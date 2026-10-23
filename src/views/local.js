// Páginas de contenido para SEO local y nacional: Joyería en Margarita, Envíos a toda Venezuela y Preguntas frecuentes.
// El texto viene de la tabla pages (editable en el panel); tarifas, zonas y pagos salen de sus tablas, nunca del texto.
import { esc, html, raw } from '../lib/html.js';
import { money } from '../lib/pricing.js';
import { fillTokens, lines } from '../lib/seo.js';
import { crumbsNav } from './parts.js';

const STATES = ['Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico',
  'La Guaira', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Yaracuy', 'Zulia'];

// Texto simple a HTML seguro: "## " = subtítulo, "1. " = lista numerada, el resto = párrafos
export function richText(text, S) {
  const out = [];
  let ol = [];
  const flush = () => { if (ol.length) { out.push(`<ol class="steps-list">${ol.map((li) => `<li>${esc(li)}</li>`).join('')}</ol>`); ol = []; } };
  for (const raw0 of fillTokens(text, S).split('\n')) {
    const l = raw0.trim();
    if (!l) { flush(); continue; }
    const m = l.match(/^\d+\.\s+(.*)$/);
    if (m) { ol.push(m[1]); continue; }
    flush();
    if (l.startsWith('## ')) out.push(`<h2>${esc(l.slice(3))}</h2>`);
    else out.push(`<p>${esc(l)}</p>`);
  }
  flush();
  return raw(out.join(''));
}

export const parseFaq = (pg, S) => {
  try {
    return (JSON.parse(pg.faq || '[]') || []).filter((x) => Array.isArray(x) && x[0] && x[1]).map(([q, a]) => [fillTokens(q, S), fillTokens(a, S)]);
  } catch {
    return [];
  }
};

const faqBlock = (faq, title = 'Preguntas frecuentes') => (faq.length ? html`<section class="lp-faq" aria-label="${title}"><h2>${title}</h2>
  ${faq.map(([q, a], i) => html`<details class="qa"${i === 0 ? raw(' open') : ''}><summary>${q}</summary><p>${a}</p></details>`)}</section>` : '');

const fee = (z) => (z.fee == null ? (z.cod ? 'Se paga en destino' : 'Por cotizar') : z.fee === 0 ? 'Sin costo' : money(z.fee));
const zoneTable = (zs, caption) => html`<div class="lp-table-wrap"><table class="lp-table"><caption>${caption}</caption>
  <thead><tr><th scope="col">Zona</th><th scope="col">Costo</th><th scope="col">Gratis desde</th><th scope="col">Tiempo de entrega</th></tr></thead>
  <tbody>${zs.map((z) => html`<tr><th scope="row">${z.name.replace(/^Delivery · /, '')}</th><td>${fee(z)}</td><td>${z.freeOver != null ? money(z.freeOver) : '—'}</td><td>${z.eta || '—'}</td></tr>`)}</tbody></table></div>`;

const head = (pg, url, S, kicker) => html`<section class="page-head lp-head" aria-label="${pg.heading || pg.title}"><div class="wrap">
  ${crumbsNav([['Inicio', '/'], [pg.title, url]])}
  <p class="eyebrow">${kicker}</p>
  <h1>${pg.heading || pg.title}</h1>
  ${pg.intro ? html`<p class="lede">${fillTokens(pg.intro, S)}</p>` : ''}
</div></section>`;

const chips = (items) => html`<ul class="lp-chips">${items.map((n) => html`<li>${n}</li>`)}</ul>`;

export function localView({ S, pg, zones, places, faq }) {
  const island = zones.filter((z) => z.kind === 'isla' || z.kind === 'retiro');
  return html`${head(pg, '/joyeria-en-margarita', S, `${S['local.region'] || 'Nueva Esparta'} · Venezuela`)}
<section class="wrap lp-body">
  <div class="lp-text">${richText(pg.body, S)}</div>
  <aside class="lp-side">
    <h2>Delivery en la isla</h2>
    ${zoneTable(island, 'Costos de entrega en la Isla de Margarita')}
    <h3>Llegamos a</h3>${chips(lines(S['local.island_areas']))}
    <p class="lp-cta"><a class="btn btn-solid" href="/catalogo">Ver el catálogo <span class="arr"></span></a><a class="btn btn-ghost" href="/ir/whatsapp">Escribir por WhatsApp</a></p>
  </aside>
</section>
${places.length ? html`<section class="lp-places" aria-label="Lugares de Margarita"><div class="wrap">
  <div class="sec-h"><div class="t"><p class="eyebrow">Alisios de Margarita</p><h2>Cada lugar, <span class="script">su pieza</span></h2></div><p>Las piezas de la colección cápsula llevan el nombre del lugar de la isla que las inspira.</p></div>
  <div class="lp-places-grid">${places.map((pl) => html`<a class="lp-place" href="/#lugar-${pl.slug}">${pl.photo ? html`<img src="${pl.photo}" alt="${pl.name}, Isla de Margarita" loading="lazy">` : ''}<span><small>${pl.dirName}</small><b>${pl.name}</b><em>${pl.products.length ? `${pl.products.length} ${pl.products.length === 1 ? 'pieza' : 'piezas'}` : 'Próximamente'}</em></span></a>`)}</div>
</div></section>` : ''}
<section class="wrap">${faqBlock(faq, 'Preguntas sobre Margarita')}</section>
<div style="height:clamp(50px,8vh,100px)"></div>`;
}

export function shippingView({ S, pg, zones, pays, faq, states }) {
  return html`${head(pg, '/envios-venezuela', S, 'Desde la Isla de Margarita')}
<section class="wrap lp-body">
  <div class="lp-text">${richText(pg.body, S)}</div>
  <aside class="lp-side">
    <h2>Costos y tiempos</h2>
    ${zoneTable(zones, 'Envíos en Margarita y al resto de Venezuela')}
    <p class="note">Al tiempo de entrega se suma la elaboración bajo pedido: ${S['orders.lead_time_text']}.</p>
    <h3>Formas de pago</h3>${chips(pays.map((p) => p.name))}
  </aside>
</section>
<section class="lp-states" aria-label="Estados de Venezuela"><div class="wrap">
  <div class="sec-h"><div class="t"><p class="eyebrow">Toda Venezuela</p><h2>Llegamos <span class="script">a tu estado</span></h2></div><p>Toca tu estado para ver el costo y el tiempo de envío.</p></div>
  <ul class="state-picker" aria-label="Elige tu estado">${(states.length ? states.map((x) => x.state) : STATES).map((st) => html`<li><button type="button" class="state-btn" data-state="${st}" aria-pressed="false" aria-controls="stateInfo">${st}</button></li>`)}</ul>
  <div class="state-info" id="stateInfo" aria-live="polite"><p>Elige tu estado y te mostramos cómo llega tu pedido, cuánto cuesta el envío y cuánto tarda.</p></div>
  <div class="lp-cols"><div><h3>El oriente</h3>${chips(lines(S['local.region_areas']))}</div><div><h3>Ciudades a las que más enviamos</h3>${chips(lines(S['local.national_cities']))}</div></div>
  <p class="lp-cta"><a class="btn btn-solid" href="/catalogo">Elegir mis piezas <span class="arr"></span></a><a class="btn btn-ghost" href="/caja-de-joyeria">Caja de joyería para revender</a></p>
</div></section>
<section class="wrap">${faqBlock(faq, 'Preguntas sobre envíos')}</section>
<div style="height:clamp(50px,8vh,100px)"></div>`;
}

export function faqView({ S, pg, faq }) {
  return html`${head(pg, '/preguntas-frecuentes', S, 'THF · Isla de Margarita')}
<section class="wrap lp-faq-page">${pg.body ? html`<div class="lp-text">${richText(pg.body, S)}</div>` : ''}${faqBlock(faq, 'Todas las preguntas')}
  <p class="lp-cta"><a class="btn btn-solid" href="/ir/whatsapp">¿Otra duda? Escríbenos <span class="arr"></span></a><a class="btn btn-ghost" href="/envios-venezuela">Envíos a toda Venezuela</a></p>
</section>
<div style="height:clamp(50px,8vh,100px)"></div>`;
}

// Franja del inicio: isla, región y país
export function coverageStrip(S) {
  const isl = lines(S['local.island_areas']).slice(0, 6), reg = lines(S['local.region_areas']).slice(0, 4), nat = lines(S['local.national_cities']).slice(0, 6);
  return html`<section class="coverage" aria-label="Dónde entregamos"><div class="wrap">
  <div class="sec-h"><div class="t"><p class="eyebrow">De la isla a todo el país</p><h2>Hecha en Margarita, <span class="script">enviada a toda Venezuela</span></h2></div></div>
  <div class="cov-grid">
    <a class="cov" href="/joyeria-en-margarita"><small>La isla</small><b>Delivery en Margarita</b><span>${isl.join(' · ')} y más</span><em>Ver zonas y costos →</em></a>
    <a class="cov" href="/envios-venezuela"><small>El oriente</small><b>Nueva Esparta y la región</b><span>Coche, ${reg.join(' · ')}</span><em>Ver envíos →</em></a>
    <a class="cov" href="/envios-venezuela"><small>Nacional</small><b>Envíos a toda Venezuela</b><span>${nat.join(' · ')}</span><em>Ver envíos →</em></a>
  </div>
</div></section>`;
}
