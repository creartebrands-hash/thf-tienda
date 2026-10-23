// Piezas de interfaz del panel: plantilla, formularios a partir de especificaciones y tablas.
import { esc, html, raw } from '../lib/html.js';
import { money } from '../lib/pricing.js';
import { htmlRes } from '../http.js';
import { readColors, validateColors } from '../lib/variants.js';

export const NAV = [
  ['Tienda', [['/admin', 'Inicio', 'home'], ['/admin/pedidos', 'Pedidos', 'orders'], ['/admin/pagos-recibidos', 'Pagos por verificar', 'payq'], ['/admin/clientas', 'Clientas', 'customers'], ['/admin/solicitudes', 'Solicitudes', 'requests']]],
  ['Catálogo', [['/admin/piezas', 'Piezas', 'products'], ['/admin/colecciones', 'Colecciones', 'collections'], ['/admin/lugares', 'Bitácora · lugares', 'places'],
    ['/admin/looks', 'Compra el look', 'looks'], ['/admin/categorias', 'Categorías', 'categories'], ['/admin/medios', 'Fotos y videos', 'media']]],
  ['Costos', [['/admin/costos', 'Costos por pieza', 'costs', 'ADMIN'], ['/admin/materiales', 'Materiales', 'materials', 'ADMIN'], ['/admin/proveedores', 'Proveedores', 'suppliers', 'ADMIN']]],
  ['Ventas', [['/admin/temporadas', 'Temporadas y ofertas', 'campaigns', 'ADMIN'], ['/admin/cupones', 'Cupones', 'coupons', 'ADMIN'], ['/admin/envios', 'Envíos', 'shipping'], ['/admin/pagos', 'Métodos de pago', 'payments', 'ADMIN']]],
  ['Programas', [['/admin/afiliadas', 'Embajadoras y aliadas', 'partners', 'ADMIN'], ['/admin/aliadas-imagenes', 'Imágenes para aliadas', 'aliada_assets', 'ADMIN'], ['/admin/comisiones', 'Comisiones por pagar', 'payable', 'ADMIN']]],
  ['Analítica', [['/admin/analitica', 'Resumen', 'analytics', 'ADMIN'], ['/admin/utm', 'Enlaces UTM', 'utm', 'ADMIN']]],
  ['Biblioteca', [['/admin/biblioteca', 'Guías y ebooks', 'digital']]],
  ['Sitio', [['/admin/ajustes#tienda', 'Editor de la tienda', 'store', 'ADMIN'], ['/admin/avisos', 'Avisos', 'notify', 'ADMIN'], ['/admin/seo', 'SEO, IA y GEO', 'seo'], ['/admin/integraciones', 'Integraciones', 'integrations', 'ADMIN'], ['/admin/ajustes', 'Ajustes', 'settings', 'ADMIN'],
    ['/admin/usuarios', 'Usuarios', 'users', 'ADMIN'], ['/admin/auditoria', 'Auditoría', 'audit', 'ADMIN']]],
];

export function layout(c, { title, active, body, actions = '' }) {
  const u = c.user;
  const msg = c.url.searchParams.get('msg');
  const err = c.url.searchParams.get('err');
  return htmlRes(html`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="csrf" content="${c.sess?.csrf || ''}"><title>${title} · Panel THF</title>
<link rel="icon" href="/brand/favicon.svg"><link rel="stylesheet" href="/assets/admin/admin.css?v=4"></head>
<body><div class="shell">
<aside class="side" id="side"><a class="brand" href="/admin">THF <span>panel</span></a>
<nav>${NAV.map(([g, all]) => { const items = all.filter((i) => !i[3] || u.role === i[3]); if (!items.length) return '';
  const open = g === 'Tienda' || items.some((i) => i[2] === active);
  return html`<details class="ngrp" data-group="${g}"${open ? raw(' open') : ''}><summary class="ng">${g}<i aria-hidden="true"></i></summary><div class="ngl">${items.map(([href, label, key]) => html`<a href="${href}"${active === key ? raw(' aria-current="page"') : ''}>${label}</a>`)}</div></details>`; })}</nav>
<div class="me"><b>${u.name}</b><small>${u.email} · ${u.role === 'ADMIN' ? 'Administración' : 'Equipo'}</small>
<form method="post" action="/admin/salir">${csrf(c)}<button class="link">Salir</button></form><a class="link" href="/" target="_blank" rel="noopener">Ver la tienda ↗</a></div></aside>
<main class="main"><header class="top"><button class="menu" id="sideBtn" aria-label="Menú">☰</button><h1>${title}</h1><div class="acts">${actions}</div></header>
${msg ? html`<p class="flash ok" role="status">${msg}</p>` : ''}${err ? html`<p class="flash bad" role="alert">${err}</p>` : ''}
${body}</main></div>
<div class="picker" id="picker" hidden></div>
<script src="/assets/admin/admin.js?v=4" defer></script></body></html>`, 200, { 'Cache-Control': 'no-store' });
}

