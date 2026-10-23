// API pública: cotizar, crear el pedido, pagar ("Ya pagué"), descargas gratis, solicitudes, analítica y datos de la clienta.
// El número de WhatsApp sale siempre del ajuste global; nada que envíe el cliente puede cambiarlo. El servidor recalcula todo.
import { loadAccount } from './lib/accounts.js';
import { record } from './lib/analytics.js';
import { customerSelf } from './lib/customers.js';
import { nowIso } from './lib/db.js';
import { createGrant } from './lib/downloads.js';
import { amountDue, changeMethod, createOrder as createOrderCore, methodDetails, reportPayment } from './lib/orders.js';
import { QuoteError, quote } from './lib/pricing.js';
import { bs, rateText } from './lib/rates.js';
import { clientIp, cookieGet, rateLimited, safeEqual, sha256, turnstileOk } from './lib/security.js';
import { ValidationError } from './lib/validate.js';
import { HttpError, clean, cleanLine, json, readJson, sameOrigin } from './http.js';
import { waUrl } from './public.js';
import { emit } from './lib/webhooks.js';

function guard(c) {
  if (!sameOrigin(c.req, c.url)) throw new HttpError(403, 'Origen no permitido.');
}

// Nunca salen del servidor: costos, instantáneas ni identificadores internos de afiliadas o cupones
const publicQuote = (qt) => ({
  ...qt, lines: qt.lines.map(({ snapshot, collectionId, ...l }) => l), campaignIds: undefined,
  coupon: qt.coupon ? { code: qt.coupon.code, ok: qt.coupon.ok, error: qt.coupon.error, description: qt.coupon.description, needsLogin: qt.coupon.needsLogin } : null,
  ref: qt.ref ? { code: qt.ref.code, source: qt.ref.source, store: qt.ref.store } : null,
});

const session = async (c) => (await loadAccount(c.db, 'clienta', c.req))?.who || null;
const refCookie = (c) => { const r = cookieGet(c.req, 'thf_ref') || ''; return /^[A-Z0-9]{3,24}$/.test(r) ? r : ''; };

export async function quoteApi(c) {
  guard(c);
  if (await rateLimited(c.db, `quote:${clientIp(c.req)}`, 120, 60)) return json({ error: 'Demasiadas solicitudes. Espera un momento.' }, 429);
  const data = await readJson(c.req);
  try {
    const me = await session(c);
    return json(publicQuote(await quote(c.db, { ...data, code: data.code || refCookie(c) }, { customerId: me?.id ?? null })));
  } catch (e) {
    if (e instanceof QuoteError) return json({ error: e.message }, 400);
    throw e;
  }
}

export async function createOrder(c) {
  guard(c);
  const ip = clientIp(c.req);
  if (await rateLimited(c.db, `order:${ip}`, 8, 600)) return json({ error: 'Recibimos muchos pedidos desde tu conexión. Intenta de nuevo en unos minutos.' }, 429);
  const data = await readJson(c.req);
  if (data.website) return json({ error: 'Solicitud inválida.' }, 400); // campo trampa para robots
  if (!(await turnstileOk(c.env, data.turnstile, ip))) return json({ error: 'No pudimos verificar que eres una persona. Recarga la página e intenta de nuevo.' }, 400);
  if (!data.terms) return json({ error: 'Debes aceptar los términos para crear el pedido.' }, 400);
  const idem = cleanLine(data.idem, 64);
  if (idem) {
    const prev = await c.db.first('SELECT * FROM orders WHERE idem_key=?', [idem]);
    if (prev) return json({ code: prev.code, message: prev.wa_message, wa: await waUrl(c.db, prev.wa_message), duplicate: true });
  }
  const me = await session(c);
  let r;
  try {
    r = await createOrderCore(c, data, { sessionCustomer: me, refCookie: refCookie(c) });
  } catch (e) {
    if (e instanceof QuoteError || e instanceof ValidationError) return json({ error: e.message }, 400);
    throw e;
  }
  const o = r.order;
  if (r.duplicate) return json({ code: o.code, message: o.wa_message, wa: await waUrl(c.db, o.wa_message), duplicate: true });
  return json({
    code: o.code, message: o.wa_message, wa: await waUrl(c.db, o.wa_message), status: `/pedido/${o.code}?t=${r.token}`, total: o.total_cents, mode: r.mode,
    totalBs: o.total_bs_cents ? bs(o.total_bs_cents) : '', account: !!me,
    payNote: r.mode === 'whatsapp' ? 'Te enviaremos los datos de pago de THF por este mismo WhatsApp. Nunca pagues a otra persona.' : 'Paga solo a THF con los datos de la pantalla de tu pedido. Nunca pagues a otra persona.',
  });
}

