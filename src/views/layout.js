import { fill, html, raw } from '../lib/html.js';
import { FRAG } from './fragments.js';

const LOGO_SQ = (d) => raw(`<svg viewBox="0 0 200 200" aria-label="THF ${d}" role="img"><rect width="100" height="100" fill="#fff"/><text x="50" y="54" text-anchor="middle" dominant-baseline="middle" font-family="Cormorant Garamond, Garamond, serif" font-size="74" fill="#0D0C0B">T</text><rect x="100" width="100" height="100" fill="none" stroke="rgba(255,255,255,.3)"/><text x="150" y="54" text-anchor="middle" dominant-baseline="middle" font-family="Cormorant Garamond, Garamond, serif" font-size="74" fill="#fff">H</text><rect y="100" width="100" height="100" fill="none" stroke="rgba(255,255,255,.3)"/><text x="50" y="154" text-anchor="middle" dominant-baseline="middle" font-family="Cormorant Garamond, Garamond, serif" font-size="74" fill="#fff">F</text><rect x="100" y="100" width="100" height="100" fill="#fff"/><text x="150" y="152" text-anchor="middle" dominant-baseline="middle" font-family="Pinyon Script, cursive" font-size="19" fill="#0D0C0B">${d.replace(/[<>&"]/g, '')}</text></svg>`);

const cur = (page, k) => (page === k ? raw(' aria-current="page"') : '');

const HEX = /^#[0-9a-fA-F]{6}$/;
const THEME_KEYS = ['burdeos', 'marino', 'oliva', 'beige', 'arena', 'oro'];
// Colores del editor de la tienda: solo valores #RRGGBB (nunca CSS libre)
const themeCss = (S) => {
  const v = THEME_KEYS.filter((k) => HEX.test(String(S[`theme.${k}`] || ''))).map((k) => `--${k}:${S[`theme.${k}`]}`);
  return v.length ? raw(`<style>:root{${v.join(';')}}</style>`) : '';
};

function mainHeader({ S, d, page, cols, campaign }) {
  return html`<div class="announce">${S['store.announcement'] ? (S['store.announcement_link'] ? html`<a href="${S['store.announcement_link']}">${S['store.announcement']}</a>` : S['store.announcement']) : raw('Hecho a mano <b>bajo pedido</b> · Cadenas con baño de oro 18k · Envíos a toda Venezuela')}</div>
${campaign && page !== 'temporada' ? html`<a class="camp-bar t-${campaign.theme}" href="${campaign.url}"><b>${campaign.title}</b><span>${campaign.text}</span>${campaign.countdown ? html`<span class="camp-count" data-ends="${campaign.endsAt}"></span>` : ''}<em>${campaign.cta || 'Ver'} →</em></a>` : ''}
<header class="nav" id="nav"${page !== 'home' ? raw(' data-static') : ''}>
  <div class="wrap">
    <a class="nav-logo" href="/" aria-label="${S['brand.name']} ${d}, inicio">
      <svg viewBox="0 0 250 40" aria-hidden="true"><rect x="0" y="4" width="96" height="32" fill="currentColor"/><text x="48" y="21.5" text-anchor="middle" dominant-baseline="middle" font-family="Cormorant Garamond, Garamond, serif" font-size="22" letter-spacing="9" class="ink">THF</text><text x="108" y="25" font-family="Pinyon Script, cursive" font-size="27" fill="currentColor">${d}</text></svg>
    </a>
    <ul class="nav-links">
      <li class="has-menu"><button class="nav-menu-btn" aria-expanded="false" aria-controls="colMenu"${cur(page, 'coleccion')}>Colecciones</button>
        <div class="mega" id="colMenu"><div class="mega-in">
          ${cols.map((c) => html`<a class="mega-card t-${c.theme}" href="${c.url}"><span class="mega-img">${c.card ? html`<img src="${c.card}" alt="" loading="lazy">` : ''}</span><span class="mega-txt"><small>${c.kicker}</small><b>${c.name}</b><em>${c.tagline}</em></span></a>`)}
          <a class="mega-card mega-map" href="/#bitacora"><span class="mega-img"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#rose"/></svg></span><span class="mega-txt"><small>Mapa</small><b>La Bitácora</b><em>los lugares de la isla</em></span></a>
        </div></div>
      </li>
      <li><a href="/catalogo"${cur(page, 'catalogo')}>Catálogo</a></li>
      <li><a href="/compra-el-look"${cur(page, 'looks')}>Compra el look</a></li>
      <li><a href="/caja-de-joyeria"${cur(page, 'caja')}>Caja de joyería</a></li>
      <li><a href="/joyeria-personalizada"${cur(page, 'personalizada')}>Personalizada</a></li>
      <li><a href="/programas"${cur(page, 'programas')}>Programas</a></li>
    </ul>
    <div class="nav-actions">
      <a class="btn btn-ghost nav-cta" href="/programas">Gana con THF</a>
      <a class="acct-btn" href="/cuenta" aria-label="Mi cuenta" rel="nofollow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"/></svg></a>
      <button class="cart-btn" id="cartBtn" aria-label="Abrir carrito"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg><span class="cart-count" id="cartCount" data-n="0">0</span></button>
      <button class="menu-btn" id="menuBtn" aria-label="Abrir menú"><span></span><span></span></button>
    </div>
  </div>
</header>
<nav class="mnav" id="mnav" aria-label="Menú móvil">
  <button class="close" id="menuClose">Cerrar ✕</button>
  <a href="/">Inicio</a>
  <details class="mnav-cols"><summary>Colecciones</summary>${cols.map((c) => html`<a href="${c.url}">${c.name}</a>`)}<a href="/#bitacora">La Bitácora</a></details>
  <a href="/catalogo">Catálogo</a><a href="/compra-el-look">Compra el look</a><a href="/caja-de-joyeria">Caja de joyería</a><a href="/joyeria-personalizada">Personalizada</a><a href="/programas">Programas</a><a href="/envios-venezuela">Envíos</a><a href="/guias">Guías y ebooks</a><a href="/cuenta" rel="nofollow">Mi cuenta</a>
  <a class="btn btn-gold" href="/programas" style="font-size:var(--t-xs);align-self:flex-start;margin-top:20px">Quiero ser embajadora o emprendedora</a>
</nav>
`;
}

