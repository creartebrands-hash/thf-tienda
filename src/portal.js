// Portal de afiliadas: /afiliadas (entrar), /afiliadas/acceso?t= (crear contraseña), /afiliadas/panel, /afiliadas/precios, /afiliadas/qr.svg, /afiliadas/salir
import { acctCookie, checkLogin, endSession, hashPw, loadAccount, startSession } from './lib/accounts.js';
import { nowIso } from './lib/db.js';
import { balance, commissionRule, partnerLink, storeLink } from './lib/partners.js';
import { clampStore } from './lib/pricing.js';
import { qrSvg } from './lib/qr.js';
import { clientIp, rateLimited, safeEqual, sha256 } from './lib/security.js';
import * as V from './lib/validate.js';
import { HttpError, readForm, redirect, sameOrigin } from './http.js';
import { render } from './public.js';
import * as PV from './views/portal.js';
import * as AL from './lib/aliadas.js';

export async function dashboardData(c, p) {
  const { db } = c;
  const S = await db.settings();
  const [clicks, orders, sales, bal, ledger, list] = await Promise.all([
    db.n("SELECT COUNT(*) n FROM events WHERE partner_id=? AND type='ref_click'", [p.id]),
    db.n("SELECT COUNT(*) n FROM orders WHERE partner_id=? AND status NOT IN ('expirado')", [p.id]),
    db.n("SELECT COALESCE(SUM(subtotal_cents-discount_cents),0) n FROM orders WHERE partner_id=? AND status IN ('pagado','en_produccion','listo','listo_retiro','enviado','entregado')", [p.id]),
    balance(db, p.id),
    db.all('SELECT * FROM ledger_entries WHERE partner_id=? ORDER BY id DESC LIMIT 100', [p.id]),
    db.all(`SELECT o.code, o.created_at, o.status, o.subtotal_cents, o.discount_cents, (SELECT SUM(amount_cents) FROM ledger_entries l WHERE l.order_id=o.id AND l.partner_id=o.partner_id) earned
      FROM orders o WHERE o.partner_id=? ORDER BY o.id DESC LIMIT 100`, [p.id]),
  ]);
  const link = partnerLink(c.base, p);
  return { p, S, stats: { clicks, orders, sales }, bal, ledger, orders: list, link, store: storeLink(c.base, p), qr: qrSvg(link), rule: commissionRule(p, S) };
}

