// Pedidos: listado, detalle con instantánea de precios, pagos reportados, cambio de estado con avisos por WhatsApp,
// envío o retiro, referida por, costo de producción (solo Administración) y descargas digitales.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { orderLinks } from '../lib/downloads.js';
import { waTo } from '../lib/notify.js';
import { NEXT, STATUS, approvePayment, methodDetails, grantDigitalFor, newAccess, orderLink, rejectPayment, setOrderStatus } from '../lib/orders.js';
import { money } from '../lib/pricing.js';
import { bs, rateText } from '../lib/rates.js';
import { audit } from '../lib/security.js';
import { CHANNELS, TRAFFIC } from '../lib/analytics.js';
import { ValidationError, bankName, docText, phoneText } from '../lib/validate.js';
import { HttpError, readForm, redirect } from '../http.js';
import { waUrl } from '../public.js';
import { mediaUrl } from '../lib/repo.js';
import { readColors } from '../lib/variants.js';
import { DETAIL_LABELS, KIND_FIELDS } from '../views/shop.js';
import { afterWrite } from './common.js';
import { badge, csrf, empty, fmt, layout } from './ui.js';

export { STATUS };
const st = (s) => badge(STATUS[s]?.[0] || s, STATUS[s]?.[1] || '');
const PST = { reportado: ['Por verificar', 'gold'], verificado: ['Verificado', 'ok'], rechazado: ['Rechazado', 'bad'] };
const SRC = { codigo: 'escribió su código', enlace: 'entró por su enlace', tienda: 'compró en su tienda' };

