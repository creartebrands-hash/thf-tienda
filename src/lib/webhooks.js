// Webhooks salientes: THF avisa a otros sistemas (Make, n8n, Zapier, Google Sheets, contabilidad, la API de WhatsApp Business…)
// cuando pasa algo en la tienda. Cada envío va firmado con HMAC-SHA256 y el secreto propio de ese webhook:
//   X-THF-Event: pedido_creado
//   X-THF-Timestamp: 1734567890
//   X-THF-Signature: sha256=<hex de HMAC(secreto, timestamp + "." + cuerpo)>
// Quien recibe debe recalcular la firma y rechazar mensajes con más de 5 minutos. Solo se envía a https:// públicos (nunca a la red interna).
import { nowIso } from './db.js';

export const WEBHOOK_EVENTS = [
  ['pedido_creado', 'Pedido nuevo'],
  ['pago_reportado', 'Pago reportado por la clienta'],
  ['pago_verificado', 'Pago verificado (pedido pagado)'],
  ['pago_rechazado', 'Pago rechazado'],
  ['estado_cambiado', 'Cambio de estado del pedido'],
  ['clienta_nueva', 'Clienta nueva registrada'],
  ['solicitud_nueva', 'Solicitud nueva (programas, personalizada, mayor)'],
  ['pago_afiliada', 'Pago a una afiliada'],
];
const EVENT_SET = new Set(WEBHOOK_EVENTS.map(([k]) => k));

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function newSecret() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return 'whsec_' + hex(b);
}

export async function sign(secret, ts, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'sha256=' + hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${body}`)));
}

// Solo URLs https públicas: sin usuario/clave, sin IPs ni nombres internos, puerto 443. Evita que un webhook sirva para llegar a la red interna.
export function safeUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.') || h.length > 253) return null;
  if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return null; // IP literal (v4 o v6)
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(h)) return null;
  if (/^(metadata|instance-data)(\.|$)/.test(h)) return null;
  if (u.href.length > 500) return null;
  return u.href;
}

export const validEvents = (list) => [...new Set((Array.isArray(list) ? list : [list]).map(String).filter((e) => EVENT_SET.has(e)))];

async function deliver(db, hook, event, payload) {
  const body = JSON.stringify({ event, id: crypto.randomUUID(), created_at: nowIso(), data: payload });
  const ts = String(Math.floor(Date.now() / 1000));
  let status = null, ok = false, error = '';
  const url = safeUrl(hook.url);
  if (!url) error = 'URL no permitida';
  else {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, {
        method: 'POST', redirect: 'manual', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'THF-Webhooks/1', 'X-THF-Event': event, 'X-THF-Timestamp': ts, 'X-THF-Signature': await sign(hook.secret, ts, body) },
        body,
      });
      clearTimeout(timer);
      status = r.status; ok = r.status >= 200 && r.status < 300;
      if (!ok) error = `Respondió ${r.status}`;
    } catch (e) { error = e?.name === 'AbortError' ? 'Tardó más de 8 s' : 'No se pudo conectar'; }
  }
  await db.run('INSERT INTO webhook_deliveries(webhook_id,event,status,ok,error,at) VALUES (?,?,?,?,?,?)', [hook.id, event, status, ok ? 1 : 0, error.slice(0, 200), nowIso()]);
  // Se guardan solo los últimos 200 envíos por webhook
  await db.run('DELETE FROM webhook_deliveries WHERE webhook_id=? AND id NOT IN (SELECT id FROM webhook_deliveries WHERE webhook_id=? ORDER BY id DESC LIMIT 200)', [hook.id, hook.id]);
  return { ok, status, error };
}

// Envía el evento a todos los webhooks activos suscritos, en segundo plano (nunca frena ni rompe la acción de la clienta)
export async function emit(c, event, payload) {
  if (!EVENT_SET.has(event)) return;
  try {
    const hooks = (await c.db.all('SELECT * FROM webhooks WHERE active=1')).filter((h) => { try { return JSON.parse(h.events || '[]').includes(event); } catch { return false; } });
    if (!hooks.length) return;
    c.waitUntil(Promise.all(hooks.map((h) => deliver(c.db, h, event, payload))).catch((e) => console.error('webhooks', e)));
  } catch (e) { console.error('webhooks', e); }
}

export const testDelivery = (db, hook) => deliver(db, hook, 'prueba', { mensaje: 'Prueba de conexión desde el panel de THF' });

// Lo que se manda de un pedido (sin datos internos: ni costos, ni notas de la dueña, ni claves)
export async function orderPayload(db, o) {
  const lines = await db.all('SELECT name, sku, variant, qty, unit_cents, total_cents FROM order_lines WHERE order_id=? ORDER BY id', [o.id]).catch(() => []);
  const partner = o.partner_id ? await db.first('SELECT kind, code FROM partners WHERE id=?', [o.partner_id]) : null;
  return {
    pedido: o.code, estado: o.status, creado: o.created_at, total_usd: (o.total_cents || 0) / 100, subtotal_usd: (o.subtotal_cents || 0) / 100,
    descuento_usd: (o.discount_cents || 0) / 100, envio_usd: (o.shipping_cents || 0) / 100, metodo_pago: o.pay_name || '', zona: o.zone_name || '',
    clienta: { nombre: o.customer_name || '', telefono: o.customer_phone || '', correo: o.customer_email || '', ciudad: o.customer_city || '', estado: o.customer_state || '' },
    lineas: lines.map((l) => ({ pieza: l.name, sku: l.sku, variante: l.variant || '', cantidad: l.qty, precio_usd: (l.unit_cents || 0) / 100, total_usd: (l.total_cents || 0) / 100 })),
    afiliada: partner ? { programa: partner.kind === 'emprendedora' ? 'aliada' : 'embajadora', codigo: partner.code } : null,
    origen: { utm_source: o.utm_source || '', utm_medium: o.utm_medium || '', utm_campaign: o.utm_campaign || '' },
  };
}