const page = async (c, title, body, status = 200, headers = {}) => {
  const r = await render(c, { page: 'socias', title: `${title} · Portal de afiliadas`, desc: '', noindex: true, body, status });
  r.headers.set('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
};

export async function portal(c) {
  const { db, req, url, env } = c;
  const path = url.pathname.replace(/\/$/, '') || '/afiliadas';
  const method = req.method;
  if (method === 'POST' && !sameOrigin(req, url)) throw new HttpError(403, 'Origen no permitido.');
  const ip = clientIp(req);

  if (path === '/afiliadas/entrar' && method === 'POST') {
    const f = await readForm(req);
    if (await rateLimited(db, `plogin:${ip}`, 10, 900)) return page(c, 'Entrar', PV.portalLogin({ e: 'Demasiados intentos. Espera 15 minutos.' }), 429);
    let email = '';
    try { email = V.emailKey(f.email); } catch {}
    const row = email ? await db.first("SELECT * FROM partners WHERE email_key=? AND status<>'baja'", [email]) : null;
    const r = await checkLogin(db, env, 'socia', row, f.password);
    if (r.error) return page(c, 'Entrar', PV.portalLogin({ e: r.error }), 401);
    const token = await startSession(db, 'socia', row.id, req);
    return redirect('/afiliadas/panel', 303, { 'Set-Cookie': acctCookie('socia', token, c.secure, null) });
  }
  if (path === '/afiliadas/acceso') {
    const t = String((method === 'POST' ? (await req.clone().formData()).get('t') : url.searchParams.get('t')) || '').replace(/[^\w-]/g, '').slice(0, 80);
    const row = t ? await db.first('SELECT * FROM partners WHERE access_token_hash=?', [await sha256(t)]) : null;
    if (!row || !row.access_expires || Date.parse(row.access_expires) < Date.now() || row.status === 'baja')
      return page(c, 'Enlace vencido', PV.portalLogin({ e: 'Este enlace de acceso venció o ya se usó. Pide uno nuevo por WhatsApp.' }), 410);
    if (method === 'POST') {
      const f = await readForm(req);
      try {
        const pw = V.password(f.password);
        if (pw !== f.password2) throw new V.ValidationError('Las contraseñas no coinciden.');
        await db.batch([['UPDATE partners SET pw_hash=?, access_token_hash=NULL, access_expires=NULL, failed_count=0, locked_until=NULL, updated_at=? WHERE id=?', [await hashPw(env, pw), nowIso(), row.id]],
          ['DELETE FROM partner_sessions WHERE partner_id=?', [row.id]]]);
      } catch (e) {
        if (!(e instanceof V.ValidationError)) throw e;
        return page(c, 'Crea tu contraseña', PV.portalSetPassword({ t, e: e.message, name: row.name.split(' ')[0] }), 400);
      }
      const token = await startSession(db, 'socia', row.id, req);
      return redirect('/afiliadas/panel', 303, { 'Set-Cookie': acctCookie('socia', token, c.secure, null) });
    }
    return page(c, 'Crea tu contraseña', PV.portalSetPassword({ t, name: row.name.split(' ')[0] }));
  }
  const a = await loadAccount(db, 'socia', req);
  if (!a) return path === '/afiliadas' || method === 'GET' ? page(c, 'Entrar', PV.portalLogin({})) : redirect('/afiliadas', 303);
  const p = a.who;
  if (method === 'POST') {
    const f = await readForm(req);
    if (!safeEqual(String(f._csrf || ''), a.sess.csrf)) throw new HttpError(403, 'La sesión del formulario venció. Recarga la página.');
    if (path === '/afiliadas/salir') { await endSession(db, 'socia', req); return redirect('/afiliadas', 303, { 'Set-Cookie': acctCookie('socia', '', c.secure, 0) }); }
    if (path === '/afiliadas/precios' && p.kind === 'emprendedora') {
      if (await rateLimited(db, `pprice:${p.id}`, 30, 600)) throw new HttpError(429, 'Demasiados cambios seguidos. Espera unos minutos.');
      const prods = await db.all("SELECT id, price_cents, min_cents, max_cents FROM products WHERE status='published' AND in_catalog=1 AND is_bundle=0");
      const opts = await AL.assetOptions(db);
      const t = nowIso();
      const stmts = [];
      for (const r of prods) {
        if (f[`p_${r.id}`] == null) continue;
        let cents;
        try { cents = V.amountCents(f[`p_${r.id}`]); } catch { continue; }
        // Solo se puede mostrar una pieza que tenga fotos para aliadas, y solo con una de esas fotos
        const list = opts.byProduct.get(r.id) || [];
        const asked = Number(f[`a_${r.id}`]);
        const asset = list.find((o) => o.id === asked)?.id ?? list[0]?.id ?? null;
        const visible = f[`v_${r.id}`] && list.length ? 1 : 0;
        stmts.push([`INSERT INTO partner_prices(partner_id,product_id,price_cents,visible,asset_id,updated_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(partner_id,product_id) DO UPDATE SET price_cents=excluded.price_cents, visible=excluded.visible, asset_id=excluded.asset_id, updated_at=excluded.updated_at`, [p.id, r.id, clampStore(cents, r), visible, asset, t]]);
      }
      if (stmts.length) await db.batch(stmts);
      return redirect('/afiliadas/precios?msg=' + encodeURIComponent('Piezas guardadas. Los precios fuera del rango se ajustaron al límite.'), 303);
    }
    if (path === '/afiliadas/tienda' && p.kind === 'emprendedora') {
      if (await rateLimited(db, `pstore:${p.id}`, 30, 600)) throw new HttpError(429, 'Demasiados cambios seguidos. Espera unos minutos.');
      try {
        const v = await AL.validateStore(db, { ...f, bg: f.bg || f.bg_p, fg: f.fg || f.fg_p });
        await db.run('UPDATE partners SET store_title=?, store_subtitle=?, store_bio=?, store_bg=?, store_fg=?, store_banner_id=?, updated_at=? WHERE id=?',
          [v.title, v.subtitle, v.bio, v.bg, v.fg, v.banner, nowIso(), p.id]);
      } catch (e) {
        if (!(e instanceof V.ValidationError)) throw e;
        return page(c, 'Mi tienda', PV.portalStore({ p: { ...p, store_title: f.title, store_subtitle: f.subtitle, store_bio: f.bio }, opts: await AL.assetOptions(db), presets: PRESETS, csrf: a.sess.csrf, e: e.message, store: storeLink(c.base, p), brand: await db.setting('brand.name', 'THF') }), 400);
      }
      return redirect('/afiliadas/tienda?msg=' + encodeURIComponent('Tu tienda quedó guardada.'), 303);
    }
    throw new HttpError(404);
  }
  if (path === '/afiliadas' || path === '/afiliadas/panel') return page(c, 'Mi portal', PV.portalDashboard({ ...(await dashboardData(c, p)), csrf: a.sess.csrf }));
  if (path === '/afiliadas/qr.svg') {
    return new Response(qrSvg(partnerLink(c.base, p)), { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `attachment; filename="qr-${p.code}.svg"`, 'Cache-Control': 'no-store' } });
  }
  if (path === '/afiliadas/precios' && p.kind === 'emprendedora') {
    const rows = await priceRows(db, p.id);
    return page(c, 'Mis piezas', PV.portalPrices({ p, rows, csrf: a.sess.csrf, msg: url.searchParams.get('msg') }));
  }
  if (path === '/afiliadas/tienda' && p.kind === 'emprendedora') {
    return page(c, 'Mi tienda', PV.portalStore({ p, opts: await AL.assetOptions(db), presets: PRESETS, csrf: a.sess.csrf, msg: url.searchParams.get('msg'), store: storeLink(c.base, p), brand: await db.setting('brand.name', 'THF') }));
  }
  throw new HttpError(404);
}

const PRESETS = { bg: AL.BG_PRESETS, fg: AL.FG_PRESETS, defBg: AL.DEFAULT_BG, defFg: AL.DEFAULT_FG };

export async function priceRows(db, partnerId) {
  const opts = await AL.assetOptions(db);
  const prods = await db.all("SELECT id, name, price_cents, offer_cents, cost_cents, suggested_cents, min_cents, max_cents FROM products WHERE status='published' AND in_catalog=1 AND is_bundle=0 ORDER BY sort, id");
  const mine = new Map((await db.all('SELECT * FROM partner_prices WHERE partner_id=?', [partnerId])).map((r) => [r.product_id, r]));
  return prods.map((r) => {
    const min = r.min_cents ?? r.price_cents, max = r.max_cents ?? r.price_cents * 2;
    const own = mine.get(r.id);
    return { id: r.id, name: r.name, cost: r.cost_cents, min, max, price: own ? own.price_cents : clampStore(r.suggested_cents ?? r.price_cents, r), visible: own ? !!own.visible : false,
      asset: own?.asset_id ?? null, options: opts.byProduct.get(r.id) || [] };
  });
}
