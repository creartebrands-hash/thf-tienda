// Enlaces de descarga de guías y ebooks: se guardan como hash; el token se recalcula con HMAC para mostrarlo al cliente.
import { nowIso } from './db.js';
import { randomToken, sha256 } from './security.js';

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function grantToken(env, nonce) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.THF_PEPPER || 'dev-pepper'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode('descarga|' + nonce)));
}

export async function createGrant(env, db, { orderId = null, digitalId, hours, max }) {
  const nonce = randomToken(18);
  const token = await grantToken(env, nonce);
  const exp = new Date(Date.now() + hours * 3600e3).toISOString().replace(/\.\d{3}Z$/, 'Z');
  await db.run('INSERT INTO download_grants(order_id,digital_product_id,token_hash,nonce,expires_at,max_downloads,created_at) VALUES (?,?,?,?,?,?,?)',
    [orderId, digitalId, await sha256(token), nonce, exp, max, nowIso()]);
  return { token, url: `/descarga/${token}`, expires: exp };
}

export async function orderLinks(env, db, orderId) {
  const rows = await db.all(`SELECT g.*, d.title FROM download_grants g JOIN digital_products d ON d.id=g.digital_product_id
                             WHERE g.order_id=? ORDER BY g.id`, [orderId]);
  const out = [];
  for (const g of rows) {
    if (!g.nonce) continue;
    out.push({ title: g.title, url: `/descarga/${await grantToken(env, g.nonce)}`, expires: g.expires_at, left: Math.max(0, g.max_downloads - g.downloads),
      active: Date.parse(g.expires_at) > Date.now() && g.downloads < g.max_downloads, id: g.id });
  }
  return out;
}
