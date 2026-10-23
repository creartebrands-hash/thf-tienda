import { html, raw } from '../lib/html.js';
import { money } from '../lib/pricing.js';
import { swatchRow } from '../lib/variants.js';

// Selector de variante con color (ficha de la pieza): radios con muestra; el servidor valida la elección
export function colorPicker(p, name = 'ppColor') {
  const on = p.colors ? p.colors.items.filter((x) => x.on) : [];
  if (!on.length) return '';
  return html`<fieldset class="vpick ${p.colors.shape}" data-vpick><legend>${p.colors.label}: <b data-vpick-name>${on[0].name}</b></legend><div>${on.map((x, i) => html`<label title="${x.name}"><input type="radio" name="${name}" value="${x.name}"${i ? '' : raw(' checked')}><span style="--sw:${x.hex}"></span><em>${x.name}</em></label>`)}</div></fieldset>`;
}

export function price(p, S) {
  if (p.bundle) return html`<s>${money(p.price)}</s> ${money(p.unit)}<small>${p.pieces} piezas · ${money(p.perPiece)} c/u</small>`;
  return html`${p.offer != null ? html`<s>${money(p.price)}</s> ` : ''}${money(p.unit)}${p.mayor != null ? html`<small>Al mayor ${money(p.mayor)} · ${S['orders.wholesale_min_pieces']}+ pzs</small>` : ''}`;
}

export function tag(p) {
  if (p.bundle) return html`<span class="card-tag offer">Caja · −${p.offPct} %</span>`;
  if (p.campaign) return html`<span class="card-tag offer">${p.campaign} · −${p.offPct} %</span>`;
  if (p.offer != null) return html`<span class="card-tag offer">Oferta</span>`;
  if (p.audience) return html`<span class="card-tag">${p.audience.replace('Niñas de ', '')}</span>`;
  return html`<span class="card-tag">Bajo pedido</span>`;
}

// Cuadro pequeño opcional (se activa por pieza en el panel). Si tiene título, muestra una nota breve al pasar el cursor o al tocarlo.
export function inset(p, cls = 'card-inset') {
  if (!p.img.insetOn || !p.img.inset) return '';
  const t = p.img.insetTitle, n = p.img.insetNote;
  return html`<figure class="${cls}${t ? ' has-note' : ''}"${t ? raw(' tabindex="0"') : ''}${t ? html` aria-label="${t}${n ? ': ' + n : ''}"` : ''}><img src="${p.img.inset}" alt="" loading="lazy">${t ? html`<figcaption><b>${t}</b>${n ? html`<span>${n}</span>` : ''}</figcaption><i class="inset-dot" aria-hidden="true"></i>` : ''}</figure>`;
}

const EYE = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>');

// Tarjeta editorial (inicio y colecciones)
export function card(p, S, cls = '', i = 0) {
  return html`<article class="card ${cls}">
  <a class="card-hit" href="${p.url}" aria-label="Ver ${p.name}"></a>
  <div class="card-fig"><div class="card-media"><img class="im1" src="${p.img.main}" alt="${p.name}, ${String(p.type).toLowerCase()}" loading="lazy"><img class="im2" src="${p.img.hover}" alt="" loading="lazy">${tag(p)}
    <button class="quick-view" data-open="${p.slug}" aria-label="Vista rápida de ${p.name}">${EYE}Vista rápida</button>${swatchRow(p.colors)}</div>
    ${inset(p)}${!p.img.insetOn && i % 4 === 1 ? raw('<span class="card-sq" aria-hidden="true"></span>') : ''}</div>
  <div class="card-info"><div><span class="eyebrow">${p.eyebrow}</span><h3>${p.name}</h3><p class="card-meta">${p.type} · ${p.stone}</p></div>
  <div class="card-price">${price(p, S)}</div></div>
</article>`;
}

