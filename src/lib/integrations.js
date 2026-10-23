// Integraciones de medición: Google Analytics 4, píxel de Meta (Facebook/Instagram) y píxel de TikTok.
// Los IDs se escriben en Panel → Sitio → Integraciones y se validan por formato: nunca se acepta código ni etiquetas <script>.
// El navegador carga cada etiqueta solo si su ID está puesto, y la política de seguridad (CSP) abre solo los dominios de esas etiquetas.
// La compra se reporta desde el servidor cuando THF verifica el pago (nunca desde el navegador, que no sabe si el pago es real):
//   GA4 Measurement Protocol (secreto GA4_API_SECRET) y Conversions API de Meta (secreto META_CAPI_TOKEN). Ambos opcionales.
import { sha256 } from './security.js';
import * as V from './validate.js';

export const FORMATS = {
  ga4: { re: /^G-[A-Z0-9]{6,12}$/, label: 'Google Analytics 4', example: 'G-AB12CD34EF' },
  meta: { re: /^\d{10,20}$/, label: 'Píxel de Meta', example: '123456789012345' },
  tiktok: { re: /^[A-Z0-9]{15,25}$/, label: 'Píxel de TikTok', example: 'C9ABCDEF1234567890' },
};

export function cleanId(kind, v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return '';
  if (!FORMATS[kind].re.test(s)) throw new V.ValidationError(`${FORMATS[kind].label}: el ID no tiene el formato correcto (ejemplo: ${FORMATS[kind].example}).`);
  return s;
}

// IDs válidos para el navegador (lo inválido se ignora)
export function publicTags(S) {
  const out = {};
  for (const k of Object.keys(FORMATS)) {
    const v = String(S[`integrations.${k === 'ga4' ? 'ga4_id' : k === 'meta' ? 'meta_pixel_id' : 'tiktok_pixel_id'}`] || '').trim().toUpperCase();
    if (FORMATS[k].re.test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// Dominios que la CSP debe permitir según las etiquetas activas
export function cspExtra(tags) {
  const x = { script: [], connect: [], img: [], frame: [] };
  if (!tags) return x;
  if (tags.ga4) {
    x.script.push('https://www.googletagmanager.com');
    x.connect.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com');
    x.img.push('https://*.google-analytics.com', 'https://www.googletagmanager.com');
  }
  if (tags.meta) {
    x.script.push('https://connect.facebook.net');
    x.connect.push('https://www.facebook.com', 'https://connect.facebook.net');
    x.img.push('https://www.facebook.com');
    x.frame.push('https://www.facebook.com');
  }
  if (tags.tiktok) {
    x.script.push('https://analytics.tiktok.com');
    x.connect.push('https://analytics.tiktok.com');
    x.img.push('https://analytics.tiktok.com');
  }
  return x;
}

const normPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 11) d = '58' + d.slice(1);
  return d;
};

// Compra confirmada → GA4 y Meta desde el servidor (en segundo plano; si falla no afecta el pedido)
export async function serverPurchase(c, o) {
  const { db, env } = c;
  const S = await db.settings();
  if (S['integrations.server_purchases'] === false) return [];
  const tags = publicTags(S) || {};
  const lines = await db.all('SELECT name, sku, variant, qty, unit_cents FROM order_lines WHERE order_id=?', [o.id]);
  const value = (o.total_cents || 0) / 100;
  const jobs = [];
  if (tags.ga4 && env.GA4_API_SECRET) {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(tags.ga4)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`;
    jobs.push(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      client_id: o.vid ? String(o.vid).slice(0, 40) : `thf.${o.id}`,
      events: [{ name: 'purchase', params: { transaction_id: o.code, currency: 'USD', value, shipping: (o.shipping_cents || 0) / 100, coupon: o.coupon_code || undefined,
        items: lines.map((l) => ({ item_id: l.sku || l.name, item_name: l.name, item_variant: l.variant || undefined, quantity: l.qty, price: (l.unit_cents || 0) / 100 })) } }],
    }) }).then((r) => ['ga4', r.status]).catch(() => ['ga4', 0]));
  }
  if (tags.meta && env.META_CAPI_TOKEN) {
    const ud = {};
    if (o.customer_email) ud.em = [await sha256(String(o.customer_email).trim().toLowerCase())];
    if (o.customer_phone) ud.ph = [await sha256(normPhone(o.customer_phone))];
    ud.country = [await sha256('ve')];
    jobs.push(fetch(`https://graph.facebook.com/v19.0/${tags.meta}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [{
        event_name: 'Purchase', event_time: Math.floor(Date.now() / 1000), event_id: o.code, action_source: 'website',
        event_source_url: `${c.base}/pedido`, user_data: ud,
        custom_data: { currency: 'USD', value, order_id: o.code, content_type: 'product', contents: lines.map((l) => ({ id: l.sku || l.name, quantity: l.qty, item_price: (l.unit_cents || 0) / 100 })) },
      }] }),
    }).then((r) => ['meta', r.status]).catch(() => ['meta', 0]));
  }
  return Promise.all(jobs);
}

// Estado de las conexiones (solo dice si el secreto está puesto; nunca muestra su valor)
export function connections(env, S) {
  const has = (k) => !!(env[k] && String(env[k]).length > 3);
  const tags = publicTags(S) || {};
  return [
    { name: 'Base de datos', ok: true, detail: env.PLATFORM === 'vercel' ? 'Supabase (PostgreSQL)' : env.DB ? 'Cloudflare D1' : 'Local', need: '' },
    { name: 'Archivos (fotos y comprobantes)', ok: env.PLATFORM === 'vercel' ? has('SUPABASE_SERVICE_ROLE_KEY') : true, detail: env.PLATFORM === 'vercel' ? 'Supabase Storage' : 'KV', need: 'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY' },
    { name: 'Correo (Resend)', ok: has('RESEND_API_KEY'), detail: 'avisos por correo a clientas y a la dueña', need: 'RESEND_API_KEY' },
    { name: 'Telegram', ok: has('TELEGRAM_BOT_TOKEN'), detail: 'avisos a la dueña', need: 'TELEGRAM_BOT_TOKEN' },
    { name: 'Webhook de avisos (WhatsApp Business, n8n…)', ok: has('NOTIFY_WEBHOOK_SECRET'), detail: 'el webhook único de Avisos', need: 'NOTIFY_WEBHOOK_SECRET' },
    { name: 'Verificación automática de pagos', ok: has('VERIFY_API_URL') && has('VERIFY_API_KEY'), detail: 'conciliación bancaria', need: 'VERIFY_API_URL y VERIFY_API_KEY' },
    { name: 'Turnstile (anti-bots)', ok: has('TURNSTILE_SITEKEY') && has('TURNSTILE_SECRET'), detail: 'formularios y pedidos', need: 'TURNSTILE_SITEKEY y TURNSTILE_SECRET' },
    { name: 'Google Analytics 4 · compras desde el servidor', ok: !!tags.ga4 && has('GA4_API_SECRET'), detail: tags.ga4 ? `ID ${tags.ga4}` : 'falta el ID', need: 'GA4_API_SECRET' },
    { name: 'Meta · Conversions API', ok: !!tags.meta && has('META_CAPI_TOKEN'), detail: tags.meta ? `Píxel ${tags.meta}` : 'falta el ID del píxel', need: 'META_CAPI_TOKEN' },
  ];
}
