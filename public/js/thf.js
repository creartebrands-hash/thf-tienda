/* THF · interacción del sitio público. Los datos vienen del servidor en #thf-data; los precios finales siempre los calcula el servidor. */
(function () {
'use strict';
const safe = (fn, name) => { try { fn(); } catch (e) { console.warn('[THF]', name, e); } };
document.documentElement.classList.add('js');
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => { c = Math.round(Number(c) || 0); const neg = c < 0; c = Math.abs(c); return (neg ? '-' : '') + '$' + String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(c % 100).padStart(2, '0'); };
const short = (c) => money(c).replace(',00', '');
const RM = matchMedia('(prefers-reduced-motion:reduce)');
let D = {};
try { D = JSON.parse($('#thf-data').textContent); } catch (e) { D = {}; }
const S = D.S || {};
const PAGE = D.page || document.body.dataset.page || '';
const P = new Map((D.products || []).map((p) => [p.slug, p]));
const LOOKS = new Map((D.looks || []).map((l) => [l.slug, l]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
async function post(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin' });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || 'No pudimos completar la solicitud. Revisa tu conexión.');
  return j;
}
function toast(t) { const el = $('#toast'); if (!el) return; el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2800); }
function copy(text, ok) {
  const done = () => toast(ok || 'Copiado');
  try { navigator.clipboard.writeText(text).then(done, () => toast('Mantén presionado el texto para copiarlo')); } catch (e) { toast('Mantén presionado el texto para copiarlo'); }
}
const waLink = (text) => '/ir/whatsapp?text=' + encodeURIComponent(text);

/* ---------- Referida por: ?ref=CODIGO o /a/CODIGO (una sola por pedido, vence según los ajustes) ---------- */
const CO = D.checkout || { mode: 'whatsapp', attrDays: 30 };
const cart = Object.assign({ lines: [], zone: '', pay: '', code: '', refSource: '', coupon: '', store: '' }, store.get('thf-cart-v2', {}));
safe(() => {
  const qs = new URLSearchParams(location.search);
  const ref = qs.get('ref');
  if (ref && /^[A-Za-z0-9]{3,24}$/.test(ref)) { cart.code = ref.toUpperCase(); cart.refSource = 'enlace'; store.set('thf-ref', { code: cart.code, at: Date.now() }); store.set('thf-cart-v2', cart); }
  const r = store.get('thf-ref', null);
  if (r && Date.now() - r.at > (CO.attrDays || 30) * 864e5) { store.set('thf-ref', null); if (cart.refSource === 'enlace' && cart.code === r.code) { cart.code = ''; cart.refSource = ''; store.set('thf-cart-v2', cart); } }
  if (D.store) { cart.store = D.store; cart.storeName = D.storeName || ''; store.set('thf-cart-v2', cart); }
}, 'ref');

/* ---------- Origen de la visita (UTM y sitio de procedencia) y analítica propia ---------- */
const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const VID = (() => { let v = store.get('thf-vid', ''); if (!v) { v = rid(); store.set('thf-vid', v); } return v; })();
const SID = (() => { try { let v = sessionStorage.getItem('thf-sid'); if (!v) { v = rid(); sessionStorage.setItem('thf-sid', v); } return v; } catch (e) { return ''; } })();
const SRC = (() => {
  const qs = new URLSearchParams(location.search);
  let host = ''; try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}
  if (host === location.hostname.replace(/^www\./, '')) host = '';
  const now = { utm_source: qs.get('utm_source') || '', utm_medium: qs.get('utm_medium') || '', utm_campaign: qs.get('utm_campaign') || '', utm_content: qs.get('utm_content') || '', ref_host: host };
  if (!now.utm_source && qs.get('gclid')) { now.utm_source = 'google'; now.utm_medium = 'cpc'; }
  if (!now.utm_source && qs.get('fbclid') && !now.ref_host) now.ref_host = 'facebook.com';
  const fresh = now.utm_source || now.ref_host;
  if (fresh) { now.landing = location.pathname; store.set('thf-src', now); return now; }
  return store.get('thf-src', { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', ref_host: '', landing: location.pathname });
})();
/* ---------- Etiquetas de medición (GA4, Meta, TikTok): solo si la dueña puso sus IDs en el panel ---------- */
const TG = D.tags || null;
const addScript = (src) => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); };
if (TG) safe(() => {
  if (TG.ga4) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', TG.ga4);
    addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(TG.ga4));
  }
  if (TG.meta && !window.fbq) {
    const f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
    window._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    addScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', TG.meta); window.fbq('track', 'PageView');
  }
  if (TG.tiktok && !window.ttq) {
    const t = window.ttq = []; t.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    t.setAndDefer = (o, m) => { o[m] = function () { o.push([m].concat([].slice.call(arguments))); }; };
    t.methods.forEach((m) => t.setAndDefer(t, m));
    t.load = (id) => { t._i = t._i || {}; t._i[id] = []; t._t = t._t || {}; t._t[id] = +new Date(); addScript('https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + encodeURIComponent(id) + '&lib=ttq'); };
    t.load(TG.tiktok); t.page();
  }
}, 'etiquetas');
// Traduce los eventos de la tienda a los nombres estándar de cada plataforma (la compra la reporta el servidor al verificar el pago)
function tagEv(type, extra) {
  if (!TG) return;
  const p = extra && extra.product ? P.get(extra.product) : null;
  const item = p ? { item_id: p.sku || p.slug, item_name: p.name, price: (p.unit || 0) / 100 } : null;
  const value = p ? (p.unit || 0) / 100 : extra && extra.value ? extra.value : undefined;
  const map = { view_item: ['view_item', 'ViewContent', 'ViewContent'], add_to_cart: ['add_to_cart', 'AddToCart', 'AddToCart'], begin_checkout: ['begin_checkout', 'InitiateCheckout', 'InitiateCheckout'],
    order: ['generate_lead', 'Lead', 'PlaceAnOrder'], wa_click: ['contact', 'Contact', 'Contact'], lead: ['generate_lead', 'Lead', 'SubmitForm'], signup: ['sign_up', 'CompleteRegistration', 'CompleteRegistration'] };
  const m = map[type]; if (!m) return;
  try {
    if (TG.ga4 && window.gtag) window.gtag('event', m[0], Object.assign({ currency: 'USD' }, value != null ? { value } : {}, item ? { items: [item] } : {}, extra && extra.code ? { transaction_id: extra.code } : {}));
    if (TG.meta && window.fbq) window.fbq('track', m[1], Object.assign({ currency: 'USD' }, value != null ? { value } : {}, p ? { content_ids: [p.sku || p.slug], content_type: 'product', content_name: p.name } : {}));
    if (TG.tiktok && window.ttq) window.ttq.track(m[2], Object.assign({ currency: 'USD' }, value != null ? { value } : {}, p ? { content_id: p.sku || p.slug, content_type: 'product', content_name: p.name } : {}));
  } catch (e) {}
}
function track(type, extra) {
  if (CO.analytics === false) return;
  tagEv(type, extra);
  try {
    fetch('/api/t', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify(Object.assign({ type, path: location.pathname, vid: VID, sid: SID }, SRC, extra || {})) }).catch(() => {});
  } catch (e) {}
}
safe(() => {
  track('page');
  const pp = $('.pp-info[data-product]'); if (pp) track('view_item', { product: pp.dataset.product });
  document.addEventListener('click', (e) => { const a = e.target.closest('a[href*="/ir/whatsapp"],a[href*="wa.me"]'); if (a) track('wa_click'); }, true);
}, 'analytics');

/* ---------- Splash ---------- */
safe(() => { const s = $('#splash'); if (!s) return; const hide = () => s.classList.add('gone'); addEventListener('load', () => setTimeout(hide, RM.matches ? 0 : 2200)); setTimeout(hide, 3800); }, 'splash');

/* ---------- Navegación ---------- */
safe(() => {
  const nav = $('#nav');
  const isStatic = nav.hasAttribute('data-static');
  const onS = () => nav.classList.toggle('solid', isStatic || scrollY > 40);
  addEventListener('scroll', onS, { passive: true }); onS();
  const mq = matchMedia('(max-width:900px)');
  const setDark = () => document.body.classList.toggle('hero-on-dark', PAGE === 'home' && mq.matches);
  mq.addEventListener ? mq.addEventListener('change', setDark) : 0; setDark();
  const m = $('#mnav');
  $('#menuBtn').onclick = () => { m.classList.add('open'); $('#menuClose').focus(); };
  $('#menuClose').onclick = () => m.classList.remove('open');
  $$('a', m).forEach((a) => a.addEventListener('click', () => m.classList.remove('open')));
  // menú de colecciones
  const btn = $('.nav-menu-btn'), mega = $('#colMenu');
  if (btn && mega) {
    const set = (o) => { btn.setAttribute('aria-expanded', o); mega.classList.toggle('open', o); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(btn.getAttribute('aria-expanded') !== 'true'); });
    const li = btn.closest('li');
    let t;
    li.addEventListener('mouseenter', () => { if (matchMedia('(hover:hover)').matches) { clearTimeout(t); set(true); } });
    li.addEventListener('mouseleave', () => { if (matchMedia('(hover:hover)').matches) t = setTimeout(() => set(false), 180); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.has-menu')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  }
}, 'nav');

/* ---------- Nuestra esencia: revelado palabra a palabra ---------- */
safe(() => {
  const el = $('#manifesto'); if (!el || RM.matches) return;
  const walk = (node) => [...node.childNodes].forEach((n) => {
    if (n.nodeType === 3) { const f = document.createDocumentFragment(); n.textContent.split(/(\s+)/).forEach((t) => { if (!t) return; if (/^\s+$/.test(t)) f.appendChild(document.createTextNode(t)); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = t; f.appendChild(s); } }); n.replaceWith(f); }
    else if (n.nodeType === 1 && !n.classList.contains('w')) n.classList.add('w');
  });
  walk(el);
  const words = $$('.w', el);
  const upd = () => { const r = el.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35))); const k = Math.floor(p * words.length * 1.05); words.forEach((w, i) => w.classList.toggle('dim', i > k)); };
  addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true }); upd();
}, 'manifesto');

