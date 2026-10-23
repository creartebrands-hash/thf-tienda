// Analítica: visitas, de dónde llegan (Instagram, Google, Facebook, Pinterest, WhatsApp…), orgánico o anuncios,
// piezas más vistas y vendidas, embudo de compra, rutas de las clientas y ventas por embajadora o aliada.
// Y el generador de enlaces con UTM para medir cada publicación, historia o anuncio.
import { html, raw } from '../lib/html.js';
import { CHANNELS, TRAFFIC, dayOf } from '../lib/analytics.js';
import { nowIso } from '../lib/db.js';
import { money } from '../lib/pricing.js';
import { audit } from '../lib/security.js';
import { HttpError, readForm, redirect } from '../http.js';
import { badge, csrf, empty, fmt, layout } from './ui.js';

const PAID = "('pagado','en_produccion','listo','listo_retiro','enviado','entregado')";
const pctTxt = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toString().replace('.', ',')} %` : '—');

function bars(rows, { key, val, label, fmtv = (v) => v, max = null }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r[val]));
  return html`<ul class="hbars">${rows.map((r) => html`<li><span class="hb-l">${label(r[key])}</span><span class="hb-b"><i style="width:${Math.max(1, Math.round((r[val] / m) * 100))}%"></i></span><b>${fmtv(r[val])}</b></li>`)}</ul>`;
}

// Serie diaria en SVG (sin librerías): visitas en barras, pedidos en línea
function daily(days, sessions, orders) {
  const W = 760, H = 180, P = 26;
  const n = days.length, mx = Math.max(1, ...days.map((d) => sessions[d] || 0)), mo = Math.max(1, ...days.map((d) => orders[d] || 0));
  const bw = (W - P * 2) / n;
  const bars = days.map((d, i) => { const h = ((sessions[d] || 0) / mx) * (H - P * 2); return `<rect x="${(P + i * bw + bw * 0.15).toFixed(1)}" y="${(H - P - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" fill="var(--c1)"><title>${d}: ${sessions[d] || 0} visitas</title></rect>`; }).join('');
  // Pedidos: un punto por día con pedidos (con su número), sobre una línea suave que no salta a cero en los días sin pedidos
  const dots = days.map((d, i) => { const v = orders[d] || 0; if (!v) return ''; const x = P + i * bw + bw / 2, y = H - P - (v / mo) * (H - P * 2) * 0.9 - 4;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--c2)"><title>${d}: ${v} pedido(s)</title></circle>${mo > 1 ? `<text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".75">${v}</text>` : ''}`; }).join('');
  const lab = days.map((d, i) => (i % Math.ceil(n / 8) === 0 ? `<text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">${d.slice(8)}/${d.slice(5, 7)}</text>` : '')).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas y pedidos por día"><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="currentColor" opacity=".2"/>${bars}${dots}${lab}</svg>
<p class="legend"><span class="sw c1"></span>Visitas (sesiones) <span class="sw c2 dot"></span>Días con pedidos</p>`);
}


// Periodo del informe: lista de periodos rápidos o fechas personalizadas con calendario (días de Caracas)
const RANGES = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado'], ['ano', 'Este año'], ['personalizado', 'Personalizado…']];
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v + 'T12:00:00Z'));
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const ddmm = (day) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
export function rangeOf(q) {
  const today = dayOf(nowIso());
  let key = q.get('rango') || (q.get('dias') ? String(q.get('dias')) : '30');
  if (!RANGES.some(([k]) => k === key)) key = '30';
  let since, until = today;
  if (key === 'hoy') since = today;
  else if (key === 'ayer') since = until = addDays(today, -1);
  else if (key === 'mes') since = today.slice(0, 8) + '01';
  else if (key === 'mes_pasado') { until = addDays(today.slice(0, 8) + '01', -1); since = until.slice(0, 8) + '01'; }
  else if (key === 'ano') since = today.slice(0, 5) + '01-01';
  else if (key === 'personalizado') {
    since = isDay(q.get('desde')) ? q.get('desde') : addDays(today, -29);
    until = isDay(q.get('hasta')) ? q.get('hasta') : today;
    if (until > today) until = today;
    if (since > until) [since, until] = [until, since];
    if (since < addDays(until, -730)) since = addDays(until, -730); // máximo dos años por consulta
  } else since = addDays(today, -(Number(key) - 1));
  // Los días son de Caracas (UTC−4): el día empieza a las 04:00 UTC
  return { key, since, until, sinceIso: since + 'T04:00:00.000Z', untilIso: addDays(until, 1) + 'T04:00:00.000Z', label: since === until ? ddmm(since) : `${ddmm(since)} – ${ddmm(until)}` };
}
function rangeForm(R) {
  return html`<form class="range" method="get" data-range>