// Pedido por su código + token secreto del enlace
export async function orderByToken(c, code, token) {
  if (!/^THF-\d{4}-\d{6}$/.test(code) || !token || String(token).length > 80) throw new HttpError(404);
  const o = await c.db.first('SELECT * FROM orders WHERE code=?', [code]);
  if (!o || !safeEqual(await sha256(String(token)), o.access_hash)) throw new HttpError(404, 'Pedido no encontrado.');
  return o;
}

export async function orderMethod(c, code) {
  guard(c);
  if (await rateLimited(c.db, `paym:${clientIp(c.req)}`, 20, 600)) return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
  const d = await readJson(c.req, 4096);
  const o = await orderByToken(c, code, d.t);
  try {
    await changeMethod(c, o, d.pay);
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    throw e;
  }
  return json({ ok: true });
}

// "Ya pagué": formulario multiparte con la captura opcional
export async function orderPayment(c, code) {
  guard(c);
  const ip = clientIp(c.req);
  if (await rateLimited(c.db, `pay:${ip}`, 10, 3600)) return json({ error: 'Recibimos varios reportes desde tu conexión. Intenta más tarde o escríbenos por WhatsApp.' }, 429);
  const ct = c.req.headers.get('Content-Type') || '';
  if (!ct.includes('multipart/form-data')) throw new HttpError(415, 'Formato inválido.');
  const len = Number(c.req.headers.get('Content-Length') || 0);
  if (len > 7 * 1024 * 1024) return json({ error: 'La captura pesa demasiado (máximo 6 MB).' }, 413);
  const fd = await c.req.formData();
  const f = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') f[k] = v.slice(0, 400);
  if (f.website) return json({ error: 'Solicitud inválida.' }, 400);
  const file = fd.get('proof');
  const o = await orderByToken(c, code, f.t);
  if (await rateLimited(c.db, `pay-o:${o.id}`, 6, 3600)) return json({ error: 'Ya recibimos varios reportes para este pedido. Te escribimos pronto.' }, 429);
  try {
    const r = await reportPayment(c, o, f, file && typeof file !== 'string' ? file : null);
    return json({ ok: true, verified: r.payment.status === 'verificado' });
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    throw e;
  }
}

// Monto a pagar en la moneda del método, con la tasa vigente
export async function orderDue(c, code) {
  guard(c);
  const d = await readJson(c.req, 2048);
  const o = await orderByToken(c, code, d.t);
  const pm = await c.db.first('SELECT * FROM payment_methods WHERE code=?', [o.pay_code]);
  const due = await amountDue(c, o, pm);
  return json({ currency: due.currency, amount: due.amount, amountText: due.amount == null ? '' : due.currency === 'Bs' ? bs(due.amount) : '', rate: due.milli ? rateText(due.milli) : '', details: methodDetails(pm) });
}

export async function freeDownload(c, slug) {
  guard(c);
  if (await rateLimited(c.db, `free:${clientIp(c.req)}`, 10, 3600)) return json({ error: 'Has pedido muchas descargas. Intenta más tarde.' }, 429);
  const d = await c.db.first("SELECT id FROM digital_products WHERE slug=? AND status='published' AND price_cents=0 AND file_path IS NOT NULL", [slug]);
  if (!d) return json({ error: 'Esta guía no está disponible para descarga gratuita.' }, 404);
  const S = await c.db.settings();
  const hours = Math.min(24 * 90, Math.max(1, Number(S['downloads.free_hours']) || 1));
  const max = Math.min(100, Math.max(1, Number(S['downloads.free_max']) || 1));
  const g = await createGrant(c.env, c.db, { digitalId: d.id, hours, max });
  c.waitUntil(record(c.db, c.req, { type: 'download', path: `/guias/${slug}` }).catch(() => {}));
  return json({ url: g.url, hours, max });
}

// Analítica: eventos del navegador (sin datos personales)
export async function track(c) {
  if (!sameOrigin(c.req, c.url)) return new Response(null, { status: 204 });
  if (!(await c.db.setting('analytics.enabled', true))) return new Response(null, { status: 204 });
  if (await rateLimited(c.db, `t:${clientIp(c.req)}`, 240, 600)) return new Response(null, { status: 204 });
  let d;
  try { d = await readJson(c.req, 4096); } catch { return new Response(null, { status: 204 }); }
  const ref = refCookie(c);
  delete d.partner_id;
  if (ref) {
    const p = await c.db.first("SELECT id FROM partners WHERE code=? AND status='activa'", [ref]);
    if (p) d.partner_id = p.id;
  }
  if (d.product && /^[a-z0-9-]{1,80}$/.test(d.product)) d.product_id = (await c.db.first('SELECT id FROM products WHERE slug=?', [d.product]))?.id;
  else delete d.product_id;
  delete d.order_id;
  await record(c.db, c.req, d);
  return new Response(null, { status: 204 });
}