export async function list(c) {
  const f = c.url.searchParams.get('estado') || '';
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 40);
  const where = [], args = [];
  if (f === 'abiertos') where.push("status IN ('creado','confirmado_por_whatsapp','pago_reportado','anticipo_recibido','pagado','en_produccion','listo','listo_retiro','enviado')");
  else if (f && STATUS[f]) { where.push('status=?'); args.push(f); }
  if (q) { where.push('(code LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR customer_doc LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q.replace(/\W/g, '')}%`); }
  const rows = await c.db.all(`SELECT id, code, status, customer_name, total_cents, kind, created_at, attribution_code, close_mode, channel FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`, args);
  const allLines = rows.length ? await c.db.all(`SELECT id, order_id, kind, ref_id, name, variant, qty, snapshot FROM order_lines WHERE order_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`, rows.map((r) => r.id)) : [];
  const thumbs = await lineThumbs(c.db, allLines);
  const byOrder = new Map();
  for (const l of allLines) { if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, []); byOrder.get(l.order_id).push(l); }
  const pieces = (oid) => { const ls = byOrder.get(oid) || []; if (!ls.length) return ''; const first = ls[0]; const n = ls.reduce((a, l) => a + l.qty, 0);
    return html`<div class="ol-mini"><span class="ol-stack">${ls.slice(0, 3).map((l) => { const t = thumbs.get(l.id) || {}; return t.url ? html`<img src="${t.url}" alt="" loading="lazy" title="${l.name}${l.variant ? ' · ' + l.variant : ''}">` : html`<i></i>`; })}</span><span><b>${first.name}</b>${ls.length > 1 ? html` <small class="muted">+${ls.length - 1} más</small>` : ''}<small class="muted">${n} ${n === 1 ? 'pieza' : 'piezas'}${first.variant ? ` · ${first.variant}` : ''}</small></span></div>`; };
  const body = html`<form class="filters" method="get"><input type="search" name="q" value="${q}" placeholder="Código, nombre, teléfono o cédula">
  <select name="estado"><option value="">Todos</option><option value="abiertos"${f === 'abiertos' ? raw(' selected') : ''}>Abiertos</option>${Object.entries(STATUS).map(([k, [n]]) => html`<option value="${k}"${k === f ? raw(' selected') : ''}>${n}</option>`)}</select><button class="btn ghost">Filtrar</button></form>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Piezas</th><th>Cliente</th><th>Tipo</th><th>Origen</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
${rows.map((o) => html`<tr><td><a href="/admin/pedidos/${o.id}">${o.code}</a>${o.attribution_code ? html` <small class="muted">· ${o.attribution_code}</small>` : ''}</td><td>${pieces(o.id)}</td><td>${o.customer_name}</td><td>${o.kind}${o.close_mode === 'web' ? html` <small class="muted">· web</small>` : ''}</td><td><small>${CHANNELS[o.channel] || o.channel}</small></td><td>${money(o.total_cents)}</td><td>${st(o.status)}</td><td>${fmt.date(o.created_at)}</td></tr>`)}
</tbody></table></div>` : empty('Todavía no hay pedidos. Cuando una clienta finaliza su carrito, el pedido aparece aquí.')}`;
  return layout(c, { title: 'Pedidos', active: 'orders', body });
}

// Foto de cada línea del pedido (pieza, look o guía) y el color de la variante elegida, para reconocerla de un vistazo
async function lineThumbs(db, lines) {
  const ids = (k) => [...new Set(lines.filter((l) => l.kind === k).map((l) => l.ref_id).filter(Number.isInteger))];
  const q = (sql, list) => (list.length ? db.all(sql.replace('(?)', `(${list.map(() => '?').join(',')})`), list) : []);
  const [prods, looks, digs] = await Promise.all([
    q(`SELECT p.id, p.colors, (SELECT m.path FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=p.id ORDER BY CASE pm.role WHEN 'main' THEN 0 ELSE 1 END, pm.sort LIMIT 1) path FROM products p WHERE p.id IN (?)`, ids('product')),
    q('SELECT l.id, m.path FROM looks l LEFT JOIN media m ON m.id=l.media_id WHERE l.id IN (?)', ids('look')),
    q('SELECT d.id, m.path FROM digital_products d LEFT JOIN media m ON m.id=d.cover_media_id WHERE d.id IN (?)', ids('digital')),
  ]);
  const P = new Map(prods.map((r) => [r.id, r])), L = new Map(looks.map((r) => [r.id, r.path])), G = new Map(digs.map((r) => [r.id, r.path]));
  const out = new Map();
  for (const l of lines) {
    const s = (() => { try { return JSON.parse(l.snapshot || '{}'); } catch { return {}; } })();
    const p = l.kind === 'product' ? P.get(l.ref_id) : null;
    const path = l.kind === 'product' ? p?.path : l.kind === 'look' ? L.get(l.ref_id) : G.get(l.ref_id);
    const hex = s.color && p ? (readColors(p.colors)?.items.find((x) => x.name === s.color)?.hex || '') : '';
    out.set(l.id, { url: path ? mediaUrl(path) : '', hex, color: s.color || '' });
  }
  return out;
}

// Botón para avisar a la clienta por WhatsApp con el mensaje listo (abre su chat; se marca como avisado)
const waBtn = (c, n, label = 'Avisar por WhatsApp') => html`<a class="btn sm wa" href="${waTo(n.recipient, n.body)}" target="_blank" rel="noopener" data-mark-sent="${n.id}">${label} ↗</a>`;

export async function detail(c, id) {
  const { db, user } = c;
  let o = await db.first('SELECT * FROM orders WHERE id=?', [id]);
  if (!o) throw new HttpError(404);
  let newLink = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    const back = (k, m) => redirect(`/admin/pedidos/${id}?${k}=${encodeURIComponent(m)}`, 303);
    try {
      if (f._action === 'status') {
        const r = await setOrderStatus(c, o, String(f.to || ''), { note: f.note, userId: user.id, carrier: f.carrier, tracking: f.tracking, pickup: f.pickup });
        await audit(db, c, 'estado_pedido', 'orders', id, { from: o.status, to: r.order.status });
        const wa = r.notes.find((n) => n.channel === 'whatsapp');
        return redirect(`/admin/pedidos/${id}?msg=${encodeURIComponent('Estado actualizado.')}${wa ? `&aviso=${wa.id}` : ''}#avisos`, 303);
      }
      if (f._action === 'approve' || f._action === 'reject') {
        const p = await db.first('SELECT * FROM payments WHERE id=? AND order_id=?', [Number(f.payment), id]);
        if (!p) throw new ValidationError('Pago no encontrado.');
        if (f._action === 'approve') {
          await approvePayment(c, p, { userId: user.id, markPaid: f.mark === '1' });
          await audit(db, c, 'pago_verificado', 'payments', p.id, { order: o.code, ref: p.reference });
          const n = await db.first("SELECT id FROM notifications WHERE order_id=? AND channel='whatsapp' AND event='pago_verificado' ORDER BY id DESC LIMIT 1", [id]);
          return redirect(`/admin/pedidos/${id}?msg=${encodeURIComponent('Pago verificado.')}${n ? `&aviso=${n.id}` : ''}#avisos`, 303);
        }
        const r = await rejectPayment(c, p, { userId: user.id, reason: f.reason });
        await audit(db, c, 'pago_rechazado', 'payments', p.id, { order: o.code, reason: f.reason });
        const wa = r.notes.find((n) => n.channel === 'whatsapp');
        return redirect(`/admin/pedidos/${id}?msg=${encodeURIComponent('Pago marcado como no confirmado.')}${wa ? `&aviso=${wa.id}` : ''}#avisos`, 303);
      }
    } catch (e) {
      if (e instanceof ValidationError) return back('err', e.message);
      throw e;
    }
    if (f._action === 'note') {
      await db.run('INSERT INTO order_events(order_id,at,user_id,from_status,to_status,note) VALUES (?,?,?,?,?,?)', [id, nowIso(), user.id, o.status, o.status, String(f.note || '').slice(0, 400)]);
      return back('msg', 'Nota agregada.');
    }
    if (f._action === 'grants') {
      await grantDigitalFor(c, o, true);
      return back('msg', 'Enlaces de descarga creados.');
    }
    if (f._action === 'client_link') {
      const a = await newAccess(c.env);
      await db.run('UPDATE orders SET access_hash=?, access_nonce=? WHERE id=?', [a.hash, a.nonce, id]);
      await audit(db, c, 'enlace_cliente', 'orders', id);
      o = await db.first('SELECT * FROM orders WHERE id=?', [id]);
      newLink = `${c.base}/pedido/${o.code}?t=${a.token}`;
    }
  }
  const S = await db.settings();
  const [lines, events, pm, links, payments, notes, pickups, customer, partner] = await Promise.all([
    db.all('SELECT * FROM order_lines WHERE order_id=? ORDER BY id', [id]),
    db.all('SELECT e.*, u.name uname FROM order_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.order_id=? ORDER BY e.id', [id]),
    db.first('SELECT * FROM payment_methods WHERE code=?', [o.pay_code]),
    orderLinks(c.env, db, id),
    db.all('SELECT p.*, u.name rname FROM payments p LEFT JOIN users u ON u.id=p.reviewed_by WHERE p.order_id=? ORDER BY p.id DESC', [id]),
    db.all('SELECT * FROM notifications WHERE order_id=? ORDER BY id DESC LIMIT 30', [id]),
    db.all("SELECT code, name FROM shipping_zones WHERE kind='retiro' AND active=1 ORDER BY sort"),
    o.customer_id ? db.first('SELECT id, name, pw_hash FROM customers WHERE id=?', [o.customer_id]) : null,
    o.partner_id ? db.first('SELECT id, name, kind, code FROM partners WHERE id=?', [o.partner_id]) : null,
  ]);
  const isAdmin = user.role === 'ADMIN';
  const hasDigital = lines.some((l) => l.kind === 'digital');
  const aviso = Number(c.url.searchParams.get('aviso') || 0);
  const fresh = notes.find((n) => n.id === aviso && n.channel === 'whatsapp');
  const ledger = o.partner_id ? await db.n('SELECT COALESCE(SUM(amount_cents),0) n FROM ledger_entries WHERE order_id=?', [id]) : 0;
  const custLink = await orderLink(c, o);
  const span = 3, tail = isAdmin ? raw('<td></td>') : '';
  const pmDetails = pm ? methodDetails(pm) : {};
  const pmFields = (KIND_FIELDS[pm?.kind] || []).filter((k) => pmDetails[k]);
  const thumbs = await lineThumbs(db, lines);
  const body = html`
${fresh ? html`<section class="card notice" id="avisos"><h2>Avisa a la clienta</h2><p>${fresh.subject}</p><pre class="msg">${fresh.body}</pre><p>${waBtn(c, fresh, `Enviar por WhatsApp a ${o.customer_name.split(' ')[0]}`)}</p><p class="help">Se abre el chat de la clienta con el mensaje escrito; solo tienes que tocar enviar.</p></section>` : ''}
${payments.some((p) => p.status === 'reportado') ? html`<section class="card notice"><h2>Pago por verificar</h2>${payments.filter((p) => p.status === 'reportado').map((p) => payCard(c, o, p, true))}</section>` : ''}
<div class="cols order-cols">
<div class="stack">
<section class="card"><h2>Piezas</h2><table class="tbl"><thead><tr><th>Pieza</th><th>Cant.</th><th>Unit.</th><th>Total</th>${isAdmin ? html`<th>Costo aliada</th>` : ''}</tr></thead><tbody>
${lines.map((l) => { const s = JSON.parse(l.snapshot || '{}'); const cost = l.kind === 'look' ? (s.items || []).reduce((a, i) => a + (i.cost || 0) * i.qty, 0) * l.qty : (s.cost ?? null) != null ? s.cost * l.qty : null;
    const th = thumbs.get(l.id) || {};
    return html`<tr><td><div class="ol-item">${th.url ? html`<a class="ol-ph" href="${th.url}" target="_blank" rel="noopener"><img src="${th.url}" alt="" loading="lazy"></a>` : html`<span class="ol-ph none" aria-hidden="true"></span>`}<div><b>${l.name}</b>${th.color ? html`<span class="ol-var">${th.hex ? html`<i style="background:${th.hex}"></i>` : ''}${th.color}</span>` : ''}<small class="muted"> ${l.sku}${(th.color ? s.size : l.variant) ? ' · ' + (th.color ? s.size : l.variant) : ''}${s.campaign ? ` · temporada −${s.campaign.bps / 100} %` : ''}${s.priceKind === 'tienda' ? ' · precio de la tienda' : ''}</small>${l.kind === 'look' ? html`<small class="muted"><br>${(s.items || []).map((i) => `${i.name} ×${i.qty}`).join(', ')}</small>` : ''}</div></div></td><td>${l.qty}</td><td>${money(l.unit_cents)}</td><td>${money(l.total_cents)}</td>${isAdmin ? html`<td>${cost != null ? money(cost) : '—'}</td>` : ''}</tr>`; })}
</tbody><tfoot><tr><td colspan="${span}">Subtotal</td><td>${money(o.subtotal_cents)}</td>${tail}</tr>
${o.discount_cents ? html`<tr><td colspan="${span}">Descuento${o.coupon_code ? ` · cupón ${o.coupon_code}` : o.attribution_code ? ` · código ${o.attribution_code}` : ''}</td><td>−${money(o.discount_cents)}</td>${tail}</tr>` : ''}
<tr><td colspan="${span}">Envío · ${o.zone_name}</td><td>${o.shipping_label}</td>${tail}</tr>
${o.adj_cents ? html`<tr><td colspan="${span}">Ajuste ${o.pay_name}</td><td>${money(o.adj_cents)}</td>${tail}</tr>` : ''}<tr><td colspan="${span}"><b>Total</b></td><td><b>${money(o.total_cents)} USD</b></td>${tail}</tr>
${o.total_bs_cents ? html`<tr><td colspan="${span}"><small class="muted">En bolívares (tasa ${rateText(o.rate_milli)} del ${fmt.date(o.rate_at)})</small></td><td><small>${bs(o.total_bs_cents)}</small></td>${tail}</tr>` : ''}</tfoot></table>
<p class="help">Los precios quedaron fijados al crear el pedido. Cambios posteriores en la tienda no lo alteran.</p>
${isAdmin && o.prod_cost_cents ? html`<p class="help">Costo de producción (materiales y mano de obra al crear el pedido): <b>${money(o.prod_cost_cents)}</b> · Margen bruto: <b>${money(o.subtotal_cents - o.discount_cents - o.prod_cost_cents)}</b></p>` : ''}</section>
<section class="card" id="${fresh ? '' : 'avisos'}"><h2>Avisos a la clienta</h2>${notes.length ? html`<div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Aviso</th><th>Canal</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>
${notes.map((n) => html`<tr><td>${n.subject}</td><td>${{ whatsapp: 'WhatsApp (manual)', email: 'Correo', telegram: 'Telegram', webhook: 'Webhook' }[n.channel]}</td><td>${{ pendiente: n.channel === 'whatsapp' ? 'Por avisar' : 'Enviando', enviada: 'Enviado', fallida: `Falló ${n.error}`, omitida: 'Omitido' }[n.status]}</td><td>${fmt.date(n.created_at)}</td><td class="r">${n.channel === 'whatsapp' && n.audience === 'clienta' ? waBtn(c, n, n.status === 'enviada' ? 'Reenviar' : 'Avisar') : ''}</td></tr>`)}</tbody></table></div>`
  : html`<p class="muted">Aún no hay avisos.</p>`}</section>
<section class="card"><h2>Historial</h2><ol class="timeline">${events.map((e) => html`<li><b>${STATUS[e.to_status]?.[0] || e.to_status}</b> <small class="muted">${fmt.date(e.at)}${e.uname ? ` · ${e.uname}` : ''}</small>${e.note ? html`<br>${e.note}` : ''}</li>`)}</ol>
<form method="post" class="addrow">${csrf(c)}<input type="hidden" name="_action" value="note"><input name="note" placeholder="Agregar una nota interna" maxlength="400" required><button class="btn sm ghost">Agregar</button></form></section>
<section class="card"><h2>Mensaje del pedido</h2><pre class="msg">${o.wa_message}</pre></section>
${hasDigital ? html`<section class="card"><h2>Descargas</h2>${links.length ? html`<ul class="links">${links.map((l) => html`<li>${l.title}: <code>${c.base}${l.url}</code> <small class="muted">${l.active ? `vence ${fmt.date(l.expires)} · quedan ${l.left}` : 'vencido'}</small></li>`)}</ul>` : html`<p class="muted">Se crean solos al marcar el pedido como pagado.</p>`}
<form method="post">${csrf(c)}<input type="hidden" name="_action" value="grants"><button class="btn sm ghost">Crear enlaces nuevos</button></form></section>` : ''}
</div>
<aside class="stack">
<section class="card"><h2>${o.code}</h2><p>${st(o.status)} · ${o.kind} · cierre ${o.close_mode === 'web' ? 'con pago en la web' : 'por WhatsApp'}</p><p class="muted">Creado ${fmt.date(o.created_at)}${o.paid_at ? ` · pagado ${fmt.date(o.paid_at)}` : ''}</p>
${(NEXT[o.status] || []).length ? html`<form method="post" class="stack" data-status-form>${csrf(c)}<input type="hidden" name="_action" value="status">
<label>Cambiar estado<select name="to" data-status-to>${NEXT[o.status].map((s) => html`<option value="${s}">${STATUS[s][0]}</option>`)}</select></label>
<div data-when="enviado" hidden><label>Empresa de envío<input name="carrier" maxlength="60" placeholder="MRW, Zoom, Tealca, Domesa…" value="${o.carrier}"></label><label>Número de guía<input name="tracking" maxlength="60" value="${o.tracking_code}"></label></div>
<div data-when="listo_retiro" hidden><label>Punto de retiro<select name="pickup">${pickups.map((z) => html`<option value="${z.code}"${z.code === o.zone_code ? raw(' selected') : ''}>${z.name}</option>`)}</select></label></div>
<label>Nota (opcional)<input name="note" maxlength="400"></label><button class="btn sm">Actualizar</button>
<p class="help">Al guardar te mostramos el mensaje para avisar a la clienta por WhatsApp.</p></form>` : ''}
</section>
<section class="card"><h2>Cliente</h2><p><b>${o.customer_name}</b>${customer ? html` · <a href="/admin/clientas/${customer.id}">${customer.pw_hash ? 'con cuenta' : 'ficha'}</a>` : ''}<br>${o.customer_phone}${o.customer_doc ? html`<br>${docText(o.customer_doc)}` : ''}${o.customer_email ? html`<br>${o.customer_email}` : ''}</p>
${o.customer_address ? html`<p>${[o.customer_address, o.customer_city, o.customer_state].filter(Boolean).join(', ')}</p>` : ''}${o.customer_notes ? html`<p class="muted">${o.customer_notes}</p>` : ''}
<p>Referida por: ${partner ? html`<a href="/admin/afiliadas/${partner.id}"><b>${partner.name}</b></a> (${partner.kind === 'emprendedora' ? 'aliada' : 'embajadora'}, ${partner.code}) · ${SRC[o.attribution_source] || ''}${ledger ? html` · ${partner.kind === 'emprendedora' ? 'ganancia' : 'comisión'} ${money(ledger)}` : ''}` : o.attribution_code ? html`<b>${o.attribution_code}</b>` : 'nadie (venta directa)'}</p>
<p class="muted">Llegó por: ${CHANNELS[o.channel] || o.channel} · ${TRAFFIC[o.traffic] || o.traffic}${o.utm_campaign ? ` · campaña ${o.utm_campaign}` : ''}</p>
<a class="btn sm ghost" href="${waTo(o.customer_phone, `Hola, ${o.customer_name.split(' ')[0]}. Te escribimos de ${S['brand.name']} por tu pedido ${o.code}.`)}" target="_blank" rel="noopener">Escribirle por WhatsApp ↗</a></section>
<section class="card"><h2>Pago · ${o.pay_name}</h2>${pmFields.length ? html`<dl class="dl">${pmFields.map((k) => html`<dt>${DETAIL_LABELS[k]}</dt><dd>${pmDetails[k]}</dd>`)}</dl>
<p class="help">Son los datos que la clienta ve en su pantalla de pago.</p>` : pm?.instructions ? html`<pre class="msg" data-copyable>${pm.instructions}</pre><button class="btn sm ghost" data-copy-prev>Copiar datos de pago</button>` : html`<p class="muted">${pm && pm.proof === 'none' ? 'Se paga al recibir o retirar.' : html`Faltan los datos de la cuenta: cárgalos en <a href="/admin/pagos">Métodos de pago</a>.`}</p>`}</section>
${payments.filter((p) => p.status !== 'reportado').length ? html`<section class="card"><h2>Pagos revisados</h2>${payments.filter((p) => p.status !== 'reportado').map((p) => payCard(c, o, p, false))}</section>` : ''}
<section class="card"><h2>Enlace de seguimiento para la clienta</h2>${newLink ? html`<p>Nuevo enlace (el anterior dejó de funcionar):</p><pre class="msg">${newLink}</pre>` : o.access_nonce ? html`<pre class="msg">${custLink}</pre><button class="btn sm ghost" data-copy-prev>Copiar enlace</button>` : ''}
<p class="help">La clienta ve aquí el estado y, si aplica, la pantalla de pago. Si sospechas que otra persona lo tiene, crea uno nuevo.</p><form method="post">${csrf(c)}<input type="hidden" name="_action" value="client_link"><button class="btn sm ghost">Crear enlace nuevo</button></form></section>
</aside></div>`;
  return layout(c, { title: `Pedido ${o.code}`, active: 'orders', body, actions: html`<a class="btn ghost" href="/admin/pedidos">← Pedidos</a>` });
}

