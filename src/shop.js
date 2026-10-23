// Rutas públicas nuevas: pantalla del pedido y pago, Mi cuenta (clientas), enlaces de embajadoras (/a/CÓDIGO),
// enlaces con UTM (/r/código), tiendas de aliadas (/e/slug) y temporadas (/temporada/slug).
import { acctCookie, checkLogin, endSession, hashPw, loadAccount, newCustomerToken, startSession, useCustomerToken } from './lib/accounts.js';
import { record } from './lib/analytics.js';
import { activeCampaigns, parseCampaign } from './lib/campaigns.js';
import { nowIso } from './lib/db.js';
import { orderLinks } from './lib/downloads.js';
import { html } from './lib/html.js';
import { amountDue, methodDetails, orderLink } from './lib/orders.js';
import { catalog, mediaUrl } from './lib/repo.js';
import { clampStore, pct } from './lib/pricing.js';
import { currentRate, toBs } from './lib/rates.js';
import * as AL from './lib/aliadas.js';
import { clientIp, rateLimited, safeEqual, sha256, turnstileOk, verifyPassword } from './lib/security.js';
import * as V from './lib/validate.js';
import { HttpError, readForm, redirect, sameOrigin } from './http.js';
import { render, waUrl } from './public.js';
import * as SV from './views/shop.js';
import { emit } from './lib/webhooks.js';

