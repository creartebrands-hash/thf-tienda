import { fill, html, paras, raw } from '../lib/html.js';
import { money } from '../lib/pricing.js';
import { FRAG } from './fragments.js';
import { card, colorPicker, crumbsNav, lookBoard, pcard, price } from './parts.js';
import { coverageStrip } from './local.js';

const PATTERN = ['s-a', 's-b', 's-c', 's-d', 's-e'];
const GIRLS = ['gummy-star', 'confeti-cream', 'primavera-cookie', 'arcoiris'];

// ---------------------------------------------------------------- inicio
export function homeView({ S, cat, featured, box }) {
  const places = cat.places;
  const cols = cat.visibleCollections;
  const boxVals = box ? { boxUnit: money(box.unit).replace(',00', ''), boxPrice: money(box.price), boxOff: box.offPct, boxPer: money(box.perPiece) } : {};
  return html`
${fill(FRAG.home_hero, { tagline: S['brand.tagline'] })}
<section class="bitacora" id="bitacora" data-dir="${places[0]?.dir || 'O'}" aria-label="La Bitácora">
  <div class="bita-head">
    <h2>La Bitácora <span class="script">de los cuatro vientos</span></h2>
    <p>Sigue la brújula por ${places.length} lugares de la isla, de oeste a sur. Cada lugar tiene sus propias piezas.</p>
  </div>
  <div class="bita-track" id="bitaTrack" style="--n:${places.length}">
    <div class="bita-stage">
      <div class="map-wrap">
        <svg id="map" viewBox="30 70 1060 700" role="img" aria-label="Mapa de Margarita, Coche y Cubagua con la ruta por ${places.length} lugares">
          <defs><pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" class="map-hatch"/></pattern></defs>
          <g id="mapIslands"></g><path id="routeGhost" class="map-route-ghost"/><path id="route" class="map-route"/><g id="mapLabels"></g><g id="mapStops"></g>
          <g id="compass" class="map-compass"><circle r="34" style="fill:var(--bg)" stroke="currentColor" stroke-width="1"/><use href="#rose" x="-30" y="-30" width="60" height="60"/></g>
        </svg>
        <div class="map-coords"><span id="coordName">${places[0] ? `${places[0].dirName} · ${places[0].name}` : ''}</span><span id="coordVal">${places[0]?.coords || ''}</span></div>
      </div>
      <div class="chapters" id="chapters">
        ${places.map((pl, i) => html`<article class="chapter${i === 0 ? ' on' : ''}" data-i="${i}" data-dir="${pl.dir}" id="lugar-${pl.slug}">
          <p class="eyebrow"><b>${pl.dir}</b> ${pl.dirName} · ${pl.name} <span class="ch-n">${String(i + 1).padStart(2, '0')} / ${String(places.length).padStart(2, '0')}</span></p>
          <h3>${pl.title}<span class="script">${pl.subtitle}</span></h3>
          <div class="chapter-body">${pl.photo ? html`<div class="chapter-photo"><img src="${pl.photo}" alt="${pl.name}" loading="lazy"></div>` : ''}<p>${pl.story}</p></div>
          <div class="chapter-pieces">${pl.products.map((p) => html`<a class="piece-chip" href="${p.url}" data-open="${p.slug}"><img src="${p.img.main}" alt="" loading="lazy"><span>${p.name}<small class="pc-price">${money(p.unit)}</small><small>Ver pieza →</small></span></a>`)}${cat.looks.filter((lk) => lk.placeSlug === pl.slug).map((lk) => html`<a class="piece-chip look-chip" href="/compra-el-look#${lk.slug}"><img src="${lk.photo}" alt="" loading="lazy"><span>Look ${lk.name}<small class="pc-price">${lk.items.length} piezas · ${money(lk.price)}</small><small>Comprar el look →</small></span></a>`)}${!pl.products.length ? html`<p class="ch-soon">Piezas de este lugar, muy pronto.</p>` : ''}</div>
        </article>`)}
      </div>
      <div class="bita-nav" aria-label="Lugares de la Bitácora"><button type="button" class="bita-arrow" data-bita-step="-1" aria-label="Lugar anterior"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="bita-dots">${places.map((pl, i) => html`<button type="button" data-bita-go="${i}" aria-label="${pl.name}"${i === 0 ? raw(' aria-current="true"') : ''}></button>`)}</div>
        <span class="bita-count" aria-live="polite"><b data-bita-n>01</b> / ${String(places.length).padStart(2, '0')}</span>
        <button type="button" class="bita-arrow" data-bita-step="1" aria-label="Lugar siguiente"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>
    </div>
    <div class="bita-progress" aria-hidden="true">${['O', 'N', 'E', 'S'].map((d) => html`<span data-dir="${d}"${places[0]?.dir === d ? raw(' class="on"') : ''}>${d}</span>`)}</div>
  </div>
</section>

<section class="colls" id="colecciones" aria-label="Colecciones">
  <div class="wrap">
    <div class="sec-h rv"><div class="t"><p class="eyebrow">${cols.length} colecciones</p><h2>Nuestras <span class="script">colecciones</span></h2></div><p>Una casa, cuatro historias. Todas hechas a mano en Margarita, con cadenas con baño de oro 18k.</p></div>
    <div class="colls-grid">
      ${cols.map((c, i) => html`<a class="coll t-${c.theme} coll-${i + 1}${c.slug === 'candy-girl' ? ' coll-candy' : ''}" href="${c.url}">
        <span class="coll-img">${c.card ? html`<img src="${c.card}" alt="" loading="lazy">` : ''}</span>
        <span class="coll-txt"><small>${c.kicker}${c.audience ? ` · ${c.audience}` : ''}</small><b>${c.name}</b><em>${c.tagline}</em><span class="coll-intro">${c.intro}</span><span class="coll-more">${c.count} piezas <span class="arr"></span></span></span>
        ${c.slug === 'candy-girl' ? html`<span class="coll-girls" aria-hidden="true">${GIRLS.map((g) => html`<img src="/media/seed/cg-${g}-nina.webp" alt="" loading="lazy">`)}</span>` : ''}
      </a>`)}
    </div>
  </div>
</section>

<section class="coleccion" id="coleccion" aria-label="Piezas destacadas">
  <div class="wrap">
    <div class="col-head rv"><h2>Alisios <span class="script">de</span> Margarita</h2><p>Una selección de la colección cápsula, hecha a mano bajo pedido. Pasa el cursor para ver cada pieza de cerca.</p></div>
    <div class="col-links"><nav aria-label="Categorías del catálogo"><a href="/catalogo#collares">Collares</a><a href="/catalogo#pulseras">Pulseras</a><a href="/catalogo#sets">Sets y conjuntos</a><a href="/catalogo#ofertas">Ofertas</a></nav><a class="textlink" href="/coleccion/alisios-de-margarita">Ver toda la colección</a></div>
    <div class="grid" id="featured">${featured.map((p, i) => card(p, S, PATTERN[i % 5], i))}</div>
    <div class="col-cta rv"><span class="big">${cat.listed.length}</span><div><h3>piezas en el catálogo</h3><p>Busca por colección, piedra, lugar o precio.</p></div><a class="btn btn-solid" href="/catalogo">Ver el catálogo completo <span class="arr"></span></a></div>
  </div>
</section>

${cat.looks.length ? html`<section class="looks-teaser" aria-label="Compra el look">
  <div class="wrap">
    <div class="sec-h rv"><div class="t"><p class="eyebrow">Sets para combinar</p><h2>Compra <span class="script">el look</span></h2></div><p>Varios sets que quedan bien juntos. Llévate el look completo con descuento o elige solo las piezas que quieras.</p></div>
    <div class="looks-stage" data-looks>${lookBoard(cat.looks[0], 0, cat.looks.length)}</div>
    <div class="looks-more"><a class="btn btn-ghost" href="/compra-el-look">Ver los ${cat.looks.length} looks <span class="arr"></span></a></div>
  </div>
</section>` : ''}

${fill(FRAG.home_invite, boxVals)}
${coverageStrip(S)}
${fill(FRAG.home_after, { lead: S['orders.lead_time_text'] })}`;
}