export const csrf = (c) => raw(`<input type="hidden" name="_csrf" value="${esc(c.sess?.csrf || '')}">`);

// ---------------------------------------------------------------- campos
// Tipos: text, textarea, slug, money (centavos), int, pct (bps), bool, select, media, ref, list (JSON), real, email, readonly
export function field(f, v, ctx = {}) {
  const id = `f_${f.k}`;
  const lab = html`<label for="${id}">${f.label}${f.req ? raw(' <i class="req">*</i>') : ''}</label>`;
  const help = f.help ? html`<small class="help">${f.help}</small>` : '';
  const wrap = (input, cls = '') => html`<div class="fld ${cls} ${f.wide ? 'wide' : ''}">${lab}${input}${help}</div>`;
  const common = raw(`id="${id}" name="${f.k}"${f.req ? ' required' : ''}${f.ro ? ' readonly' : ''}`);
  switch (f.type) {
    case 'textarea':
      return wrap(html`<textarea ${common} rows="${f.rows || 4}" maxlength="${f.max || 4000}">${v ?? ''}</textarea>`);
    case 'money':
      return wrap(html`<div class="money"><span>$</span><input ${common} inputmode="decimal" value="${v == null ? '' : (v / 100).toFixed(2)}" placeholder="${f.req ? '0.00' : 'vacío'}" pattern="^\\d{1,6}([.,]\\d{1,2})?$"></div>`);
    case 'pct':
      return wrap(html`<div class="money"><input ${common} inputmode="decimal" value="${v == null ? '' : (v / 100).toString()}"><span>%</span></div>`);
    case 'int': case 'real':
      return wrap(html`<input ${common} inputmode="decimal" value="${v ?? ''}">`);
    case 'factor': // guardado ×10.000 (40000 = ×4), se muestra como 4
      return wrap(html`<div class="money"><span>×</span><input ${common} inputmode="decimal" value="${v == null ? '' : String(v / 10000).replace('.', ',')}"></div>`);
    case 'bool':
      return html`<div class="fld chk ${f.wide ? 'wide' : ''}"><label><input type="checkbox" name="${f.k}" value="1"${v ? raw(' checked') : ''}> ${f.label}</label>${help}</div>`;
    case 'select':
      return wrap(html`<select ${common}>${f.options.map(([val, name]) => html`<option value="${val}"${String(v ?? '') === String(val) ? raw(' selected') : ''}>${name}</option>`)}</select>`);
    case 'ref':
      return wrap(html`<select ${common}>${f.req ? '' : raw('<option value="">—</option>')}${(ctx.refs?.[f.k] || []).map(([val, name]) => html`<option value="${val}"${String(v ?? '') === String(val) ? raw(' selected') : ''}>${name}</option>`)}</select>`);
    case 'media': {
      const m = ctx.media?.get?.(Number(v));
      return wrap(html`<div class="mpick" data-mpick><input type="hidden" name="${f.k}" value="${v ?? ''}"><span class="mprev">${m ? html`<img src="/media/${m.path}" alt="">` : html`<em>Sin foto</em>`}</span>
        <button type="button" class="btn sm ghost" data-pick>Elegir o subir</button><button type="button" class="btn sm ghost" data-unpick${v ? '' : raw(' hidden')}>Quitar</button></div>`);
    }
    case 'list':
      return wrap(html`<input ${common} value="${(Array.isArray(v) ? v : JSON.parse(v || '[]')).join(', ')}" placeholder="Separadas por coma">`);
    case 'datetime': // se guarda en UTC; se muestra en hora de Caracas (UTC−4)
      return wrap(html`<input ${common} type="datetime-local" value="${v ? new Date(Date.parse(v) - 4 * 3600e3).toISOString().slice(0, 16) : ''}">`);
    case 'colors': { // variantes con muestra de color: editor visual (admin.js) sobre un JSON validado en el servidor
      const cv = readColors(v) || { label: 'Color de la piedra', shape: 'circle', items: [] };
      const row = (x) => html`<div class="cv-row" data-cv-row><input type="color" value="${x.hex || '#D9C7B8'}" data-cv-hex aria-label="Color"><input value="${x.name}" maxlength="30" placeholder="Ej. Cuarzo rosa" data-cv-name aria-label="Nombre"><label class="chk"><input type="checkbox" data-cv-on${x.on !== false ? raw(' checked') : ''}> Disponible</label><button type="button" class="link bad" data-cv-del>Quitar</button></div>`;
      return html`<div class="fld wide cv" data-cv><label for="${id}">${f.label}</label>
<div class="cv-head"><label>Nombre del grupo<input value="${cv.label}" maxlength="30" data-cv-label placeholder="Color de la piedra"></label><label>Forma<select data-cv-shape><option value="circle"${cv.shape === 'circle' ? raw(' selected') : ''}>Círculos</option><option value="square"${cv.shape === 'square' ? raw(' selected') : ''}>Cuadrados</option></select></label><div class="cv-prev" data-cv-prev aria-hidden="true"></div></div>
<div class="cv-rows" data-cv-rows>${cv.items.map(row)}</div>
<template data-cv-tpl>${row({ name: '', hex: '#D9C7B8', on: true })}</template>
<div class="cv-add"><button type="button" class="btn sm ghost" data-cv-add>+ Agregar opción</button><span class="help">Rápido:</span>${[['Cuarzo rosa', '#F2C6CF'], ['Cuarzo blanco', '#EFECE6'], ['Amatista', '#9A6CB4'], ['Ónix', '#1E1C1C'], ['Perla', '#F1E8DA'], ['Coral', '#E36F59'], ['Turquesa', '#3FB2AE'], ['Jade', '#5E9A73'], ['Citrino', '#E8BE52'], ['Ojo de tigre', '#A4672A']].map(([n, h]) => html`<button type="button" class="cv-chip" data-cv-quick="${n}" data-hex="${h}"><i style="background:${h}"></i>${n}</button>`)}</div>
<textarea id="${id}" name="${f.k}" rows="3" class="mono cv-json" data-cv-json>${readColors(v) ? JSON.stringify(readColors(v)) : ''}</textarea>
<small class="help">Solo se muestran en la tienda las opciones marcadas como disponibles. Si una pieza no tiene variantes, deja la lista vacía.</small></div>`;
    }
    case 'color':
      return wrap(html`<div class="colorf"><input type="color" value="${/^#[0-9a-f]{6}$/i.test(v || '') ? v : f.def || '#000000'}" data-color-for="${id}" aria-label="${f.label}"><input ${common} value="${v ?? ''}" placeholder="${f.def || 'vacío = color de la marca'}" maxlength="7" pattern="^#[0-9a-fA-F]{6}$"></div>`);
    default:
      return wrap(html`<input ${common} type="${f.type === 'email' ? 'email' : 'text'}" value="${v ?? ''}" maxlength="${f.max || 300}"${f.type === 'slug' ? raw(' pattern="[a-z0-9\\-]+" data-slug') : ''}${f.ph ? html` placeholder="${f.ph}"` : ''}>`);
  }
}

