// Primera instalación: /setup crea las tablas, carga los datos iniciales y la primera cuenta de administración.
// Protegido con el secreto SETUP_TOKEN. Una vez instalado, /setup deja de funcionar.
import { html } from './lib/html.js';
import { nowIso } from './lib/db.js';
import { hashPassword, passwordProblem, rateLimited, clientIp, safeEqual } from './lib/security.js';
import { install, isInstalled } from './lib/seed.js';
import { loadBundledFiles } from './lib/bundled.js';
import { ensureBucket } from './lib/storage.js';
import { invalidate } from './lib/repo.js';
import { htmlRes, readForm, redirect, sameOrigin } from './http.js';

const page = (body) => htmlRes(html`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Instalar THF</title><link rel="stylesheet" href="/assets/admin/admin.css"></head>
<body class="auth"><main class="auth-card"><p class="brand">THF <span>panel</span></p>${body}</main></body></html>`, 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });

export async function setupPage(c) {
  const { req, env, db } = c;
  let installed = false;
  try { installed = await isInstalled(db); } catch {}
  if (installed && (await db.n('SELECT COUNT(*) n FROM users')) > 0) return redirect('/admin');
  if (!env.SETUP_TOKEN || String(env.SETUP_TOKEN).length < 16 || !env.THF_PEPPER || String(env.THF_PEPPER).length < 32) {
    return page(html`<h1>Falta un paso</h1><p>Antes de instalar, crea dos secretos en Cloudflare (Worker → Settings → Variables and Secrets):</p>
      <ul><li><b>THF_PEPPER</b>: 32 caracteres o más, al azar. No lo cambies después.</li><li><b>SETUP_TOKEN</b>: 16 caracteres o más. Solo sirve para esta instalación.</li></ul>
      <p>La guía paso a paso está en el README del proyecto.</p>`);
  }
  let err = '';
  if (req.method === 'POST') {
    if (!sameOrigin(req, c.url)) return page(html`<p>Origen no permitido.</p>`);
    if (await rateLimited(db, `setup:${clientIp(req)}`, 5, 900).catch(() => false)) return page(html`<p>Demasiados intentos. Espera 15 minutos.</p>`);
    const f = await readForm(req);
    const email = String(f.email || '').trim().toLowerCase(), name = String(f.name || '').trim().slice(0, 80), pw = String(f.password || '');
    if (!safeEqual(String(f.token || ''), String(env.SETUP_TOKEN))) err = 'El código de instalación no coincide.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) err = 'Escribe tu nombre y un correo válido.';
    else if (passwordProblem(pw)) err = passwordProblem(pw);
    else if (pw !== f.password2) err = 'Las contraseñas no coinciden.';
    else {
      if (!installed) { await ensureBucket(env); await install(db); }
      await copySeedFiles(c);
      await db.run("INSERT INTO users(email,name,role,pw_hash,created_at) VALUES (?,?,'ADMIN',?,?)", [email, name, await hashPassword(pw, env.THF_PEPPER, env.PW_ITER), nowIso()]);
      await db.run("INSERT INTO audit_log(at,action,entity,data,ip) VALUES (?,'instalacion','sistema',?,?)", [nowIso(), JSON.stringify({ email }), clientIp(req)]);
      invalidate();
      return redirect('/admin/login?msg=' + encodeURIComponent('Listo. Entra con tu correo y contraseña; luego activarás la verificación en dos pasos.'), 303);
    }
  }
  return page(html`<h1>Instalar la tienda</h1>
    <p>Esto crea la base de datos con las colecciones, piezas, looks, envíos y ajustes iniciales, y tu cuenta de administración.</p>
    ${err ? html`<p class="err" role="alert">${err}</p>` : ''}
    <form method="post" class="stack">
      <label>Código de instalación (SETUP_TOKEN)<input name="token" type="password" required autocomplete="off"></label>
      <label>Tu nombre<input name="name" required autocomplete="name"></label>
      <label>Correo<input name="email" type="email" required autocomplete="username"></label>
      <label>Contraseña (12 caracteres o más)<input name="password" type="password" minlength="12" required autocomplete="new-password"></label>
      <label>Repite la contraseña<input name="password2" type="password" minlength="12" required autocomplete="new-password"></label>
      <button class="btn">Instalar</button>
    </form>`);
}

async function copySeedFiles(c) {
  try {
    await loadBundledFiles(c);
  } catch (e) {
    console.error('copySeedFiles', e);
  }
}
