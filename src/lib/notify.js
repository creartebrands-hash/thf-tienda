// Avisos de cada pedido. Al empezar todo es manual: el panel muestra un botón "Avisar por WhatsApp" con el mensaje listo
// para la clienta. Cuando la dueña lo active (y pague el servicio si hace falta), los mismos avisos salen solos por:
// correo (Resend, secreto RESEND_API_KEY), Telegram (opcional, TELEGRAM_BOT_TOKEN) o un webhook firmado
// (NOTIFY_WEBHOOK_SECRET) para conectar la API oficial de WhatsApp Business, n8n, Make u otro sistema.
import { nowIso } from './db.js';
import { money } from './pricing.js';
import { bs } from './rates.js';
import { docText } from './validate.js';

export const EVENTS = ['pedido_creado', 'pago_reportado', 'pago_verificado', 'pago_rechazado', 'en_produccion', 'enviado', 'listo_retiro', 'entregado', 'duena_pedido', 'duena_pago'];
// Estado del pedido → aviso para la clienta
export const STATUS_EVENT = { pagado: 'pago_verificado', en_produccion: 'en_produccion', enviado: 'enviado', listo_retiro: 'listo_retiro', entregado: 'entregado' };

export function fillTpl(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : k === 'motivo' ? 'sin detalle' : '—'));
}

export async function orderVars(c, o, extra = {}) {
  const S = await c.db.settings();
  const zone = o.zone_code ? await c.db.first('SELECT * FROM shipping_zones WHERE code=?', [o.zone_code]) : null;
  return {
    marca: S['brand.name'] || 'THF', nombre: String(o.customer_name || '').split(' ')[0], pedido: o.code, total: `${money(o.total_cents)} USD`,
    total_bs: o.total_bs_cents ? bs(o.total_bs_cents) : '', metodo: o.pay_name, estado: o.status, enlace: extra.link || `${c.base}/cuenta/pedidos`,
    enlace_panel: `${c.base}/admin/pedidos/${o.id}`, empresa_envio: o.carrier, guia: o.tracking_code,
    retiro: zone?.kind === 'retiro' ? zone.name : '', retiro_direccion: zone?.address || '', retiro_horario: zone?.hours || '', documento: docText(o.customer_doc),
    ...extra,
  };
}

const waPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 11) d = '58' + d.slice(1);
  if (d.length === 10 && d.startsWith('4')) d = '58' + d;
  return d;
};
export const waTo = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;

// Crea los avisos de un evento y envía en segundo plano los automáticos que estén activos
export async function notify(c, o, event, extra = {}) {
  const { db, env } = c;
  const S = await db.settings();
  const tpl = (S['notify.templates'] || {})[event];
  if (!tpl) return [];
  const vars = await orderVars(c, o, extra);
  const subject = fillTpl(tpl.subject, vars), body = fillTpl(tpl.body, vars);
  const forOwner = event.startsWith('duena_');
  const t = nowIso();
  const rows = [];
  const add = async (channel, recipient, status) => {
    const r = await db.run('INSERT INTO notifications(order_id,event,audience,channel,recipient,subject,body,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [o.id, event, forOwner ? 'duena' : 'clienta', channel, recipient, subject, body, status, t]);
    rows.push({ id: r.id, channel, recipient, subject, body, status });
  };
  if (!forOwner) await add('whatsapp', o.customer_phone, 'pendiente'); // botón manual en el panel
  if (S['notify.email_enabled'] && env.RESEND_API_KEY && S['notify.from_email']) {
    const to = forOwner ? S['notify.owner_email'] : o.customer_email;
    if (to) await add('email', to, 'pendiente');
  }
  if (forOwner && S['notify.telegram_enabled'] && env.TELEGRAM_BOT_TOKEN && S['notify.telegram_chat_id']) await add('telegram', String(S['notify.telegram_chat_id']), 'pendiente');
  if (S['notify.webhook_enabled'] && S['notify.webhook_url'] && env.NOTIFY_WEBHOOK_SECRET) await add('webhook', S['notify.webhook_url'], 'pendiente');
  const auto = rows.filter((r) => r.channel !== 'whatsapp');
  if (auto.length) c.waitUntil(Promise.all(auto.map((r) => deliver(c, r, o, event, vars))).catch((e) => console.error('notify', e)));
  return rows;
}

async function deliver(c, n, o, event, vars) {
  const { db, env } = c;
  const S = await db.settings();
  let ok = false, error = '';
  try {
    if (n.channel === 'email') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${S['notify.from_name'] || 'THF'} <${S['notify.from_email']}>`, to: [n.recipient], subject: n.subject, text: n.body, html: emailHtml(S, n) }),
      });
      ok = r.ok; if (!ok) error = `Resend ${r.status}`;
    } else if (n.channel === 'telegram') {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: n.recipient, text: `${n.subject}\n\n${n.body}` }) });
      ok = r.ok; if (!ok) error = `Telegram ${r.status}`;
    } else if (n.channel === 'webhook') {
      const payload = JSON.stringify({ event, order: o.code, audience: event.startsWith('duena_') ? 'duena' : 'clienta', phone: o.customer_phone, email: o.customer_email, subject: n.subject, text: n.body, at: nowIso() });
      const sig = await hmacHex(env.NOTIFY_WEBHOOK_SECRET, payload);
      const r = await fetch(n.recipient, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THF-Signature': `sha256=${sig}` }, body: payload });
      ok = r.ok; if (!ok) error = `Webhook ${r.status}`;
    }
  } catch (e) {
    error = String(e?.message || e).slice(0, 200);
  }
  await db.run('UPDATE notifications SET status=?, error=?, attempts=attempts+1, sent_at=? WHERE id=?', [ok ? 'enviada' : 'fallida', error, ok ? nowIso() : null, n.id]);
}

async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const escH = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function emailHtml(S, n) {
  const body = escH(n.body).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#735619">$1</a>').replace(/\n/g, '<br>');
  return `<div style="background:#F3EBE1;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#1D1815"><div style="max-width:520px;margin:auto;background:#fff;padding:32px;border-top:2px solid #B8912F">
<p style="font-family:Georgia,serif;font-size:22px;margin:0 0 4px">${escH(S['brand.name'] || 'THF')}</p><p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#735619;margin:0 0 24px">${escH(S['brand.descriptor'] || '')}</p>
<p style="font-size:15px;line-height:1.6">${body}</p><hr style="border:0;border-top:1px solid #E7D6C3;margin:24px 0"><p style="font-size:12px;color:#6E6157">Solo pagas a ${escH(S['brand.name'] || 'THF')} por sus canales oficiales.</p></div></div>`;
}

// Lo que el panel muestra para avisar a mano
export async function pendingWhatsapp(db, orderId) {
  return db.all("SELECT * FROM notifications WHERE order_id=? AND channel='whatsapp' ORDER BY id DESC", [orderId]);
}