// ---------------------------------------------------------------- catálogo
export function catalogView({ S, cat }) {
  return html`
<section class="page-head cat-head" aria-label="Catálogo">
  <div class="wrap">
    ${crumbsNav([['Inicio', '/'], ['Catálogo', '/catalogo']])}
    <h1>Catálogo <span class="script">hecho a mano, bajo pedido</span></h1>
    <p>Todas las piezas de THF en un solo lugar: ${cat.visibleCollections.map((c) => c.name).join(', ')}. Filtra por colección, categoría, piedra, lugar o precio.</p>
  </div>
  <div class="wrap"><div class="ctabs" id="colTabs" role="group" aria-label="Colecciones">
    <button class="ctab" data-col="" aria-pressed="true">Todas <i>${cat.listed.length}</i></button>
    ${cat.visibleCollections.map((c) => html`<button class="ctab" data-col="${c.slug}" aria-pressed="false">${c.name} <i>${c.count}</i></button>`)}
  </div></div>
</section>
<div class="toolbar">
  <div class="wrap">
    <label class="search" for="fSearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg><span class="sr">Buscar</span><input id="fSearch" type="search" placeholder="Buscar pieza, piedra o lugar" autocomplete="off"></label>
    <div class="chips" id="catChips" role="group" aria-label="Categoría">
      <button class="chip" data-cat="" aria-pressed="true">Todas</button><button class="chip" data-cat="collares" aria-pressed="false">Collares</button><button class="chip" data-cat="pulseras" aria-pressed="false">Pulseras</button><button class="chip" data-cat="sets" aria-pressed="false">Sets y conjuntos</button><button class="chip" data-cat="cajas" aria-pressed="false">Cajas</button>
    </div>
    <div class="tools">
      <button class="tbtn" id="filterBtn" aria-expanded="false" aria-controls="filterPanel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filtros <b id="filterCount"></b></button>
      <label class="sr" for="fSort">Ordenar</label>
      <select class="sortsel" id="fSort"><option value="destacados">Destacados</option><option value="precio_asc">Menor precio</option><option value="precio_desc">Mayor precio</option><option value="nombre">Nombre A–Z</option></select>
    </div>
  </div>
  <div class="filter-panel" id="filterPanel"><div><div class="wrap fp-grid">
    <div class="field"><label for="fStone">Piedra o material</label><select id="fStone"><option value="">Todas</option></select></div>
    <div class="field"><label for="fPlace">Lugar de la isla</label><select id="fPlace"><option value="">Toda la isla</option></select></div>
    <div class="field"><label for="fDir">Punto cardinal</label><select id="fDir"><option value="">Los cuatro</option><option value="O">Oeste</option><option value="N">Norte</option><option value="E">Este</option><option value="S">Sur</option></select></div>
    <div class="range-row"><label for="fMax">Precio máximo <output id="fMaxO"></output></label><input type="range" id="fMax" min="5" step="1"><label class="fp-check" for="fOffer"><input type="checkbox" id="fOffer"> Solo ofertas</label></div>
    <button class="btn btn-solid" id="filterDone" type="button">Ver piezas</button>
  </div></div></div>
</div>
<section class="wrap" aria-label="Piezas">
  <div class="results-bar"><span id="resultCount" aria-live="polite">${cat.listed.length} piezas</span><div class="afilters" id="activeFilters"></div></div>
  <div class="cat-grid" id="catGrid">${cat.listed.map((p) => pcard(p, S))}</div>
  <div class="more" id="moreWrap" hidden><span id="moreTxt"></span><button class="btn btn-ghost" id="moreBtn">Mostrar más piezas</button></div>
  <div class="cat-note">
    <div><h2 class="h4">Bajo pedido</h2><p>Elaboramos tu pieza a mano en ${S['orders.lead_time_text']}.</p></div>
    <div><h2 class="h4">Precio al mayor</h2><p>Se aplica en el carrito desde ${S['orders.wholesale_min_pieces']} piezas sueltas.</p></div>
    <div><h2 class="h4">Pago seguro</h2><p>Pagas solo a THF, por el WhatsApp oficial. Nunca a una persona.</p></div>
  </div>
</section>
<div style="height:clamp(60px,10vh,120px)"></div>`;
}