// ---------------------------------------------------------------- pedido y pago
export async function orderPage(c, code, { token = null, viaAccount = null } = {}) {
  const { db } = c;
  const o = await db.first('SELECT * FROM orders WHERE code=?', [code]);
  if (!o) throw new HttpError(404);
  const tok = token ?? c.url.searchParams.get('t') ?? '';
  let okTok = false;
  if (tok && tok.length < 90) okTok = safeEqual(await sha256(tok), o.access_hash);
  if (!okTok && !(viaAccount && o.customer_id === viaAccount.id)) throw new HttpError(404);
  const S = await db.settings();
  const lines = await db.all('SELECT name, variant, qty, total_cents FROM order_lines WHERE order_id=? ORDER BY id', [o.id]);
  const links = (await orderLinks(c.env, db, o.id)).filter((l) => l.active);
  const pm = await db.first('SELECT * FROM payment_methods WHERE code=?', [o.pay_code]);
  const zone = await db.first('SELECT * FROM shipping_zones WHERE code=?', [o.zone_code]);
  const physical = o.shipping_label !== 'Entrega digital';
  const methodRows = (await db.all('SELECT * FROM payment_methods WHERE active=1 ORDER BY sort'))
    .filter((m) => (!m.island_only || !physical || ['isla', 'retiro'].includes(zone?.kind)) && (!m.pickup_only || zone?.kind === 'retiro'));
  const webPay = o.close_mode === 'web' || S['checkout.mode'] !== 'whatsapp';
  const canPay = !!(pm && okTok && webPay && ['creado', 'confirmado_por_whatsapp', 'pago_reportado'].includes(o.status));
  const due = pm ? await amountDue(c, o, pm) : { currency: 'USD', amount: o.total_cents, usd: o.total_cents };
  const payments = await db.all('SELECT status, currency, amount_cents, reference, reject_reason, created_at FROM payments WHERE order_id=? ORDER BY id DESC', [o.id]);
  // Cada método con su monto (en Bs o USD, con su recargo o descuento): la clienta cambia de método y ve sus datos al instante
  const paidUsd = await db.n("SELECT COALESCE(SUM(usd_cents),0) n FROM payments WHERE order_id=? AND status='verificado'", [o.id]);
  const base = o.subtotal_cents - o.discount_cents + o.shipping_cents;
  const rate = due.milli ? { milli: due.milli, at: due.at } : await currentRate(db);
  const methods = (methodRows.some((m) => m.code === pm?.code) ? methodRows : pm ? [pm, ...methodRows] : methodRows).map((m) => {
    if (m.code === pm?.code) return { ...m, details: methodDetails(m), due, total: o.total_cents, adj: o.adj_cents };
    const adj = pct(base, m.adj_bps), total = base + adj, usd = Math.max(0, total - paidUsd);
    const d = m.currency !== 'Bs' ? { currency: 'USD', usd, amount: usd } : rate ? { currency: 'Bs', usd, amount: toBs(usd, rate.milli), milli: rate.milli, at: rate.at } : { currency: 'Bs', usd, amount: null, noRate: true };
    return { ...m, details: methodDetails(m), due: d, total, adj };
  });
  const waHelp = o.close_mode === 'whatsapp' && ['creado'].includes(o.status) ? await waUrl(db, o.wa_message) : await waUrl(db, `Hola, tengo una consulta sobre mi pedido ${o.code}.`);
  const body = SV.orderView({ o, lines, links, S, pm, methods, payments, pickup: zone?.kind === 'retiro' ? zone : null, token: okTok ? tok : '', canPay, waHelp });
  const res = await render(c, { page: 'pedido', title: `Pedido ${o.code} · ${S['brand.name']}`, desc: 'Estado y pago de tu pedido', noindex: true, body });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

// ---------------------------------------------------------------- Mi cuenta
const cookieOut = (c, kind, token) => ({ 'Set-Cookie': acctCookie(kind, token, c.secure, token ? null : 0), 'Cache-Control': 'no-store' });
const page = async (c, title, body, status = 200) => {
  const r = await render(c, { page: 'cuenta', title: `${title} · Mi cuenta`, desc: '', noindex: true, body, status });
  r.headers.set('Cache-Control', 'no-store');
  return r;
};
const tsk = (c) => c.env.TURNSTILE_SITEKEY || '';
// Páginas a las que no se vuelve después de entrar
const NO_NEXT = /^\/cuenta(\/(entrar|registro|recuperar|restablecer|salir))?\/?$/;

export async function account(c) {
  const { db, req, url, env } = c;
  const path = url.pathname.replace(/\/$/, '') || '/cuenta';
  const method = req.method;
  if (method === 'POST' && !sameOrigin(req, url)) throw new HttpError(403, 'Origen no permitido.');
  const a = await loadAccount(db, 'clienta', req);
  const ip = clientIp(req);

  if (path === '/cuenta/entrar' && method === 'POST') {
    const f = await readForm(req);
    if (await rateLimited(db, `clogin:${ip}`, 12, 900)) return page(c, 'Entrar', SV.loginView({ e: 'Demasiados intentos. Espera 15 minutos.', tsk: tsk(c) }), 429);
    if (!(await turnstileOk(env, f['cf-turnstile-response'], ip))) return page(c, 'Entrar', SV.loginView({ e: 'No pudimos verificar que eres una persona.', tsk: tsk(c) }), 400);
    let email = '';
    try { email = V.emailKey(f.email); } catch {}
    const row = email ? await db.first('SELECT * FROM customers WHERE email_key=?', [email]) : null;
    const r = await checkLogin(db, env, 'clienta', row, f.password);
    if (r.error || row.status !== 'activa') return page(c, 'Entrar', SV.loginView({ e: r.error || 'Esta cuenta no está activa. Escríbenos por WhatsApp.', tsk: tsk(c) }), 401);
    const token = await startSession(db, 'clienta', row.id, req);
    const next = /^\/(cuenta|pedido)\/[\w\-/]*$/.test(f.next || '') && !NO_NEXT.test(f.next) ? f.next : '/cuenta/pedidos';
    return redirect(next, 303, cookieOut(c, 'clienta', token));
  }
  if (path === '/cuenta/registro') {
    if (a) return redirect('/cuenta/pedidos', 303);
    const S = await db.settings();
    if (method !== 'POST') return page(c, 'Crear cuenta', SV.registerView({ tsk: tsk(c), S }));
    const f = await readForm(req);
    const again = (e, st = 400) => page(c, 'Crear cuenta', SV.registerView({ e, v: f, tsk: tsk(c), S }), st);
    if (f.website) return again('Solicitud inválida.');
    if (await rateLimited(db, `creg:${ip}`, 6, 3600)) return again('Demasiados registros desde tu conexión. Intenta más tarde.', 429);
    if (!(await turnstileOk(env, f['cf-turnstile-response'], ip))) return again('No pudimos verificar que eres una persona.');
    if (!f.terms) return again('Acepta el uso de tus datos para crear la cuenta.');
    let d;
    try {
      d = { name: V.personName(f.name), docKey: V.docKey(f.docType, f.docNumber), phoneKey: V.phoneKey(f.phone), phone: V.line(f.phone, 30), emailKey: V.emailKey(f.email),
        state: V.state(f.state), city: V.line(f.city, 60), address: V.text(f.address, 200), pw: V.password(f.password) };
      if (f.password !== f.password2) throw new V.ValidationError('Las contraseñas no coinciden.');
    } catch (e) {
      if (e instanceof V.ValidationError) return again(e.message);
      throw e;
    }
    // Sin duplicados: si ya compró como invitada con los mismos tres datos, se activa esa misma ficha
    const rows = await db.all('SELECT * FROM customers WHERE doc_key=? OR phone_key=? OR email_key=?', [d.docKey, d.phoneKey, d.emailKey]);
    const t = nowIso();
    let id;
    if (rows.length) {
      const same = rows.length === 1 && rows[0].doc_key === d.docKey && rows[0].phone_key === d.phoneKey && rows[0].email_key === d.emailKey && !rows[0].pw_hash;
      if (!same) return again('Ya existe una cuenta con esa cédula, teléfono o correo. Entra con tu correo o recupera tu contraseña.');
      id = rows[0].id;
      await db.run('UPDATE customers SET name=?, pw_hash=?, state=?, city=?, address=?, marketing_ok=?, updated_at=? WHERE id=? AND pw_hash IS NULL',
        [d.name, await hashPw(env, d.pw), d.state, d.city, d.address, f.marketing ? 1 : 0, t, id]);
    } else {
      try {
        id = (await db.run('INSERT INTO customers(name,doc_key,phone_key,email_key,phone,email,pw_hash,address,city,state,marketing_ok,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [d.name, d.docKey, d.phoneKey, d.emailKey, d.phone, d.emailKey, await hashPw(env, d.pw), d.address, d.city, d.state, f.marketing ? 1 : 0, t, t])).id;
      } catch (e) {
        if (/UNIQUE/i.test(String(e?.message))) return again('Ya existe una cuenta con esos datos.');
        throw e;
      }
    }
    c.waitUntil(record(db, req, { type: 'signup', path: '/cuenta/registro' }, { serverType: 'signup' }).catch(() => {}));
    await emit(c, 'clienta_nueva', { nombre: d.name, correo: d.emailKey || '', telefono: d.phone || '', ciudad: d.city || '', estado: d.state || '', novedades: !!f.marketing, creada: t });
    const token = await startSession(db, 'clienta', id, req);
    return redirect('/cuenta/pedidos', 303, cookieOut(c, 'clienta', token));
  }
  if (path === '/cuenta/recuperar') {
    const S = await db.settings();
    const canMail = S['notify.email_enabled'] && env.RESEND_API_KEY && S['notify.from_email'];
    if (method === 'POST') {
      const f = await readForm(req);
      if (!(await rateLimited(db, `crec:${ip}`, 5, 3600)) && canMail) {
        let email = '';
        try { email = V.emailKey(f.email); } catch {}
        const row = email ? await db.first("SELECT id, name, email FROM customers WHERE email_key=? AND pw_hash IS NOT NULL AND status='activa'", [email]) : null;
        if (row) {
          const tk = await newCustomerToken(db, row.id, 'reset', 2);
          const link = `${c.base}/cuenta/restablecer?t=${tk}`;
          c.waitUntil(fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: `${S['notify.from_name'] || 'THF'} <${S['notify.from_email']}>`, to: [row.email], subject: 'Restablece tu contraseña',
              text: `Hola, ${row.name.split(' ')[0]}. Para crear una contraseña nueva entra aquí (vence en 2 horas): ${link}\n\nSi no lo pediste, ignora este correo.` }) }).catch(() => {}));
        }
      }
      return page(c, 'Recuperar', SV.simpleAcct('Revisa tu correo', html`<p>Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva. Vence en 2 horas.</p><p><a class="textlink" href="/cuenta">Volver a entrar</a></p>`));
    }
    return page(c, 'Recuperar', SV.simpleAcct('Recupera tu contraseña', canMail
      ? html`<form method="post" class="acct-form"><div class="field"><label for="rcMail">Tu correo</label><input id="rcMail" name="email" type="email" required maxlength="120"></div><button class="btn btn-solid">Enviar enlace <span class="arr"></span></button></form>`
      : html`<p>Escríbenos por el WhatsApp oficial desde el teléfono de tu cuenta y te enviamos un enlace para crear una contraseña nueva.</p><p><a class="btn btn-ghost" href="/ir/whatsapp?text=${encodeURIComponent('Hola, quiero recuperar el acceso a mi cuenta de la tienda.')}">Escribir por WhatsApp</a></p>`));
  }
  if (path === '/cuenta/restablecer') {
    const tk = String(method === 'POST' ? '' : url.searchParams.get('t') || '');
    if (method === 'POST') {
      const f = await readForm(req);
      let pw;
      try { pw = V.password(f.password); if (f.password !== f.password2) throw new V.ValidationError('Las contraseñas no coinciden.'); } catch (e) {
        if (!(e instanceof V.ValidationError)) throw e;
        return page(c, 'Restablecer', SV.simpleAcct('Nueva contraseña', html`<p class="acct-err">${e.message}</p><p><a class="textlink" href="/cuenta/restablecer?t=${f.t}">Intentar de nuevo</a></p>`), 400);
      }
      const r = await useCustomerToken(db, 'reset', String(f.t || ''));
      if (!r) return page(c, 'Restablecer', SV.simpleAcct('El enlace venció', html`<p>Pide uno nuevo.</p><p><a class="textlink" href="/cuenta/recuperar">Recuperar contraseña</a></p>`), 410);
      await db.batch([['UPDATE customers SET pw_hash=?, failed_count=0, locked_until=NULL, email_verified=1, updated_at=? WHERE id=?', [await hashPw(env, pw), nowIso(), r.customer_id]],
        ['DELETE FROM customer_sessions WHERE customer_id=?', [r.customer_id]]]);
      return redirect('/cuenta?msg=' + encodeURIComponent('Listo. Entra con tu nueva contraseña.'), 303);
    }
    return page(c, 'Restablecer', SV.simpleAcct('Crea tu nueva contraseña', html`<form method="post" class="acct-form"><input type="hidden" name="t" value="${tk.replace(/[^\w-]/g, '')}">
<div class="field"><label for="nPw">Nueva contraseña (10+ caracteres)</label><input id="nPw" name="password" type="password" minlength="10" required autocomplete="new-password"></div>
<div class="field"><label for="nPw2">Repítela</label><input id="nPw2" name="password2" type="password" minlength="10" required autocomplete="new-password"></div><button class="btn btn-solid">Guardar</button></form>`));
  }

  if (!a) {
    if (path === '/cuenta' || method !== 'POST') return page(c, 'Entrar', SV.loginView({ msg: url.searchParams.get('msg'), next: NO_NEXT.test(path) ? '' : path, tsk: tsk(c) }));
    return redirect('/cuenta', 303);
  }
  const me = a.who;
  if (NO_NEXT.test(path) && path !== '/cuenta/salir' && method === 'GET') return redirect('/cuenta/pedidos', 303); // ya entró
  if (method === 'POST') {
    const f = await readForm(req);
    if (!safeEqual(String(f._csrf || ''), a.sess.csrf)) throw new HttpError(403, 'La sesión del formulario venció. Recarga la página.');
    if (path === '/cuenta/salir') { await endSession(db, 'clienta', req); return redirect('/', 303, cookieOut(c, 'clienta', '')); }
    if (path === '/cuenta/datos') {
      try {
        if (f._action === 'address') {
          await db.run('UPDATE customers SET state=?, city=?, address=?, marketing_ok=?, updated_at=? WHERE id=?', [V.state(f.state), V.line(f.city, 60), V.text(f.address, 200), f.marketing ? 1 : 0, nowIso(), me.id]);
          return redirect('/cuenta/datos?msg=' + encodeURIComponent('Datos guardados.'), 303);
        }
        if (f._action === 'password') {
          if (!(await verifyPassword(String(f.current || ''), me.pw_hash, env.THF_PEPPER))) throw new V.ValidationError('La contraseña actual no es correcta.');
          const pw = V.password(f.password);
          if (pw !== f.password2) throw new V.ValidationError('Las contraseñas nuevas no coinciden.');
          await db.batch([['UPDATE customers SET pw_hash=?, updated_at=? WHERE id=?', [await hashPw(env, pw), nowIso(), me.id]], ['DELETE FROM customer_sessions WHERE customer_id=? AND id<>?', [me.id, a.sess.id]]]);
          return redirect('/cuenta/datos?msg=' + encodeURIComponent('Contraseña cambiada.'), 303);
        }
      } catch (e) {
        if (!(e instanceof V.ValidationError)) throw e;
        return page(c, 'Mis datos', SV.profileView({ me, csrf: a.sess.csrf, e: e.message }), 400);
      }
    }
    throw new HttpError(404);
  }
  if (path === '/cuenta' || path === '/cuenta/pedidos') {
    const orders = await db.all('SELECT o.code, o.status, o.total_cents, o.created_at, (SELECT COALESCE(SUM(qty),0) FROM order_lines l WHERE l.order_id=o.id) n FROM orders o WHERE o.customer_id=? ORDER BY o.id DESC LIMIT 100', [me.id]);
    return page(c, 'Mis pedidos', SV.ordersListView({ me, orders, csrf: a.sess.csrf }));
  }
  const m = path.match(/^\/cuenta\/pedidos\/(THF-\d{4}-\d{6})$/);
  if (m) {
    const o = await db.first('SELECT * FROM orders WHERE code=? AND customer_id=?', [m[1], me.id]);
    if (!o) throw new HttpError(404);
    if (o.access_nonce) return redirect(await orderLink(c, o), 303); // enlace con su clave para poder pagar
    return orderPage(c, o.code, { token: '', viaAccount: me });
  }
  if (path === '/cuenta/datos') return page(c, 'Mis datos', SV.profileView({ me, csrf: a.sess.csrf, msg: url.searchParams.get('msg') }));
  if (path === '/cuenta/cupones') {
    const coupons = await db.all(`SELECT code, description, kind, value, ends_at FROM coupons WHERE customer_id=? AND active=1 AND (ends_at IS NULL OR ends_at>?)
      AND (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id=coupons.id AND r.customer_id=?) < per_customer ORDER BY id DESC`, [me.id, nowIso(), me.id]);
    return page(c, 'Mis cupones', SV.couponsView({ coupons, csrf: a.sess.csrf }));
  }
  throw new HttpError(404);
}