/* ---------- La Bitácora: mapa con la ruta por todos los lugares ---------- */
safe(() => {
  const svg = $('#map'); if (!svg) return;
  const PL = D.places || []; if (!PL.length) return;
  const K = 1500, LON0 = -64.47, LAT0 = 11.24;
  const pr = ([lo, la]) => [(lo - LON0) * K, (LAT0 - la) * K];
  const f1 = (n) => n.toFixed(1);
  const smooth = (pts, closed) => { const p = pts.map(pr); const n = p.length; let d = `M${f1(p[0][0])},${f1(p[0][1])}`; const g = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]); const L = closed ? n : n - 1; for (let i = 0; i < L; i++) { const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2); d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`; } return d + (closed ? 'Z' : ''); };
  const MARG = [[-64.405, 10.975], [-64.395, 11.01], [-64.365, 11.04], [-64.32, 11.06], [-64.27, 11.068], [-64.22, 11.062], [-64.18, 11.045], [-64.165, 11.018], [-64.14, 11.004], [-64.1, 11.003], [-64.06, 11.012], [-64.04, 11.035], [-64.035, 11.06], [-64.0, 11.075], [-63.975, 11.088], [-63.955, 11.11], [-63.925, 11.13], [-63.89, 11.155], [-63.855, 11.17], [-63.82, 11.162], [-63.8, 11.13], [-63.785, 11.08], [-63.782, 11.035], [-63.787, 11.0], [-63.815, 10.97], [-63.855, 10.952], [-63.89, 10.935], [-63.935, 10.93], [-63.985, 10.948], [-64.03, 10.962], [-64.07, 10.982], [-64.11, 10.988], [-64.15, 10.985], [-64.175, 10.97], [-64.2, 10.948], [-64.24, 10.932], [-64.29, 10.922], [-64.34, 10.928], [-64.38, 10.945]];
  const COCHE = [[-64.01, 10.778], [-63.985, 10.8], [-63.95, 10.808], [-63.915, 10.8], [-63.9, 10.778], [-63.925, 10.758], [-63.965, 10.756], [-63.995, 10.762]];
  const CUBA = [[-64.225, 10.826], [-64.195, 10.837], [-64.155, 10.832], [-64.148, 10.818], [-64.175, 10.806], [-64.212, 10.81]];
  $('#mapIslands').innerHTML = [MARG, COCHE, CUBA].map((a) => { const d = smooth(a, true); return `<path d="${d}" fill="url(#hatch)" opacity=".9"/><path d="${d}" class="map-island-fill"/><path d="${d}" class="map-island"/>`; }).join('');
  const lab = (t, ll, cls = '', anchor = 'middle') => { const [x, y] = pr(ll); return `<text class="map-label ${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`; };
  // Islas y mar; los nombres de cada lugar van junto a su punto
  $('#mapLabels').innerHTML = lab('Isla de Margarita', [-63.845, 11.12], 'big') + lab('Coche', [-63.97, 10.735], 'isle') + lab('Mar Caribe', [-64.42, 10.84], 'big', 'start') + lab('Nueva Esparta · Venezuela', [-64.42, 10.81], 'small', 'start');
  // ruta: curva suave por cada lugar, en orden
  const pts = PL.map((p) => [p.lon, p.lat]);
  const P2 = pts.map(pr);
  const g = (i) => P2[Math.max(0, Math.min(P2.length - 1, i))];
  const segs = [];
  for (let i = 0; i < P2.length - 1; i++) { const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2); segs.push(`C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`); }
  const fullD = `M${f1(P2[0][0])},${f1(P2[0][1])} ` + segs.join(' ');
  const route = $('#route'), ghost = $('#routeGhost');
  route.setAttribute('d', fullD); ghost.setAttribute('d', fullD);
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.appendChild(tmp);
  const cum = [0];
  segs.forEach((s, i) => { tmp.setAttribute('d', `M${f1(P2[i][0])},${f1(P2[i][1])} ${s}`); cum.push(cum[i] + tmp.getTotalLength()); });
  tmp.remove();
  const L = route.getTotalLength();
  route.style.strokeDasharray = L; route.style.strokeDashoffset = L;
  const OFF = { n: [0, -46, 'middle'], s: [0, 58, 'middle'], e: [46, 8, 'start'], w: [-46, 8, 'end'] };
  $('#mapStops').innerHTML = P2.map(([x, y], i) => { const [dx, dy, an] = OFF[PL[i].mapPos] || OFF.s; return `<g class="map-stop${i === 0 ? ' on cur' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="Ir a ${esc(PL[i].name)}"><circle class="map-halo" cx="${x}" cy="${y}" r="16"/><circle cx="${x}" cy="${y}" r="7"/><text class="map-name" x="${x + dx}" y="${y + dy}" text-anchor="${an}">${esc(PL[i].title || PL[i].name)}</text></g>`; }).join('');
  // Los nombres nunca se salen del mapa; el rótulo de la isla se oculta si choca con el nombre de un lugar
  const fit = () => {
    const vb = svg.viewBox.baseVal, names = $$('.map-name', svg), big = $$('.map-label', svg);
    names.forEach((t) => {
      t.setAttribute('transform', '');
      const b = t.getBBox(); let dx = 0;
      if (b.x < vb.x + 6) dx = vb.x + 6 - b.x; else if (b.x + b.width > vb.x + vb.width - 6) dx = vb.x + vb.width - 6 - (b.x + b.width);
      if (dx) t.setAttribute('transform', `translate(${dx} 0)`);
    });
    const boxes = names.map((t) => { const b = t.getBBox(); const m = /translate\(([-\d.]+)/.exec(t.getAttribute('transform') || ''); return { x: b.x + (m ? +m[1] : 0), y: b.y, w: b.width, h: b.height }; });
    big.forEach((t) => { t.style.opacity = ''; const b = t.getBBox(); if (boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.width && b.y < o.y + o.h && o.y < b.y + b.height)) t.style.opacity = '0'; });
  };
  const comp = $('#compass');
  const sec = $('#bitacora'), track = $('#bitaTrack'), stops = $$('.map-stop'), chapters = $$('.chapter'), prog = $$('.bita-progress span');
  // Escritorio: el mapa queda fijo y los lugares avanzan con el scroll. Tabletas, teléfonos y movimiento reducido: carrusel.
  const mq = matchMedia('(max-width:1180px), (hover:none), (prefers-reduced-motion:reduce)');
  const strip = $('#chapters'), navN = $('[data-bita-n]'), dots = $$('[data-bita-go]'), arrows = $$('[data-bita-step]');
  let cur = -1;
  const setCh = (i) => {
    if (i === cur) return; cur = i;
    const pl = PL[i];
    sec.dataset.dir = pl.dir;
    chapters.forEach((c, k) => c.classList.toggle('on', k === i));
    stops.forEach((s, k) => { s.classList.toggle('on', k <= i); s.classList.toggle('cur', k === i); });
    requestAnimationFrame(fit);
    prog.forEach((s) => s.classList.toggle('on', s.dataset.dir === pl.dir));
    $('#coordName').textContent = `${pl.dirName} · ${pl.name}`; $('#coordVal').textContent = pl.coords;
    if (navN) navN.textContent = String(i + 1).padStart(2, '0');
    dots.forEach((d, k) => (k === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
    arrows.forEach((a) => { a.disabled = +a.dataset.bitaStep < 0 ? i === 0 : i === PL.length - 1; });
    if (mq.matches) { route.style.strokeDashoffset = L - cum[i]; place(cum[i]); }
  };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const place = (len) => { const a = route.getPointAtLength(Math.max(0, Math.min(L, len))), b = route.getPointAtLength(Math.max(0, Math.min(L, len + 2))); const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90; comp.setAttribute('transform', `translate(${a.x} ${a.y}) rotate(${len > 0.5 && len < L - 0.5 ? ang * 0.25 : 0})`); };
  const n = PL.length;
  const upd = () => {
    if (mq.matches) { if (cur < 0) setCh(0); return; }
    const r = track.getBoundingClientRect(); const total = r.height - innerHeight; const p = Math.min(1, Math.max(0, -r.top / total));
    const k = Math.min(n - 1, Math.floor(p * n)); const t = p * n - k; let len = cum[k];
    if (k < n - 1 && t > 0.55) len = cum[k] + ease((t - 0.55) / 0.45) * (cum[k + 1] - cum[k]);
    route.style.strokeDashoffset = L - len; place(len); setCh(k);
  };
  // Carrusel: el lugar más centrado es el activo; flechas, puntos y el mapa llevan a cada lugar
  const centered = () => { const mid = strip.scrollLeft + strip.clientWidth / 2; let best = 0, dist = Infinity; chapters.forEach((c, k) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = k; } }); return best; };
  let sTick = 0;
  strip.addEventListener('scroll', () => { if (!mq.matches || sTick) return; sTick = requestAnimationFrame(() => { sTick = 0; setCh(centered()); }); }, { passive: true });
  const slide = (i, smooth = true) => { const c = chapters[i]; if (!c) return; strip.scrollTo({ left: c.offsetLeft - (strip.clientWidth - c.offsetWidth) / 2, behavior: smooth && !RM.matches ? 'smooth' : 'auto' }); setCh(i); };
  arrows.forEach((a) => a.addEventListener('click', () => slide(Math.max(0, Math.min(n - 1, cur + +a.dataset.bitaStep)))));
  dots.forEach((d) => d.addEventListener('click', () => slide(+d.dataset.bitaGo)));
  strip.addEventListener('keydown', (e) => { if (!mq.matches) return; if (e.key === 'ArrowRight') { e.preventDefault(); slide(Math.min(n - 1, cur + 1)); } if (e.key === 'ArrowLeft') { e.preventDefault(); slide(Math.max(0, cur - 1)); } });
  const goTo = (i) => {
    if (mq.matches) { const r = sec.getBoundingClientRect(); if (r.top > innerHeight * 0.5 || r.bottom < innerHeight * 0.3) $('.map-wrap', sec).scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' }); slide(i); return; }
    const r = track.getBoundingClientRect(); const total = r.height - innerHeight; scrollTo({ top: scrollY + r.top + ((i + 0.3) / n) * total, behavior: RM.matches ? 'auto' : 'smooth' });
  };
  mq.addEventListener?.('change', () => { cur = -1; upd(); if (mq.matches) slide(Math.max(0, cur), false); });
  stops.forEach((s) => { s.addEventListener('click', () => goTo(+s.dataset.i)); s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(+s.dataset.i); } }); });
  addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true }); addEventListener('resize', () => { upd(); fit(); }); upd();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  const h = location.hash.match(/^#lugar-([a-z0-9-]+)$/);
  if (h) { const i = PL.findIndex((p) => p.slug === h[1]); if (i >= 0) setTimeout(() => goTo(i), 400); }
}, 'bitacora');

/* ---------- Cajones y ventanas ---------- */
const scrim = $('#scrim');
let openD = null, lastFocus = null;
function openDrawer(d) { lastFocus = document.activeElement; if (openD && openD !== d) openD.classList.remove('open'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); scrim.classList.add('on'); openD = d; document.body.style.overflow = 'hidden'; setTimeout(() => { const b = $('[data-close]', d); b && b.focus({ preventScroll: true }); }, 60); }
function closeModal() { $$('.modal.open').forEach((m) => { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }); }
function closeAll() { $$('.drawer').forEach((d) => { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }); closeModal(); scrim.classList.remove('on'); openD = null; document.body.style.overflow = ''; lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); }
function openModal(m) { lastFocus = document.activeElement; closeModal(); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); scrim.classList.add('on'); document.body.style.overflow = 'hidden'; }
scrim && scrim.addEventListener('click', closeAll);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { e.preventDefault(); closeAll(); return; }
  const o = e.target.closest('[data-open]');
  if (o && P.has(o.dataset.open)) { e.preventDefault(); openProduct(o.dataset.open); }
});

/* ---------- Ficha rápida ---------- */
function pricesHTML(p) {
  if (D.store) return `<div class="pd-prices"><div><small>Precio</small><b>${money(p.unit)}</b></div></div>`; // tienda de aliada: un solo precio
  if (p.bundle) return `<div class="pd-prices"><div><small>Precio de la caja</small><b>${money(p.unit)}</b><s>${money(p.price)}</s></div><div><small>Por pieza · ${p.pieces} piezas</small><b>${money(p.perPiece)}</b></div></div>`;
  return `<div class="pd-prices"><div><small>Precio detal</small><b>${money(p.unit)}</b>${p.offer != null ? `<s>${money(p.price)}</s>` : ''}</div><div><small>Al mayor · desde ${S['orders.wholesale_min_pieces']} piezas</small><b>${p.mayor != null ? money(p.mayor) : 'Consultar'}</b></div></div>`;
}
// Selector de variante con color (vista rápida); el servidor valida la elección
function colorPickHTML(p, name) {
  const on = p.colors ? p.colors.items.filter((x) => x.on) : [];
  if (!on.length) return '';
  return `<fieldset class="vpick ${p.colors.shape === 'square' ? 'square' : 'circle'}" data-vpick><legend>${esc(p.colors.label)}: <b data-vpick-name>${esc(on[0].name)}</b></legend><div>${on.map((x, i) => `<label title="${esc(x.name)}"><input type="radio" name="${name}" value="${esc(x.name)}"${i ? '' : ' checked'}><span style="--sw:${/^#[0-9a-f]{6}$/i.test(x.hex) ? x.hex : '#ccc'}"></span><em>${esc(x.name)}</em></label>`).join('')}</div></fieldset>`;
}
const pickedColor = (root, name) => { const r = root && root.querySelector(`input[name="${name}"]:checked`); return r ? r.value : ''; };
document.addEventListener('change', (e) => { const r = e.target.closest('[data-vpick] input[type=radio]'); if (!r) return; const n = r.closest('[data-vpick]').querySelector('[data-vpick-name]'); if (n) n.textContent = r.value; });
const hasChoices = (p) => !p.bundle && ((p.variants && p.variants.length > 1) || (p.colors && p.colors.items.filter((x) => x.on).length > 1));
function openProduct(slug, color) {
  const p = P.get(slug); if (!p) return;
  const imgs = [...new Set([p.img.main, p.img.hover, ...(p.img.gallery || [])])].filter(Boolean).slice(0, 4);
  $('#pdBody').innerHTML = `<div class="pd-gallery">${imgs.map((u, i) => `<img src="${esc(u)}" alt="${i ? '' : esc(p.name)}">`).join('')}</div>
  <div class="pd-info"><p class="eyebrow">${esc(p.eyebrow)}</p><h3>${esc(p.name)}</h3><p class="story">${esc(p.story || p.detail)}</p>
  ${p.img.insetOn && p.img.insetTitle ? `<figure class="pp-stone"><img src="${esc(p.img.inset)}" alt=""><figcaption><b>${esc(p.img.insetTitle)}</b><span>${esc(p.img.insetNote)}</span></figcaption></figure>` : ''}
  ${pricesHTML(p)}
  <dl class="pd-specs"><div><dt>Tipo</dt><dd>${esc(p.type)}</dd></div><div><dt>${p.bundle ? 'Contenido' : 'Piedra y detalle'}</dt><dd>${esc(p.detail || p.stone)}</dd></div>
  <div><dt>Material</dt><dd>${esc(p.material)}</dd></div>${p.audience ? `<div><dt>Para</dt><dd>${esc(p.audience)}</dd></div>` : ''}<div><dt>Elaboración</dt><dd>Bajo pedido · ${p.leadMin} a ${p.leadMax} días hábiles</dd></div></dl>
  ${colorPickHTML(p, 'pdColor')}
  ${p.variants && p.variants.length > 1 ? `<div class="field"><label for="pdVar">${p.audience ? 'Talla' : 'Largo de cadena'}</label><select id="pdVar">${p.variants.map((v) => `<option>${esc(v)}</option>`).join('')}</select></div>` : ''}
  <div class="pd-buy"><div class="qty"><button type="button" aria-label="Menos" data-q="-1">−</button><input id="pdQty" type="number" min="1" max="99" value="1" aria-label="Cantidad"><button type="button" aria-label="Más" data-q="1">+</button></div>
  <button class="btn btn-solid" id="pdAdd">Añadir al pedido <span class="arr"></span></button></div>
  ${D.store ? '' : `<a class="textlink" href="${esc(p.url)}" style="justify-self:start">Ver la ficha completa</a>`}
  <p class="note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>El pago se coordina únicamente con THF por el WhatsApp oficial.</p></div>`;
  const q = $('#pdQty');
  $$('[data-q]', $('#pd')).forEach((b) => (b.onclick = () => { q.value = Math.max(1, Math.min(99, (+q.value || 1) + +b.dataset.q)); }));
  $('#pdAdd').onclick = () => { addProduct(p, $('#pdVar') ? $('#pdVar').value : p.variants[0] || '', Math.max(1, Math.min(99, +q.value || 1)), pickedColor($('#pd'), 'pdColor')); openCart(); };
  if (color) { const r = $$('#pd input[name="pdColor"]').find((x) => x.value === color); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
  $('#pd .drawer-body').scrollTop = 0; openDrawer($('#pd'));
}
// Muestras de color en la franja "Añadir" de la tarjeta
document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-pick-color]'); if (!d) return;
  e.preventDefault(); e.stopPropagation();
  const bar = d.closest('.qbar'); if (!bar) return;
  $$('[data-pick-color]', bar).forEach((x) => x.setAttribute('aria-checked', x === d ? 'true' : 'false'));
  const n = $('[data-qb-name]', bar); if (n) n.textContent = d.dataset.pickColor;
  const q = $('[data-quick]', bar); if (q) q.dataset.color = d.dataset.pickColor;
}, true);