// ---------------------------------------------------------------- colección
export function collectionView({ S, col, prods, groups, looks, others }) {
  const isCandy = col.slug === 'candy-girl', isRel = col.slug === 'linea-religiosa';
  const grid = (list) => html`<div class="cat-grid">${list.map((p) => pcard(p, S))}</div>`;
  return html`
<section class="col-hero t-${col.theme}" aria-label="${col.name}">
  <div class="wrap col-hero-in">
    <div class="col-hero-copy">
      ${crumbsNav([['Inicio', '/'], ['Colecciones', '/catalogo'], [col.name, col.url]])}
      <p class="eyebrow">${col.kicker}${col.audience ? ` · ${col.audience}` : ''}</p>
      <h1>${col.name}<span class="script">${col.tagline}</span></h1>
      <p class="lede">${col.intro}</p>
      <p class="col-meta"><span>${col.count} piezas</span><span>Baño de oro 18k</span><span>Hecho a mano bajo pedido</span>${isRel ? html`<span>Cada set ${money(prods[0]?.unit || 0)}</span>` : ''}</p>
      <a class="btn ${col.theme === 'arena' || col.theme === 'rosa' ? 'btn-solid' : 'btn-gold'}" href="#piezas">Ver las piezas <span class="arr"></span></a>
    </div>
    ${isCandy ? html`<div class="col-hero-girls" aria-hidden="true">${GIRLS.map((g) => html`<img src="/media/seed/cg-${g}-nina.webp" alt="" loading="lazy">`)}</div>`
    : html`<figure class="col-hero-media">${col.hero ? html`<img src="${col.hero}" alt="${col.name}" fetchpriority="high">` : ''}<span class="col-hero-checker" aria-hidden="true"><i></i><i></i><i></i><i></i></span></figure>`}
  </div>
</section>
<section class="col-story t-${col.theme}-soft" aria-label="Historia">
  <div class="wrap col-story-in">
    <svg class="rose" viewBox="0 0 100 100" aria-hidden="true"><use href="#rose"/></svg>
    <div class="col-story-text">${paras(col.story)}</div>
    ${isRel ? html`<a class="textlink" href="/#lugar-valle-del-espiritu-santo">El Valle del Espíritu Santo en la Bitácora</a>` : ''}
    ${isCandy ? html`<p class="kid-note"><b>Para las más pequeñas:</b> contienen piezas pequeñas. Recomendamos usarlas con supervisión de un adulto y guardarlas fuera del alcance de niños menores de 3 años.</p>` : ''}
  </div>
</section>
<section class="wrap col-pieces" id="piezas" aria-label="Piezas de ${col.name}">
  ${groups.length ? groups.map(([pl, items]) => html`<div class="place-group t-dir-${pl.dir}" id="lugar-${pl.slug}">
      <header class="pg-head">${pl.photo ? html`<img src="${pl.photo}" alt="${pl.name}" loading="lazy">` : ''}<div><p class="eyebrow"><b>${pl.dir}</b> ${pl.dirName} · ${pl.region}</p><h2>${pl.name}<span class="script">${pl.subtitle}</span></h2><p>${pl.story}</p></div></header>
      ${grid(items)}
    </div>`) : grid(prods)}
</section>
${looks.length ? html`<section class="looks-teaser" aria-label="Compra el look"><div class="wrap">
  <div class="sec-h"><div class="t"><p class="eyebrow">Sets para combinar</p><h2>Compra <span class="script">el look</span></h2></div><p>Combinaciones de esta colección. El look completo tiene descuento.</p></div>
  <div class="looks-stage" data-looks>${looks.map((lk, i) => lookBoard(lk, i, looks.length, looks.length > 1))}</div>
  ${looks.length > 1 ? raw('<div class="looks-nav" data-looks-nav></div>') : ''}
</div></section>` : ''}
<section class="cross" aria-label="Otras colecciones"><div class="wrap">
  <h2>Otras <span class="script">colecciones</span></h2>
  <div class="cross-grid cross-${others.length}">${others.map((c) => html`<a href="${c.url}"><span class="L">${c.name[0]}</span><span><strong>${c.name}</strong><small>${c.intro}</small></span><span class="go" aria-hidden="true">→</span></a>`)}</div>
</div></section>`;
}

