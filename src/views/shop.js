// Vistas de la tienda venezolana: pantalla de pago del pedido, Mi cuenta, temporadas, tienda de aliada y portal de afiliadas.
import { html, raw } from '../lib/html.js';
import { money } from '../lib/pricing.js';
import { bs, rateText } from '../lib/rates.js';
import { BANKS, STATES, docText, phoneText } from '../lib/validate.js';
import { STEPS, stepOf } from '../lib/orders.js';
import { pcard as productCard } from './parts.js';
import { swatchRow } from '../lib/variants.js';

const fmtDate = (iso) => {
  if (!iso) return '';
  const t = new Date(Date.parse(iso) - 4 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
};
const fmtDateTime = (iso) => {
  if (!iso) return '';
  const t = new Date(Date.parse(iso) - 4 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${fmtDate(iso)} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};
export const todayCaracas = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

export const STATUS_PUBLIC = {
  creado: 'Esperando tu pago', confirmado_por_whatsapp: 'Confirmado · esperando tu pago', pago_reportado: 'Verificando tu pago', anticipo_recibido: 'Anticipo recibido',
  pagado: 'Pago confirmado', en_produccion: 'En preparación en el taller', listo: 'Listo', listo_retiro: 'Listo para retirar', enviado: 'En camino', entregado: 'Entregado',
  expirado: 'Expirado', cancelado: 'Cancelado', devuelto: 'Devuelto', reembolsado: 'Reembolsado',
};
const PAY_STATUS = { reportado: ['Por verificar', 'wait'], verificado: ['Verificado', 'ok'], rechazado: ['No confirmado', 'bad'] };
export const DETAIL_LABELS = { banco: 'Banco', telefono: 'Teléfono', documento: 'Cédula o RIF', titular: 'Titular', cuenta: 'Número de cuenta', correo: 'Correo', pay_id: 'Pay ID', usuario: 'Usuario' };
export const KIND_FIELDS = {
  pago_movil: ['banco', 'telefono', 'documento', 'titular'], transferencia: ['banco', 'cuenta', 'documento', 'titular'], zelle: ['correo', 'titular'],
  binance: ['pay_id', 'usuario', 'correo'], paypal: ['correo'], efectivo: [], tienda: [], otro: [],
};
const REF_LABEL = { pago_movil: 'Número de referencia', transferencia: 'Número de referencia', zelle: 'Código de confirmación', binance: 'ID de la orden de Binance Pay', paypal: 'ID de la transacción de PayPal', otro: 'Referencia' };

const stepper = (status) => {
  const at = stepOf(status);
  if (at < 0) return '';
  return html`<ol class="otrack" aria-label="Avance del pedido">${STEPS.map(([k, label], i) => html`<li class="${i < at ? 'done' : i === at ? 'now' : ''}"${i === at ? raw(' aria-current="step"') : ''}><i></i><span>${label}</span></li>`)}</ol>`;
};

// Un método de pago: monto, datos para copiar y "Ya pagué" con el formulario que ese método necesita
function payPanel(m, { o, S, waHelp, pending, on }) {
  const due = m.due, isBs = due.currency === 'Bs', details = m.details || {};
  const fields = (KIND_FIELDS[m.kind] || []).filter((k) => details[k]);
  const missing = (KIND_FIELDS[m.kind] || []).length && fields.length < (KIND_FIELDS[m.kind] || []).length;
  const amountTxt = isBs ? (due.amount != null ? bs(due.amount) : '') : `${money(due.amount)} USD`;
  const allText = [`Pago del pedido ${o.code} · ${S['brand.name']}`, ...fields.map((k) => `${DETAIL_LABELS[k]}: ${details[k]}`), amountTxt ? `Monto: ${amountTxt}` : ''].filter(Boolean).join('\n');
  const id = (x) => `${x}-${m.code}`;
  const copyIcon = raw('<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>');
  return html`<div class="pay-panel" data-panel="${m.code}" data-total="${money(m.total)} USD" data-adj="${m.adj ? money(m.adj) : ''}" data-adj-label="${m.adj < 0 ? 'Descuento' : 'Recargo'} ${m.name}"${on ? '' : raw(' hidden')}>
    <div class="pay-amount">
      ${isBs ? (due.amount != null ? html`<small>Monto exacto a pagar</small><b>${bs(due.amount)}</b><span>${money(due.usd)} USD · tasa BCV ${rateText(due.milli)} Bs/USD${due.at ? ` · ${fmtDate(due.at)}` : ''}</span>`
        : html`<small>Monto</small><b>${money(due.usd)} USD</b><span>Estamos actualizando la tasa del BCV. Escríbenos por WhatsApp y te damos el monto en bolívares.</span>`)
      : html`<small>Monto a pagar</small><b>${money(due.amount)} USD</b>${o.total_bs_cents && S['currency.show_bs'] ? html`<span>Referencia: ${bs(o.total_bs_cents)}</span>` : ''}`}
      ${due.amount != null ? html`<button type="button" class="pay-copy" data-copy="${isBs ? (due.amount / 100).toFixed(2).replace('.', ',') : (due.amount / 100).toFixed(2)}" data-copy-ok="Monto copiado">${copyIcon}<span>Copiar monto</span></button>` : ''}
    </div>
    ${m.description ? html`<p class="pay-desc">${m.description}</p>` : ''}
    ${fields.length ? html`<dl class="pay-data">${fields.map((k) => html`<div><dt>${DETAIL_LABELS[k]}</dt><dd>${k === 'banco' || k === 'titular' ? details[k] : html`<span class="mono">${details[k]}</span>`}</dd><button type="button" class="pay-copy icon" data-copy="${details[k]}" data-copy-ok="${DETAIL_LABELS[k]} copiado" aria-label="Copiar ${DETAIL_LABELS[k]}" title="Copiar">${copyIcon}</button></div>`)}</dl>
      <button type="button" class="pay-copyall" data-copy="${allText}" data-copy-ok="Datos copiados">${copyIcon}<span>Copiar todos los datos</span></button>` : ''}
    ${missing ? html`<p class="antiscam">Estamos terminando de cargar los datos de este método. <a href="${waHelp}">Escríbenos por WhatsApp</a> y te los enviamos.</p>` : ''}
    ${m.proof === 'none' ? html`<p class="pay-note">${m.kind === 'efectivo' ? 'Pagas en efectivo al recibir tu pedido.' : 'Pagas al retirar tu pedido.'} No necesitas reportar nada ahora.</p>`
    : pending ? html`<div class="pay-wait"><span class="pw-dot" aria-hidden="true"></span><div><h3>Estamos verificando tu pago</h3><p>${S['payments.review_text']}</p></div></div>`
    : html`<button class="btn btn-gold pay-done" type="button" data-pay-done>Ya pagué <span class="arr"></span></button>
    <form class="pay-form" hidden novalidate enctype="multipart/form-data" data-pay-form>
      <h3>Datos de tu pago</h3>
      <div class="grid2">
        ${['pago_movil', 'transferencia'].includes(m.kind) ? html`<div class="field"><label for="${id('pBank')}">Banco desde el que pagaste</label><select id="${id('pBank')}" name="bank" required data-bank><option value="">Elige tu banco</option>${BANKS.map(([c, n]) => html`<option value="${c}">${n}</option>`)}</select></div>` : ''}
        ${m.kind === 'pago_movil' ? html`<div class="field"><label for="${id('pPhone')}">Teléfono desde el que pagaste</label><input id="${id('pPhone')}" name="phone" inputmode="tel" required placeholder="0414 000 0000" maxlength="20"></div>` : ''}
        ${['pago_movil', 'transferencia'].includes(m.kind) ? html`<div class="field"><label for="${id('pDoc')}">Cédula del titular (opcional)</label><div class="doc"><select name="docType" aria-label="Tipo"><option>V</option><option>E</option><option>J</option></select><input id="${id('pDoc')}" name="docNumber" inputmode="numeric" maxlength="10"></div></div>` : ''}
        ${m.kind === 'zelle' ? html`<div class="field"><label for="${id('pName')}">Nombre del titular de la cuenta</label><input id="${id('pName')}" name="name" required maxlength="80"></div><div class="field"><label for="${id('pMail')}">Correo de Zelle</label><input id="${id('pMail')}" name="email" type="email" maxlength="120"></div>` : ''}
        ${['binance', 'paypal'].includes(m.kind) ? html`<div class="field"><label for="${id('pMail')}">Correo o usuario (opcional)</label><input id="${id('pMail')}" name="email" maxlength="120"></div>` : ''}
        <div class="field"><label for="${id('pRef')}">${REF_LABEL[m.kind] || 'Referencia'}</label><input id="${id('pRef')}" name="reference" required inputmode="${['pago_movil', 'transferencia'].includes(m.kind) ? 'numeric' : 'text'}" maxlength="40" autocomplete="off" data-ref></div>
        <div class="field"><label for="${id('pDate')}">Fecha del pago</label><input id="${id('pDate')}" name="date" type="date" required value="${todayCaracas()}" max="${todayCaracas()}"></div>
        <div class="field"><label for="${id('pAmt')}">Monto pagado (${isBs ? 'Bs' : 'USD'})</label><input id="${id('pAmt')}" name="amount" inputmode="decimal" required value="${due.amount != null ? (due.amount / 100).toFixed(2).replace('.', isBs ? ',' : '.') : ''}"></div>
      </div>
      <div class="field pay-file"><label for="${id('pProof')}">Captura del pago ${m.proof === 'ref_capture' ? '' : '(recomendada)'}</label><input id="${id('pProof')}" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"${m.proof === 'ref_capture' ? raw(' required') : ''} data-proof><small>JPG, PNG o PDF, hasta 6 MB. Solo la ve el equipo de ${S['brand.name']}.</small></div>
      <div class="hp" aria-hidden="true"><label>No llenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="pay-err" role="alert" hidden></p>
      <button class="btn btn-solid" type="submit">Enviar comprobante <span class="arr"></span></button>
    </form>`}
  </div>`;
}

// ---------------------------------------------------------------- pantalla del pedido y de pago
export function orderView({ o, lines, links, S, pm, methods, payments, pickup, token, canPay, waHelp }) {
  const first = String(o.customer_name || '').split(' ')[0];
  const pending = payments.some((p) => p.status === 'reportado');
  const choose = methods.length > 1 && o.status === 'creado' && !pending;
  return html`
<section class="page-head ohead" aria-label="Tu pedido"><div class="wrap">
  <p class="eyebrow">Pedido ${o.code}</p>
  <h1>${STATUS_PUBLIC[o.status] || o.status}<span class="script">gracias, ${first}</span></h1>
  <p>Guarda esta página: aquí ves el estado de tu pedido${canPay ? ' y pagas' : ''}. ${S['brand.name']} es la única que cobra tus pedidos.</p>
</div></section>
<section class="wrap opage">
  <div class="omain">
    ${stepper(o.status)}
    ${o.status === 'enviado' && (o.carrier || o.tracking_code) ? html`<div class="obox ok"><h2>Tu pedido va en camino</h2><p>Empresa: <b>${o.carrier || '—'}</b> · Guía: <b class="mono">${o.tracking_code || '—'}</b>${o.tracking_code ? html` <button type="button" class="textlink" data-copy="${o.tracking_code}">Copiar guía</button>` : ''}</p></div>` : ''}
    ${o.status === 'listo_retiro' ? html`<div class="obox ok"><h2>Listo para retirar</h2><p><b>${pickup?.name || o.zone_name}</b>${pickup?.address ? html`<br>${pickup.address}` : ''}${pickup?.hours ? html`<br>Horario: ${pickup.hours}` : ''}</p>${pickup?.maps_url ? html`<p><a class="textlink" href="${pickup.maps_url}" target="_blank" rel="noopener">Ver en el mapa ↗</a></p>` : ''}<p class="small">Lleva tu cédula y el código ${o.code}.</p></div>` : ''}

    ${canPay ? html`<div class="pay" id="pay" data-code="${o.code}" data-t="${token}">
      <p class="eyebrow">Paga tu pedido</p>
      ${choose ? html`<div class="pay-methods" role="radiogroup" aria-label="Elige cómo pagar">${methods.map((m) => html`<button type="button" role="radio" class="pm-opt" data-pm="${m.code}" aria-checked="${m.code === pm.code ? 'true' : 'false'}"><b>${m.name}</b><small>${m.currency === 'Bs' ? 'Bolívares · tasa BCV' : m.proof === 'none' ? (m.kind === 'efectivo' ? 'Al recibir' : 'Al retirar') : 'Dólares'}${m.adj_bps > 0 ? ` · +${m.adj_bps / 100} %` : m.adj_bps < 0 ? ` · −${-m.adj_bps / 100} %` : ''}</small></button>`)}</div>`
      : html`<p class="pay-mname">${pm.name}</p>`}
      ${(choose ? methods : methods.filter((m) => m.code === pm.code)).map((m) => payPanel(m, { o, S, waHelp, pending, on: m.code === pm.code }))}
    </div>` : ''}

    ${payments.length ? html`<div class="obox"><h2>Pagos reportados</h2><ul class="plist">${payments.map((p) => html`<li><span class="pst ${PAY_STATUS[p.status][1]}">${PAY_STATUS[p.status][0]}</span> ${p.currency === 'Bs' ? bs(p.amount_cents) : money(p.amount_cents) + ' USD'} · ref. <span class="mono">${p.reference}</span> · ${fmtDate(p.created_at)}${p.status === 'rechazado' && p.reject_reason ? html`<br><small>${p.reject_reason}</small>` : ''}</li>`)}</ul></div>` : ''}

    ${o.close_mode === 'whatsapp' && ['creado', 'confirmado_por_whatsapp'].includes(o.status) ? html`<div class="obox"><h2>¿Cómo pago?</h2><p>Te enviamos los datos de pago de ${S['brand.name']} por el WhatsApp oficial. Si todavía no enviaste tu pedido, hazlo aquí:</p><p><a class="btn btn-gold" href="${waHelp}">Enviar por WhatsApp <span class="arr"></span></a></p></div>` : ''}
    ${links.length ? html`<div class="obox"><h2>Tus descargas</h2><ul class="links">${links.map((l) => html`<li><a class="btn btn-ghost" href="${l.url}">Descargar ${l.title}</a><small>Quedan ${l.left} descargas · vence el ${fmtDate(l.expires)}</small></li>`)}</ul></div>` : ''}
  </div>
  <aside class="oside">
    <div class="obox"><h2>Resumen</h2>
      <ul class="olines">${lines.map((l) => html`<li><span>${l.name}${l.variant ? html` <small>${l.variant}</small>` : ''} × ${l.qty}</span><b>${money(l.total_cents)}</b></li>`)}</ul>
      <dl class="ototals"><div><dt>Subtotal</dt><dd>${money(o.subtotal_cents)}</dd></div>${o.discount_cents ? html`<div><dt>Descuento${o.coupon_code ? ` · ${o.coupon_code}` : ''}</dt><dd>−${money(o.discount_cents)}</dd></div>` : ''}
      <div><dt>Envío · ${o.zone_name}</dt><dd>${o.shipping_label}</dd></div><div id="oAdj"${o.adj_cents ? '' : raw(' hidden')}><dt>${o.adj_cents < 0 ? 'Descuento' : 'Recargo'} ${o.pay_name}</dt><dd>${money(o.adj_cents)}</dd></div>
      <div class="t"><dt>Total</dt><dd id="oTotal">${money(o.total_cents)} USD</dd></div></dl>
      <p class="small muted">Precios fijados el ${fmtDate(o.created_at)}.</p></div>
    <div class="obox"><h2>¿Dudas con tu pedido?</h2><p><a class="btn btn-ghost" href="${waHelp}">Escribir por WhatsApp</a></p><p class="antiscam">Paga solo a ${S['brand.name']}. Ninguna embajadora ni emprendedora recibe pagos.</p></div>
  </aside>
</section>
<div style="height:clamp(40px,8vh,90px)"></div>`;
}

// ---------------------------------------------------------------- Mi cuenta
const acctShell = (title, kicker, body, aside = '') => html`
<section class="page-head acct-head" aria-label="${title}"><div class="wrap"><p class="eyebrow">${kicker}</p><h1>${title}</h1></div></section>
<section class="wrap acct">${body}${aside}</section><div style="height:clamp(40px,8vh,90px)"></div>`;

export const csrfField = (t) => raw(`<input type="hidden" name="_csrf" value="${String(t || '').replace(/[^\w-]/g, '')}">`);
const err = (e) => (e ? html`<p class="acct-err" role="alert">${e}</p>` : '');
const okm = (m) => (m ? html`<p class="acct-ok" role="status">${m}</p>` : '');

export function loginView({ e, msg, next, tsk }) {
  return acctShell('Mi cuenta', 'Entrar', html`<div class="acct-card"><h2>Entra a tu cuenta</h2>${okm(msg)}${err(e)}
<form method="post" action="/cuenta/entrar" class="acct-form"><input type="hidden" name="next" value="${next || ''}">
<div class="field"><label for="aMail">Correo</label><input id="aMail" name="email" type="email" required autocomplete="username" maxlength="120"></div>
<div class="field"><label for="aPw">Contraseña</label><input id="aPw" name="password" type="password" required autocomplete="current-password" maxlength="200"></div>
${tsk ? html`<div class="cf-turnstile" data-sitekey="${tsk}"></div>` : ''}
<button class="btn btn-solid">Entrar <span class="arr"></span></button></form>
<p class="small"><a class="textlink" href="/cuenta/recuperar">Olvidé mi contraseña</a></p></div>`,
  html`<div class="acct-card alt"><h2>¿Primera vez?</h2><p>Con tu cuenta ves todos tus pedidos, pagas más rápido y recibes cupones personales.</p><p><a class="btn btn-ghost" href="/cuenta/registro">Crear mi cuenta</a></p></div>`);
}

export function registerView({ e, v = {}, tsk, S }) {
  return acctShell('Crea tu cuenta', 'Mi cuenta', html`<div class="acct-card wide"><h2>Tus datos</h2>
<p class="small muted">Usamos tu cédula, teléfono y correo para identificarte: una cuenta por persona. Así tus cupones son solo tuyos.</p>${err(e)}
<form method="post" action="/cuenta/registro" class="acct-form">
<div class="grid2">
<div class="field"><label for="rName">Nombre y apellido</label><input id="rName" name="name" required maxlength="80" autocomplete="name" value="${v.name || ''}"></div>
<div class="field"><label for="rDoc">Cédula o RIF</label><div class="doc"><select name="docType" aria-label="Tipo de documento">${['V', 'E', 'J', 'P'].map((t) => html`<option${v.docType === t ? raw(' selected') : ''}>${t}</option>`)}</select><input id="rDoc" name="docNumber" inputmode="numeric" required maxlength="10" value="${v.docNumber || ''}"></div></div>
<div class="field"><label for="rTel">WhatsApp</label><input id="rTel" name="phone" inputmode="tel" required maxlength="20" autocomplete="tel" placeholder="0414 000 0000" value="${v.phone || ''}"></div>
<div class="field"><label for="rMail">Correo</label><input id="rMail" name="email" type="email" required maxlength="120" autocomplete="email" value="${v.email || ''}"></div>
<div class="field"><label for="rState">Estado</label><select id="rState" name="state"><option value="">Elige</option>${STATES.map((s) => html`<option${v.state === s ? raw(' selected') : ''}>${s}</option>`)}</select></div>
<div class="field"><label for="rCity">Ciudad</label><input id="rCity" name="city" maxlength="60" value="${v.city || ''}"></div>
<div class="field" style="grid-column:1/-1"><label for="rAddr">Dirección o punto de entrega (opcional)</label><input id="rAddr" name="address" maxlength="200" autocomplete="street-address" value="${v.address || ''}"></div>
<div class="field"><label for="rPw">Contraseña (10 caracteres o más)</label><input id="rPw" name="password" type="password" required minlength="10" maxlength="200" autocomplete="new-password"></div>
<div class="field"><label for="rPw2">Repite la contraseña</label><input id="rPw2" name="password2" type="password" required minlength="10" maxlength="200" autocomplete="new-password"></div>
</div>
<label class="note chk"><input type="checkbox" name="marketing" value="1"${v.marketing ? raw(' checked') : ''}> <span>Quiero recibir novedades y cupones de ${S['brand.name']}.</span></label>
<label class="note chk"><input type="checkbox" name="terms" value="1" required> <span>Acepto que mis datos se usan solo para gestionar mis pedidos con ${S['brand.name']}.</span></label>
<div class="hp" aria-hidden="true"><label>No llenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
${tsk ? html`<div class="cf-turnstile" data-sitekey="${tsk}"></div>` : ''}
<button class="btn btn-solid">Crear mi cuenta <span class="arr"></span></button></form>
<p class="small">¿Ya tienes cuenta? <a class="textlink" href="/cuenta">Entra aquí</a></p></div>`);
}

const acctNav = (cur, csrf) => html`<nav class="acct-nav" aria-label="Mi cuenta">${[['/cuenta/pedidos', 'Mis pedidos', 'pedidos'], ['/cuenta/datos', 'Mis datos', 'datos'], ['/cuenta/cupones', 'Mis cupones', 'cupones']].map(([h, l, k]) => html`<a href="${h}"${cur === k ? raw(' aria-current="page"') : ''}>${l}</a>`)}<form method="post" action="/cuenta/salir" class="inline">${csrfField(csrf)}<button class="textlink">Salir</button></form></nav>`;

export function ordersListView({ me, orders, csrf }) {
  return acctShell(`Hola, ${me.name.split(' ')[0]}`, 'Mi cuenta', html`${acctNav('pedidos', csrf)}
<div class="acct-card wide"><h2>Mis pedidos</h2>${orders.length ? html`<ul class="olist">${orders.map((o) => html`<li><a href="/cuenta/pedidos/${o.code}"><span><b>${o.code}</b><small>${fmtDate(o.created_at)} · ${o.n} ${o.n === 1 ? 'pieza' : 'piezas'}</small></span><span class="ost">${STATUS_PUBLIC[o.status] || o.status}</span><b>${money(o.total_cents)}</b></a></li>`)}</ul>`
  : html`<p>Todavía no tienes pedidos. <a class="textlink" href="/catalogo">Ver el catálogo</a></p>`}</div>`);
}

export function profileView({ me, csrf, e, msg }) {
  const nav = acctNav('datos', csrf);
  return acctShell('Mis datos', 'Mi cuenta', html`${nav}<div class="acct-card wide">${okm(msg)}${err(e)}
<dl class="acct-dl"><div><dt>Nombre</dt><dd>${me.name}</dd></div><div><dt>Cédula o RIF</dt><dd>${docText(me.doc_key)}</dd></div><div><dt>WhatsApp</dt><dd>${phoneText(me.phone_key)}</dd></div><div><dt>Correo</dt><dd>${me.email}</dd></div></dl>
<p class="small muted">Para cambiar tu cédula, teléfono o correo escríbenos por WhatsApp: así protegemos tu cuenta y tus cupones.</p>
<form method="post" action="/cuenta/datos" class="acct-form">${csrfField(csrf)}<input type="hidden" name="_action" value="address"><div class="grid2">
<div class="field"><label for="dState">Estado</label><select id="dState" name="state"><option value="">Elige</option>${STATES.map((s) => html`<option${me.state === s ? raw(' selected') : ''}>${s}</option>`)}</select></div>
<div class="field"><label for="dCity">Ciudad</label><input id="dCity" name="city" maxlength="60" value="${me.city}"></div>
<div class="field" style="grid-column:1/-1"><label for="dAddr">Dirección o punto de entrega</label><input id="dAddr" name="address" maxlength="200" value="${me.address}"></div></div>
<label class="note chk"><input type="checkbox" name="marketing" value="1"${me.marketing_ok ? raw(' checked') : ''}> <span>Quiero recibir novedades y cupones.</span></label>
<button class="btn btn-ghost">Guardar</button></form>
<form method="post" action="/cuenta/datos" class="acct-form"><h3>Cambiar contraseña</h3>${csrfField(csrf)}<input type="hidden" name="_action" value="password"><div class="grid2">
<div class="field"><label for="dCur">Contraseña actual</label><input id="dCur" name="current" type="password" required autocomplete="current-password"></div><div></div>
<div class="field"><label for="dPw">Nueva contraseña</label><input id="dPw" name="password" type="password" minlength="10" required autocomplete="new-password"></div>
<div class="field"><label for="dPw2">Repite la nueva</label><input id="dPw2" name="password2" type="password" minlength="10" required autocomplete="new-password"></div></div>
<button class="btn btn-ghost">Cambiar contraseña</button></form></div>`);
}

export function couponsView({ coupons, csrf }) {
  const nav = acctNav('cupones', csrf);
  return acctShell('Mis cupones', 'Mi cuenta', html`${nav}<div class="acct-card wide">${coupons.length ? html`<ul class="clist">${coupons.map((cp) => html`<li><b class="mono">${cp.code}</b><span>${cp.description || (cp.kind === 'pct' ? `${cp.value / 100} % de descuento` : cp.kind === 'monto' ? `${money(cp.value)} de descuento` : 'Envío gratis')}</span>${cp.ends_at ? html`<small>Vence el ${fmtDate(cp.ends_at)}</small>` : ''}<button type="button" class="btn-copy" data-copy="${cp.code}">Copiar</button></li>`)}</ul><p class="small muted">Tus cupones personales solo funcionan con tu cuenta iniciada. No se pueden transferir.</p>`
    : html`<p>No tienes cupones activos por ahora. Te avisaremos cuando tengas uno.</p>`}</div>`);
}

export function simpleAcct(title, body) {
  return acctShell(title, 'Mi cuenta', html`<div class="acct-card">${body}</div>`);
}

// ---------------------------------------------------------------- temporada
export function campaignView({ camp, prods, S, preview }) {
  return html`${preview ? html`<p class="preview-bar">Vista previa · la temporada todavía no es visible para tus clientas</p>` : ''}
<section class="camp-hero t-${camp.theme}" aria-label="${camp.name}"${camp.photo ? raw(` style="--camp-img:url('${camp.photo.replace(/'/g, '')}')"`) : ''}><div class="wrap">
  <p class="eyebrow">${camp.kind === 'oferta' ? 'Oferta por tiempo limitado' : 'Temporada'}</p>
  <h1>${camp.banner_title || camp.name}</h1>
  ${camp.page_intro ? html`<p class="lede">${camp.page_intro}</p>` : ''}
  ${camp.discount_bps ? html`<p class="camp-off">−${Math.round(camp.discount_bps / 100)} %</p>` : ''}
  ${camp.show_countdown ? html`<p class="camp-count" data-ends="${camp.ends_at}">Termina el ${fmtDate(camp.ends_at)}</p>` : ''}
  ${camp.coupon_code ? html`<p class="camp-coupon">Usa el cupón <b class="mono">${camp.coupon_code}</b> <button type="button" class="btn-copy" data-copy="${camp.coupon_code}">Copiar</button></p>` : ''}
</div></section>
<section class="wrap camp-grid">${prods.length ? html`<div class="cat-grid">${prods.map((p) => productCard(p, S))}</div>` : html`<p class="lede">Mira todo el <a class="textlink" href="/catalogo">catálogo</a>.</p>`}</section>
<div style="height:clamp(40px,8vh,90px)"></div>`;
}

// ---------------------------------------------------------------- tienda de aliada
export function storeView({ p, prods, S, store, banner }) {
  const card = (x) => html`<article class="st-card" data-cat="${x.cat}">
  <div class="st-fig"><button type="button" class="st-media" data-open="${x.slug}" aria-label="Ver ${x.name}"><img src="${x.img.main}" alt="${x.name}" loading="lazy"><span class="st-tag">Bajo pedido</span></button>${swatchRow(x.colors)}</div>
  <div class="st-info"><h3>${x.name}</h3><p class="st-meta">${x.type}${x.stone ? ` · ${x.stone}` : ''}</p>
  <div class="st-row"><b class="st-price">${money(x.unit)}</b><button type="button" class="st-add" data-quick="${x.slug}" aria-label="Añadir ${x.name} al pedido"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Añadir</span></button></div></div>
</article>`;
  return html`${banner ? html`<section class="st-banner" aria-label="${store.title}"><img src="${banner.url}" alt="" fetchpriority="high"></section>` : ''}
<section class="st-head${banner ? ' has-banner' : ''}" aria-label="${store.title}"><div class="wrap">
  <p class="eyebrow">Tienda aliada de ${S['brand.name']}</p>
  <h1>${store.title}${store.subtitle ? html`<span class="script">${store.subtitle}</span>` : ''}</h1>
  ${store.bio ? html`<p class="st-bio">${store.bio}</p>` : ''}
</div></section>
<section class="wrap st-shop" id="piezas">
  ${prods.length ? html`<div class="st-grid">${prods.map(card)}</div>` : html`<p class="st-empty">${store.owner} está preparando su tienda. Vuelve pronto.</p>`}
  <p class="st-safe"><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>Tu pedido lo elabora, cobra y envía ${S['brand.name']}. Paga solo con los datos oficiales de ${S['brand.name']}; ${store.owner} no recibe pagos.</p>
</section>
<div style="height:clamp(40px,8vh,90px)"></div>`;
}

export { fmtDate, fmtDateTime };