/* ---------- Carrito (el servidor cotiza; aquí solo se guarda lo elegido) ---------- */
cart.lines = (cart.lines || []).filter((l) => l && ['product', 'look', 'digital'].includes(l.kind) && Number.isInteger(l.id));
const saveCart = () => store.set('thf-cart-v2', cart);
function lineKey(l) { return `${l.kind}:${l.id}:${l.color || ''}:${l.variant || ''}`; }
function addLine(l) {
  const ex = cart.lines.find((x) => lineKey(x) === lineKey(l));
  if (ex) ex.qty = l.kind === 'digital' ? 1 : Math.min(99, ex.qty + l.qty); else cart.lines.push(l);
  saveCart(); refreshCount(); toast(`${l.name} se añadió a tu pedido`);
  track('add_to_cart', l.kind === 'product' ? { product: l.slug } : {});
}
function addProduct(p, variant, qty, color) {
  const on = p.colors ? p.colors.items.filter((x) => x.on) : [];
  addLine({ kind: 'product', id: p.id, slug: p.slug, name: p.name, img: p.img.main, sku: p.sku, variant: variant || '', color: color || (on[0] ? on[0].name : ''), qty: qty || 1, unit: p.unit, bundle: !!p.bundle });
}
function refreshCount() { const n = cart.lines.reduce((a, l) => a + l.qty, 0); const cc = $('#cartCount'); if (cc) { cc.textContent = n; cc.dataset.n = n; } }
let quoteSeq = 0, lastQuote = null, quoteErr = '';
async function requote() {
  const seq = ++quoteSeq;
  if (!cart.lines.length) { lastQuote = null; return; }
  try {
    const q = await post('/api/quote', { lines: cart.lines.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty, variant: l.variant, color: l.color || '' })), zone: cart.zone, pay: cart.pay, code: cart.code, coupon: cart.coupon, store: cart.store });
    if (seq !== quoteSeq) return;
    lastQuote = q; quoteErr = ''; cart.zone = q.zone.code; cart.pay = q.pay.code; saveCart();
  } catch (e) {
    if (seq !== quoteSeq) return;
    lastQuote = null; quoteErr = e.message;
    if (/disponible/.test(e.message)) {
      // quita líneas que ya no existen y reintenta una vez
      const before = cart.lines.length;
      const keep = [];
      let fixed = 0;
      for (const l of cart.lines) {
        try { await post('/api/quote', { lines: [{ kind: l.kind, id: l.id, qty: 1, variant: l.variant, color: l.color || '' }] }); keep.push(l); continue; } catch (x) {}
        // si solo falla la opción de color (se agotó), queda la primera disponible
        if (l.color) try { await post('/api/quote', { lines: [{ kind: l.kind, id: l.id, qty: 1 }] }); l.color = ''; fixed++; keep.push(l); } catch (x) {}
      }
      if (keep.length !== before || fixed) { cart.lines = keep; saveCart(); toast(fixed && keep.length === before ? 'Una opción de color se agotó: elegimos la primera disponible' : 'Quitamos de tu pedido una pieza que ya no está disponible'); return requote(); }
    }
  }
}
async function renderCart() {
  refreshCount();
  const body = $('#cartBody'), foot = $('#cartFoot');
  if (!cart.lines.length) {
    body.innerHTML = `<div class="cart-empty"><h4>Tu pedido está vacío</h4><p>Elige una pieza del catálogo para empezar.</p><p style="margin-top:22px"><a class="btn btn-ghost" href="/catalogo">Ver el catálogo</a></p></div>`;
    foot.innerHTML = ''; return;
  }
  body.classList.add('loading');
  await requote();
  body.classList.remove('loading');
  const q = lastQuote;
  const lines = cart.lines.map((l, i) => {
    const ql = q && q.lines[i];
    return `<div class="cline"><img src="${esc(l.img || '')}" alt=""><div><h4>${esc(l.name)}</h4><small>${esc([l.color, l.variant, l.sku].filter(Boolean).join(' · '))}</small>
      ${l.kind !== 'digital' ? `<div class="qty"><button aria-label="Menos" data-cq="${i}" data-d="-1">−</button><input value="${l.qty}" aria-label="Cantidad de ${esc(l.name)}" data-ci="${i}" inputmode="numeric"><button aria-label="Más" data-cq="${i}" data-d="1">+</button></div>` : '<small>Descarga digital</small>'}
      <button class="rm" data-rm="${i}">Quitar</button></div>
      <div class="amt">${ql ? money(ql.total) : '—'}<small>${ql ? `${money(ql.unit)} c/u · ${{ detal: 'detal', mayor: 'mayor', caja: 'caja', look: 'look', digital: 'digital' }[ql.priceKind]}` : ''}</small></div></div>`;
  }).join('');
  let rule = '';
  if (q && q.physical) {
    const min = q.wholesaleMin;
    rule = `<div class="cart-rule">${!q.loosePieces ? '<span>Las cajas y los looks tienen <b>precio propio</b>. El precio al mayor aplica a piezas sueltas.</span>' : q.mayor ? `<b>Precio al mayor aplicado</b><span>Tu pedido tiene ${q.loosePieces} piezas sueltas (mínimo ${min}).</span>` : `<span>Te ${q.missingForWholesale === 1 ? 'falta 1 pieza' : `faltan ${q.missingForWholesale} piezas`} para el <b>precio al mayor</b> (desde ${min}).</span>`}
      ${q.loosePieces ? `<div class="sim-bar"><i style="width:${Math.min(100, (q.loosePieces / min) * 100)}%"></i></div>` : ''}${q.freeLeft > 0 ? `<span>Te faltan ${money(q.freeLeft)} para el delivery gratis.</span>` : ''}</div>`;
  }
  const zones = D.zones || [], pays = D.pays || [];
  const zone = q ? q.zone : zones[0];
  const island = zone && ['isla', 'retiro'].includes(zone.kind);
  body.innerHTML = `<div class="cart-lines">${lines}</div>${rule}
   ${quoteErr ? `<p class="cart-err" role="alert">${esc(quoteErr)}</p>` : ''}
   <div class="cart-opts">
     ${!q || q.physical ? `<div class="field"><label for="cZone">Entrega</label><select id="cZone">${zones.map((z) => `<option value="${esc(z.code)}"${q && z.code === q.zone.code ? ' selected' : ''}>${esc(z.name)}${z.eta ? ' · ' + esc(z.eta) : ''}</option>`).join('')}</select></div>` : ''}
     <div class="field"><label for="cPay">Método de pago preferido</label><select id="cPay">${pays.filter((p) => !p.islandOnly || island || (q && !q.physical)).map((p) => `<option value="${esc(p.code)}"${q && p.code === q.pay.code ? ' selected' : ''}>${esc(p.name)}${p.adj > 0 ? ` (+${p.adj / 100} %)` : p.adj < 0 ? ` (−${-p.adj / 100} %)` : ''}</option>`).join('')}</select></div>
     ${cart.store ? `<p class="cart-store">Compras en la tienda de <b>${esc(cart.storeName || cart.store)}</b> · <button type="button" class="textlink" id="cStoreOff">Comprar en la tienda principal</button></p>`
       : `<div class="field"><label for="cCode">Código de embajadora (opcional)</label><input id="cCode" value="${esc(cart.code)}" placeholder="Ej. MARIA10" autocomplete="off" maxlength="24"></div>`}
     <div class="field"><label for="cCoupon">Cupón de descuento (opcional)</label><div class="coupon-row"><input id="cCoupon" value="${esc(cart.coupon || '')}" placeholder="Escribe tu cupón" autocomplete="off" maxlength="24"><button type="button" class="btn btn-ghost" id="cCouponGo">Aplicar</button></div>
       ${q && q.coupon ? (q.coupon.ok ? `<small class="ok">Cupón ${esc(q.coupon.code)} aplicado${q.coupon.description ? ' · ' + esc(q.coupon.description) : ''}</small>` : `<small class="bad">${esc(q.coupon.error)}${q.coupon.needsLogin ? ' <a href="/cuenta">Entrar</a>' : ''}</small>`) : ''}</div>
   </div>
   ${q ? `<div class="totals"><div><span>Subtotal${q.mayor ? ' (mayor)' : ''}</span><span>${money(q.subtotal)}</span></div>${q.physical ? `<div><span>Envío · ${esc(q.zone.name.replace('Delivery · ', ''))}</span><span>${esc(q.shippingLabel)}</span></div>` : ''}${q.discount ? `<div><span>${esc(q.discountLabel || 'Descuento')}</span><span>−${money(q.discount)}</span></div>` : ''}${q.adj ? `<div><span>${q.adj > 0 ? 'Recargo' : 'Descuento'} ${esc(q.pay.name)}</span><span>${money(q.adj)}</span></div>` : ''}<div class="total"><span>Total</span><span>${money(q.total)} <small>USD</small></span></div></div>` : ''}`;
  foot.innerHTML = q ? `<button class="btn btn-gold" id="toCheckout">${CO.mode === 'whatsapp' ? 'Finalizar por WhatsApp' : 'Continuar al pago'} <span class="arr"></span></button><p class="antiscam">${CO.mode === 'whatsapp' ? 'El pago se coordina únicamente con THF por el WhatsApp oficial.' : 'Pagas solo a THF, con los datos oficiales de la pantalla de tu pedido.'} Ninguna embajadora o emprendedora recibe pagos.</p>` : '';
  $$('[data-cq]', body).forEach((b) => (b.onclick = () => { const l = cart.lines[+b.dataset.cq]; l.qty = Math.max(1, Math.min(99, l.qty + +b.dataset.d)); saveCart(); renderCart(); }));
  $$('[data-ci]', body).forEach((inp) => (inp.onchange = () => { const l = cart.lines[+inp.dataset.ci]; l.qty = Math.max(1, Math.min(99, parseInt(inp.value, 10) || 1)); saveCart(); renderCart(); }));
  $$('[data-rm]', body).forEach((b) => (b.onclick = () => { cart.lines.splice(+b.dataset.rm, 1); saveCart(); renderCart(); }));
  const cz = $('#cZone'); if (cz) cz.onchange = (e) => { cart.zone = e.target.value; saveCart(); renderCart(); };
  $('#cPay').onchange = (e) => { cart.pay = e.target.value; saveCart(); renderCart(); };
  const cc = $('#cCode'); if (cc) { cc.oninput = (e) => { cart.code = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 24); cart.refSource = 'codigo'; e.target.value = cart.code; saveCart(); }; cc.onchange = () => renderCart(); }
  const so = $('#cStoreOff'); if (so) so.onclick = () => { cart.store = ''; cart.storeName = ''; saveCart(); renderCart(); };
  const cpi = $('#cCoupon'), apply = () => { cart.coupon = cpi.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 24); saveCart(); renderCart(); };
  if (cpi) { $('#cCouponGo').onclick = apply; cpi.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }; }
  const tc = $('#toCheckout'); if (tc) tc.onclick = openCheckout;
}
function openCart() { openDrawer($('#cart')); renderCart(); }
safe(() => { $('#cartBtn').addEventListener('click', openCart); refreshCount(); }, 'cart');

