// Acceso al panel: contraseña + verificación en dos pasos (TOTP) obligatoria, códigos de recuperación, bloqueo y reautenticación.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import {
  audit, clientIp, createSession, destroySession, hashPassword, newRecoveryCodes, newTotpSecret, passwordProblem, rateLimited, sessionCookie,
  sha256, totpUri, totpVerify, turnstileOk, verifyPassword,
} from '../lib/security.js';
import { htmlRes, readForm, redirect } from '../http.js';
import { csrf } from './ui.js';

const DUMMY = 'pbkdf2$20000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export const authPage = (c, title, body, headers = {}) => htmlRes(html`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} · Panel THF</title><link rel="stylesheet" href="/assets/admin/admin.css?v=3">
${c.env.TURNSTILE_SITEKEY ? raw('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>') : ''}</head>
<body class="auth"><main class="auth-card"><p class="brand">THF <span>panel</span></p>${body}</main><script src="/assets/admin/admin.js?v=3" defer></script></body></html>`, 200, { 'Cache-Control': 'no-store', ...headers });

const msgs = (c, err) => html`${c.url.searchParams.get('msg') ? html`<p class="ok" role="status">${c.url.searchParams.get('msg')}</p>` : ''}${err ? html`<p class="err" role="alert">${err}</p>` : ''}`;

export async function login(c) {
  const { req, env, db } = c;
  let err = '';
  if (req.method === 'POST') {
    const ip = clientIp(req);
    const f = await readForm(req);
    const email = String(f.email || '').trim().toLowerCase();
    if (await rateLimited(db, `login-ip:${ip}`, 10, 900)) err = 'Demasiados intentos desde tu conexión. Espera 15 minutos.';
    else if (!(await turnstileOk(env, f['cf-turnstile-response'], ip))) err = 'No pudimos verificar que eres una persona.';
    else {
      const u = await db.first('SELECT * FROM users WHERE email=? AND active=1', [email]);
      const ok = await verifyPassword(String(f.password || ''), u ? u.pw_hash : DUMMY, env.THF_PEPPER);
      if (u && u.locked_until && Date.parse(u.locked_until) > Date.now()) err = 'La cuenta está bloqueada por intentos fallidos. Intenta en 15 minutos.';
      else if (!u || !ok) {
        if (u) {
          const n = u.failed_count + 1;
          await db.run('UPDATE users SET failed_count=?, locked_until=? WHERE id=?', [n >= 5 ? 0 : n, n >= 5 ? new Date(Date.now() + 15 * 60e3).toISOString() : null, u.id]);
          await audit(db, { req, user: u }, 'login_fallido', 'usuario', u.id);
        }
        err = 'Correo o contraseña incorrectos.';
      } else {
        await db.run('UPDATE users SET failed_count=0, locked_until=NULL WHERE id=?', [u.id]);
        const token = await createSession(db, u.id, false, req, env);
        return redirect(u.totp_enabled ? '/admin/2fa' : '/admin/2fa/activar', 303, { 'Set-Cookie': sessionCookie(token, c.secure, null) });
      }
    }
  }
  return authPage(c, 'Entrar', html`<h1>Entrar</h1>${msgs(c, err)}
<form method="post" class="stack" autocomplete="on">
  <label>Correo<input name="email" type="email" required autocomplete="username" autofocus></label>
  <label>Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
  ${env.TURNSTILE_SITEKEY ? html`<div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITEKEY}"></div>` : ''}
  <button class="btn">Entrar</button>
</form>`);
}

async function finishMfa(c, user) {
  await destroySession(c.db, c.token);
  const token = await createSession(c.db, user.id, true, c.req, c.env);
  await c.db.run('UPDATE users SET last_login_at=? WHERE id=?', [nowIso(), user.id]);
  await audit(c.db, { req: c.req, user }, 'login', 'usuario', user.id);
  return redirect('/admin', 303, { 'Set-Cookie': sessionCookie(token, c.secure, null) });
}

export async function mfa(c) {
  const { req, db, user } = c;
  let err = '';
  if (req.method === 'POST') {
    const f = await readForm(req);
    if (await rateLimited(db, `mfa:${user.id}`, 8, 900)) err = 'Demasiados intentos. Espera 15 minutos.';
    else {
      const code = String(f.code || '').trim();
      if (await totpVerify(user.totp_secret, code)) return finishMfa(c, user);
      const hashes = JSON.parse(user.recovery_codes || '[]');
      const h = await sha256(code.toLowerCase());
      if (hashes.includes(h)) {
        await db.run('UPDATE users SET recovery_codes=? WHERE id=?', [JSON.stringify(hashes.filter((x) => x !== h)), user.id]);
        await audit(db, { req, user }, 'codigo_recuperacion_usado', 'usuario', user.id);
        return finishMfa(c, user);
      }
      err = 'El código no es válido.';
    }
  }
  return authPage(c, 'Verificación', html`<h1>Verificación en dos pasos</h1><p>Escribe el código de 6 dígitos de tu app de autenticación (o un código de recuperación).</p>${msgs(c, err)}