function mainFooter({ S, d, cols, isDemoWa, ig }) {
  return html`<footer class="footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">${LOGO_SQ(d)}<p>${S['brand.tagline']}. Joyería artesanal hecha a mano en la Isla de Margarita, Venezuela, con cadenas con baño de oro 18k.</p></div>
      <div><h2 class="fh">Colecciones</h2><ul>${cols.map((c) => html`<li><a href="${c.url}">${c.name}</a></li>`)}<li><a href="/#bitacora">La Bitácora</a></li></ul></div>
      <div><h2 class="fh">Tienda</h2><ul><li><a href="/catalogo">Catálogo completo</a></li><li><a href="/compra-el-look">Compra el look</a></li><li><a href="/caja-de-joyeria">Caja de joyería</a></li><li><a href="/joyeria-personalizada">Joyería personalizada</a></li><li><a href="/guias">Guías y ebooks</a></li><li><a href="/joyeria-en-margarita">Joyería en Margarita</a></li><li><a href="/envios-venezuela">Envíos a toda Venezuela</a></li><li><a href="/preguntas-frecuentes">Preguntas frecuentes</a></li><li><a href="/cuenta" rel="nofollow">Mi cuenta y mis pedidos</a></li></ul></div>
      <div><h2 class="fh">Programas</h2><ul><li><a href="/programas#embajadoras">Embajadoras</a></li><li><a href="/programas#emprendedoras">Emprendedoras</a></li><li><a href="/programas#test">¿Cuál es para mí?</a></li><li><a href="/afiliadas" rel="nofollow">Portal de afiliadas</a></li></ul></div>
      <div><h2 class="fh">Contacto</h2><ul><li>WhatsApp oficial<br><span class="fv">${S['contact.whatsapp_display']}</span>${isDemoWa ? raw(' <span class="demo">demo</span>') : ''}</li>${ig ? html`<li>Instagram<br><a class="fv" href="https://www.instagram.com/${ig}/" rel="noopener">${S['contact.instagram']}</a></li>` : ''}${S['contact.email'] ? html`<li>Correo<br><span class="fv">${S['contact.email']}</span></li>` : ''}</ul></div>
    </div>
    <div class="footer-warn"><svg width="22" viewBox="0 0 24 24" fill="none" stroke="var(--oro-claro)" stroke-width="1.2" aria-hidden="true"><path d="M12 3l9 16H3L12 3z"/><path d="M12 10v4M12 17v.5"/></svg><p><b>${S['checkout.mode'] === 'whatsapp' ? 'Los pedidos a THF se pagan solo por el WhatsApp oficial.' : 'Los pedidos a THF se pagan solo a THF, con los datos de la pantalla de tu pedido o por el WhatsApp oficial.'}</b> Nunca pagues un pedido de THF a una persona, a una embajadora ni a una emprendedora.</p></div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${S['brand.name']} ${d} · ${S['local.locality'] || 'Isla de Margarita'}, ${S['local.region'] || 'Nueva Esparta'}, Venezuela · Envíos a todo el país</span><span><a href="/llms.txt">Resumen para asistentes de IA</a> · <a href="/sitemap.xml">Mapa del sitio</a>${credit(S)}</span></div>
  </div>
</footer>`;
}

