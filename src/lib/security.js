// Seguridad: contraseñas (PBKDF2-SHA256 + pimienta secreta), 2FA TOTP, sesiones en D1, CSRF,
// límites de intentos compartidos, Turnstile, cabeceras con CSP por nonce y auditoría.
import { nowIso } from './db.js';

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const randomToken = (n = 32) => b64u(randomBytes(n));
export async function sha256(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------------------------------------------------------------- contraseñas
// Argon2 no existe en Workers y PBKDF2 está limitado a 100.000 iteraciones. El plan gratuito da ~10 ms de CPU
// por solicitud, así que el valor por defecto es moderado (PW_ITER) y la fuerza real viene de la pimienta secreta
// (THF_PEPPER, 32+ bytes fuera de la base de datos: sin ella el hash no se puede atacar), 2FA obligatoria y límite de intentos.
const ITER = 20000;
async function pbkdf2(pw, salt, pepper, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper + '\u0000' + pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
export async function hashPassword(pw, pepper, iter = ITER) {
  const salt = randomBytes(16);
  iter = Math.min(100000, Math.max(10000, Number(iter) || ITER));
  return `pbkdf2$${iter}$${b64u(salt)}$${b64u(await pbkdf2(pw, salt, pepper, iter))}`;
}
export async function verifyPassword(pw, stored, pepper) {
  try {
    const [alg, it, s, h] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const cand = b64u(await pbkdf2(pw, fromB64u(s), pepper, Number(it)));
    return safeEqual(cand, h);
  } catch {
    return false;
  }
}
const COMMON = new Set(['123456789012', 'contraseña123', 'password1234', 'qwertyuiop12', 'margarita123', 'thfjoyeria123', 'thfaccesorios']);
export function passwordProblem(pw) {
  if (!pw || pw.length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
  if (COMMON.has(pw.toLowerCase()) || new Set(pw).size < 5) return 'Esa contraseña es muy común. Elige otra.';
  return '';
}

// ---------------------------------------------------------------- TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function b32decode(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}
export async function totpAt(secret, unixSec, step = 30) {
  const key = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const ctr = Math.floor(unixSec / step);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(4, ctr >>> 0);
  new DataView(msg.buffer).setUint32(0, Math.floor(ctr / 2 ** 32));
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 0xf;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6;
  return String(code).padStart(6, '0');
}
export async function totpVerify(secret, code, window = 1) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code) || !secret) return false;
  const now = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) if (safeEqual(await totpAt(secret, now + i * 30), code)) return true;
  return false;
}
export const totpUri = (secret, email) => `otpauth://totp/THF:${encodeURIComponent(email)}?secret=${secret}&issuer=THF&digits=6&period=30`;
export async function newRecoveryCodes(n = 8) {
  const codes = Array.from({ length: n }, () => `${hex(randomBytes(3))}-${hex(randomBytes(3))}`);
  return { codes, hashes: await Promise.all(codes.map(sha256)) };
}