// ---------------------------------------------------------------- enlace personal de embajadora: /a/CODIGO[/ruta]
export async function refLink(c, code, rest) {
  const { db } = c;
  const p = await db.first("SELECT id, code FROM partners WHERE code=? AND status='activa'", [String(code).toUpperCase()]);
  const dest = /^\/[a-z0-9\-/]*$/.test(rest || '') && !rest.startsWith('//') ? rest : '/';
  if (!p) return redirect(dest, 302);
  const days = Number(await db.setting('programs.attribution_days', 30)) || 30;
  const qs = new URLSearchParams({ ref: p.code });
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) { const v = c.url.searchParams.get(k); if (v) qs.set(k, v.slice(0, 80)); }
  if (!qs.has('utm_medium')) qs.set('utm_medium', 'embajadora');
  if (!qs.has('utm_source')) qs.set('utm_source', p.code.toLowerCase());
  c.waitUntil(record(db, c.req, { type: 'ref_click', path: dest, partner_id: p.id, utm_source: qs.get('utm_source'), utm_medium: qs.get('utm_medium'), ref_host: '' }).catch(() => {}));
  return redirect(`${dest}?${qs}`, 302, { 'Set-Cookie': `thf_ref=${p.code}; Path=/; Max-Age=${days * 86400}; SameSite=Lax${c.secure ? '; Secure' : ''}`, 'X-Robots-Tag': 'noindex' });
}