// Franja "Añadir" de la tarjeta: si la pieza tiene variantes con color, sube con las muestras para elegir y el botón de añadir
function quickBar(p) {
  const on = p.colors ? p.colors.items.filter((x) => x.on) : [];
  const btn = (color) => html`<button class="quick" data-quick="${p.slug}"${color ? html` data-color="${color}"` : ''} aria-label="Añadir ${p.name} al pedido"><span>Añadir</span><b aria-hidden="true">+</b></button>`;
  if (on.length < 2) return btn('');
  const shown = on.slice(0, 6);
  return html`<div class="qbar"><div class="qb-top"><div class="qb-sw ${p.colors.shape}" role="radiogroup" aria-label="${p.colors.label}">${shown.map((x, i) => html`<button type="button" class="qb-dot" role="radio" aria-checked="${i ? 'false' : 'true'}" data-pick-color="${x.name}" title="${x.name}" aria-label="${x.name}"><span style="--sw:${x.hex}"></span></button>`)}${on.length > shown.length ? html`<button type="button" class="qb-more" data-open="${p.slug}" aria-label="Ver las ${on.length} opciones">+${on.length - shown.length}</button>` : ''}</div><small class="qb-name" data-qb-name>${on[0].name}</small></div>${btn(on[0].name)}</div>`;
}

// Tarjeta de catálogo
export function pcard(p, S) {
  return html`<article class="pcard" data-slug="${p.slug}">
  <a class="card-hit" href="${p.url}" aria-label="Ver ${p.name}"></a>
  <div class="pcard-media"><img class="im1" src="${p.img.main}" alt="${p.name}, ${String(p.type).toLowerCase()}" loading="lazy"><img class="im2" src="${p.img.hover}" alt="" loading="lazy">${tag(p)}
    ${quickBar(p)}${inset(p, 'pcard-inset')}${swatchRow(p.colors)}</div>
  <div class="pcard-info"><span class="eyebrow">${p.eyebrow}</span><h3>${p.name}</h3><p class="card-meta">${p.type} · ${p.stone}</p><div class="pcard-price">${price(p, S)}</div></div>
</article>`;
}

// Tablero de "Compra el look": foto del lugar + foto del look con puntos + piezas seleccionables
export function lookBoard(lk, idx = 0, total = 1, nav = false) {
  return html`<article class="look" data-look="${lk.slug}" data-idx="${idx}" aria-label="Look ${lk.name}">
  <figure class="look-place">
    ${lk.placePhoto ? html`<img src="${lk.placePhoto}" alt="${lk.place || lk.name}" loading="lazy">` : ''}
    <figcaption>${lk.place ? html`${lk.place}${lk.dirName ? ` · ${lk.dirName}` : ''}` : 'Venezuela'}</figcaption>
  </figure>
  <div class="look-photo">
    <img src="${lk.photo}" alt="Look ${lk.name}: ${lk.items.map((i) => i.product.name).join(', ')}" loading="lazy">
    ${lk.items.map((it, n) => html`<button class="hot" style="left:${it.x}%;top:${it.y}%" data-hot="${n}" aria-label="${it.product.name}: ${money(it.product.unit)}"><span>${n + 1}</span></button>`)}
    <div class="hot-card" hidden></div>
  </div>
  <div class="look-info">
    <p class="eyebrow">${lk.subtitle}${nav ? ` · ${idx + 1} de ${total}` : ''}</p>
    <h3>${lk.name}</h3>
    <p class="look-story">${lk.story}</p>
    <ol class="look-items">
      ${lk.items.map((it, n) => html`<li><label><input type="checkbox" checked data-item="${n}" data-slug="${it.product.slug}" data-qty="${it.qty}" data-unit="${it.product.unit}"><span class="li-n">${n + 1}</span><img src="${it.product.img.main}" alt="" loading="lazy"><span class="li-t"><a href="${it.product.url}">${it.product.name}</a><small>${it.product.type}</small></span><span class="li-p">${money(it.product.unit * it.qty)}</span></label></li>`)}
    </ol>
    <div class="look-total"><div><small>Look completo</small><b class="lt-price">${money(lk.price)}</b> <s class="lt-full">${money(lk.full)}</s></div><span class="lt-save">Ahorras ${money(lk.discount)} · −${lk.discountPct} %</span></div>
    <div class="look-ctas"><button class="btn btn-solid lt-add" data-look-add="${lk.slug}">Comprar el look completo <span class="arr"></span></button></div>
    <p class="look-note">Desmarca las piezas que no quieras. El descuento aplica al look completo.</p>
  </div>
</article>`;
}

export const crumbsNav = (items) => html`<nav class="crumbs" aria-label="Ruta">${items.map(([n, u], i) => (i < items.length - 1 ? html`<a href="${u}">${n}</a><span aria-hidden="true">/</span>` : html`<span aria-current="page">${n}</span>`))}</nav>`;