// ---------------------------------------------------------------- límites de intentos (compartidos en D1)
export async function rateLimited(db, key, limit, windowS) {
  const now = Date.now() / 1000;
  const k = (await sha256(key)).slice(0, 32);
  const n = await db.n('SELECT COUNT(*) n FROM rate_events WHERE key=? AND at>?', [k, now - windowS]);
  if (n >= limit) return true;
  await db.run('INSERT INTO rate_events(key,at) VALUES (?,?)', [k, now]);
  if (Math.random() < 0.02) await db.run('DELETE FROM rate_events WHERE at<?', [now - 86400]);
  return false;
}
// IP de la visita: la pone la plataforma (Cloudflare o Vercel), nunca el navegador
export const clientIp = (req) => req.headers.get('CF-Connecting-IP') || req.headers.get('X-Real-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0].trim() || '0.0.0.0';

// ---------------------------------------------------------------- Turnstile (captcha gratuito de Cloudflare)
export async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // desactivado si no hay clave
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  body.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    return (await r.json()).success === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- sesiones
export const COOKIE = 'thf_s';
export function cookieGet(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
export function sessionCookie(token, secure, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${maxAge != null ? `; Max-Age=${maxAge}` : ''}`;
}
export async function createSession(db, userId, mfaOk, req, env) {
  const token = randomToken(32);
  const now = new Date();
  const exp = new Date(now.getTime() + Number(env.ADMIN_ABS_HOURS || 12) * 3600e3);
  await db.run('INSERT INTO sessions(token_hash,user_id,mfa_ok,csrf,created_at,last_seen,expires_at,ip,ua) VALUES (?,?,?,?,?,?,?,?,?)',
    [await sha256(token), userId, mfaOk ? 1 : 0, randomToken(24), nowIso(), nowIso(), exp.toISOString(), clientIp(req), (req.headers.get('User-Agent') || '').slice(0, 200)]);
  return token;
}
export async function destroySession(db, token) {
  if (token) await db.run('DELETE FROM sessions WHERE token_hash=?', [await sha256(token)]);
}
export async function loadSession(db, req, env) {
  const token = cookieGet(req, COOKIE);
  if (!token) return { user: null, sess: null };
  const s = await db.first('SELECT * FROM sessions WHERE token_hash=?', [await sha256(token)]);
  if (!s) return { user: null, sess: null };
  const now = Date.now();
  const idle = Number(env.ADMIN_IDLE_MIN || 60) * 60e3;
  if (Date.parse(s.expires_at) < now || Date.parse(s.last_seen) + idle < now) {
    await db.run('DELETE FROM sessions WHERE id=?', [s.id]);
    return { user: null, sess: null };
  }
  const user = await db.first('SELECT * FROM users WHERE id=? AND active=1', [s.user_id]);
  if (!user) return { user: null, sess: null };
  if (now - Date.parse(s.last_seen) > 60e3) await db.run('UPDATE sessions SET last_seen=? WHERE id=?', [nowIso(), s.id]);
  return { user, sess: s, token };
}
export const recentlyReauthed = (sess, minutes = 10) => !!(sess && sess.reauth_at && Date.parse(sess.reauth_at) + minutes * 60e3 > Date.now());

// ---------------------------------------------------------------- cabeceras
// CSP estricta. `extra` solo agrega dominios fijos de las etiquetas de medición activas (ver lib/integrations.js).
export function buildCsp({ nonce = '', extra = null } = {}) {
  const x = extra || { script: [], connect: [], img: [], frame: [] };
  const add = (list) => (list.length ? ' ' + list.join(' ') : '');
  return [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''} https://challenges.cloudflare.com${add(x.script)}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob:${add(x.img)}`, "media-src 'self' blob:", `connect-src 'self' https://challenges.cloudflare.com${add(x.connect)}`, "worker-src 'none'", "manifest-src 'self'",
    `frame-src https://challenges.cloudflare.com${add(x.frame)}`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; ');
}
export function securityHeaders(res, { nonce = '', path, secure }) {
  const h = new Headers(res.headers);
  if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', buildCsp({ nonce }));
  h.set('X-Content-Type-Options', 'nosniff');
  if (!h.has('Referrer-Policy')) h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  h.set('X-Frame-Options', 'DENY');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  h.set('X-Permitted-Cross-Domain-Policies', 'none');
  h.set('Origin-Agent-Cluster', '?1');
  if (path.startsWith('/cuenta') || path.startsWith('/afiliadas') || path.startsWith('/pedido/') || path.startsWith('/api/')) {
    h.set('Cache-Control', 'no-store');
    h.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (secure) h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  if (path.startsWith('/admin')) {
    h.set('Cache-Control', 'no-store');
    h.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export async function audit(db, ctx, action, entity = null, entityId = null, data = null) {
  await db.run('INSERT INTO audit_log(at,user_id,action,entity,entity_id,data,ip) VALUES (?,?,?,?,?,?,?)',
    [nowIso(), ctx.user ? ctx.user.id : null, action, entity, entityId == null ? null : String(entityId),
      data == null ? null : JSON.stringify(data).slice(0, 4000), clientIp(ctx.req)]);
}