// ---------------------------------------------------------------- enlaces con UTM: /r/codigo
export async function utmLink(c, code) {
  const l = await c.db.first('SELECT * FROM utm_links WHERE code=?', [code]);
  if (!l) return redirect('/', 302);
  await c.db.run('UPDATE utm_links SET clicks=clicks+1 WHERE id=?', [l.id]);
  const qs = new URLSearchParams({ utm_source: l.utm_source, utm_medium: l.utm_medium, utm_campaign: l.utm_campaign });
  if (l.utm_content) qs.set('utm_content', l.utm_content);
  const dest = /^\/[a-z0-9\-/]*$/.test(l.dest) ? l.dest : '/';
  return redirect(`${dest}?${qs}`, 302, { 'X-Robots-Tag': 'noindex' });
}

// ---------------------------------------------------------------- temporada
const enc = new TextEncoder();
export async function previewToken(env, slug) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.THF_PEPPER || 'dev-pepper'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('vista|' + slug)))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function campaignPage(c, slug) {
  const { db } = c;
  const row = await db.first('SELECT * FROM campaigns WHERE slug=?', [slug]);
  if (!row) throw new HttpError(404);
  const live = (await activeCampaigns(db)).some((x) => x.id === row.id);
  const pv = c.url.searchParams.get('vista');
  const preview = !live && pv && safeEqual(pv, await previewToken(c.env, slug));
  if (!live && !preview) throw new HttpError(404);
  const camp = parseCampaign(row);
  const m = row.media_id ? await db.first('SELECT path FROM media WHERE id=?', [row.media_id]) : null;
  camp.photo = m ? mediaUrl(m.path) : '';
  const cat = await catalog(db, { fresh: !!preview });
  const S = await db.settings();
  let prods = cat.listed;
  if (camp.scope === 'coleccion') prods = prods.filter((p) => p.collectionId === camp.collection_id);
  else if (camp.scope === 'piezas') prods = prods.filter((p) => camp.productIds.has(p.id));
  else if (camp.scope === 'ninguno') prods = cat.listed.filter((p) => p.featured || p.bundle).concat(cat.listed.filter((p) => !p.featured && !p.bundle)).slice(0, 24);
  const res = await render(c, { page: 'temporada', title: `${camp.banner_title || camp.name} · ${S['brand.name']}`, desc: camp.banner_text || camp.page_intro, og: camp.photo,
    crumbs: [['Inicio', '/'], [camp.name, `/temporada/${slug}`]], body: SV.campaignView({ camp, prods, S, preview }), products: prods, noindex: !!preview });
  if (preview) res.headers.set('Cache-Control', 'no-store');
  return res;
}