function storeFooter(st, S, d) {
  return html`<footer class="footer st-footer"><div class="wrap">
  <div class="st-foot"><div><p class="st-foot-name">${st.title}</p><p>${st.bio || `Joyería hecha a mano por ${S['brand.name']} en la Isla de Margarita, Venezuela, con cadenas con baño de oro 18k.`}</p></div>
  <div><h2 class="fh">Compra segura</h2><p>${S['brand.name']} elabora tu pedido, lo cobra y lo envía. Paga solo con los datos oficiales de ${S['brand.name']} que ves en la pantalla de tu pedido o por su WhatsApp oficial (${S['contact.whatsapp_display']}). ${st.owner} no recibe pagos.</p></div>
  <div><h2 class="fh">Ayuda</h2><ul><li><a href="/envios-venezuela">Envíos a toda Venezuela</a></li><li><a href="/preguntas-frecuentes">Preguntas frecuentes</a></li><li><a href="/cuenta" rel="nofollow">Mi cuenta y mis pedidos</a></li></ul></div></div>
  <div class="footer-bottom"><span>Tienda aliada de ${S['brand.name']} ${d} · Isla de Margarita, Venezuela</span><span><a href="/">Conoce ${S['brand.name']}</a>${credit(S)}</span></div>
</div></footer>`;
}

// Cabecera de la tienda de una aliada: su nombre, su menú de categorías y el carrito (sin el menú de la tienda principal)
function storeHeader(st, S) {
  return html`<div class="announce st-announce">Tienda aliada de ${S['brand.name']} · joyería hecha a mano en Margarita · ${S['brand.name']} elabora, cobra y envía</div>
<header class="nav st-nav" id="nav" data-static>
  <div class="wrap">
    <a class="st-logo" href="${st.home}"><b>${st.title}</b><small>${st.subtitle || `joyería ${S['brand.name']}`}</small></a>
    <ul class="nav-links st-cats" data-store-nav>${st.cats.length > 1 ? html`<li><a href="${st.home}#piezas" data-cat="" aria-current="true">Todo</a></li>` : ''}${st.cats.map((c) => html`<li><a href="${st.home}#${c.slug}" data-cat="${c.slug}">${c.name}</a></li>`)}</ul>
    <div class="nav-actions">
      <button class="cart-btn" id="cartBtn" aria-label="Abrir carrito"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg><span class="cart-count" id="cartCount" data-n="0">0</span></button>
      <button class="menu-btn" id="menuBtn" aria-label="Abrir menú"><span></span><span></span></button>
    </div>
  </div>
</header>
<nav class="mnav" id="mnav" aria-label="Menú de la tienda" data-store-nav>
  <button class="close" id="menuClose">Cerrar ✕</button>
  <a href="${st.home}#piezas" data-cat="">Todo</a>${st.cats.map((c) => html`<a href="${st.home}#${c.slug}" data-cat="${c.slug}">${c.name}</a>`)}
  <a href="/envios-venezuela">Envíos</a><a href="/preguntas-frecuentes">Preguntas frecuentes</a>
</nav>
`;
}

