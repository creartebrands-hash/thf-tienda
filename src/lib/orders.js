// Pedidos: creación (con clienta, cupón, referida, tasa y origen), cambios de estado con sus efectos
// (descargas, comisiones, materiales, avisos) y pagos reportados ("Ya pagué") con verificación manual o automática.
import { nowIso } from './db.js';
import { createGrant } from './downloads.js';
import { record } from './analytics.js';
import { resolveCustomer } from './customers.js';
import { notify, STATUS_EVENT } from './notify.js';
import { creditOnPaid, reverseOnCancel } from './partners.js';
import { QuoteError, money, quote, whatsappMessage } from './pricing.js';
import { bs, currentRate, fromBs, rateText, toBs } from './rates.js';
import { randomToken, sha256 } from './security.js';
import { putFile, sniff } from './storage.js';
import * as V from './validate.js';
import { autoVerify } from './verify.js';
import { emit, orderPayload } from './webhooks.js';
import { serverPurchase } from './integrations.js';

export const STATUS = {
  creado: ['Por pagar', 'warn'], confirmado_por_whatsapp: ['Confirmado por WhatsApp', 'blue'], pago_reportado: ['Pago por verificar', 'gold'],
  anticipo_recibido: ['Anticipo recibido', 'blue'], pagado: ['Pagado', 'ok'], en_produccion: ['En preparación', 'gold'], listo: ['Listo', 'gold'],
  listo_retiro: ['Listo para retirar', 'ok'], enviado: ['Enviado', 'blue'], entregado: ['Entregado', 'ok'], expirado: ['Expirado', 'muted'],
  cancelado: ['Cancelado', 'bad'], devuelto: ['Devuelto', 'bad'], reembolsado: ['Reembolsado', 'bad'],
};
export const NEXT = {
  creado: ['confirmado_por_whatsapp', 'pago_reportado', 'pagado', 'anticipo_recibido', 'cancelado', 'expirado'],
  confirmado_por_whatsapp: ['pago_reportado', 'pagado', 'anticipo_recibido', 'cancelado', 'expirado'],
  pago_reportado: ['pagado', 'creado', 'cancelado'],
  anticipo_recibido: ['pagado', 'en_produccion', 'cancelado'],
  pagado: ['en_produccion', 'listo', 'listo_retiro', 'enviado', 'entregado', 'reembolsado'],
  en_produccion: ['listo', 'listo_retiro', 'enviado', 'cancelado'], listo: ['enviado', 'listo_retiro', 'entregado'], listo_retiro: ['entregado'],
  enviado: ['entregado', 'devuelto'], entregado: ['devuelto'], expirado: ['creado'], cancelado: [], devuelto: ['reembolsado'], reembolsado: [],
};
export const PAID = ['pagado', 'en_produccion', 'listo', 'listo_retiro', 'enviado', 'entregado'];
export const OPEN = ['creado', 'confirmado_por_whatsapp', 'pago_reportado', 'anticipo_recibido', 'pagado', 'en_produccion', 'listo', 'listo_retiro', 'enviado'];
// Lo que ve la clienta en su pedido
export const STEPS = [['recibido', 'Recibido'], ['pago', 'Pago'], ['preparacion', 'Preparación'], ['entrega', 'Envío o retiro'], ['entregado', 'Entregado']];
export function stepOf(status) {
  if (['creado', 'confirmado_por_whatsapp', 'expirado'].includes(status)) return 0;
  if (['pago_reportado', 'anticipo_recibido'].includes(status)) return 1;
  if (['pagado', 'en_produccion'].includes(status)) return 2;
  if (['listo', 'listo_retiro', 'enviado'].includes(status)) return 3;
  if (status === 'entregado') return 4;
  return -1;
}

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function orderToken(env, nonce) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.THF_PEPPER || 'dev-pepper'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode('pedido|' + nonce))).slice(0, 32);
}
export async function orderLink(c, o) {
  if (!o.access_nonce) return `${c.base}/cuenta/pedidos`;
  return `${c.base}/pedido/${o.code}?t=${await orderToken(c.env, o.access_nonce)}`;
}
export async function newAccess(env) {
  const nonce = randomToken(16);
  const token = await orderToken(env, nonce);
  return { nonce, token, hash: await sha256(token) };
}