/* ---------- Finalizar: el servidor crea el pedido y arma el enlace al WhatsApp oficial ---------- */
let tsLoaded = false;
function turnstile(el) {
  if (!D.tsk || !el) return;
  const render = () => window.turnstile && window.turnstile.render(el, { sitekey: D.tsk, callback: (t) => (el.dataset.token = t) });
  if (tsLoaded) return render();
  tsLoaded = true;
  const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; s.onload = () => setTimeout(render, 50); document.head.appendChild(s);
}
const STATES = ['Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'La Guaira', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Yaracuy', 'Zulia'];
async function openCheckout() {
  const q = lastQuote; if (!q) return;
  const card = $('#coCard');
  const saved = store.get('thf-customer', {});
  let me = null;
  try { const r = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' }); const j = await r.json(); if (j.logged) me = j.me; } catch (e) {}
  track('begin_checkout');
  const opt = (v, cur) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`;
  const addr = q.physical ? `<div class="grid2"><div class="field"><label for="coState">Estado</label><select id="coState"><option value="">Elige</option>${STATES.map((x) => opt(x, (me && me.state) || saved.state || '')).join('')}</select></div>
     <div class="field"><label for="coCity">Ciudad</label><input id="coCity" maxlength="60" autocomplete="address-level2" value="${esc((me && me.city) || saved.city || '')}"></div></div>
     <div class="field"><label for="coAddr">Dirección o punto de entrega</label><input id="coAddr" required autocomplete="street-address" maxlength="200" value="${esc((me && me.address) || saved.address || '')}"></div>` : '';
  const who = me ? `<p class="co-me">Compras con tu cuenta: <b>${esc(me.name)}</b> · ${esc(me.email)} <a class="textlink" href="/cuenta/datos">Mis datos</a></p>`
    : `<div class="grid2"><div class="field"><label for="coName">Nombre y apellido</label><input id="coName" required autocomplete="name" maxlength="80" value="${esc(saved.name || '')}"></div><div class="field"><label for="coTel">WhatsApp o teléfono</label><input id="coTel" required inputmode="tel" autocomplete="tel" placeholder="0414 000 0000" maxlength="30" value="${esc(saved.phone || '')}"></div></div>
     <div class="grid2"><div class="field"><label for="coDoc">Cédula o RIF${CO.doc ? '' : ' (opcional)'}</label><div class="doc"><select id="coDocT" aria-label="Tipo de documento">${['V', 'E', 'J', 'P'].map((t) => opt(t, saved.docType || 'V')).join('')}</select><input id="coDoc" inputmode="numeric" maxlength="10" value="${esc(saved.docNumber || '')}"${CO.doc ? ' required' : ''}></div></div>
     <div class="field"><label for="coMail">Correo${CO.email ? '' : ' (opcional)'}</label><input id="coMail" type="email" autocomplete="email" maxlength="120" value="${esc(saved.email || '')}"${CO.email ? ' required' : ''}></div></div>`;
  card.innerHTML = `<p class="eyebrow" style="color:var(--oro-texto)">Paso 1 de 2</p><h3>Tus datos</h3>
   ${me ? '' : '<p class="co-acct">¿Ya tienes cuenta? <a class="textlink" href="/cuenta?msg=Entra%20y%20vuelve%20a%20tu%20pedido">Entra</a> y tus datos se completan solos.</p>'}
   <form id="coForm" novalidate><div style="display:grid;gap:12px">
   ${who}${addr}
   <div class="field"><label for="coNotes">Notas (opcional)</label><textarea id="coNotes" rows="2" maxlength="400"></textarea></div>
   <div class="hp" aria-hidden="true"><label>No llenar <input id="coWeb" tabindex="-1" autocomplete="off"></label></div>
   ${me ? '' : '<label class="note" style="cursor:pointer"><input type="checkbox" id="coMkt" style="margin-top:3px"> <span>Quiero recibir novedades y cupones.</span></label>'}
   <label class="note" style="cursor:pointer"><input type="checkbox" id="coTerms" style="margin-top:3px"> <span>${esc(CO.terms || '')} ${q.physical ? 'Elaboración bajo pedido, variación natural de piedras y perlas, y la política de cambios.' : 'El enlace de descarga se envía al confirmar el pago.'}</span></label>
   <div id="coTs"></div>
   <p id="coErr" class="note" style="color:var(--burdeos)" role="alert" hidden></p>
   <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-solid" type="submit" id="coGo">${CO.mode === 'whatsapp' ? 'Crear pedido' : 'Ir a pagar'} · ${money(q.total)} <span class="arr"></span></button><button class="btn btn-ghost" type="button" data-back>Volver</button></div></div></form>`;
  openModal($('#checkout'));
  turnstile($('#coTs'));
  setTimeout(() => { const f = $('#coName') || $('#coAddr'); f && f.focus(); }, 50);
  $('[data-back]', card).onclick = () => { closeModal(); scrim.classList.add('on'); };
  const idem = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  $('#coForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
    const err = $('#coErr');
    const fail = (m) => { err.hidden = false; err.textContent = m; };
    if (!me) {
      if (v('coName').length < 3 || v('coTel').replace(/\D/g, '').length < 10) return fail('Escribe tu nombre y apellido y un teléfono válido.');
      if (CO.doc && v('coDoc').replace(/\D/g, '').length < 5) return fail('Escribe tu cédula o RIF.');
      if (CO.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('coMail'))) return fail('Escribe un correo válido.');
    }
    if (q.physical && v('coAddr').length < 4) return fail('Escribe tu dirección o punto de entrega.');
    if (!$('#coTerms').checked) return fail('Acepta los términos para continuar.');
    const customer = { name: v('coName'), phone: v('coTel'), docType: v('coDocT'), docNumber: v('coDoc'), email: v('coMail'), state: v('coState'), city: v('coCity'), address: v('coAddr'), notes: v('coNotes'), marketing: !!($('#coMkt') && $('#coMkt').checked) };
    if (!me) store.set('thf-customer', { name: customer.name, phone: customer.phone, docType: customer.docType, docNumber: customer.docNumber, email: customer.email, state: customer.state, city: customer.city, address: customer.address });
    const btn = $('#coGo'); btn.disabled = true; btn.classList.add('busy');
    try {
      const r = await post('/api/orders', { lines: cart.lines.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty, variant: l.variant, color: l.color || '' })), zone: cart.zone, pay: cart.pay, code: cart.code, refSource: cart.refSource,
        coupon: cart.coupon, store: cart.store, customer, terms: true, idem, website: v('coWeb'), turnstile: ($('#coTs') || {}).dataset ? $('#coTs').dataset.token : '', src: Object.assign({ vid: VID }, SRC) });
      tagEv('order', { code: r.code, value: r.total ? r.total / 100 : undefined });
      cart.lines = []; cart.coupon = ''; cart.store = ''; cart.storeName = ''; saveCart(); refreshCount();
      const statusLink = r.status ? location.origin + r.status : '';
      if (r.mode === 'web' && r.status) {
        card.innerHTML = `<p class="eyebrow" style="color:var(--oro-texto)">Pedido creado</p><div class="code">${esc(r.code)}</div><p style="color:var(--gris)">Te llevamos a la pantalla de pago…</p><a class="btn btn-gold" href="${esc(r.status)}">Ir a pagar <span class="arr"></span></a>`;
        setTimeout(() => { location.href = r.status; }, 900);
        return;
      }
      if (r.mode === 'mixto' && r.status) {
        card.innerHTML = `<p class="eyebrow" style="color:var(--oro-texto)">Paso 2 de 2 · Pedido creado</p><div class="code">${esc(r.code)}</div>
         <p style="color:var(--gris)">Tu pedido quedó registrado con sus precios${r.totalBs ? ` (${esc(r.totalBs)} con la tasa BCV de hoy)` : ''}. Elige cómo seguir:</p>
         <div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-gold" href="${esc(r.status)}">Pagar ahora <span class="arr"></span></a><a class="btn btn-ghost wa-go" href="${esc(r.wa)}" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>
         <p class="note">Guarda el enlace de tu pedido: <a href="${esc(r.status)}">${esc(statusLink)}</a></p>
         <p class="antiscam">${esc(r.payNote)}</p><button class="btn btn-ghost" data-close>Cerrar</button>`;
        return;
      }
      card.innerHTML = `<p class="eyebrow" style="color:var(--oro-texto)">Paso 2 de 2 · Pedido creado</p><div class="code">${esc(r.code)}</div>
       <p style="color:var(--gris)">Tu pedido quedó registrado con sus precios. Ahora envíalo al <b style="color:var(--tinta)">WhatsApp oficial de THF</b> para confirmarlo y recibir los datos de pago.</p>
       <a class="btn btn-gold wa-go" href="${esc(r.wa)}" target="_blank" rel="noopener">Enviar por WhatsApp <span class="arr"></span></a>
       <details class="co-msg"><summary>Ver el mensaje</summary><div class="msg" id="coMsg">${esc(r.message)}</div><button class="textlink" id="coCopy" type="button">Copiar mensaje</button></details>
       ${r.status ? `<p class="note">Guarda este enlace para ver el estado de tu pedido: <a href="${esc(r.status)}">${esc(statusLink)}</a></p>` : ''}
       <p class="antiscam">${esc(r.payNote || 'Paga solo por el WhatsApp oficial de THF.')}</p><button class="btn btn-ghost" data-close>Cerrar</button>`;
      $('#coCopy').onclick = () => copy(r.message, 'Mensaje copiado');
      setTimeout(() => { const w = window.open(r.wa, '_blank'); if (w) { try { w.opener = null; } catch (x) {} } else toast('Toca "Enviar por WhatsApp" para abrir el chat'); }, 350);
    } catch (x) {
      fail(x.message); btn.disabled = false; btn.classList.remove('busy');
    }
  };
}

/* ---------- Tarjetas: añadir rápido ---------- */
document.addEventListener('click', (e) => {
  const q = e.target.closest('[data-quick]'); if (!q) return;
  e.preventDefault(); e.stopPropagation();
  const p = P.get(q.dataset.quick); if (!p) return;
  const color = q.dataset.color || '';
  // con largos para elegir: abre la vista rápida con el color ya marcado; si no, se añade directo con el color elegido en la franja
  if (!p.bundle && p.variants && p.variants.length > 1) return openProduct(p.slug, color);
  if (!color && hasChoices(p)) return openProduct(p.slug);
  addProduct(p, p.variants ? p.variants[0] : '', 1, color);
  q.classList.add('done'); setTimeout(() => q.classList.remove('done'), 1400);
}, true);

/* ---------- Cuadro pequeño: en pantallas táctiles, tocar muestra la nota ---------- */
document.addEventListener('click', (e) => {
  const f = e.target.closest('.has-note'); if (!f) { $$('.has-note.show').forEach((x) => x.classList.remove('show')); return; }
  if (matchMedia('(hover:none)').matches) { e.preventDefault(); e.stopPropagation(); f.classList.toggle('show'); }
}, true);