// Crédito de la agencia (Ajustes → Marca). Solo enlaces https; abre en otra pestaña sin pasar datos de la tienda.
const credit = (S) => {
  const t = String(S['footer.credit_text'] || '').trim();
  if (!t) return '';
  const u = String(S['footer.credit_url'] || '').trim();
  return /^https:\/\/[^\s<>"]+$/.test(u) ? html` · <a class="credit" href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>` : html` · <span class="credit">${t}</span>`;
};

export function layout({ page, seo, S, cols, body, data, nonce, assetV = '1', campaign = null, store = null }) {
  const d = S['brand.descriptor'] || 'Accesorios';
  const isDemoWa = String(S['contact.whatsapp_display'] || '').endsWith('000 0000');
  const ig = String(S['contact.instagram'] || '').replace('@', '');
  return html`<!doctype html>
<html lang="es-VE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${seo.title}</title>
<meta name="description" content="${seo.desc}">
<link rel="canonical" href="${seo.canonical}">
<link rel="alternate" hreflang="es-VE" href="${seo.canonical}">
<link rel="alternate" hreflang="x-default" href="${seo.canonical}">
<meta name="geo.region" content="${S['local.region_code'] || 'VE-O'}">
<meta name="geo.placename" content="${S['local.locality'] || 'Isla de Margarita'}, ${S['local.region'] || 'Nueva Esparta'}, Venezuela">
${S['local.lat'] && S['local.lon'] ? html`<meta name="geo.position" content="${S['local.lat']};${S['local.lon']}"><meta name="ICBM" content="${S['local.lat']}, ${S['local.lon']}">` : ''}
${seo.noindex ? raw('<meta name="robots" content="noindex">') : ''}
<meta name="theme-color" content="#F3EBE1">
<meta property="og:type" content="${page === 'pieza' ? 'product' : 'website'}">
<meta property="og:locale" content="es_VE">
<meta property="og:site_name" content="${S['brand.name']} ${d}">
<meta property="og:title" content="${seo.title}">
<meta property="og:description" content="${seo.desc}">
<meta property="og:url" content="${seo.canonical}">
<meta property="og:image" content="${seo.og}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;500&family=Pinyon+Script&display=swap">
<link rel="stylesheet" href="/css/thf.css?v=${assetV}">
${themeCss(S)}
${store ? raw(`<style>${store.css}</style>`) : ''}
<link rel="alternate" type="text/plain" title="Resumen para asistentes de IA" href="/llms.txt">
${S['seo.google_verification'] ? html`<meta name="google-site-verification" content="${S['seo.google_verification']}">` : ''}${S['seo.bing_verification'] ? html`<meta name="msvalidate.01" content="${S['seo.bing_verification']}">` : ''}
${raw(seo.jsonld || '')}
</head>
<body data-page="${page}"${store ? raw(' class="is-store"') : ''}>
${page === 'home' ? fill(FRAG.splash, { descriptor: d }) : ''}
<a class="skip" href="#contenido">Saltar al contenido</a>
${store ? storeHeader(store, S) : mainHeader({ S, d, page, cols, campaign })}
<main id="contenido">
${body}
</main>
${store ? storeFooter(store, S, d) : mainFooter({ S, d, cols, isDemoWa, ig })}
${fill(FRAG.tail, { wa: S['contact.whatsapp_display'], waDemo: isDemoWa ? raw(' <span class="demo">demo</span>') : '', brand: `${S['brand.name']} ${d}`,
  chatStatus: S['chat.status'] || 'WhatsApp oficial', greeting: S['chat.greeting'] || '¿En qué te ayudamos?',
  quick: String(S['chat.quick_replies'] || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6).map((q) => html`<button type="button" class="wa-chip" data-wa-q="${q}">${q}</button>`) })}
<script type="application/json" id="thf-data">${raw(JSON.stringify(data).replace(/</g, '\\u003c'))}</script>
<script src="/js/thf.js?v=${assetV}" defer></script>
</body>
</html>`;
}