const src = (d) => {
  const o = d && typeof d === 'object' ? d : {};
  const f = (k, n) => V.line(o[k], n).toLowerCase();
  return { utm_source: f('utm_source', 60), utm_medium: f('utm_medium', 60), utm_campaign: f('utm_campaign', 80), utm_content: f('utm_content', 80),
    ref_host: f('ref_host', 80), landing: V.line(o.landing, 200), vid: V.line(o.vid, 64) };
};

// ---------------------------------------------------------------- crear pedido
export async function createOrder(c, data, { sessionCustomer = null, refCookie = '' } = {}) {
  const { db } = c;
  const S = await db.settings();
  const mode = ['whatsapp', 'mixto', 'web'].includes(S['checkout.mode']) ? S['checkout.mode'] : 'whatsapp';
  const cu = data.customer || {};
  // 1. Datos de la clienta (con sesión, salen de su cuenta)
  let person;
  if (sessionCustomer) {
    person = { name: sessionCustomer.name, phone: sessionCustomer.phone, phoneKey: sessionCustomer.phone_key, docKey: sessionCustomer.doc_key, email: sessionCustomer.email, emailKey: sessionCustomer.email_key };
  } else {
    const docKey = cu.docNumber || S['checkout.require_doc'] ? V.docKey(cu.docType, cu.docNumber) : '';
    const emailKey = V.emailKey(cu.email, { required: !!S['checkout.require_email'] });
    person = { name: V.personName(cu.name), phone: V.line(cu.phone, 30), phoneKey: V.phoneKey(cu.phone), docKey, email: emailKey, emailKey };
  }
  Object.assign(person, { address: V.text(cu.address, 200), city: V.line(cu.city, 60), state: V.state(cu.state), notes: V.text(cu.notes, 400), marketing: !!cu.marketing });

  // 2. Precio (el servidor recalcula todo)
  const qt = await quote(db, { ...data, code: data.code || refCookie }, { customerId: sessionCustomer?.id ?? null });
  if (qt.physical && person.address.length < 4) throw new V.ValidationError('Escribe tu dirección o punto de entrega.');
  if (qt.coupon && !qt.coupon.ok) throw new V.ValidationError(qt.coupon.error);

  // 3. Clienta única
  const customer = await resolveCustomer(db, person, { sessionCustomer });
  let redemption = null;
  if (qt.coupon?.ok) {
    if (!customer) throw new V.ValidationError('Para usar un cupón necesitamos tu cédula y tu correo.');
    const cp = await db.first('SELECT * FROM coupons WHERE id=?', [qt.coupon.id]);
    const mine = await db.n('SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=? AND customer_id=?', [cp.id, customer.id]);
    if (mine >= cp.per_customer) throw new V.ValidationError('Ya usaste este cupón.');
    if (cp.first_order_only && (await db.n("SELECT COUNT(*) n FROM orders WHERE customer_id=? AND status NOT IN ('cancelado','expirado')", [customer.id])))
      throw new V.ValidationError('Este cupón es solo para la primera compra.');
    redemption = { coupon: cp, slot: mine + 1, global: cp.uses + 1 };
  }

  // 4. Referida por: una sola afiliada por pedido; nadie puede referirse a sí misma
  let partnerId = null, attrSource = null, attrCode = null;
  if (qt.ref) {
    const p = await db.first('SELECT * FROM partners WHERE id=?', [qt.ref.partnerId]);
    const self = p && (p.phone_key === person.phoneKey || (person.emailKey && p.email_key === person.emailKey) || (person.docKey && p.doc_key === person.docKey));
    if (p && !self) {
      partnerId = p.id; attrCode = p.code;
      attrSource = qt.ref.source === 'tienda' ? 'tienda' : data.code ? (data.refSource === 'enlace' ? 'enlace' : 'codigo') : 'enlace';
    }
  }
  if (!partnerId && qt.lines.some((l) => l.priceKind === 'tienda')) throw new QuoteError('Esta tienda no puede recibir pedidos en este momento.');

  // 5. Tasa del día (si hay una vigente) y origen de la visita
  const rate = await currentRate(db);
  const origin = src(data.src);
  const { classify } = await import('./analytics.js');
  const cls = classify({ ...origin, partner: !!partnerId });
  const prodCost = qt.lines.reduce((a, l) => {
    if (l.kind === 'product') return a + (l.snapshot.prodCost ?? 0) * l.qty;
    if (l.kind === 'look') return a + (l.snapshot.items || []).reduce((b, i) => b + (i.prodCost ?? 0) * i.qty, 0) * l.qty;
    return a;
  }, 0);

  // 6. Guardar (todo en una transacción)
  const access = await newAccess(c.env);
  const elab = S['orders.lead_time_text'] || '';
  const year = new Date().getUTCFullYear();
  const idem = V.line(data.idem, 64) || null;
  const closeMode = mode === 'whatsapp' ? 'whatsapp' : 'web';
  let code, msg, link;
  for (let attempt = 0; attempt < 4; attempt++) {
    const n = (await db.n('SELECT COUNT(*) n FROM orders WHERE code LIKE ?', [`THF-${year}-%`])) + 1 + attempt;
    code = `THF-${year}-${String(n).padStart(6, '0')}`;
    link = closeMode === 'web' ? `${c.base}/pedido/${code}?t=${access.token}` : '';
    msg = whatsappMessage(code, qt, { ...person, doc: V.docText(person.docKey) }, attrCode ? `${attrCode}${attrSource === 'tienda' ? ' (tienda)' : ''}` : '', elab,
      { totalBs: rate ? bs(toBs(qt.total, rate.milli)) : '', rate: rate ? rateText(rate.milli) : '', link });
    const t = nowIso();
    const oid = `(SELECT id FROM orders WHERE code='${code}')`;
    const stmts = [
      [`INSERT INTO orders(code,access_hash,access_nonce,idem_key,kind,status,customer_id,customer_name,customer_phone,customer_address,customer_notes,customer_email,customer_doc,customer_city,customer_state,
        zone_code,zone_name,pay_code,pay_name,subtotal_cents,shipping_cents,adj_cents,discount_cents,total_cents,shipping_label,attribution_code,partner_id,attribution_source,
        coupon_id,coupon_code,campaign_id,close_mode,rate_milli,rate_at,rate_source,total_bs_cents,channel,traffic,utm_source,utm_medium,utm_campaign,utm_content,ref_host,landing,vid,prod_cost_cents,wa_message,created_at,updated_at)
        VALUES (?,?,?,?,?,'creado',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, access.hash, access.nonce, idem, qt.kind, customer?.id ?? null, person.name, person.phone, person.address, person.notes, person.email, person.docKey, person.city, person.state,
        qt.zone.code, qt.zone.name, qt.pay.code, qt.pay.name, qt.subtotal, qt.shipping, qt.adj, qt.discount, qt.total, qt.shippingLabel, attrCode, partnerId, attrSource,
        redemption?.coupon.id ?? null, redemption?.coupon.code ?? null, qt.campaignIds[0] ?? null, closeMode, rate?.milli ?? null, rate?.at ?? null, rate?.source ?? null,
        rate ? toBs(qt.total, rate.milli) : null, cls.channel, cls.traffic, origin.utm_source, origin.utm_medium, origin.utm_campaign, origin.utm_content, origin.ref_host, origin.landing,
        origin.vid ? (await sha256('v|' + origin.vid)).slice(0, 20) : '', prodCost || null, msg, t, t]],
      ...qt.lines.map((l) => [`INSERT INTO order_lines(order_id,kind,ref_id,name,sku,variant,qty,unit_cents,total_cents,snapshot) VALUES (${oid},?,?,?,?,?,?,?,?,?)`,
        [l.kind, l.id, l.name, l.sku, l.variant, l.qty, l.unit, l.total, JSON.stringify({ ...l.snapshot, priceKind: l.priceKind })]]),
      [`INSERT INTO order_events(order_id,at,from_status,to_status,note) VALUES (${oid},?,NULL,'creado',?)`, [t, `Pedido creado desde la web${attrCode ? ` · referida por ${attrCode}` : ''}`]],
    ];
    if (redemption) {
      stmts.push([`INSERT INTO coupon_redemptions(coupon_id,customer_id,order_id,slot,global_slot,discount_cents,created_at) VALUES (?,?,${oid},?,?,?,?)`,
        [redemption.coupon.id, customer.id, redemption.slot, redemption.global, qt.discount, t]]);
      stmts.push(['UPDATE coupons SET uses=uses+1, updated_at=? WHERE id=?', [t, redemption.coupon.id]]);
    }
    try {
      await db.batch(stmts);
      break;
    } catch (e) {
      const m = String(e?.message || e);
      if (!/UNIQUE/i.test(m) || attempt === 3) throw e;
      if (idem && (await db.first('SELECT 1 x FROM orders WHERE idem_key=?', [idem]))) return { duplicate: true, order: await db.first('SELECT * FROM orders WHERE idem_key=?', [idem]) };
      if (/coupon/i.test(m)) throw new V.ValidationError('Ese cupón se acaba de usar o agotar. Revisa tu pedido.');
    }
  }
  const o = await db.first('SELECT * FROM orders WHERE code=?', [code]);
  c.waitUntil(record(db, c.req, { type: 'order', path: '/pedido', order_id: o.id, value_cents: o.total_cents, ...origin, partner_id: partnerId }, { serverType: 'order' }).catch(() => {}));
  const olink = await orderLink(c, o);
  await notify(c, o, 'pedido_creado', { link: olink });
  await notify(c, o, 'duena_pedido', { link: olink });
  await emit(c, 'pedido_creado', await orderPayload(db, o));
  return { order: o, token: access.token, quote: qt, mode, link: olink };
}

// ---------------------------------------------------------------- cambiar estado
export async function setOrderStatus(c, o, to, { note = '', userId = null, carrier = '', tracking = '', pickup = '', system = false } = {}) {
  const { db } = c;
  if (!system && !(NEXT[o.status] || []).includes(to)) throw new V.ValidationError('Ese cambio de estado no está permitido.');
  const t = nowIso();
  const sets = ['status=?', 'updated_at=?'], args = [to, t];
  if (to === 'pagado' && !o.paid_at) { sets.push('paid_at=?'); args.push(t); }
  if (to === 'enviado') { sets.push('carrier=?', 'tracking_code=?'); args.push(V.line(carrier, 60), V.line(tracking, 60)); }
  if (to === 'listo_retiro' && pickup) { sets.push('zone_code=?', 'zone_name=?'); const z = await db.first("SELECT code, name FROM shipping_zones WHERE code=? AND kind='retiro'", [pickup]); args.push(z?.code || o.zone_code, z?.name || o.zone_name); }
  const r = await db.run(`UPDATE orders SET ${sets.join(', ')} WHERE id=? AND status=?`, [...args, o.id, o.status]);
  if (!r.changes) throw new V.ValidationError('El pedido cambió mientras lo veías. Revisa y vuelve a intentar.');
  await db.run('INSERT INTO order_events(order_id,at,user_id,from_status,to_status,note) VALUES (?,?,?,?,?,?)', [o.id, t, userId, o.status, to, V.text(note, 400)]);
  const fresh = await db.first('SELECT * FROM orders WHERE id=?', [o.id]);
  if (to === 'pagado') {
    await grantDigitalFor(c, fresh);
    await creditOnPaid(db, fresh, userId);
    c.waitUntil(record(db, c.req, { type: 'paid', order_id: o.id, value_cents: o.total_cents, utm_source: o.utm_source, utm_medium: o.utm_medium, ref_host: o.ref_host, partner_id: o.partner_id }, { serverType: 'paid' }).catch(() => {}));
  }
  if (to === 'en_produccion') await consumeMaterials(db, fresh, userId);
  if (['cancelado', 'devuelto', 'reembolsado'].includes(to)) await reverseOnCancel(db, fresh, userId, to);
  let notes = [];
  if (STATUS_EVENT[to]) notes = await notify(c, fresh, STATUS_EVENT[to], { link: await orderLink(c, fresh) });
  const payload = await orderPayload(db, fresh);
  await emit(c, 'estado_cambiado', { ...payload, estado_anterior: o.status });
  if (to === 'pagado') {
    await emit(c, 'pago_verificado', payload);
    c.waitUntil(serverPurchase(c, fresh).catch((e) => console.error('compra servidor', e)));
  }
  return { order: fresh, notes };
}

export async function grantDigitalFor(c, o, force = false) {
  const S = await c.db.settings();
  const days = Math.min(365, Math.max(1, Number(S['downloads.paid_days']) || 1));
  const max = Math.min(100, Math.max(1, Number(S['downloads.paid_max']) || 1));
  const lines = await c.db.all("SELECT ref_id FROM order_lines WHERE order_id=? AND kind='digital'", [o.id]);
  for (const l of lines) {
    if (!force && (await c.db.first('SELECT 1 x FROM download_grants WHERE order_id=? AND digital_product_id=?', [o.id, l.ref_id]))) continue;
    await createGrant(c.env, c.db, { orderId: o.id, digitalId: l.ref_id, hours: 24 * days, max });
  }
}

// Al pasar a "En preparación" se descuentan del inventario los materiales de la receta de cada pieza
async function consumeMaterials(db, o, userId) {
  if (await db.first("SELECT 1 x FROM material_moves WHERE order_id=? AND kind='consumo'", [o.id])) return;
  const lines = await db.all("SELECT kind, ref_id, qty, snapshot FROM order_lines WHERE order_id=? AND kind IN ('product','look')", [o.id]);
  const need = new Map();
  for (const l of lines) {
    const items = l.kind === 'look' ? (JSON.parse(l.snapshot || '{}').items || []).map((i) => [i.id, i.qty * l.qty]) : [[l.ref_id, l.qty]];
    for (const [pid, q] of items) for (const b of await db.all('SELECT material_id, qty FROM product_bom WHERE product_id=?', [pid])) need.set(b.material_id, (need.get(b.material_id) || 0) + b.qty * q);
  }
  if (!need.size) return;
  const t = nowIso();
  const stmts = [];
  for (const [mid, q] of need) {
    stmts.push(['INSERT INTO material_moves(material_id,qty,kind,order_id,unit_cost_mc,note,user_id,created_at) VALUES (?,?,?,?,(SELECT unit_cost_mc FROM materials WHERE id=?),?,?,?)', [mid, -q, 'consumo', o.id, mid, `Pedido ${o.code}`, userId, t]]);
    stmts.push(['UPDATE materials SET stock_qty=stock_qty-? WHERE id=?', [q, mid]]);
  }
  await db.batch(stmts);
}

// ---------------------------------------------------------------- pagos
// Cuánto debe pagar la clienta en la moneda del método (Bs con la tasa fijada al pedido)
export async function amountDue(c, o, pm) {
  const paidUsd = await c.db.n("SELECT COALESCE(SUM(usd_cents),0) n FROM payments WHERE order_id=? AND status='verificado'", [o.id]);
  const dueUsd = Math.max(0, o.total_cents - paidUsd);
  if (pm.currency !== 'Bs') return { currency: 'USD', usd: dueUsd, amount: dueUsd };
  const S = await c.db.settings();
  const lockH = Number(S['payments.rate_lock_hours'] || 12);
  let milli = o.rate_milli, at = o.rate_at;
  const stale = !milli || Date.now() - Date.parse(at) > lockH * 3600e3;
  if (stale) {
    const cur = await currentRate(c.db);
    if (!cur) return { currency: 'Bs', usd: dueUsd, amount: null, noRate: true };
    if (cur.milli !== milli || stale) {
      milli = cur.milli; at = cur.at;
      // Se vuelve a fijar la tasa del día (pasó el tiempo de bloqueo)
      await c.db.run('UPDATE orders SET rate_milli=?, rate_at=?, rate_source=?, total_bs_cents=? WHERE id=?', [milli, nowIso(), cur.source, toBs(o.total_cents, milli), o.id]);
      at = nowIso();
    }
  }
  return { currency: 'Bs', usd: dueUsd, amount: toBs(dueUsd, milli), milli, at };
}

export function methodDetails(pm) {
  try { return JSON.parse(pm.details || '{}'); } catch { return {}; }
}

export const PROOF_MAX = 6 * 1024 * 1024;

// "Ya pagué": la clienta reporta su pago con referencia (y captura si el método la pide)
export async function reportPayment(c, o, f, file) {
  const { db, env } = c;
  if (!['creado', 'confirmado_por_whatsapp', 'pago_reportado', 'anticipo_recibido'].includes(o.status)) throw new V.ValidationError('Este pedido ya no recibe pagos.');
  const pm = await db.first('SELECT * FROM payment_methods WHERE code=? AND active=1', [o.pay_code]);
  if (!pm) throw new V.ValidationError('El método de pago de este pedido ya no está disponible. Escríbenos por WhatsApp.');
  if (pm.proof === 'none') throw new V.ValidationError('Este método se paga al recibir o retirar el pedido.');
  if ((await db.n("SELECT COUNT(*) n FROM payments WHERE order_id=? AND status='reportado'", [o.id])) >= 3) throw new V.ValidationError('Ya tienes pagos por verificar en este pedido. Espera nuestra confirmación.');
  const due = await amountDue(c, o, pm);
  const kind = pm.kind;
  const p = { payer_bank: '', payer_phone: '', payer_doc: '', payer_name: '', payer_email: '' };
  let reference;
  if (kind === 'pago_movil' || kind === 'transferencia') {
    p.payer_bank = V.bankCode(f.bank);
    if (kind === 'pago_movil') p.payer_phone = V.phoneKey(f.phone);
    if (f.docNumber) p.payer_doc = V.docKey(f.docType, f.docNumber);
    reference = V.reference(f.reference, { min: 4, max: 20 });
  } else if (kind === 'zelle') {
    p.payer_name = V.personName(f.name); p.payer_email = V.emailKey(f.email, { required: false });
    reference = V.reference(f.reference, { min: 4, max: 30 });
  } else if (kind === 'binance' || kind === 'paypal') {
    p.payer_email = V.emailKey(f.email, { required: false }); p.payer_name = V.line(f.name, 80);
    reference = V.reference(f.reference, { min: 6, max: 40 });
  } else reference = V.reference(f.reference, { min: 3, max: 40 });
  const paidOn = V.isoDay(f.date);
  const amount = V.amountCents(f.amount);
  const usd = pm.currency === 'Bs' ? (due.milli ? fromBs(amount, due.milli) : 0) : amount;
  // Captura del comprobante
  let proofPath = null, proofSha = null;
  if (file && file.size) {
    if (file.size > PROOF_MAX) throw new V.ValidationError('La captura pesa demasiado (máximo 6 MB).');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes.slice(0, 64));
    if (!['jpeg', 'png', 'webp', 'pdf'].includes(type)) throw new V.ValidationError('La captura debe ser una imagen (JPG, PNG o WEBP) o un PDF.');
    proofPath = `p/comprobantes/${o.id}/${randomToken(12)}.${type === 'jpeg' ? 'jpg' : type}`;
    const info = await putFile(env, db, proofPath, bytes, { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[type], { maxBytes: PROOF_MAX });
    proofSha = info.sha256;
  } else if (pm.proof === 'ref_capture') throw new V.ValidationError('Adjunta la captura del pago.');
  const refKey = `${kind}|${p.payer_bank}|${reference}`;
  const t = nowIso();
  let pid;
  try {
    pid = (await db.run(`INSERT INTO payments(order_id,method_code,method_kind,currency,amount_cents,usd_cents,rate_milli,reference,ref_key,payer_bank,payer_phone,payer_doc,payer_name,payer_email,paid_on,proof_path,proof_sha256,status,verifier,ip,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'reportado','manual',?,?)`,
    [o.id, pm.code, kind, pm.currency, amount, usd, due.milli ?? null, reference, refKey, p.payer_bank, p.payer_phone, p.payer_doc, p.payer_name, p.payer_email, paidOn, proofPath, proofSha,
      (c.req.headers.get('CF-Connecting-IP') || c.req.headers.get('X-Forwarded-For') || '').split(',')[0].trim().slice(0, 45), t])).id;
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) throw new V.ValidationError('Esa referencia ya fue reportada. Si crees que es un error, escríbenos por WhatsApp.');
    throw e;
  }
  const dup = proofSha ? await db.n('SELECT COUNT(*) n FROM payments WHERE proof_sha256=? AND id<>?', [proofSha, pid]) : 0;
  if (dup) await db.run("UPDATE payments SET verifier_result='Atención: esta misma captura ya se usó en otro pago.' WHERE id=?", [pid]);
  let order = o;
  if (o.status !== 'pago_reportado' && o.status !== 'anticipo_recibido') order = (await setOrderStatus(c, o, 'pago_reportado', { note: `Pago reportado: ${pm.name}, ref. ${reference}`, system: true })).order;
  const payment = await db.first('SELECT * FROM payments WHERE id=?', [pid]);
  const link = await orderLink(c, order);
  const monto = pm.currency === 'Bs' ? bs(amount) : `${money(amount)} USD`;
  await notify(c, order, 'pago_reportado', { link, referencia: reference, monto });
  await notify(c, order, 'duena_pago', { link, referencia: reference, monto });
  await emit(c, 'pago_reportado', { ...(await orderPayload(db, order)), pago: { metodo: pm.name, referencia: reference, monto } });
  // Verificación automática (si está activada y conectada)
  const S = await db.settings();
  const v = await autoVerify(env, S, payment, order);
  if (v.status !== 'manual') {
    await db.run('UPDATE payments SET verifier=?, verifier_result=? WHERE id=?', ['api', `${v.status}: ${v.detail || ''}`.slice(0, 300), pid]);
    const enough = pm.currency === 'Bs' ? due.amount != null && amount >= Math.floor(due.amount * 0.995) : amount >= due.amount;
    if (v.status === 'verified' && enough && !dup) return { payment: await approvePayment(c, payment, { markPaid: true, auto: true }), auto: true };
  }
  return { payment, auto: false };
}

export async function approvePayment(c, payment, { userId = null, markPaid = true, auto = false } = {}) {
  const { db } = c;
  const r = await db.run("UPDATE payments SET status='verificado', reviewed_by=?, reviewed_at=? WHERE id=? AND status='reportado'", [userId, nowIso(), payment.id]);
  if (!r.changes) throw new V.ValidationError('Ese pago ya fue revisado.');
  let o = await db.first('SELECT * FROM orders WHERE id=?', [payment.order_id]);
  if (markPaid && !PAID.includes(o.status)) {
    if (o.status === 'creado' || o.status === 'confirmado_por_whatsapp') o = (await setOrderStatus(c, o, 'pago_reportado', { system: true, userId })).order;
    await setOrderStatus(c, o, 'pagado', { userId, note: auto ? 'Pago verificado automáticamente' : 'Pago verificado', system: true });
  }
  return db.first('SELECT * FROM payments WHERE id=?', [payment.id]);
}

export async function rejectPayment(c, payment, { userId, reason }) {
  const { db } = c;
  const why = V.line(reason, 200) || 'No encontramos el pago en nuestra cuenta';
  const r = await db.run("UPDATE payments SET status='rechazado', reviewed_by=?, reviewed_at=?, reject_reason=? WHERE id=? AND status='reportado'", [userId, nowIso(), why, payment.id]);
  if (!r.changes) throw new V.ValidationError('Ese pago ya fue revisado.');
  let o = await db.first('SELECT * FROM orders WHERE id=?', [payment.order_id]);
  const pending = await db.n("SELECT COUNT(*) n FROM payments WHERE order_id=? AND status='reportado'", [o.id]);
  if (o.status === 'pago_reportado' && !pending) o = (await setOrderStatus(c, o, 'creado', { userId, note: `Pago no confirmado: ${why}`, system: true })).order;
  const notes = await notify(c, o, 'pago_rechazado', { link: await orderLink(c, o), motivo: why });
  await emit(c, 'pago_rechazado', { ...(await orderPayload(db, o)), motivo: why });
  return { order: o, notes };
}

// La clienta puede cambiar el método mientras no haya pagado (el recargo se recalcula)
export async function changeMethod(c, o, code) {
  const { db } = c;
  if (!['creado', 'confirmado_por_whatsapp'].includes(o.status)) throw new V.ValidationError('Ya no puedes cambiar el método de pago de este pedido.');
  const pm = await db.first('SELECT * FROM payment_methods WHERE code=? AND active=1', [String(code || '')]);
  if (!pm) throw new V.ValidationError('Ese método de pago no está disponible.');
  const zone = await db.first('SELECT kind FROM shipping_zones WHERE code=?', [o.zone_code]);
  const physical = o.zone_code && o.shipping_label !== 'Entrega digital';
  if (pm.island_only && physical && !['isla', 'retiro'].includes(zone?.kind)) throw new V.ValidationError(`${pm.name} solo está disponible para entregas en la isla.`);
  if (pm.pickup_only && zone?.kind !== 'retiro') throw new V.ValidationError(`${pm.name} solo está disponible si retiras tu pedido.`);
  const { pct } = await import('./pricing.js');
  const base = o.subtotal_cents - o.discount_cents + o.shipping_cents;
  const adj = pct(base, pm.adj_bps);
  const total = base + adj;
  await db.run('UPDATE orders SET pay_code=?, pay_name=?, adj_cents=?, total_cents=?, total_bs_cents=CASE WHEN rate_milli IS NULL THEN NULL ELSE total_bs_cents END, updated_at=? WHERE id=? AND status=?',
    [pm.code, pm.name, adj, total, nowIso(), o.id, o.status]);
  const fresh = await db.first('SELECT * FROM orders WHERE id=?', [o.id]);
  if (fresh.rate_milli) await db.run('UPDATE orders SET total_bs_cents=? WHERE id=?', [toBs(total, fresh.rate_milli), o.id]);
  await db.run('INSERT INTO order_events(order_id,at,from_status,to_status,note) VALUES (?,?,?,?,?)', [o.id, nowIso(), o.status, o.status, `La clienta cambió el método de pago a ${pm.name}`]);
  return db.first('SELECT * FROM orders WHERE id=?', [o.id]);
}