// ---------------------------------------------------------------- tienda de aliada: /e/slug
// Muestra solo las piezas que ella activó y que tienen fotos para aliadas (nunca las fotos de la tienda principal),
// con su título, subtítulo, colores y banner. El menú lleva las categorías que tiene disponibles.
export async function storePage(c, slug) {
  const { db } = c;
  const p = await db.first("SELECT * FROM partners WHERE slug=? AND kind='emprendedora' AND status='activa'", [slug]);
  if (!p) throw new HttpError(404);
  const S = await db.settings();
  const mine = new Map((await db.all('SELECT product_id, price_cents, asset_id FROM partner_prices WHERE partner_id=? AND visible=1', [p.id])).map((r) => [r.product_id, r]));
  const raw = new Map((await db.all("SELECT id, price_cents, min_cents, max_cents FROM products WHERE status='published'")).map((r) => [r.id, r]));
  const opts = await AL.assetOptions(db);
  const cat = await catalog(db);
  const prods = cat.listed.filter((x) => mine.has(x.id) && !x.bundle && opts.byProduct.has(x.id)).map((x) => {
    const own = mine.get(x.id);
    const unit = clampStore(own.price_cents, raw.get(x.id));
    const im = AL.pieceImage(opts, x.id, own.asset_id);
    const img = { ...x.img, main: im.url, hover: im.url, inset: '', insetOn: false, model: '', gallery: [im.url], alt: x.name };
    return { ...x, img, unit, price: unit, offer: null, mayor: null, campaign: '', offPct: 0 };
  });
  const order = (slug2) => { const i = AL.BASIC_CATS.indexOf(slug2); return i < 0 ? 99 : i; };
  const cats = [...new Map(prods.filter((x) => x.cat).map((x) => [x.cat, { slug: x.cat, name: x.catName }])).values()].sort((x, y) => order(x.slug) - order(y.slug));
  const banner = p.store_banner_id ? opts.banners.find((x) => x.id === p.store_banner_id) || null : null;
  const title = p.store_title || `La tienda de ${p.name.split(' ')[0]}`;
  const store = { home: `/e/${p.slug}`, title, subtitle: p.store_subtitle || '', bio: p.store_bio || '', owner: p.name.split(' ')[0], cats, css: AL.storeCss(p) };
  return render(c, { page: 'tienda', title: `${title} · ${S['brand.name']}`, desc: p.store_bio || p.store_subtitle || '', og: banner?.url,
    body: SV.storeView({ p, prods, S, store, banner }), products: prods, extra: { store: p.slug, storeName: title }, noindex: false, store });
}