<label class="rg-sel"><span>Periodo</span><select name="rango" data-range-sel>${RANGES.map(([k, l]) => html`<option value="${k}"${k === R.key ? raw(' selected') : ''}>${l}</option>`)}</select></label>
<span class="rg-dates"${R.key === 'personalizado' ? '' : raw(' data-hide')}><label><span>Desde</span><input type="date" name="desde" value="${R.since}" max="${dayOf(nowIso())}"></label>
<label><span>Hasta</span><input type="date" name="hasta" value="${R.until}" max="${dayOf(nowIso())}"></label><button class="btn sm">Ver</button></span>
<span class="rg-label">${R.label}</span><a class="btn sm ghost" href="/admin/utm">Enlaces UTM</a></form>`;
}

export async function dashboard(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db } = c;
  const R = rangeOf(c.url.searchParams);
  const { since, until, sinceIso, untilIso } = R;
  const [visitors, sessions, views, ord, paid, byChannel, ordByChannel, byTraffic, ordByTraffic, topViews, topCart, topSold, funnel, landings, devices, campaigns, programs, dSess, dOrd, pathsRaw] = await Promise.all([
    db.n("SELECT COUNT(DISTINCT vid) n FROM events WHERE type='page' AND day>=? AND day<=?", [since, until]),
    db.n("SELECT COUNT(DISTINCT sid) n FROM events WHERE type='page' AND day>=? AND day<=?", [since, until]),
    db.n("SELECT COUNT(*) n FROM events WHERE type='page' AND day>=? AND day<=?", [since, until]),
    db.first("SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) t FROM orders WHERE created_at>=? AND created_at<? AND status NOT IN ('expirado')", [sinceIso, untilIso]),
    db.first(`SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) t FROM orders WHERE created_at>=? AND created_at<? AND status IN ${PAID}`, [sinceIso, untilIso]),
    db.all("SELECT channel, COUNT(DISTINCT sid) n FROM events WHERE type='page' AND day>=? AND day<=? GROUP BY channel ORDER BY n DESC", [since, until]),
    db.all(`SELECT channel, COUNT(*) n, COALESCE(SUM(CASE WHEN status IN ${PAID} THEN total_cents ELSE 0 END),0) t FROM orders WHERE created_at>=? AND created_at<? AND status<>'expirado' GROUP BY channel ORDER BY t DESC`, [sinceIso, untilIso]),
    db.all("SELECT traffic, COUNT(DISTINCT sid) n FROM events WHERE type='page' AND day>=? AND day<=? GROUP BY traffic ORDER BY n DESC", [since, until]),
    db.all(`SELECT traffic, COUNT(*) n, COALESCE(SUM(CASE WHEN status IN ${PAID} THEN total_cents ELSE 0 END),0) t FROM orders WHERE created_at>=? AND created_at<? AND status<>'expirado' GROUP BY traffic ORDER BY t DESC`, [sinceIso, untilIso]),
    db.all("SELECT p.name, COUNT(*) n FROM events e JOIN products p ON p.id=e.product_id WHERE e.type='view_item' AND e.day>=? AND e.day<=? GROUP BY p.name ORDER BY n DESC LIMIT 10", [since, until]),
    db.all("SELECT p.name, COUNT(*) n FROM events e JOIN products p ON p.id=e.product_id WHERE e.type='add_to_cart' AND e.day>=? AND e.day<=? GROUP BY p.name ORDER BY n DESC LIMIT 10", [since, until]),
    db.all(`SELECT l.name, SUM(l.qty) n, SUM(l.total_cents) t FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.created_at>=? AND o.created_at<? AND o.status IN ${PAID} GROUP BY l.name ORDER BY n DESC LIMIT 10`, [sinceIso, untilIso]),
    db.all("SELECT type, COUNT(DISTINCT sid) n FROM events WHERE day>=? AND day<=? AND type IN ('page','view_item','add_to_cart','begin_checkout') GROUP BY type", [since, until]),
    db.all("SELECT path, COUNT(*) n FROM events WHERE id IN (SELECT MIN(id) FROM events WHERE type='page' AND day>=? AND day<=? GROUP BY sid) GROUP BY path ORDER BY n DESC LIMIT 10", [since, until]),
    db.all("SELECT device, COUNT(DISTINCT sid) n FROM events WHERE type='page' AND day>=? AND day<=? GROUP BY device ORDER BY n DESC", [since, until]),
    db.all(`SELECT utm_campaign, utm_source, COUNT(*) n, COALESCE(SUM(CASE WHEN status IN ${PAID} THEN total_cents ELSE 0 END),0) t FROM orders WHERE created_at>=? AND created_at<? AND utm_campaign<>'' GROUP BY utm_campaign, utm_source ORDER BY t DESC LIMIT 15`, [sinceIso, untilIso]),
    db.all(`SELECT p.name, p.kind, p.code, COUNT(o.id) n, COALESCE(SUM(CASE WHEN o.status IN ${PAID} THEN o.total_cents ELSE 0 END),0) t FROM orders o JOIN partners p ON p.id=o.partner_id WHERE o.created_at>=? AND o.created_at<? AND o.status<>'expirado' GROUP BY p.name, p.kind, p.code ORDER BY t DESC LIMIT 20`, [sinceIso, untilIso]),
    db.all("SELECT day, COUNT(DISTINCT sid) n FROM events WHERE type='page' AND day>=? AND day<=? GROUP BY day", [since, until]),
    db.all("SELECT created_at FROM orders WHERE created_at>=? AND created_at<? AND status<>'expirado'", [sinceIso, untilIso]),
    db.all("SELECT sid, path FROM events WHERE type='page' AND day>=? AND day<=? AND sid<>'' ORDER BY id DESC LIMIT 20000", [since, until]),
  ]);
  // Rutas más comunes: las tres primeras páginas de cada visita
  const bySid = new Map();
  for (const r of pathsRaw.reverse()) { const a = bySid.get(r.sid) || []; if (a.length < 3 && a[a.length - 1] !== r.path) a.push(r.path); bySid.set(r.sid, a); }
  const routeCount = new Map();
  for (const a of bySid.values()) if (a.length > 1) { const k = a.join(' → '); routeCount.set(k, (routeCount.get(k) || 0) + 1); }
  const routes = [...routeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const days = [];
  for (let t = Date.parse(since + 'T12:00:00Z'); dayOf(new Date(t).toISOString()) <= until; t += 86400e3) days.push(dayOf(new Date(t).toISOString()));
  const sMap = Object.fromEntries(dSess.map((r) => [r.day, r.n]));
  const oMap = {};
  for (const r of dOrd) { const k = dayOf(r.created_at); oMap[k] = (oMap[k] || 0) + 1; }
  const F = Object.fromEntries(funnel.map((r) => [r.type, r.n]));
  const steps = [['Visitaron la tienda', F.page || 0], ['Vieron una pieza', F.view_item || 0], ['Añadieron al pedido', F.add_to_cart || 0], ['Empezaron a pagar', F.begin_checkout || 0], ['Crearon el pedido', ord.n], ['Pagaron', paid.n]];
  const ordCh = Object.fromEntries(ordByChannel.map((r) => [r.channel, r]));
  const ordTr = Object.fromEntries(ordByTraffic.map((r) => [r.traffic, r]));
  const chRows = [...new Set([...byChannel.map((r) => r.channel), ...ordByChannel.map((r) => r.channel)])].map((ch) => ({ ch, s: byChannel.find((r) => r.channel === ch)?.n || 0, o: ordCh[ch]?.n || 0, t: ordCh[ch]?.t || 0 }));
  const trRows = Object.keys(TRAFFIC).map((tr) => ({ tr, s: byTraffic.find((r) => r.traffic === tr)?.n || 0, o: ordTr[tr]?.n || 0, t: ordTr[tr]?.t || 0 })).filter((r) => r.s || r.o);
  const body = html`${rangeForm(R)}