// Datos de la clienta con sesión (para completar el formulario del pedido). No se guarda en caché.
export async function me(c) {
  const a = await loadAccount(c.db, 'clienta', c.req);
  if (!a) return json({ logged: false });
  const coupons = await c.db.all(`SELECT code, description, kind, value, ends_at FROM coupons WHERE customer_id=? AND active=1 AND (ends_at IS NULL OR ends_at>?)
    AND (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id=coupons.id AND r.customer_id=?) < per_customer`, [a.who.id, nowIso(), a.who.id]);
  return json({ logged: true, me: customerSelf(a.who), coupons });
}

const SOCIAL_RE = /^(https?:\/\/)?(www\.)?(instagram\.com|tiktok\.com|facebook\.com|youtube\.com|x\.com|pinterest\.com|wa\.me|linktr\.ee)\/[\w.@\-/]+$/i;

// Postulaciones a los programas y solicitudes de joyería personalizada
export async function createRequest(c) {
  guard(c);
  const ip = clientIp(c.req);
  if (await rateLimited(c.db, `req:${ip}`, 6, 3600)) return json({ error: 'Recibimos varias solicitudes desde tu conexión. Intenta más tarde.' }, 429);
  const d = await readJson(c.req, 16 * 1024);
  if (d.website) return json({ error: 'Solicitud inválida.' }, 400);
  if (!(await turnstileOk(c.env, d.turnstile, ip))) return json({ error: 'No pudimos verificar que eres una persona.' }, 400);
  const kind = String(d.kind || '');
  if (!['embajadora', 'emprendedora', 'personalizada'].includes(kind)) return json({ error: 'Tipo de solicitud inválido.' }, 400);
  const name = cleanLine(d.name, 80), phone = cleanLine(d.phone, 30), city = cleanLine(d.city, 60);
  if (name.length < 2 || phone.replace(/\D/g, '').length < 7) return json({ error: 'Escribe tu nombre y un WhatsApp válido.' }, 400);
  let data, waText = '';
  if (kind === 'personalizada') {
    const f = d.data || {};
    const arr = (v, n) => (Array.isArray(v) ? v : [v]).map((x) => cleanLine(x, 40)).filter(Boolean).slice(0, n);
    data = { who: cleanLine(f.who, 20), what: arr(f.what, 6), qty: cleanLine(f.qty, 30), design: cleanLine(f.design, 60), sample: cleanLine(f.sample, 60),
      colors: cleanLine(f.colors, 160), date: cleanLine(f.date, 20), idea: clean(f.idea, 800) };
    waText = ['*Joyería personalizada · THF*', '', `Soy: ${data.who}`, `Piezas: ${data.what.join(', ')}`, `Cantidad: ${data.qty}`, `Diseño: ${data.design}`, `Muestra: ${data.sample}`,
      ...(data.colors ? [`Colores / piedras: ${data.colors}`] : []), ...(data.date ? [`Para: ${data.date}`] : []), ...(data.idea ? ['', `Idea: ${data.idea}`] : []), '',
      `${data.who === 'Marca' ? 'Marca' : 'Nombre'}: ${name}`, `WhatsApp: ${phone}`].join('\n');
  } else {
    const f = d.data || {};
    if (!f.age) return json({ error: 'Los programas son solo para mayores de 18 años.' }, 400);
    if (!f.terms) return json({ error: 'Acepta los términos del programa.' }, 400);
    const socials = [f.ig, f.tk].map((x) => cleanLine(x, 160)).filter(Boolean);
    if (!socials.length) return json({ error: 'Agrega al menos una red social.' }, 400);
    if (socials.some((u) => !SOCIAL_RE.test(u))) return json({ error: 'Revisa el enlace de tu red social.' }, 400);
    data = { socials, followers: cleanLine(f.f, 40), why: clean(f.why, 600) };
  }
  const t = nowIso();
  await c.db.run('INSERT INTO requests(kind,name,city,phone,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [kind, name, city, phone, JSON.stringify(data), t, t]);
  await emit(c, 'solicitud_nueva', { tipo: kind, nombre: name, ciudad: city, telefono: phone, datos: data, creada: t });
  return json({ ok: true, wa: waText ? await waUrl(c.db, waText) : null });
}
