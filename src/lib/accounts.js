// Cuentas de clientas y de afiliadas (embajadoras y aliadas): sesiones separadas del panel, con cookie propia,
// token guardado como hash, CSRF por sesión, vencimiento por inactividad y bloqueo por intentos fallidos.
import { nowIso } from './db.js';
import { clientIp, cookieGet, hashPassword, randomToken, sha256, verifyPassword } from './security.js';

export const KINDS = {
  clienta: { cookie: 'thf_c', table: 'customer_sessions', fk: 'customer_id', owner: 'customers', idleMin: 60 * 24 * 14, absDays: 60 },
  socia: { cookie: 'thf_p', table: 'partner_sessions', fk: 'partner_id', owner: 'partners', idleMin: 60 * 12, absDays: 14 },
};

export function acctCookie(kind, token, secure, maxAge) {
  const k = KINDS[kind];
  return `${k.cookie}=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${maxAge != null ? `; Max-Age=${maxAge}` : ''}`;
}

export async function startSession(db, kind, ownerId, req) {
  const k = KINDS[kind];
  const token = randomToken(32);
  const exp = new Date(Date.now() + k.absDays * 86400e3).toISOString();
  await db.run(`INSERT INTO ${k.table}(token_hash,${k.fk},csrf,created_at,last_seen,expires_at,ip,ua) VALUES (?,?,?,?,?,?,?,?)`,
    [await sha256(token), ownerId, randomToken(24), nowIso(), nowIso(), exp, clientIp(req), (req.headers.get('User-Agent') || '').slice(0, 200)]);
  await db.run(`UPDATE ${k.owner} SET last_login_at=?, failed_count=0, locked_until=NULL WHERE id=?`, [nowIso(), ownerId]);
  return token;
}

export async function endSession(db, kind, req) {
  const k = KINDS[kind];
  const t = cookieGet(req, k.cookie);
  if (t) await db.run(`DELETE FROM ${k.table} WHERE token_hash=?`, [await sha256(t)]);
}

// Devuelve { who, sess } o null
export async function loadAccount(db, kind, req) {
  const k = KINDS[kind];
  const t = cookieGet(req, k.cookie);
  if (!t || t.length > 100) return null;
  const s = await db.first(`SELECT * FROM ${k.table} WHERE token_hash=?`, [await sha256(t)]);
  if (!s) return null;
  const now = Date.now();
  if (Date.parse(s.expires_at) < now || Date.parse(s.last_seen) + k.idleMin * 60e3 < now) {
    await db.run(`DELETE FROM ${k.table} WHERE id=?`, [s.id]);
    return null;
  }
  const who = await db.first(`SELECT * FROM ${k.owner} WHERE id=?`, [s[k.fk]]);
  if (!who || (kind === 'clienta' && who.status !== 'activa') || (kind === 'socia' && who.status === 'baja')) return null;
  if (now - Date.parse(s.last_seen) > 5 * 60e3) await db.run(`UPDATE ${k.table} SET last_seen=? WHERE id=?`, [nowIso(), s.id]);
  return { who, sess: s };
}

const DUMMY = 'pbkdf2$20000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Verifica contraseña con bloqueo de 15 minutos tras 6 intentos. Mismo tiempo de respuesta exista o no la cuenta.
export async function checkLogin(db, env, kind, row, pw) {
  const k = KINDS[kind];
  const ok = await verifyPassword(String(pw || ''), row?.pw_hash || DUMMY, env.THF_PEPPER);
  if (!row || !row.pw_hash) return { error: 'Correo o contraseña incorrectos.' };
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) return { error: 'La cuenta está bloqueada unos minutos por intentos fallidos. Intenta más tarde.' };
  if (!ok) {
    const n = (row.failed_count || 0) + 1;
    await db.run(`UPDATE ${k.owner} SET failed_count=?, locked_until=? WHERE id=?`, [n >= 6 ? 0 : n, n >= 6 ? new Date(Date.now() + 15 * 60e3).toISOString() : null, row.id]);
    return { error: 'Correo o contraseña incorrectos.' };
  }
  return { ok: true };
}

export const hashPw = (env, pw) => hashPassword(pw, env.THF_PEPPER, env.PW_ITER);

// Enlace de un solo uso (restablecer contraseña / verificar correo): se guarda solo el hash
export async function newCustomerToken(db, customerId, purpose, hours = 2) {
  const token = randomToken(24);
  await db.run('INSERT INTO customer_tokens(customer_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)',
    [customerId, purpose, await sha256(token), new Date(Date.now() + hours * 3600e3).toISOString(), nowIso()]);
  return token;
}
export async function useCustomerToken(db, purpose, token) {
  if (!token || token.length > 80) return null;
  const r = await db.first('SELECT * FROM customer_tokens WHERE token_hash=? AND purpose=?', [await sha256(token), purpose]);
  if (!r || r.used_at || Date.parse(r.expires_at) < Date.now()) return null;
  const u = await db.run('UPDATE customer_tokens SET used_at=? WHERE id=? AND used_at IS NULL', [nowIso(), r.id]);
  return u.changes ? r : null;
}