<div class="kpis"><div class="kpi"><small>Personas</small><b>${visitors}</b></div><div class="kpi"><small>Visitas</small><b>${sessions}</b></div><div class="kpi"><small>Páginas vistas</small><b>${views}</b></div>
<div class="kpi"><small>Pedidos</small><b>${ord.n}</b></div><div class="kpi"><small>Ventas pagadas</small><b>${money(paid.t)}</b></div><div class="kpi"><small>Conversión</small><b>${pctTxt(ord.n, sessions)}</b></div></div>
<section class="card"><h2>Visitas y pedidos por día</h2>${daily(days, sMap, oMap)}</section>
<div class="cols"><section class="card"><h2>¿De dónde llegan?</h2><table class="tbl small"><thead><tr><th>Canal</th><th>Visitas</th><th>Pedidos</th><th>Ventas pagadas</th></tr></thead><tbody>${chRows.map((r) => html`<tr><td>${CHANNELS[r.ch] || r.ch}</td><td>${r.s}</td><td>${r.o}</td><td>${money(r.t)}</td></tr>`)}</tbody></table></section>
<section class="card"><h2>Orgánico, anuncios o programas</h2><table class="tbl small"><thead><tr><th>Tipo</th><th>Visitas</th><th>Pedidos</th><th>Ventas pagadas</th></tr></thead><tbody>${trRows.map((r) => html`<tr><td>${TRAFFIC[r.tr]}</td><td>${r.s}</td><td>${r.o}</td><td>${money(r.t)}</td></tr>`)}</tbody></table>
<p class="help">"Anuncios" = visitas con utm_medium de pago (cpc, paid_social, ads…) o que vienen de Google Ads. "Programas" = llegaron por el enlace o el código de una afiliada.</p></section></div>
<section class="card"><h2>Embudo de compra</h2>${bars(steps.map(([l, n]) => ({ l, n })), { key: 'l', val: 'n', label: (x) => x, fmtv: (v) => String(v), max: Math.max(1, steps[0][1]) })}
<p class="help">De cada 100 visitas, ${pctTxt(F.add_to_cart || 0, steps[0][1])} añaden algo al pedido y ${pctTxt(ord.n, steps[0][1])} crean un pedido.</p></section>
<div class="cols"><section class="card"><h2>Piezas más vistas</h2>${topViews.length ? bars(topViews, { key: 'name', val: 'n', label: (x) => x }) : html`<p class="muted">Sin datos aún.</p>`}</section>
<section class="card"><h2>Más añadidas al pedido</h2>${topCart.length ? bars(topCart, { key: 'name', val: 'n', label: (x) => x }) : html`<p class="muted">Sin datos aún.</p>`}</section></div>
<div class="cols"><section class="card"><h2>Más vendidas (pagadas)</h2>${topSold.length ? html`<table class="tbl small"><thead><tr><th>Pieza</th><th>Unidades</th><th>Ventas</th></tr></thead><tbody>${topSold.map((r) => html`<tr><td>${r.name}</td><td>${r.n}</td><td>${money(r.t)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Sin ventas pagadas en el período.</p>`}</section>
<section class="card"><h2>Ventas por afiliada</h2>${programs.length ? html`<table class="tbl small"><thead><tr><th>Afiliada</th><th>Pedidos</th><th>Ventas pagadas</th></tr></thead><tbody>${programs.map((r) => html`<tr><td>${r.name} <small class="muted">${r.kind} · ${r.code}</small></td><td>${r.n}</td><td>${money(r.t)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Aún no hay ventas referidas.</p>`}</section></div>
<div class="cols"><section class="card"><h2>Por dónde entran (primera página)</h2>${landings.length ? bars(landings, { key: 'path', val: 'n', label: (x) => x }) : html`<p class="muted">Sin datos.</p>`}</section>
<section class="card"><h2>Rutas más comunes</h2>${routes.length ? html`<ol class="routes">${routes.map(([k, n]) => html`<li><span>${k}</span> <b>${n}</b></li>`)}</ol>` : html`<p class="muted">Sin datos.</p>`}</section></div>
<div class="cols"><section class="card"><h2>Campañas con UTM</h2>${campaigns.length ? html`<table class="tbl small"><thead><tr><th>Campaña</th><th>Fuente</th><th>Pedidos</th><th>Ventas</th></tr></thead><tbody>${campaigns.map((r) => html`<tr><td>${r.utm_campaign}</td><td>${r.utm_source}</td><td>${r.n}</td><td>${money(r.t)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Usa los <a href="/admin/utm">enlaces UTM</a> en tus publicaciones para verlas aquí.</p>`}</section>
<section class="card"><h2>Dispositivos</h2>${devices.length ? bars(devices, { key: 'device', val: 'n', label: (x) => ({ movil: 'Teléfono', escritorio: 'Computadora', tablet: 'Tableta' }[x] || x) }) : html`<p class="muted">Sin datos.</p>`}</section></div>
<p class="help">La analítica es propia de la tienda: no usa cookies de terceros ni comparte datos con nadie. No guarda la IP ni datos personales de las visitas.</p>`;
  return layout(c, { title: 'Analítica', active: 'analytics', body });
}

// ---------------------------------------------------------------- enlaces UTM
const SOURCES = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['pinterest', 'Pinterest'], ['whatsapp', 'WhatsApp'], ['google', 'Google'], ['youtube', 'YouTube'], ['email', 'Correo'], ['otro', 'Otro']];
const MEDIUMS = [['bio', 'Enlace de la biografía'], ['post', 'Publicación'], ['stories', 'Historias'], ['reels', 'Reels o videos'], ['estado', 'Estado de WhatsApp'], ['grupo', 'Grupo o difusión'],
  ['paid_social', 'Anuncio en redes (pago)'], ['cpc', 'Anuncio en Google (pago)'], ['email', 'Correo'], ['qr', 'Código QR impreso'], ['influencer', 'Colaboración']];

export async function utm(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db } = c;
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (f._action === 'delete') { await db.run('DELETE FROM utm_links WHERE id=?', [Number(f.id)]); return redirect('/admin/utm?msg=' + encodeURIComponent('Enlace eliminado.'), 303); }
    const clean = (v, n) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n);
    const src = SOURCES.some(([k]) => k === f.utm_source) ? f.utm_source : clean(f.utm_source, 40);
    const med = MEDIUMS.some(([k]) => k === f.utm_medium) ? f.utm_medium : clean(f.utm_medium, 40);
    const camp = clean(f.utm_campaign, 60), content = clean(f.utm_content, 60);
    const dest = /^\/[a-z0-9\-/]*$/.test(f.dest || '') ? f.dest : '/';
    const name = String(f.name || '').trim().slice(0, 80);
    if (!src || !med || !camp || !name) return redirect('/admin/utm?err=' + encodeURIComponent('Completa nombre, red, tipo y campaña.'), 303);
    let code = clean(f.code, 30) || `${src.slice(0, 3)}-${camp}`.slice(0, 30);
    for (let i = 2; await db.first('SELECT 1 x FROM utm_links WHERE code=?', [code]); i++) code = `${code.replace(/-\d+$/, '')}-${i}`;
    await db.run('INSERT INTO utm_links(code,name,dest,utm_source,utm_medium,utm_campaign,utm_content,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [code, name, dest, src, med, camp, content, c.user.id, nowIso()]);
    await audit(db, c, 'crear', 'utm_links', null, { code });
    return redirect('/admin/utm?msg=' + encodeURIComponent('Enlace creado.'), 303);
  }
  const rows = await db.all(`SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.utm_campaign=u.utm_campaign AND o.utm_source=u.utm_source) orders,
    (SELECT COALESCE(SUM(total_cents),0) FROM orders o WHERE o.utm_campaign=u.utm_campaign AND o.utm_source=u.utm_source AND o.status IN ${PAID}) sales FROM utm_links u ORDER BY u.id DESC`);
  const body = html`<p class="intro">Crea un enlace para cada publicación, historia, anuncio o código QR. Así la analítica te dice exactamente qué contenido trae visitas y ventas. Usa el enlace corto (<code>/r/…</code>) en Instagram, WhatsApp y en impresos.</p>
<nav class="tabs"><a href="/admin/analitica">Analítica</a><a href="/admin/utm" aria-current="page">Enlaces UTM</a></nav>
<form method="post" class="card form" data-utm>${csrf(c)}<h2>Nuevo enlace</h2><div class="grid">
<div class="fld"><label for="u_name">Nombre (para ti)</label><input id="u_name" name="name" required maxlength="80" placeholder="Reel Ocaso 21 oct"></div>
<div class="fld"><label for="u_dest">Página de destino</label><select id="u_dest" name="dest">${[['/', 'Inicio'], ['/catalogo', 'Catálogo'], ['/compra-el-look', 'Compra el look'], ['/caja-de-joyeria', 'Caja de joyería'], ['/programas', 'Programas'], ['/guias', 'Guías'],
    ...(await db.all("SELECT slug, name FROM products WHERE status='published' AND in_catalog=1 ORDER BY sort LIMIT 80")).map((p) => [`/pieza/${p.slug}`, `Pieza · ${p.name}`]),
    ...(await db.all('SELECT slug, name FROM campaigns ORDER BY id DESC')).map((k) => [`/temporada/${k.slug}`, `Temporada · ${k.name}`])].map(([v, n]) => html`<option value="${v}">${n}</option>`)}</select></div>
<div class="fld"><label for="u_src">Red o fuente</label><select id="u_src" name="utm_source">${SOURCES.map(([v, n]) => html`<option value="${v}">${n}</option>`)}</select></div>
<div class="fld"><label for="u_med">Tipo de contenido</label><select id="u_med" name="utm_medium">${MEDIUMS.map(([v, n]) => html`<option value="${v}">${n}</option>`)}</select></div>
<div class="fld"><label for="u_camp">Campaña</label><input id="u_camp" name="utm_campaign" required maxlength="60" placeholder="navidad-2026"></div>
<div class="fld"><label for="u_cont">Detalle (opcional)</label><input id="u_cont" name="utm_content" maxlength="60" placeholder="reel-ocaso"></div>
<div class="fld"><label for="u_code">Enlace corto (opcional)</label><input id="u_code" name="code" maxlength="30" placeholder="se genera solo"></div></div>
<p class="help">Vista previa: <code data-utm-out></code></p><div class="bar"><button class="btn">Crear enlace</button></div></form>
${rows.length ? html`<section class="card"><h2>Tus enlaces</h2><div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Nombre</th><th>Enlace corto</th><th>Red · tipo · campaña</th><th>Clics</th><th>Pedidos</th><th>Ventas</th><th></th></tr></thead><tbody>
${rows.map((u) => { const short = `${c.base}/r/${u.code}`; const full = `${c.base}${u.dest}?utm_source=${u.utm_source}&utm_medium=${u.utm_medium}&utm_campaign=${u.utm_campaign}${u.utm_content ? `&utm_content=${u.utm_content}` : ''}`;
    return html`<tr><td>${u.name}<br><small class="muted">${u.dest}</small></td><td><code>${short}</code><br><button class="link" data-copy="${short}">Copiar corto</button> · <button class="link" data-copy="${full}">Copiar completo</button></td><td>${u.utm_source} · ${u.utm_medium} · ${u.utm_campaign}${u.utm_content ? ` · ${u.utm_content}` : ''}</td><td>${u.clicks}</td><td>${u.orders}</td><td>${money(u.sales)}</td>
<td class="r"><form method="post" class="inline" data-confirm="¿Eliminar el enlace? Dejará de funcionar.">${csrf(c)}<input type="hidden" name="_action" value="delete"><input type="hidden" name="id" value="${u.id}"><button class="link bad">Eliminar</button></form></td></tr>`; })}</tbody></table></div></section>`
    : empty('Todavía no hay enlaces.')}`;
  return layout(c, { title: 'Enlaces UTM', active: 'utm', body });
}

export { badge, fmt };