// ---------------------------------------------------------------- ficha de pieza
export function productView({ S, p, looks, same, more }) {
  const gallery = [...new Set([p.img.main, ...p.img.gallery])].filter(Boolean);
  return html`
<section class="pp" aria-label="${p.name}">
  <div class="wrap pp-grid">
    <div class="pp-gallery">
      <div class="pp-main"><img id="ppMain" src="${gallery[0]}" alt="${p.name}, ${String(p.type).toLowerCase()}" fetchpriority="high"></div>
      ${gallery.length > 1 ? html`<div class="pp-thumbs" role="group" aria-label="Fotos">${gallery.map((u, i) => html`<button data-img="${u}" aria-label="Foto ${i + 1}"${i === 0 ? raw(' aria-pressed="true"') : ''}><img src="${u}" alt="" loading="lazy"></button>`)}</div>` : ''}
    </div>
    <div class="pp-info" data-product="${p.slug}">
      ${crumbsNav([['Inicio', '/'], ['Catálogo', '/catalogo'], ...(p.collection ? [[p.collectionName, `/coleccion/${p.collection}`]] : []), [p.name, p.url]])}
      <p class="eyebrow">${p.eyebrow}</p>
      <h1>${p.name}</h1>
      <p class="pp-detail">${p.detail}</p>
      ${p.img.insetOn && p.img.insetTitle ? html`<figure class="pp-stone"><img src="${p.img.inset}" alt="" loading="lazy"><figcaption><b>${p.img.insetTitle}</b><span>${p.img.insetNote}</span></figcaption></figure>` : ''}
      <div class="pd-prices">${p.bundle
    ? html`<div><small>Precio de la caja</small><b>${money(p.unit)}</b><s>${money(p.price)}</s></div><div><small>Por pieza · ${p.pieces} piezas</small><b>${money(p.perPiece)}</b></div>`
    : html`<div><small>Precio detal</small><b>${money(p.unit)}</b>${p.offer != null ? html`<s>${money(p.price)}</s>` : ''}</div><div><small>Al mayor · desde ${S['orders.wholesale_min_pieces']} piezas</small><b>${p.mayor != null ? money(p.mayor) : 'Consultar'}</b></div>`}</div>
      ${colorPicker(p)}
      ${p.variants.length > 1 ? html`<div class="field"><label for="ppVar">${p.audience ? 'Talla' : 'Largo de cadena'}</label><select id="ppVar">${p.variants.map((v) => html`<option>${v}</option>`)}</select></div>` : ''}
      <div class="pd-buy"><div class="qty"><button type="button" aria-label="Menos" data-ppq="-1">−</button><input id="ppQty" type="number" min="1" max="99" value="1" aria-label="Cantidad"><button type="button" aria-label="Más" data-ppq="1">+</button></div>
        <button class="btn btn-solid" id="ppAdd">Añadir al pedido <span class="arr"></span></button></div>
      <ul class="pp-trust" aria-label="Por qué comprar aquí">
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z"/></svg>Hecha a mano en Margarita · lista en ${p.leadMin} a ${p.leadMax} días hábiles</li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg><span><a href="/envios-venezuela">Envíos a toda Venezuela</a> y entrega en la isla</span></li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>Pagas solo a ${S['brand.name']}: Pago Móvil, transferencia, Zelle y más</li>
      </ul>
      <button class="textlink" id="ppAsk" style="justify-self:start">Preguntar por WhatsApp</button>
      ${p.bundle ? '' : html`<div class="pp-sticky" data-pp-sticky hidden><div><b>${p.name}</b><span>${money(p.unit)}</span></div><button type="button" class="btn btn-solid" data-pp-sticky-add>Añadir al pedido</button></div>`}
      <dl class="pd-specs">
        <div><dt>Tipo</dt><dd>${p.type}</dd></div>
        <div><dt>${p.bundle ? 'Contenido' : 'Piedra y detalle'}</dt><dd>${p.stone}</dd></div>
        <div><dt>Material</dt><dd>${p.material}</dd></div>
        ${p.place ? html`<div><dt>Lugar que la inspira</dt><dd><a href="/#lugar-${p.placeSlug}">${p.place}</a> · ${p.dirName}</dd></div>` : ''}
        ${p.collection ? html`<div><dt>Colección</dt><dd><a href="/coleccion/${p.collection}">${p.collectionName}</a></dd></div>` : ''}
        ${p.audience ? html`<div><dt>Para</dt><dd>${p.audience}</dd></div>` : ''}
        <div><dt>Elaboración</dt><dd>Hecha a mano bajo pedido · ${p.leadMin} a ${p.leadMax} días hábiles</dd></div>
        <div><dt>SKU</dt><dd>${p.sku}</dd></div>
      </dl>
      <div class="pp-story">${paras(p.story)}</div>
      ${p.care ? html`<details class="pp-care"><summary>Cuidados</summary>${paras(p.care)}</details>` : ''}
      <p class="note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>El pago se coordina únicamente con THF por el WhatsApp oficial. Ninguna embajadora o emprendedora recibe pagos.</p>
    </div>
  </div>
</section>
${looks.length ? html`<section class="looks-teaser" aria-label="Completa el look"><div class="wrap">
  <div class="sec-h"><div class="t"><p class="eyebrow">Set para combinar</p><h2>Completa <span class="script">el look</span></h2></div><p>Esta pieza se combina con otras. Llévate el look completo con descuento.</p></div>
  <div class="looks-stage" data-looks>${looks.map((lk, i) => lookBoard(lk, i, looks.length, looks.length > 1))}</div>
</div></section>` : ''}
${same.length ? html`<section class="wrap pp-more" aria-label="Del mismo lugar"><div class="sec-h"><div class="t"><p class="eyebrow">${p.dirName} · ${p.place}</p><h2>Del mismo <span class="script">lugar</span></h2></div></div><div class="cat-grid">${same.map((x) => pcard(x, S))}</div></section>` : ''}
${more.length ? html`<section class="wrap pp-more" aria-label="De la misma colección"><div class="sec-h"><div class="t"><p class="eyebrow">${p.collectionName || 'THF'}</p><h2>También <span class="script">te puede gustar</span></h2></div></div><div class="cat-grid">${more.map((x) => pcard(x, S))}</div></section>` : ''}
<div style="height:clamp(50px,8vh,100px)"></div>`;
}

