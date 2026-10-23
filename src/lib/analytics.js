// Analítica propia, sin cookies de terceros ni servicios externos: de dónde llegan las visitas, qué ven, qué compran
// y cuántas ventas son orgánicas, pagadas o de los programas. El visitante se identifica con un número al azar
// (guardado en su navegador) del que solo se guarda un hash; no se guarda la IP.
import { nowIso } from './db.js';
import { sha256 } from './security.js';

const PAID = /^(cpc|ppc|paid|paid[_-]?social|ads?|display|cpm|sponsored|pago|anuncio|retargeting)$/i;
const HOSTS = [
  ['instagram', /(^|\.)instagram\.com$|^l\.instagram\.com$/], ['facebook', /(^|\.)facebook\.com$|^(l|lm|m)\.facebook\.com$|(^|\.)fb\.com$/],
  ['google', /(^|\.)google\.[a-z.]+$/], ['pinterest', /(^|\.)pinterest\.[a-z.]+$|^pin\.it$/], ['whatsapp', /(^|\.)whatsapp\.com$|^wa\.me$/],
  ['tiktok', /(^|\.)tiktok\.com$/], ['youtube', /(^|\.)youtube\.com$|^youtu\.be$/], ['bing', /(^|\.)bing\.com$/], ['chatgpt', /(^|\.)chatgpt\.com$|(^|\.)openai\.com$/],
  ['x', /^(t\.co|x\.com|twitter\.com)$/], ['email', /mail\./],
];
export const CHANNELS = { instagram: 'Instagram', facebook: 'Facebook', google: 'Google', pinterest: 'Pinterest', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube',
  bing: 'Bing', chatgpt: 'ChatGPT y asistentes', x: 'X (Twitter)', email: 'Correo', programa: 'Embajadoras y aliadas', otro: 'Otros sitios', directo: 'Directo' };
export const TRAFFIC = { organico: 'Orgánico', pago: 'Anuncios', programa: 'Programas', referido: 'Otros sitios', directo: 'Directo' };

// Clasifica una visita: canal (Instagram, Google…) y tipo (orgánico, anuncios, programas, directo)
export function classify({ utm_source = '', utm_medium = '', ref_host = '', partner = false } = {}) {
  const src = String(utm_source).toLowerCase(), med = String(utm_medium).toLowerCase();
  let channel = '';
  for (const [name, re] of HOSTS) if (src === name || src.includes(name) || re.test(ref_host)) { channel = name; break; }
  if (!channel && (src === 'ig')) channel = 'instagram';
  if (!channel && (src === 'fb')) channel = 'facebook';
  if (!channel && (src === 'wa')) channel = 'whatsapp';
  if (partner) return { channel: channel || 'programa', traffic: 'programa' };
  if (PAID.test(med) || /gclid|fbclid_ads/.test(med)) return { channel: channel || 'otro', traffic: 'pago' };
  if (channel) return { channel, traffic: 'organico' };
  if (src) return { channel: 'otro', traffic: med === 'referral' ? 'referido' : 'organico' };
  if (ref_host) return { channel: 'otro', traffic: 'referido' };
  return { channel: 'directo', traffic: 'directo' };
}

export const cleanHost = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase().slice(0, 80); } catch { return ''; }
};

// Día en hora de Caracas (UTC−4)
export const dayOf = (iso) => new Date(Date.parse(iso) - 4 * 3600e3).toISOString().slice(0, 10);

const TYPES = new Set(['page', 'view_item', 'add_to_cart', 'begin_checkout', 'wa_click', 'search', 'download', 'ref_click']);
const s = (v, n) => String(v ?? '').replace(/[\x00-\x1f<>]/g, '').slice(0, n);

export function device(ua = '') {
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse/i.test(ua)) return 'bot';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'movil';
  return 'escritorio';
}

export async function record(db, req, ev, { serverType = null } = {}) {
  const ua = req.headers.get('User-Agent') || '';
  const dev = device(ua);
  if (dev === 'bot') return false;
  const type = serverType || String(ev.type || '');
  if (!serverType && !TYPES.has(type)) return false;
  const at = nowIso();
  const vid = ev.vid ? (await sha256('v|' + s(ev.vid, 64))).slice(0, 20) : '';
  const sid = ev.sid ? (await sha256('s|' + s(ev.sid, 64))).slice(0, 20) : '';
  const ref = s(ev.ref_host, 80).toLowerCase();
  const { channel, traffic } = classify({ utm_source: ev.utm_source, utm_medium: ev.utm_medium, ref_host: ref, partner: !!ev.partner_id });
  const country = s(req.headers.get('CF-IPCountry') || req.headers.get('X-Vercel-IP-Country') || '', 2);
  await db.run(`INSERT INTO events(at,day,vid,sid,type,path,product_id,order_id,value_cents,channel,traffic,utm_source,utm_medium,utm_campaign,utm_content,ref_host,device,country,partner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [at, dayOf(at), vid, sid, type, s(ev.path, 200), Number.isInteger(ev.product_id) ? ev.product_id : null, ev.order_id ?? null, Number.isInteger(ev.value_cents) ? ev.value_cents : null,
    channel, traffic, s(ev.utm_source, 60).toLowerCase(), s(ev.utm_medium, 60).toLowerCase(), s(ev.utm_campaign, 80).toLowerCase(), s(ev.utm_content, 80).toLowerCase(), ref, dev, country,
    Number.isInteger(ev.partner_id) ? ev.partner_id : null]);
  if (Math.random() < 0.002) {
    const days = Number(await db.setting('analytics.retention_days', 400)) || 400;
    await db.run('DELETE FROM events WHERE at<?', [new Date(Date.now() - days * 86400e3).toISOString()]);
  }
  return true;
}