export class FormError extends Error {}

export function parseField(f, raw0) {
  const raw1 = Array.isArray(raw0) ? raw0[raw0.length - 1] : raw0;
  const s = raw1 == null ? '' : String(raw1).trim();
  const need = () => { if (f.req && s === '') throw new FormError(`Completa "${f.label}".`); };
  switch (f.type) {
    case 'bool': return s === '1' || s === 'on' ? 1 : 0;
    case 'money': {
      need();
      if (s === '') return null;
      const m = s.replace(/\s|\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(m)) throw new FormError(`"${f.label}" debe ser un monto, por ejemplo 38.50`);
      const [e, d = ''] = m.split('.');
      return Number(e) * 100 + Number((d + '00').slice(0, 2));
    }
    case 'pct': {
      need();
      if (s === '') return f.req ? 0 : null;
      const n = Number(s.replace(',', '.'));
      if (!Number.isFinite(n) || n < (f.min ?? -100) || n > (f.maxv ?? 100)) throw new FormError(`"${f.label}" debe ser un porcentaje válido.`);
      return Math.round(n * 100);
    }
    case 'factor': {
      need();
      if (s === '') return null;
      const n = Number(s.replace(',', '.'));
      if (!Number.isFinite(n) || n < (f.min ?? 1) || n > (f.maxv ?? 20)) throw new FormError(`"${f.label}" debe ser un número entre ${f.min ?? 1} y ${f.maxv ?? 20}, por ejemplo 4 o 2,5.`);
      return Math.round(n * 10000);
    }
    case 'int': {
      need();
      if (s === '') return f.req ? 0 : null;
      if (!/^-?\d{1,9}$/.test(s)) throw new FormError(`"${f.label}" debe ser un número entero.`);
      const n = Number(s);
      if ((f.min != null && n < f.min) || (f.maxv != null && n > f.maxv)) throw new FormError(`"${f.label}" está fuera de rango.`);
      return n;
    }
    case 'real': {
      need();
      if (s === '') return f.req ? 0 : '';
      const n = Number(s.replace(',', '.'));
      if (!Number.isFinite(n)) throw new FormError(`"${f.label}" debe ser un número.`);
      if ((f.min != null && n < f.min) || (f.maxv != null && n > f.maxv)) throw new FormError(`"${f.label}" está fuera de rango.`);
      return n;
    }
    case 'datetime': {
      need();
      if (s === '') return null;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new FormError(`"${f.label}" debe ser una fecha y hora.`);
      return new Date(Date.parse(s + ':00Z') + 4 * 3600e3).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    case 'color':
      if (s && !/^#[0-9a-fA-F]{6}$/.test(s)) throw new FormError(`"${f.label}" debe ser un color como #3D1011.`);
      return s;
    case 'colors':
      try { return validateColors(s); } catch (e) { throw new FormError(e.message); }
    case 'link':
      need();
      if (s && !/^(https:\/\/[^\s<>"]+|\/[a-z0-9\-/#?=&]*)$/i.test(s)) throw new FormError(`"${f.label}" debe empezar con / (página de la tienda) o con https://`);
      return s.slice(0, 300);
    case 'url':
      need();
      if (s && !/^https:\/\/[^\s<>"]+$/.test(s)) throw new FormError(`"${f.label}" debe ser un enlace que empiece con https://`);
      return s.slice(0, f.max || 300);
    case 'media': case 'ref': {
      need();
      if (s === '') return null;
      if (!/^\d+$/.test(s)) throw new FormError(`"${f.label}" inválido.`);
      return Number(s);
    }
    case 'select': {
      need();
      if (!f.options.some(([v]) => String(v) === s)) throw new FormError(`"${f.label}" inválido.`);
      return s;
    }
    case 'slug': {
      need();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || s.length > 80) throw new FormError(`"${f.label}" solo puede tener minúsculas, números y guiones.`);
      return s;
    }
    case 'list':
      return JSON.stringify(s.split(',').map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 20));
    case 'email':
      need();
      if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new FormError(`"${f.label}" no es un correo válido.`);
      return s;
    default:
      need();
      return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\r\n?/g, '\n').slice(0, f.max || (f.type === 'textarea' ? 4000 : 300));
  }
}

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export const fmt = {
  money: (v) => (v == null ? '—' : money(v)),
  date: (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    const t = new Date(d.getTime() - 4 * 3600e3); // America/Caracas (UTC−4, sin horario de verano)
    return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
  },
  bool: (v) => (v ? '✓' : '—'),
};

export const badge = (text, tone = '') => html`<span class="badge ${tone}">${text}</span>`;
export const empty = (t) => html`<div class="empty">${t}</div>`;