/* ---------- Catálogo: filtros sobre las tarjetas que ya vienen del servidor ---------- */
safe(() => {
  const grid = $('#catGrid'); if (!grid) return;
  const cards = $$('.pcard', grid);
  const items = cards.map((el, i) => ({ el, i, p: P.get(el.dataset.slug) })).filter((x) => x.p);
  const PAGE_SIZE = 24;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  items.forEach((x) => { x.txt = norm([x.p.name, x.p.type, x.p.stone, x.p.place, x.p.collectionName, x.p.detail, x.p.story].join(' ')); });
  const maxPrice = Math.ceil(Math.max(...items.map((x) => x.p.unit), 500) / 500) * 5;
  const st = { col: '', cat: '', stone: '', place: '', dir: '', max: maxPrice, offer: false, q: '', sort: 'destacados', shown: PAGE_SIZE };
  const uniq = (k) => [...new Set(items.map((x) => x.p[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#fStone').insertAdjacentHTML('beforeend', uniq('stone').map((s) => `<option>${esc(s)}</option>`).join(''));
  $('#fPlace').insertAdjacentHTML('beforeend', uniq('place').map((s) => `<option>${esc(s)}</option>`).join(''));
  const pr = $('#fMax'); pr.max = maxPrice; pr.value = maxPrice;
  $$('#catChips .chip').forEach((c) => { const k = c.dataset.cat; if (k) { const n = items.filter((x) => x.p.cat === k).length; const s = document.createElement('i'); s.textContent = n; c.appendChild(s); c.classList.toggle('zero', !n); } });
  const empty = document.createElement('div'); empty.className = 'cat-empty'; empty.hidden = true;
  empty.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#rose"/></svg><h3>Ninguna pieza coincide</h3><p>Prueba con menos filtros o con otra palabra.</p><button class="btn btn-ghost" data-clear>Ver todas las piezas</button>`;
  grid.appendChild(empty);
  const filtered = () => {
    const q = norm(st.q.trim());
    let l = items.filter(({ p, txt }) => (!st.col || p.collection === st.col) && (!st.cat || p.cat === st.cat) && (!st.stone || p.stone === st.stone) && (!st.place || p.place === st.place) && (!st.dir || p.dir === st.dir) && p.unit <= st.max * 100 && (!st.offer || p.offer != null) && (!q || q.split(/\s+/).every((w) => txt.includes(w))));
    const s = { precio_asc: (a, b) => a.p.unit - b.p.unit, precio_desc: (a, b) => b.p.unit - a.p.unit, nombre: (a, b) => a.p.name.localeCompare(b.p.name, 'es') }[st.sort];
    return s ? [...l].sort(s) : [...l].sort((a, b) => (b.p.featured - a.p.featured) || a.i - b.i);
  };
  const DIRS = { O: 'Oeste', N: 'Norte', E: 'Este', S: 'Sur' };
  const chipsActive = () => {
    const a = [];
    const col = (D.collections || []).find((c) => c.slug === st.col);
    if (col) a.push(['col', col.name]);
    if (st.cat) a.push(['cat', $(`#catChips [data-cat="${st.cat}"]`).firstChild.textContent.trim()]);
    if (st.stone) a.push(['stone', st.stone]); if (st.place) a.push(['place', st.place]); if (st.dir) a.push(['dir', DIRS[st.dir]]);
    if (st.max < maxPrice) a.push(['max', 'Hasta $' + st.max]); if (st.offer) a.push(['offer', 'En oferta']); if (st.q) a.push(['q', '“' + st.q + '”']);
    $('#activeFilters').innerHTML = a.length ? a.map(([k, t]) => `<button class="afilter" data-k="${k}">${esc(t)} <span aria-hidden="true">✕</span><span class="sr">Quitar filtro</span></button>`).join('') + '<button class="afilter clear" data-k="all">Limpiar todo</button>' : '';
    $('#filterCount').textContent = a.filter((x) => !['col', 'cat', 'q'].includes(x[0])).length || '';
  };
  const render = () => {
    const l = filtered();
    cards.forEach((c) => (c.hidden = true));
    l.forEach((x, k) => { x.el.hidden = k >= st.shown; grid.insertBefore(x.el, empty); });
    empty.hidden = l.length > 0;
    $('#resultCount').textContent = l.length === 1 ? '1 pieza' : `${l.length} piezas`;
    $('#moreWrap').hidden = l.length <= st.shown; $('#moreTxt').textContent = `Mostrando ${Math.min(st.shown, l.length)} de ${l.length}`;
    $$('#colTabs .ctab').forEach((b) => b.setAttribute('aria-pressed', b.dataset.col === st.col));
    $$('#catChips .chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cat === st.cat));
    chipsActive();
  };
  const set = (k, v) => { st[k] = v; st.shown = PAGE_SIZE; render(); };
  $('#colTabs').addEventListener('click', (e) => { const b = e.target.closest('.ctab'); if (b) set('col', b.dataset.col); });
  $('#catChips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) set('cat', b.dataset.cat); });
  $('#fStone').onchange = (e) => set('stone', e.target.value); $('#fPlace').onchange = (e) => set('place', e.target.value); $('#fDir').onchange = (e) => set('dir', e.target.value);
  pr.oninput = (e) => { $('#fMaxO').textContent = '$' + e.target.value; set('max', +e.target.value); }; $('#fMaxO').textContent = '$' + maxPrice;
  $('#fOffer').onchange = (e) => set('offer', e.target.checked); $('#fSort').onchange = (e) => set('sort', e.target.value);
  let tq; $('#fSearch').addEventListener('input', (e) => { clearTimeout(tq); tq = setTimeout(() => set('q', e.target.value), 160); });
  $('#moreBtn').onclick = () => { st.shown += PAGE_SIZE; render(); };
  const clearAll = () => { Object.assign(st, { col: '', cat: '', stone: '', place: '', dir: '', max: maxPrice, offer: false, q: '' }); $('#fStone').value = ''; $('#fPlace').value = ''; $('#fDir').value = ''; pr.value = maxPrice; $('#fMaxO').textContent = '$' + maxPrice; $('#fOffer').checked = false; $('#fSearch').value = ''; set('shown', PAGE_SIZE); };
  $('#activeFilters').addEventListener('click', (e) => { const b = e.target.closest('.afilter'); if (!b) return; const k = b.dataset.k;
    if (k === 'all') return clearAll(); if (k === 'max') { pr.value = maxPrice; $('#fMaxO').textContent = '$' + maxPrice; set('max', maxPrice); } else if (k === 'offer') { $('#fOffer').checked = false; set('offer', false); } else if (k === 'q') { $('#fSearch').value = ''; set('q', ''); } else { const sel = { stone: '#fStone', place: '#fPlace', dir: '#fDir' }[k]; if (sel) $(sel).value = ''; set(k, ''); } });
  grid.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) clearAll(); });
  const fp = $('#filterPanel'), fb = $('#filterBtn');
  const tog = (o) => { fp.classList.toggle('open', o); fb.setAttribute('aria-expanded', o); };
  fb.onclick = () => tog(!fp.classList.contains('open')); $('#filterDone').onclick = () => tog(false);
  const fromUrl = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (['collares', 'pulseras', 'sets', 'cajas'].includes(h)) st.cat = h;
    else if ((D.collections || []).some((c) => c.slug === h)) st.col = h;
    else if (h === 'ofertas') { st.offer = true; $('#fOffer').checked = true; }
    const q = new URLSearchParams(location.search).get('q'); if (q) { st.q = q.slice(0, 60); $('#fSearch').value = st.q; }
  };
  fromUrl(); addEventListener('hashchange', () => { fromUrl(); render(); });
  render();
}, 'catalogo');

/* ---------- Compra el look ---------- */
safe(() => {
  $$('.look').forEach((el) => {
    const lk = LOOKS.get(el.dataset.look); if (!lk) return;
    const boxes = $$('input[data-item]', el);
    const card = $('.hot-card', el);
    const btn = $('[data-look-add]', el);
    const upd = () => {
      const on = boxes.filter((b) => b.checked);
      const all = on.length === boxes.length;
      const sum = on.reduce((a, b) => a + +b.dataset.unit * +b.dataset.qty, 0);
      el.classList.toggle('partial', !all);
      $('.lt-price', el).textContent = money(all ? lk.price : sum);
      $('.lt-full', el).textContent = all ? money(lk.full) : '';
      $('.lt-save', el).textContent = all ? `Ahorras ${money(lk.discount)} · −${lk.discountPct} %` : on.length ? `Completa el look y ahorra ${lk.discountPct} %` : 'Elige al menos una pieza';
      $('small', $('.look-total', el)).textContent = all ? 'Look completo' : `${on.length} de ${boxes.length} piezas`;
      btn.disabled = !on.length;
      btn.firstChild.textContent = all ? 'Comprar el look completo ' : on.length === 1 ? 'Añadir 1 pieza ' : `Añadir ${on.length} piezas `;
      $$('.hot', el).forEach((h, i) => h.classList.toggle('off', !boxes[i].checked));
    };
    boxes.forEach((b) => b.addEventListener('change', upd));
    $$('.hot', el).forEach((h, i) => h.addEventListener('click', (e) => {
      e.stopPropagation();
      const it = lk.items[i]; const p = P.get(it.slug); if (!p || !card) return;
      if (card.dataset.i === String(i) && !card.hidden) { card.hidden = true; return; }
      card.dataset.i = i;
      card.innerHTML = `<img src="${esc(p.img.main)}" alt=""><div><b>${esc(p.name)}</b><small>${esc(p.type)} · ${money(p.unit)}</small><a href="${esc(p.url)}">Ver pieza →</a></div>`;
      card.style.left = Math.min(70, Math.max(4, it.x - 10)) + '%'; card.style.top = Math.min(78, it.y + 6) + '%';
      card.hidden = false;
    }));
    el.addEventListener('click', (e) => { if (card && !e.target.closest('.hot,.hot-card')) card.hidden = true; });
    btn.addEventListener('click', () => {
      const on = boxes.filter((b) => b.checked);
      if (on.length === boxes.length) {
        addLine({ kind: 'look', id: lk.id, slug: lk.slug, name: `Look ${lk.name}`, img: lk.photo, sku: `LOOK-${lk.id}`, variant: 'Look completo', qty: 1, unit: lk.price });
      } else on.forEach((b) => { const p = P.get(b.dataset.slug); if (p) addProduct(p, p.variants ? p.variants[0] : '', +b.dataset.qty || 1); });
      openCart();
    });
    upd();
  });
  // carrusel de looks
  $$('.looks-stage').forEach((stage) => {
    const boards = $$('.look', stage); if (boards.length < 2) return;
    stage.classList.add('is-carousel');
    let i = 0;
    const page = stage.closest('section');
    let count = $('[data-look-count]', page), prev = $('[data-look-prev]', page), next = $('[data-look-next]', page);
    if (!prev) {
      const nav = document.createElement('div'); nav.className = 'looks-arrows';
      nav.innerHTML = '<button class="la prev" aria-label="Look anterior">←</button><span class="la-count"></span><button class="la next" aria-label="Look siguiente">→</button>';
      stage.after(nav); prev = $('.prev', nav); next = $('.next', nav); count = $('.la-count', nav);
    }
    const tabs = stage.hasAttribute('data-carousel') ? $$('.look-index [data-goto]') : $$('[data-goto]', page);
    const go = (n, push) => {
      i = (n + boards.length) % boards.length;
      boards.forEach((b, k) => { b.hidden = k !== i; b.classList.toggle('in', k === i); });
      count.textContent = `${i + 1} / ${boards.length}`;
      tabs.forEach((t, k) => t.setAttribute('aria-selected', k === i));
      if (tabs[i]) tabs[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: RM.matches ? 'auto' : 'smooth' });
      if (push && stage.hasAttribute('data-carousel')) history.replaceState(null, '', '#' + boards[i].dataset.look);
    };
    prev.addEventListener('click', () => go(i - 1, true)); next.addEventListener('click', () => go(i + 1, true));
    tabs.forEach((t) => t.addEventListener('click', () => {
      go(+t.dataset.goto, true);
      const top = stage.getBoundingClientRect().top;
      if (top > innerHeight * 0.6 || top < 0) stage.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' });
    }));
    let x0 = null;
    stage.addEventListener('touchstart', (e) => { if (!e.target.closest('.look-items')) x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1), true); });
    const h = location.hash.slice(1);
    const start = Math.max(0, boards.findIndex((b) => b.dataset.look === h));
    go(start);
  });
}, 'looks');