// ---------------------------------------------------------------- compra el look
export function looksView({ cat }) {
  const L = cat.looks;
  return html`
<section class="page-head looks-head" aria-label="Compra el look">
  <div class="wrap">${crumbsNav([['Inicio', '/'], ['Compra el look', '/compra-el-look']])}
    <h1>Compra <span class="script">el look</span></h1>
    <p>Cada look nace de un lugar y combina varios sets que quedan bien juntos. Cómpralo completo con descuento o elige solo las piezas que quieras.</p></div>
  <div class="wrap"><div class="look-index" role="tablist" aria-label="Looks">${L.map((lk, i) => html`<button role="tab" data-goto="${i}" aria-selected="${i === 0 ? 'true' : 'false'}"><img src="${lk.photo}" alt="" loading="lazy"><span>${lk.name}<small>${lk.place || 'Venezuela'}</small></span></button>`)}</div></div>
</section>
<section class="looks-page" aria-label="Looks"><div class="wrap">
  <div class="looks-stage" data-looks data-carousel>${L.map((lk, i) => lookBoard(lk, i, L.length, true))}</div>
  <div class="looks-arrows"><button class="la prev" data-look-prev aria-label="Look anterior">←</button><span class="la-count" data-look-count>1 / ${L.length}</span><button class="la next" data-look-next aria-label="Look siguiente">→</button></div>
</div></section>`;
}