<form method="post" class="stack">${csrf(c)}<label>Código<input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus maxlength="13"></label><button class="btn">Verificar</button></form>
<form method="post" action="/admin/salir">${csrf(c)}<button class="link">Salir</button></form>`);
}

export async function mfaSetup(c) {
  const { req, db, user } = c;
  let err = '';
  let secret = user.totp_secret;
  if (!secret || user.totp_enabled) {
    if (user.totp_enabled) return redirect('/admin');
    secret = newTotpSecret();
    await db.run('UPDATE users SET totp_secret=? WHERE id=?', [secret, user.id]);
  }
  if (req.method === 'POST') {
    const f = await readForm(req);
    if (await rateLimited(db, `mfa:${user.id}`, 8, 900)) err = 'Demasiados intentos. Espera 15 minutos.';
    else if (await totpVerify(secret, f.code)) {
      const { codes, hashes } = await newRecoveryCodes(8);
      await db.run('UPDATE users SET totp_enabled=1, recovery_codes=? WHERE id=?', [JSON.stringify(hashes), user.id]);
      await audit(db, { req, user }, '2fa_activada', 'usuario', user.id);
      await destroySession(db, c.token);
      const token = await createSession(db, user.id, true, req, c.env);
      return authPage(c, 'Códigos de recuperación', html`<h1>Verificación activada</h1>
<p>Guarda estos códigos en un lugar seguro. Cada uno sirve <b>una sola vez</b> si pierdes el teléfono. No se volverán a mostrar.</p>
<ol class="codes">${codes.map((x) => html`<li><code>${x}</code></li>`)}</ol>
<a class="btn" href="/admin">Ya los guardé, ir al panel</a>`, { 'Set-Cookie': sessionCookie(token, c.secure, null) });
    } else err = 'El código no coincide. Revisa la hora de tu teléfono e intenta de nuevo.';
  }
  const uri = totpUri(secret, user.email);
  return authPage(c, 'Activar verificación', html`<h1>Activa la verificación en dos pasos</h1>
<p>Es obligatoria para entrar al panel. Usa Google Authenticator, Microsoft Authenticator, 1Password o Authy.</p>
<ol class="steps"><li>Escanea este código con la app:<div class="qr" data-qr="${uri}" aria-label="Código QR para la app de autenticación"></div><small>¿No puedes escanear? En el teléfono, toca <a href="${uri}">abrir en la app</a> o escribe esta clave:</small><code class="key">${secret.replace(/(.{4})/g, '$1 ').trim()}</code></li>
<li>Escribe el código de 6 dígitos que aparece.</li></ol>${msgs(c, err)}
<form method="post" class="stack">${csrf(c)}<label>Código<input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="6"></label><button class="btn">Activar</button></form>`);
}

export async function logout(c) {
  if (c.user) await audit(c.db, c, 'salir', 'usuario', c.user.id);
  await destroySession(c.db, c.token);
  return redirect('/admin/login?msg=' + encodeURIComponent('Sesión cerrada.'), 303, { 'Set-Cookie': sessionCookie('', c.secure, 0) });
}

// Confirmar la contraseña antes de acciones sensibles (cambiar el WhatsApp, usuarios, métodos de pago)
export async function reauth(c) {
  const { req, db, user, env } = c;
  const next = /^\/admin(\/[\w\-/]*)?$/.test(c.url.searchParams.get('next') || '') ? c.url.searchParams.get('next') : '/admin';
  let err = '';
  if (req.method === 'POST') {
    const f = await readForm(req);
    if (await rateLimited(db, `reauth:${user.id}`, 6, 900)) err = 'Demasiados intentos. Espera 15 minutos.';
    else if ((await verifyPassword(String(f.password || ''), user.pw_hash, env.THF_PEPPER)) && (await totpVerify(user.totp_secret, f.code))) {
      await db.run('UPDATE sessions SET reauth_at=? WHERE id=?', [nowIso(), c.sess.id]);
      await audit(db, c, 'reautenticacion', 'usuario', user.id);
      return redirect(next, 303);
    } else err = 'La contraseña o el código no coinciden.';
  }
  return authPage(c, 'Confirma tu identidad', html`<h1>Confirma tu identidad</h1><p>Esta acción es sensible. Vuelve a escribir tu contraseña y un código de tu app.</p>${msgs(c, err)}
<form method="post" class="stack">${csrf(c)}<label>Contraseña<input name="password" type="password" required autocomplete="current-password" autofocus></label>
<label>Código de 6 dígitos<input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="6"></label><button class="btn">Confirmar</button></form>
<p><a class="link" href="/admin">Cancelar</a></p>`);
}

export async function changePassword(c, f) {
  const { db, user, env } = c;
  if (!(await verifyPassword(String(f.current || ''), user.pw_hash, env.THF_PEPPER))) return 'La contraseña actual no es correcta.';
  const p = passwordProblem(String(f.password || ''));
  if (p) return p;
  if (f.password !== f.password2) return 'Las contraseñas nuevas no coinciden.';
  await db.batch([['UPDATE users SET pw_hash=? WHERE id=?', [await hashPassword(f.password, env.THF_PEPPER, env.PW_ITER), user.id]],
    ['DELETE FROM sessions WHERE user_id=? AND id<>?', [user.id, c.sess.id]]]);
  await audit(db, c, 'cambio_contrasena', 'usuario', user.id);
  return '';
}