/* ---------- Ficha de pieza ---------- */
safe(() => {
  const info = $('.pp-info[data-product]'); if (!info) return;
  const p = P.get(info.dataset.product); if (!p) return;
  $$('.pp-thumbs button').forEach((b) => b.addEventListener('click', () => { $('#ppMain').src = b.dataset.img; $$('.pp-thumbs button').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
  const q = $('#ppQty');
  $$('[data-ppq]').forEach((b) => (b.onclick = () => { q.value = Math.max(1, Math.min(99, (+q.value || 1) + +b.dataset.ppq)); }));
  $('#ppAdd').onclick = () => { addProduct(p, $('#ppVar') ? $('#ppVar').value : p.variants[0] || '', Math.max(1, Math.min(99, +q.value || 1)), pickedColor(info, 'ppColor')); openCart(); };
  // Barra fija de compra en el teléfono cuando el botón principal sale de la vista
  const sticky = $('[data-pp-sticky]'), mainBtn = $('#ppAdd');
  if (sticky && mainBtn && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { sticky.hidden = e.isIntersecting || e.boundingClientRect.top > innerHeight; }, { threshold: 0 }).observe(mainBtn);
    $('[data-pp-sticky-add]', sticky).onclick = () => { if (hasChoices(p)) { mainBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; } mainBtn.click(); };
  }
  $('#ppAsk').onclick = () => window.open(waLink(`Hola THF, quisiera saber más sobre la pieza ${p.name} (${p.sku}).`), '_blank', 'noopener');
}, 'pieza');

/* ---------- Guías y ebooks ---------- */
safe(() => {
  const info = $('.pp-info[data-digital]'); if (!info) return;
  const d = (D.digital || [])[0]; if (!d) return;
  const add = $('#digAdd');
  if (add) add.onclick = () => { addLine({ kind: 'digital', id: d.id, slug: d.slug, name: d.title, img: d.cover, sku: `DIG-${d.id}`, variant: d.format, qty: 1, unit: d.price }); openCart(); };
  const free = $('#digFree');
  if (free) free.onclick = async () => {
    free.disabled = true;
    try { const r = await post(`/api/digital/${d.slug}/free`, {}); location.href = r.url; toast('Tu descarga comenzó'); } catch (e) { toast(e.message); }
    setTimeout(() => (free.disabled = false), 3000);
  };
}, 'digital');

/* ---------- Inicio: invitación a los programas ---------- */
safe(() => {
  const root = $('#invite'); if (!root) return;
  const panels = $$('.ip', root);
  const open = (el) => panels.forEach((p) => p.classList.toggle('is-open', p === el));
  panels.forEach((p) => { p.addEventListener('mouseenter', () => { if (matchMedia('(hover:hover)').matches) open(p); }); p.addEventListener('focusin', () => open(p)); p.addEventListener('click', (e) => { if (!e.target.closest('a,button')) open(p); }); });
  const com = Number(S['programs.a.commission_pct']) || 0;
  const calc = { a: { n: 10, f: (n) => n * 3000 * com / 100 }, b: { n: 11, f: (n) => (2800 - 1200) * n } };
  const anim = (el, to) => { const from = parseFloat(el.dataset.v || 0); const t0 = performance.now(); el.dataset.v = to; const step = (t) => { const k = Math.min(1, (t - t0) / 450); el.textContent = short(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  $$('[data-calc]', root).forEach((box) => {
    const c = calc[box.dataset.calc]; if (!c) return;
    const out = $('output', box), res = $('.ip-result b', box);
    const upd = () => { out.textContent = c.n; anim(res, c.f(c.n)); };
    $$('button[data-d]', box).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); c.n = Math.max(1, Math.min(60, c.n + +b.dataset.d)); upd(); }));
    upd();
  });
}, 'invite');

/* ---------- Programas ---------- */
safe(() => {
  const root = $('#progPage'); if (!root) return;
  const com = (Number(S['programs.a.commission_pct']) || 0) / 100, payMin = (Number(S['programs.payout_min_usd']) || 0) * 100;
  const tabs = $$('[data-tab]'), panes = $$('.ppane');
  let timer = null;
  function startTour(k) {
    clearInterval(timer); const pane = $(`.ppane[data-pane="${k}"]`); if (!pane) return;
    const steps = $$('.tour-step', pane), screens = $$('.screen', pane), bar = $('.tour-bar i', pane); let i = 0, paused = false;
    const go = (n) => { i = (n + steps.length) % steps.length; steps.forEach((s, j) => { s.classList.toggle('on', j === i); s.setAttribute('aria-selected', j === i); }); screens.forEach((s, j) => s.classList.toggle('on', j === i)); if (bar) { bar.style.transition = 'none'; bar.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = 'width 5s linear'; bar.style.width = paused ? '0' : '100%'; })); } };
    steps.forEach((s, j) => (s.onclick = () => { paused = true; go(j); if (bar) bar.style.width = '0'; }));
    const tour = $('.tour', pane); if (tour) { tour.onmouseenter = () => { paused = true; }; tour.onmouseleave = () => { paused = false; go(i); }; }
    go(0); if (!RM.matches) timer = setInterval(() => { if (!paused && !document.hidden) go(i + 1); }, 5000);
  }
  const show = (k, scroll) => { root.dataset.prog = k; tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === k)); panes.forEach((p) => (p.hidden = p.dataset.pane !== k)); if (scroll) { const top = $('#switch').getBoundingClientRect().top + scrollY - 70; scrollTo({ top, behavior: RM.matches ? 'auto' : 'smooth' }); } startTour(k); };
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab, t.hasAttribute('data-scroll'))));
  $$('[data-go]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); show(b.dataset.go, true); }));
  // test
  const quiz = $('#quiz');
  if (quiz) {
    const ans = []; const qs = $$('.q', quiz), dots = $$('.qdots i', quiz);
    const qshow = (n) => { qs.forEach((q, j) => (q.hidden = j !== n)); dots.forEach((d, j) => d.classList.toggle('on', j <= n)); };
    $$('.q button', quiz).forEach((b) => b.addEventListener('click', () => { const n = +b.closest('.q').dataset.q; ans[n] = b.dataset.v;
      if (n < qs.length - 1) return qshow(n + 1);
      const a = ans.filter((v) => v === 'a').length, bb = ans.filter((v) => v === 'b').length; const r = a > bb ? 'a' : bb > a ? 'b' : 'ambos';
      const txt = { a: ['Embajadoras', 'Te va mejor compartir tu enlace y tu código con tu gente. Nosotros nos encargamos del resto.'], b: ['Emprendedoras', 'Te va mejor tener tu propia tienda, con tu nombre y tus precios. Nosotros elaboramos y enviamos.'], ambos: ['Los dos programas', 'Puedes unirte a ambos con una sola cuenta. Cada uno tiene su solicitud, su saldo y su panel.'] }[r];
      qs.forEach((q) => (q.hidden = true)); const res = $('#quizResult'); res.hidden = false; res.dataset.r = r; $('#quizName').textContent = txt[0]; $('#quizWhy').textContent = txt[1];
      $('#quizGo').dataset.go = r === 'b' ? 'b' : 'a'; $('#quizGo').textContent = r === 'ambos' ? 'Empezar por Embajadoras' : 'Ver ' + txt[0]; }));
    $('#quizAgain').onclick = () => { ans.length = 0; $('#quizResult').hidden = true; qshow(0); };
  }
  const barTxt = (sales) => (sales >= payMin ? `<b>¡Listo!</b> Con ${short(sales)} en ventas alcanzas el mínimo y se libera tu pago.` : `Llevas ${short(sales)} de ${short(payMin)} en ventas. Te faltan <b>${short(payMin - sales)}</b> para cobrar; lo acumulado se guarda.`);
  // simulador A
  if ($('#aSales')) {
    const A = () => { const s = +$('#aSales').value, pr = +$('#aPrice').value * 100; $('#aSalesO').textContent = s; $('#aPriceO').textContent = short(pr); const sales = s * pr; $('#aOut').textContent = money(Math.round(sales * com));
      $('#aBar').style.width = Math.min(100, (sales / payMin) * 100) + '%'; $('#aBarL').innerHTML = barTxt(sales);
      $('#aCoins').innerHTML = Array.from({ length: Math.min(s, 30) }, (_, i) => `<i style="--d:${i * 25}ms"></i>`).join('') + (s > 30 ? `<em>+${s - 30}</em>` : ''); };
    ['aSales', 'aPrice'].forEach((i) => $('#' + i).addEventListener('input', A)); A();
  }
  // simulador B: números de muestra definidos en el panel
  const PICK = D.sim || [];
  if ($('#bPick') && PICK.length) {
    let pick = PICK[0];
    $('#bPick').innerHTML = PICK.map((x, i) => `<button class="pick${i === 0 ? ' on' : ''}" data-pk="${i}" aria-pressed="${i === 0}"><img src="${esc(x.img)}" alt=""><span>${esc(x.name)}<small>Costo de ejemplo ${short(x.base)}</small></span></button>`).join('');
    const bp = $('#bPrice');
    const B = () => { const pr = +bp.value * 100, q = +$('#bQty').value, cost = pick.base; $('#bPriceO').textContent = short(pr); $('#bQtyO').textContent = q;
      $('#bRange').textContent = `Puedes venderla entre ${short(pick.min)} y ${short(pick.max)} · sugerido ${short(pick.sug)}`;
      const per = pr - cost; $('#bOut').textContent = money(per * q); $('#bPerTxt').innerHTML = `Ganas <b>${money(per)}</b> por pieza (${((per / pr) * 100).toFixed(1).replace('.', ',')} % del precio)`;
      $('#bCost').style.flexGrow = cost; $('#bGain').style.flexGrow = Math.max(0, per); $('#bCostL').textContent = 'Costo ' + money(cost); $('#bGainL').textContent = 'Tu ganancia ' + money(per);
      const sales = pr * q; $('#bBar').style.width = Math.min(100, (sales / payMin) * 100) + '%'; $('#bBarL').innerHTML = barTxt(sales); };
    const setPick = (i) => { pick = PICK[i]; bp.min = Math.ceil(pick.min / 100); bp.max = Math.floor(pick.max / 100); bp.value = Math.round(pick.sug / 100); $$('#bPick .pick').forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', j === i); }); B(); };
    $('#bPick').addEventListener('click', (e) => { const b = e.target.closest('.pick'); if (b) setPick(+b.dataset.pk); });
    ['bPrice', 'bQty'].forEach((i) => $('#' + i).addEventListener('input', B)); setPick(0);
  }
  // calendario de ejemplo del mes actual
  const now = new Date();
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  $$('.cal-title').forEach((t) => (t.firstChild.textContent = `${MES[now.getMonth()]} ${now.getFullYear()} `));
  $$('.paycal').forEach((cal) => {
    const y = now.getFullYear(), m = now.getMonth(); const off = (new Date(y, m, 1).getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
    const mark = { 15: 'corte', 20: 'pago', [days]: 'corte' };
    let h = '<div class="cal-head">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('') + '</div><div class="cal-grid">' + '<span></span>'.repeat(off);
    for (let d = 1; d <= days; d++) h += `<span class="${mark[d] || ''}">${d}${mark[d] ? `<em>${mark[d] === 'corte' ? 'Corte' : 'Pago'}</em>` : ''}</span>`;
    cal.innerHTML = h + '</div>';
  });
  const h = location.hash.slice(1); const k = h === 'emprendedoras' ? 'b' : 'a';
  show(k, false); if (h === 'embajadoras' || h === 'emprendedoras') setTimeout(() => show(k, true), 350); if (h === 'test' && quiz) setTimeout(() => quiz.scrollIntoView({ behavior: 'smooth' }), 350);
  addEventListener('hashchange', () => { const h2 = location.hash.slice(1); if (h2 === 'embajadoras') show('a', true); if (h2 === 'emprendedoras') show('b', true); });
}, 'programas');

/* ---------- Postulación a los programas (se guarda en el panel) ---------- */
safe(() => {
  const m = $('#apply'); if (!m) return;
  const card = $('.modal-card', m); let prog = 'embajadora', step = 0; let data = {};
  const steps = [
    () => `<div class="field"><label for="apName">Nombre y apellido</label><input id="apName" autocomplete="name" maxlength="80" value="${esc(data.name || '')}"></div>
      <div class="grid2"><div class="field"><label for="apCity">Ciudad</label><input id="apCity" autocomplete="address-level2" maxlength="60" value="${esc(data.city || '')}"></div><div class="field"><label for="apWa">WhatsApp</label><input id="apWa" inputmode="tel" autocomplete="tel" maxlength="30" value="${esc(data.wa || '')}"></div></div>
      <label class="note" style="cursor:pointer"><input type="checkbox" id="apAge" ${data.age ? 'checked' : ''} style="margin-top:3px"> <span>Soy mayor de 18 años.</span></label>`,
    () => `<p class="note">Agrega al menos una red. Solo revisamos los enlaces.</p>
      <div class="field"><label for="apIg">Instagram</label><input id="apIg" placeholder="instagram.com/tu_usuario" maxlength="160" value="${esc(data.ig || '')}"></div>
      <div class="field"><label for="apTk">TikTok u otra red</label><input id="apTk" placeholder="tiktok.com/@tu_usuario" maxlength="160" value="${esc(data.tk || '')}"></div>
      <div class="field"><label for="apF">Seguidores aproximados</label><select id="apF">${['Menos de 500', '500 a 2.000', '2.000 a 10.000', 'Más de 10.000'].map((o) => `<option${data.f === o ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`,
    () => `<div class="field"><label for="apWhy">¿Por qué quieres unirte? (una o dos líneas)</label><textarea id="apWhy" rows="3" maxlength="600">${esc(data.why || '')}</textarea></div>
      <div class="hp" aria-hidden="true"><label>No llenar <input id="apWeb" tabindex="-1" autocomplete="off"></label></div>
      <label class="note" style="cursor:pointer"><input type="checkbox" id="apTerms" style="margin-top:3px"> <span>Acepto los términos del programa. Entiendo que <b>no puedo recibir pagos de clientes</b> por las piezas.</span></label><div id="apTs"></div>`,
  ];
  const titles = ['Sobre ti', 'Tus redes', 'Último paso'];
  const read = () => { const v = (id) => { const e = $('#' + id); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : undefined; };
    if (step === 0) Object.assign(data, { name: v('apName'), city: v('apCity'), wa: v('apWa'), age: v('apAge') });
    if (step === 1) Object.assign(data, { ig: v('apIg'), tk: v('apTk'), f: v('apF') });
    if (step === 2) Object.assign(data, { why: v('apWhy'), terms: v('apTerms'), website: v('apWeb') }); };
  const SOC = /^(https?:\/\/)?(www\.)?(instagram\.com|tiktok\.com|facebook\.com|youtube\.com|x\.com|pinterest\.com|wa\.me|linktr\.ee)\/[\w.@\-/]+$/i;
  const valid = () => { if (step === 0) { if (!data.name || !data.city || !data.wa) return 'Completa nombre, ciudad y WhatsApp.'; if (!data.age) return 'El programa es solo para mayores de 18 años.'; }
    if (step === 1) { if (!data.ig && !data.tk) return 'Agrega al menos una red social.'; if ([data.ig, data.tk].filter(Boolean).some((u) => !SOC.test(u))) return 'Revisa el enlace: debe ser de Instagram, TikTok, Facebook, YouTube, X, Pinterest, WhatsApp o Linktree.'; }
    if (step === 2 && !data.terms) return 'Acepta los términos para enviar tu solicitud.'; return ''; };
  const render = () => {
    if (step === 3) { card.innerHTML = `<svg class="ap-ok" viewBox="0 0 100 100" aria-hidden="true"><use href="#rose"/></svg><p class="eyebrow" style="color:var(--oro-texto)">Solicitud recibida</p><h3>¡Gracias, ${esc(data.name.split(' ')[0])}!</h3><p style="color:var(--gris)">Revisaremos tus redes y te escribiremos por WhatsApp. Recuerda: los pedidos y pagos van siempre al WhatsApp oficial de THF.</p><button class="btn btn-solid" data-apclose>Entendido</button>`; return; }
    card.innerHTML = `<div class="ap-top"><p class="eyebrow" style="color:var(--oro-texto)">Postulación · ${prog === 'embajadora' ? 'Embajadoras' : 'Emprendedoras'}</p><button class="x" data-apclose>Cerrar ✕</button></div>
      <div class="ap-dots">${titles.map((t, i) => `<span class="${i <= step ? 'on' : ''}"><i></i>${t}</span>`).join('')}</div>
      <h3>${titles[step]}</h3><form id="apForm" novalidate style="display:grid;gap:14px">${steps[step]()}<p id="apErr" class="note" style="color:var(--burdeos)" role="alert" hidden></p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">${step > 0 ? '<button type="button" class="btn btn-ghost" data-apback>Atrás</button>' : ''}<button class="btn btn-solid" type="submit" id="apGo">${step === 2 ? 'Enviar solicitud' : 'Continuar'} <span class="arr"></span></button></div></form>
      <p class="note" style="margin-top:4px">Toma menos de 3 minutos. Paso ${step + 1} de 3.</p>`;
    const f = $('input,textarea,select', card); f && f.focus();
    if (step === 2) turnstile($('#apTs'));
    $('#apForm').onsubmit = async (e) => { e.preventDefault(); read(); const err = valid(); const el = $('#apErr'); if (err) { el.hidden = false; el.textContent = err; return; }
      if (step === 2) {
        const b = $('#apGo'); b.disabled = true;
        try { await post('/api/requests', { kind: prog, name: data.name, city: data.city, phone: data.wa, website: data.website, turnstile: ($('#apTs') || {}).dataset ? $('#apTs').dataset.token : '', data: { age: data.age, terms: data.terms, ig: data.ig, tk: data.tk, f: data.f, why: data.why } }); tagEv('lead'); }
        catch (x) { el.hidden = false; el.textContent = x.message; b.disabled = false; return; }
      }
      step++; render(); };
    const bk = $('[data-apback]', card); if (bk) bk.onclick = () => { read(); step--; render(); };
  };
  const open = (p) => { prog = p; step = 0; data = {}; render(); openModal(m); };
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-apply]'); if (a) { e.preventDefault(); open(a.dataset.apply); } if (e.target.closest('[data-apclose]')) closeAll(); });
}, 'apply');

/* ---------- Videos ---------- */
safe(() => {
  const vids = $$('video[data-autovideo],#boxVideo'); if (!vids.length) return;
  vids.forEach((v) => { v.muted = true; if (RM.matches) { v.removeAttribute('autoplay'); v.pause(); } });
  if ('IntersectionObserver' in window && !RM.matches) { const io = new IntersectionObserver((es) => es.forEach((e) => { const v = e.target; if (v.dataset.user === 'paused') return; if (e.isIntersecting) { const p = v.play(); p && p.catch(() => {}); } else v.pause(); }), { threshold: 0.15 }); vids.forEach((v) => io.observe(v)); }
  const b = $('#boxVbtn'), v = $('#boxVideo');
  if (b && v) { const icon = () => { b.innerHTML = v.paused ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'; b.setAttribute('aria-label', v.paused ? 'Reproducir video' : 'Pausar video'); };
    b.onclick = () => { if (v.paused) { v.dataset.user = ''; const p = v.play(); p && p.catch(() => {}); } else { v.dataset.user = 'paused'; v.pause(); } }; v.addEventListener('play', icon); v.addEventListener('pause', icon); icon(); }
}, 'videos');

/* ---------- Caja de joyería ---------- */
safe(() => {
  if (!$('#cajaPage')) return;
  const box = [...P.values()].find((p) => p.bundle); if (!box) return;
  const q = $('#boxQty');
  $$('[data-bq]').forEach((b) => (b.onclick = () => { q.value = Math.max(1, Math.min(20, (+q.value || 1) + +b.dataset.bq)); }));
  $('#boxAdd').onclick = () => { addProduct(box, '', Math.max(1, Math.min(20, +q.value || 1))); openCart(); };
  $('#boxAsk').onclick = () => window.open(waLink(`Hola THF, quisiera información sobre la ${box.name} (${box.type}).`), '_blank', 'noopener');
  $$('[data-scrolltop]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => $('#boxAdd').focus({ preventScroll: true }), 600); }));
  const tabs = $$('.utab'), panes = $$('.upane');
  tabs.forEach((t) => t.addEventListener('click', () => { tabs.forEach((x) => x.setAttribute('aria-selected', x === t)); panes.forEach((p) => (p.hidden = p.dataset.upane !== t.dataset.use)); }));
  const cost = box.unit, n24 = box.pieces || 24, dots = $('#dots24');
  if (dots) {
    const half = Math.floor(n24 / 2);
    dots.innerHTML = '<small>Collares</small>' + '<i></i>'.repeat(half) + '<small>Pulseras</small>' + '<i></i>'.repeat(n24 - half);
    const is = $$('i', dots);
    const R = () => { const pr = +$('#rPrice').value * 100, n = +$('#rQty').value; $('#rPriceO').textContent = short(pr); $('#rQtyO').textContent = n;
      const sales = pr * n, gain = sales - cost, be = Math.ceil(cost / pr);
      is.forEach((d, i) => (d.className = i < n ? (i < be ? 'sold' : 'profit') : ''));
      $('#rSales').textContent = short(sales); $('#rGain').textContent = (gain < 0 ? '−' : '') + short(Math.abs(gain)); $('#rGainBox').classList.toggle('neg', gain < 0);
      $('#rMsg').innerHTML = be > n24 ? `A ${short(pr)} por pieza no alcanzas a recuperar los ${short(cost)} de la caja. Prueba con un precio mayor.` : `A ${short(pr)} por pieza, <b>recuperas tu inversión al vender ${be} piezas</b>. ${n > be ? 'Desde ahí, cada pieza es ganancia.' : ''}`; };
    ['rPrice', 'rQty'].forEach((i) => $('#' + i).addEventListener('input', R)); R();
  }
}, 'caja');

/* ---------- Joyería personalizada ---------- */
safe(() => {
  if (!$('#cuPage')) return;
  const val = (k) => $$('button[aria-pressed="true"]', $(`.seg[data-key="${k}"]`)).map((b) => b.dataset.v);
  const setWho = (w) => { const v = w === 'persona' ? 'Persona' : 'Marca'; $$('.seg[data-key="who"] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v));
    $$('.who-pick button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.who === w));
    $$('.path').forEach((p) => { p.classList.toggle('on', p.dataset.path === w); p.classList.toggle('off', p.dataset.path !== w); });
    const q = $(`.seg[data-key="qty"] button[data-v="${w === 'persona' ? '1 pieza' : '11 a 50 piezas'}"]`); if (q) $$('.seg[data-key="qty"] button').forEach((b) => b.setAttribute('aria-pressed', b === q));
    $('#bName').previousElementSibling.textContent = w === 'persona' ? 'Tu nombre' : 'Nombre de la marca'; msg(); };
  $$('.who-pick button').forEach((b) => b.addEventListener('click', () => setWho(b.dataset.who)));
  $$('.seg[data-key]').forEach((s) => s.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return;
    if (s.hasAttribute('data-single')) $$('button', s).forEach((x) => x.setAttribute('aria-pressed', x === b)); else { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); if (!$$('button[aria-pressed="true"]', s).length) b.setAttribute('aria-pressed', 'true'); }
    if (s.dataset.key === 'who') return setWho(b.dataset.v === 'Persona' ? 'persona' : 'marca'); msg(); }));
  const fmtDate = (v) => { if (!v) return ''; const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; };
  const v = (id) => $('#' + id).value.trim();
  function brief() { return { who: val('who')[0], what: val('what'), qty: val('qty')[0], design: val('design')[0], sample: val('sample')[0], colors: v('bColors'), date: fmtDate(v('bDate')), idea: v('bIdea') }; }
  function msg() { const b = brief();
    $('#briefMsg').textContent = ['*Joyería personalizada · THF*', '', `Soy: ${b.who}`, `Piezas: ${b.what.join(', ')}`, `Cantidad: ${b.qty}`, `Diseño: ${b.design}`, `Muestra: ${b.sample}`, ...(b.colors ? [`Colores / piedras: ${b.colors}`] : []), ...(b.date ? [`Para: ${b.date}`] : []), ...(b.idea ? ['', `Idea: ${b.idea}`] : []), '', `${b.who === 'Marca' ? 'Marca' : 'Nombre'}: ${v('bName') || '—'}`, `WhatsApp: ${v('bTel') || '—'}`].join('\n'); }
  $$('#briefForm input,#briefForm textarea').forEach((i) => i.addEventListener('input', msg));
  $('#briefCopy').onclick = async () => {
    if (!v('bName') || v('bTel').replace(/\D/g, '').length < 7) { toast('Agrega tu nombre y tu WhatsApp para que podamos responderte'); (v('bName') ? $('#bTel') : $('#bName')).focus(); return; }
    const btn = $('#briefCopy'); btn.disabled = true;
    const win = window.open('about:blank', '_blank');
    try {
      const r = await post('/api/requests', { kind: 'personalizada', name: v('bName'), phone: v('bTel'), data: brief() });
      tagEv('lead');
      if (win) win.location = r.wa; else location.href = r.wa;
      toast('Abrimos el WhatsApp oficial con tu mensaje');
    } catch (e) { if (win) win.close(); toast(e.message); }
    btn.disabled = false;
  };
  setWho(location.hash === '#persona' ? 'persona' : 'marca');
}, 'personalizada');

/* ---------- WhatsApp flotante ---------- */
/* ---------- Cada página nueva empieza arriba; un enlace a la misma página sube suavemente ---------- */
safe(() => {
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if ('scrollRestoration' in history && (!nav || nav.type !== 'back_forward')) history.scrollRestoration = 'manual';
  if (!location.hash && (!nav || nav.type !== 'back_forward')) scrollTo(0, 0);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]'); if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (x) { return; }
    if (u.origin !== location.origin || u.hash) return;
    const same = u.pathname === location.pathname || (u.pathname.replace(/index\.html$/, '') === location.pathname.replace(/index\.html$/, ''));
    if (same && u.search === location.search) { e.preventDefault(); scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); }
  });
}, 'scrolltop');

/* ---------- Envíos: información por estado (los datos vienen del panel) ---------- */
safe(() => {
  const box = $('#stateInfo'); if (!box) return;
  const ST = new Map((D.states || []).map((x) => [x.state, x])), Z = D.zones || [];
  const fee = (z) => (z.fee == null ? (z.cod ? 'Se paga al recibir' : 'Por cotizar') : z.fee === 0 ? 'Sin costo' : money(z.fee));
  const lead = S['orders.lead_time_text'] || '';
  const show = (name) => {
    const st = ST.get(name) || { state: name, zone: 'nacional', eta: '', note: '' };
    let rows = '';
    if (st.zone === 'isla') {
      rows = Z.filter((z) => z.kind === 'isla' || z.kind === 'retiro').map((z) => `<dt>${esc(z.name.replace(/^Delivery · /, ''))}</dt><dd>${esc(fee(z))}${z.freeOver != null ? ` · gratis desde ${esc(money(z.freeOver))}` : ''}${z.eta ? ` · ${esc(z.eta)}` : ''}</dd>`).join('');
    } else {
      const z = Z.find((x) => x.code === st.zone) || Z.find((x) => x.kind === 'nacional');
      const cod = Z.find((x) => x.kind === z?.kind && x.cod && x.code !== z?.code);
      rows = z ? `<dt>Envío</dt><dd>${esc(z.name)}: ${esc(fee(z))}</dd><dt>Llega en</dt><dd>${esc(st.eta || z.eta || 'Te lo confirmamos por WhatsApp')}</dd>${cod ? `<dt>Otra opción</dt><dd>${esc(cod.name)}</dd>` : ''}` : '<dt>Envío</dt><dd>Por cotizar por WhatsApp</dd>';
    }
    box.innerHTML = `<h3>${esc(st.state)}</h3><dl>${rows}<dt>Elaboración</dt><dd>${esc(lead)}, antes del envío</dd></dl>${st.note ? `<p class="si-note">${esc(st.note)}</p>` : ''}<p><a class="textlink" href="${esc(waLink(`Hola THF, quiero saber del envío a ${st.state}.`))}" target="_blank" rel="noopener">Preguntar por WhatsApp</a></p>`;
    $$('.state-btn').forEach((b) => b.setAttribute('aria-pressed', b.dataset.state === name));
  };
  $$('.state-btn').forEach((b) => b.addEventListener('click', () => show(b.dataset.state)));
}, 'states');

/* ---------- Chat de WhatsApp: se escribe aquí y se continúa en el WhatsApp oficial ---------- */
safe(() => {
  const b = $('#waBtn'), p = $('#waPop'); if (!b || !p) return;
  const body = $('#waBody'), form = $('#waForm'), ta = $('#waText');
  const hhmm = () => new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  const open = (o) => { p.hidden = !o; b.setAttribute('aria-expanded', o); b.classList.toggle('on', o); if (o) { $$('.wa-time', p).forEach((t) => { if (!t.textContent) t.textContent = hhmm(); }); setTimeout(() => ta && ta.focus({ preventScroll: true }), 80); } };
  const bubble = (txt, cls) => { const d = document.createElement('div'); d.className = 'wa-msg ' + cls; d.innerHTML = `<p>${esc(txt)}</p><time class="wa-time">${hhmm()}</time>`; body.appendChild(d); body.scrollTop = body.scrollHeight; };
  const send = (txt) => {
    txt = String(txt || '').trim(); if (!txt) return;
    const w = window.open(waLink(txt), '_blank'); // en el mismo clic, para que el navegador no lo bloquee
    if (w) try { w.opener = null; } catch (x) {}
    bubble(txt, 'out');
    setTimeout(() => bubble(w ? 'Te abrimos WhatsApp con tu mensaje listo. Solo tienes que enviarlo.' : 'Toca de nuevo para abrir WhatsApp con tu mensaje.', 'in'), 450);
    if (!w) { const a = document.createElement('a'); a.href = waLink(txt); a.target = '_blank'; a.rel = 'noopener'; a.className = 'wa-open'; a.textContent = 'Abrir WhatsApp'; setTimeout(() => { body.appendChild(a); body.scrollTop = body.scrollHeight; }, 470); }
  };
  b.onclick = () => open(p.hidden);
  $('#waClose').onclick = () => { open(false); b.focus(); };
  $$('[data-wa-q]', p).forEach((q) => q.addEventListener('click', () => send(q.dataset.waQ)));
  form.addEventListener('submit', (e) => { e.preventDefault(); send(ta.value); ta.value = ''; ta.style.height = ''; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); } });
  ta.addEventListener('input', () => { ta.style.height = ''; ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'; });
  $('#waCopy').onclick = () => copy(S['contact.whatsapp_display'], 'Número copiado');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !p.hidden) open(false); });
  document.addEventListener('click', (e) => { if (!p.hidden && !e.target.closest('#waPop,#waBtn')) open(false); });
}, 'wa');

/* ---------- Copiar y compartir (pantalla de pago, cupones, enlaces de afiliadas) ---------- */
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]'); if (c) { e.preventDefault(); copy(c.dataset.copy, c.dataset.copyOk || 'Copiado'); c.classList.add('done'); setTimeout(() => c.classList.remove('done'), 1200); return; }
  const sh = e.target.closest('[data-share]'); if (sh) { e.preventDefault(); const t = sh.dataset.share; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else copy(t, 'Copiado'); }
});

/* ---------- Pantalla de pago: método, datos para copiar y "Ya pagué" con comprobante ---------- */
safe(() => {
  const box = $('#pay'); if (!box) return;
  const code = box.dataset.code, t = box.dataset.t;
  const opts = $$('.pm-opt', box), panels = $$('.pay-panel', box);
  const show = (c) => {
    opts.forEach((o) => o.setAttribute('aria-checked', String(o.dataset.pm === c)));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== c; });
    const p = panels.find((x) => x.dataset.panel === c); if (!p) return;
    const tot = $('#oTotal'), adj = $('#oAdj');
    if (tot) tot.textContent = p.dataset.total;
    if (adj) { adj.hidden = !p.dataset.adj; if (p.dataset.adj) { $('dt', adj).textContent = p.dataset.adjLabel; $('dd', adj).textContent = p.dataset.adj; } }
  };
  let current = (opts.find((o) => o.getAttribute('aria-checked') === 'true') || {}).dataset?.pm;
  opts.forEach((o, i) => {
    o.addEventListener('click', async () => {
      const c = o.dataset.pm; if (c === current) return;
      const prev = current; current = c; show(c);
      try { await post(`/api/orders/${code}/metodo`, { t, pay: c }); } catch (e) { toast(e.message); current = prev; show(prev); }
    });
    o.addEventListener('keydown', (e) => { const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!k) return; e.preventDefault(); const n = opts[(i + k + opts.length) % opts.length]; n.focus(); n.click(); });
  });
  // La foto se reduce en el teléfono antes de subirla (pesa menos y sube más rápido)
  const shrink = (file) => new Promise((res) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900e3) return res(file);
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u); cv.toBlob((b) => res(b ? new File([b], 'captura.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.84); };
    img.onerror = () => res(file); img.src = u;
  });
  panels.forEach((panel) => {
    const done = $('[data-pay-done]', panel), form = $('[data-pay-form]', panel);
    if (!done || !form) return;
    done.onclick = () => { form.hidden = false; done.hidden = true; opts.forEach((o) => (o.disabled = true)); const f = $('input,select', form); f && f.focus(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('.pay-err', form), btn = $('button[type=submit]', form);
      const fail = (m) => { err.hidden = false; err.textContent = m; btn.disabled = false; btn.classList.remove('busy'); };
      const ref = $('[data-ref]', form).value.replace(/[\s.\-#]/g, '');
      if (ref.length < 4) return fail('Escribe la referencia del pago.');
      const bank = $('[data-bank]', form); if (bank && !bank.value) return fail('Elige el banco desde el que pagaste.');
      btn.disabled = true; btn.classList.add('busy'); err.hidden = true;
      const fd = new FormData(form); fd.set('t', t);
      const file = $('[data-proof]', form).files[0];
      if (file) { if (file.size > 12e6) return fail('La captura pesa demasiado.'); fd.set('proof', await shrink(file)); } else fd.delete('proof');
      try {
        const r = await fetch(`/api/orders/${code}/pago`, { method: 'POST', body: fd, credentials: 'same-origin' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return fail(j.error || 'No pudimos enviar tu comprobante. Revisa tu conexión.');
        toast(j.verified ? '¡Pago confirmado!' : 'Recibimos tu comprobante');
        setTimeout(() => location.reload(), 700);
      } catch (x) { fail('No pudimos enviar tu comprobante. Revisa tu conexión.'); }
    };
  });
}, 'pago');

/* ---------- Tienda de aliada: menú por categorías ---------- */
safe(() => {
  const navs = $$('[data-store-nav]'); if (!navs.length) return;
  const cards = $$('.st-card');
  const show = (cat) => {
    cards.forEach((c) => { c.hidden = !!cat && c.dataset.cat !== cat; });
    navs.forEach((n) => $$('a[data-cat]', n).forEach((a) => { if (a.dataset.cat === cat) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }));
  };
  navs.forEach((n) => n.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-cat]'); if (!a) return;
    e.preventDefault(); show(a.dataset.cat); history.replaceState(null, '', a.dataset.cat ? '#' + a.dataset.cat : location.pathname);
    const m = $('#mnav'); if (m && m.classList.contains('open')) { const x = $('#menuClose'); x && x.click(); }
    const g = $('#piezas'); g && g.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && cards.some((c) => c.dataset.cat === h)) show(h);
}, 'tienda-aliada');

/* ---------- Cuenta regresiva de temporadas ---------- */
safe(() => {
  const els = $$('.camp-count[data-ends]'); if (!els.length) return;
  const tick = () => els.forEach((el) => { const ms = Date.parse(el.dataset.ends) - Date.now(); if (ms <= 0) { el.textContent = 'Terminó'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    el.textContent = `Termina en ${d ? d + 'd ' : ''}${h}h ${String(m).padStart(2, '0')}m`; });
  tick(); setInterval(tick, 30000);
}, 'countdown');

/* ---------- Portal de aliadas: ganancia al cambiar el precio ---------- */
safe(() => {
  $$('input[data-cost]').forEach((inp) => inp.addEventListener('input', () => {
    const box = inp.closest('.pt-piece, tr'); const cell = box && $('[data-gain]', box); if (!cell || !inp.dataset.cost) return;
    const v = Math.round(parseFloat(inp.value.replace(',', '.')) * 100); if (!Number.isFinite(v)) return;
    const c = Math.max(+inp.dataset.min, Math.min(+inp.dataset.max, v)); cell.textContent = money(c - Number(inp.dataset.cost));
    inp.closest('.pt-price')?.classList.toggle('warn', v !== c);
  }));
}, 'precios');

/* ---------- Portal de aliadas: editor de su tienda (vista previa en vivo) ---------- */
safe(() => {
  const f = $('[data-store-editor]'); if (!f) return;
  const pv = $('[data-preview]', f);
  const HEX = /^#[0-9a-f]{6}$/i;
  const set = (k, v) => { if (HEX.test(v)) pv.style.setProperty(k === 'bg' ? '--pv-bg' : '--pv-fg', v); };
  $$('[data-sw]', f).forEach((r) => r.addEventListener('change', () => { const k = r.dataset.sw; const c = $(`[data-color="${k}"]`, f); if (c) c.value = r.value.toLowerCase(); set(k, r.value); }));
  $$('[data-color]', f).forEach((c) => c.addEventListener('input', () => { const k = c.dataset.color; $$(`[data-sw="${k}"]`, f).forEach((r) => { r.checked = r.value.toLowerCase() === c.value.toLowerCase(); }); set(k, c.value); }));
  $$('[data-prev]', f).forEach((i) => i.addEventListener('input', () => { const t = $(`[data-prev-${i.dataset.prev}]`, f); if (t) t.textContent = i.value.trim() || i.placeholder; }));
  const ban = $('[data-prev-banner]', f);
  $$('input[name="banner"]', f).forEach((r) => r.addEventListener('change', () => { if (!ban) return; const img = r.closest('label')?.querySelector('img'); ban.hidden = !img; if (img) ban.style.backgroundImage = `url("${img.src}")`; }));
}, 'editor-tienda');

/* ---------- Aparición suave ---------- */
safe(() => { const els = $$('.rv'); if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; } const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.04 }); els.forEach((e) => io.observe(e)); setTimeout(() => els.forEach((e) => e.classList.add('in')), 6000); }, 'reveal');

/* ---------- Cursor ---------- */
safe(() => { if (!matchMedia('(hover:hover) and (pointer:fine)').matches || RM.matches) return; const c = $('#cursor'); if (!c) return; let x = 0, y = 0, cx = 0, cy = 0; addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; c.classList.toggle('big', !!e.target.closest('a,button,select,input,summary,.card,.pcard')); }, { passive: true }); const tick = () => { cx += (x - cx) * 0.2; cy += (y - cy) * 0.2; c.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(tick); }; tick(); }, 'cursor');
})();