// ---------------------------------------------------------------- páginas fijas con fragmentos
export const boxView = ({ S, box }) => fill(FRAG.caja, { boxUnit: money(box.unit).replace(',00', ''), boxPrice: money(box.price), boxOff: box.offPct, boxPer: money(box.perPiece), lead: S['orders.lead_time_text'] });
export const customView = ({ S }) => fill(FRAG.personalizada, { wa: S['contact.whatsapp_display'] });
export function programsView({ S }) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const cells = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const fin = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
    let on;
    if (fin) { const rr = r < 3 ? r : r - 6, cc = c < 3 ? c : c - 6; on = rr !== 1 || cc !== 1 ? rr === 0 || rr === 2 || cc === 0 || cc === 2 : true; } else on = rnd() < 0.5;
    cells.push(on ? '<i></i>' : '<i class="o"></i>');
  }
  return fill(FRAG.programas, { wa: S['contact.whatsapp_display'], qr: raw(cells.join('')), commission: S['programs.a.commission_pct'],
    payout: money(Number(S['programs.payout_min_usd'] || 0) * 100).replace(',00', '') });
}

// ---------------------------------------------------------------- biblioteca
export function libraryView({ items }) {
  return html`
<section class="page-head lib-head" aria-label="Guías y ebooks">
  <div class="wrap">${crumbsNav([['Inicio', '/'], ['Guías y ebooks', '/guias']])}
    <h1>Guías y ebooks <span class="script">para cuidar, regalar y emprender</span></h1>
    <p>Contenido para cuidar tus piezas, regalar mejor, conocer Margarita y empezar a vender. Las gratuitas se descargan al instante; las demás, después de confirmar tu pago.</p></div>
</section>
<section class="wrap lib-grid" aria-label="Guías">
  ${items.map((d) => html`<article class="dcard">
    <a class="card-hit" href="${d.url}" aria-label="Ver ${d.title}"></a>
    <div class="dcard-cover">${d.cover ? html`<img src="${d.cover}" alt="" loading="lazy">` : ''}<span class="dcard-book"><small>THF · ${d.format}</small><b>${d.title}</b></span></div>
    <div class="dcard-info"><p class="eyebrow">${d.audience}</p><h2>${d.title}</h2><p>${d.subtitle}</p>
      <p class="dcard-price">${!d.hasFile ? html`<span class="soon">Muy pronto</span>` : d.price ? money(d.price) : html`<span class="free">Gratis</span>`}</p></div>
  </article>`)}
</section>
<div style="height:clamp(60px,10vh,120px)"></div>`;
}