export function payCard(c, o, p, actions) {
  const due = o.total_cents;
  const ok = p.currency === 'Bs' ? p.usd_cents >= Math.floor(due * 0.995) : p.amount_cents >= due;
  return html`<div class="paycard">
  <div class="pc-main"><p>${badge(PST[p.status][0], PST[p.status][1])} <b>${p.currency === 'Bs' ? bs(p.amount_cents) : `${money(p.amount_cents)} USD`}</b>${p.currency === 'Bs' ? html` <small class="muted">≈ ${money(p.usd_cents)} USD (tasa ${p.rate_milli ? rateText(p.rate_milli) : '—'})</small>` : ''} ${ok ? '' : badge('Monto menor al total', 'warn')}</p>
  <dl class="dl"><dt>Método</dt><dd>${p.method_name || (p.method_code === o.pay_code ? o.pay_name : p.method_code)}</dd><dt>Referencia</dt><dd><b class="mono">${p.reference}</b></dd>${p.payer_bank ? html`<dt>Banco de origen</dt><dd>${p.payer_bank} ${bankName(p.payer_bank)}</dd>` : ''}
  ${p.payer_phone ? html`<dt>Teléfono</dt><dd>${phoneText(p.payer_phone)}</dd>` : ''}${p.payer_doc ? html`<dt>Cédula</dt><dd>${docText(p.payer_doc)}</dd>` : ''}${p.payer_name ? html`<dt>Titular</dt><dd>${p.payer_name}</dd>` : ''}${p.payer_email ? html`<dt>Correo</dt><dd>${p.payer_email}</dd>` : ''}
  <dt>Fecha del pago</dt><dd>${p.paid_on}</dd><dt>Reportado</dt><dd>${fmt.date(p.created_at)}</dd>${p.verifier_result ? html`<dt>Verificador</dt><dd>${p.verifier_result}</dd>` : ''}${p.rname ? html`<dt>Revisó</dt><dd>${p.rname} · ${fmt.date(p.reviewed_at)}</dd>` : ''}${p.reject_reason ? html`<dt>Motivo</dt><dd>${p.reject_reason}</dd>` : ''}</dl></div>
  ${p.proof_path ? html`<a class="pc-proof" href="/admin/comprobante/${p.id}" target="_blank" rel="noopener">${/\.pdf$/.test(p.proof_path) ? html`<span>Ver PDF ↗</span>` : html`<img src="/admin/comprobante/${p.id}" alt="Captura del pago" loading="lazy">`}</a>` : html`<span class="pc-proof none">Sin captura</span>`}
  ${actions ? html`<div class="pc-act"><p class="help">Revisa en tu banco que el pago llegó (monto, referencia y fecha) antes de aprobar.</p>
    <form method="post" action="/admin/pedidos/${o.id}" class="inline">${csrf(c)}<input type="hidden" name="_action" value="approve"><input type="hidden" name="payment" value="${p.id}"><label class="chk"><input type="checkbox" name="mark" value="1" checked> Marcar el pedido como pagado</label> <button class="btn sm">Verificar pago</button></form>
    <form method="post" action="/admin/pedidos/${o.id}" class="inline">${csrf(c)}<input type="hidden" name="_action" value="reject"><input type="hidden" name="payment" value="${p.id}"><input name="reason" maxlength="200" placeholder="Motivo (lo verá la clienta)"> <button class="btn sm ghost bad">No llegó</button></form></div>` : ''}
</div>`;
}

// El botón abre WhatsApp directo (enlace); el panel avisa en segundo plano que se envió
export async function markSent(c, nid) {
  const n = await c.db.first('SELECT id, order_id, event, channel FROM notifications WHERE id=?', [nid]);
  if (!n || n.channel !== 'whatsapp') throw new HttpError(404);
  await c.db.run("UPDATE notifications SET status='enviada', attempts=attempts+1, sent_at=? WHERE id=?", [nowIso(), nid]);
  await audit(c.db, c, 'aviso_whatsapp', 'notifications', nid, { order: n.order_id, event: n.event });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

export { waUrl, afterWrite, grantDigitalFor as grantDigital };