const dur = (h) => (h % 24 === 0 && h >= 48 ? `${h / 24} días` : h === 24 ? '24 horas' : `${h} ${h === 1 ? 'hora' : 'horas'}`);
export function digitalView({ d, others, S = {} }) {
  const fh = Number(S['downloads.free_hours']) || 0, fm = Number(S['downloads.free_max']) || 0, pd = Number(S['downloads.paid_days']) || 0;
  return html`
<section class="pp dpp" aria-label="${d.title}">
  <div class="wrap pp-grid">
    <div class="dcover-xl">${d.cover ? html`<img src="${d.cover}" alt="" fetchpriority="high">` : ''}<span class="dcard-book"><small>THF · ${d.format}</small><b>${d.title}</b><em>${d.subtitle}</em></span></div>
    <div class="pp-info" data-digital="${d.slug}" data-digital-id="${d.id}" data-free="${d.price ? '0' : '1'}">
      ${crumbsNav([['Inicio', '/'], ['Guías y ebooks', '/guias'], [d.title, d.url]])}
      <p class="eyebrow">${d.audience}</p>
      <h1>${d.title}</h1>
      <p class="pp-detail">${d.subtitle}</p>
      <div class="pd-prices one"><div><small>${d.format}${d.pages ? ` · ${d.pages} páginas` : ''}</small><b>${d.price ? money(d.price) : 'Gratis'}</b></div></div>
      ${!d.hasFile ? html`<p class="soon-box">Estamos terminando esta guía. Escríbenos por WhatsApp si quieres que te avisemos cuando esté lista.</p>`
    : d.price ? html`<button class="btn btn-solid" id="digAdd">Añadir al pedido <span class="arr"></span></button><p class="note">Al confirmar tu pago te enviamos un enlace de descarga personal${pd ? `, válido por ${pd === 1 ? '1 día' : `${pd} días`}` : ''}.</p>`
      : html`<button class="btn btn-gold" id="digFree">Descargar gratis <span class="arr"></span></button><p class="note">El enlace se genera al momento${fh ? ` y sirve durante ${dur(fh)}` : ''}${fm ? ` (hasta ${fm} ${fm === 1 ? 'descarga' : 'descargas'})` : ''}. Guárdala en tu teléfono.</p>`}
      <div class="pp-story">${paras(d.description)}</div>
    </div>
  </div>
</section>
${others.length ? html`<section class="wrap pp-more"><div class="sec-h"><div class="t"><p class="eyebrow">Guías y ebooks</p><h2>Otras <span class="script">guías</span></h2></div></div><div class="lib-grid small">${others.map((o) => html`<a class="dmini" href="${o.url}"><b>${o.title}</b><small>${o.price ? money(o.price) : 'Gratis'}</small></a>`)}</div></section>` : ''}
<div style="height:clamp(50px,8vh,100px)"></div>`;
}

// ---------------------------------------------------------------- errores
export const errorView = ({ code, title, msg }) => html`
<section class="page-head err" aria-label="Error"><div class="wrap">
  <p class="eyebrow">Error ${code}</p><h1>${title}</h1><p>${msg}</p>
  <p style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-solid" href="/catalogo">Ver el catálogo <span class="arr"></span></a><a class="btn btn-ghost" href="/">Ir al inicio</a></p>
</div></section><div style="height:120px"></div>`;
