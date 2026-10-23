// Piezas: listado con filtros, ficha completa con precios, fotos (con su rol), cuadro pequeño opcional y SEO.
// El costo de aliada y los rangos de precio solo los ve y edita Administración (seguridad por campo).
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { money } from '../lib/pricing.js';
import { audit } from '../lib/security.js';
import { HttpError, readForm, redirect } from '../http.js';
import { afterWrite, mediaMap } from './common.js';
import { hoverPrompt, stonePrompt } from '../lib/prompts.js';

// ¿La foto es de la pieza? (las semillas del lugar o del look no cuentan; lo que sube la marca, sí)
export const isPiecePhoto = (path) => /^u\//.test(path || '') || /^seed\/(p-|cg-|rel-|caja-)/.test(path || '');
const promptBox = (title, text, note) => html`<details class="prompt"><summary>${title}</summary><p class="help">${note}</p>
  <textarea rows="7" class="prompt-text" aria-label="${title}">${text}</textarea><button type="button" class="btn sm ghost" data-copy-text>Copiar prompt</button></details>`;
import { FormError, badge, csrf, empty, field, layout, parseField, slugify } from './ui.js';

const ROLES = [['main', 'Principal'], ['hover', 'Al pasar el cursor'], ['inset', 'Cuadro pequeño'], ['model', 'Puesta / modelo'], ['gallery', 'Galería']];

const BASIC = [
  { k: 'name', label: 'Nombre', req: true, max: 120 }, { k: 'slug', label: 'Dirección web', type: 'slug', req: true, help: '/pieza/esta-direccion' },
  { k: 'provisional_name', label: 'Nombre provisional (pendiente de confirmar)', type: 'bool' },
  { k: 'collection_id', label: 'Colección', type: 'ref' }, { k: 'category_id', label: 'Categoría', type: 'ref' },
  { k: 'place_id', label: 'Lugar de la Bitácora', type: 'ref', help: 'Cada pieza vive en un solo lugar.' },
  { k: 'type', label: 'Tipo', ph: 'Set collar + pulsera' }, { k: 'stone', label: 'Piedra o detalle principal', ph: 'Amatista' },
  { k: 'material', label: 'Material', ph: 'Cadena con baño de oro 18k' }, { k: 'detail', label: 'Detalle breve', wide: true, max: 200 },
  { k: 'story', label: 'Historia (un párrafo por línea)', type: 'textarea', rows: 5, wide: true },
  { k: 'care', label: 'Cuidados', type: 'textarea', rows: 3, wide: true }, { k: 'audience', label: 'Público', ph: 'Niñas de 4 a 10 años' },
  { k: 'sku', label: 'SKU', max: 40 },
  { k: 'lead_min_days', label: 'Elaboración: mínimo de días', type: 'int', min: 0, maxv: 120 }, { k: 'lead_max_days', label: 'Elaboración: máximo de días', type: 'int', min: 0, maxv: 120 },
];
const PRICES = [
  { k: 'price_cents', label: 'Precio detal', type: 'money', req: true }, { k: 'offer_cents', label: 'Precio de oferta', type: 'money', help: 'Vacío = sin oferta' },
  { k: 'wholesale_cents', label: 'Precio al mayor', type: 'money', help: 'Se aplica desde el mínimo de piezas de Ajustes' },
  { k: 'is_demo_price', label: 'Precio de ejemplo (pendiente del precio real)', type: 'bool', wide: true },
];
const PRIVATE = [
  { k: 'cost_cents', label: 'Costo aliada (privado)', type: 'money' }, { k: 'suggested_cents', label: 'Precio sugerido de reventa', type: 'money' },
  { k: 'min_cents', label: 'Mínimo de reventa', type: 'money' }, { k: 'max_cents', label: 'Máximo de reventa', type: 'money' },
];
const BOX = [{ k: 'is_bundle', label: 'Es una caja o paquete (precio único, no suma al mayor)', type: 'bool', wide: true }, { k: 'bundle_pieces', label: 'Piezas en la caja', type: 'int', min: 1, maxv: 500 }];
const INSET = [
  { k: 'inset_enabled', label: 'Mostrar el cuadro pequeño en la tarjeta', type: 'bool', wide: true, help: 'Usa la foto con rol "Cuadro pequeño".' },
  { k: 'inset_title', label: 'Título breve', ph: 'Amatista', max: 40 }, { k: 'inset_note', label: 'Nota breve', ph: 'Cuarzo violeta · Brasil y Uruguay', max: 70, help: 'Aparece al pasar el cursor o al tocar el cuadro. Muy corta.' },
];
const PUB = [
  { k: 'status', label: 'Estado', type: 'select', options: [['published', 'Publicada'], ['draft', 'Borrador'], ['archived', 'Archivada']] },
  { k: 'in_catalog', label: 'Mostrar en el catálogo (si no, solo dentro de looks)', type: 'bool', wide: true },
  { k: 'featured', label: 'Destacada en el inicio', type: 'bool' }, { k: 'sort', label: 'Orden', type: 'int' },
  { k: 'seo_title', label: 'Título para Google', max: 70, wide: true, help: 'Vacío = se genera solo' }, { k: 'seo_desc', label: 'Descripción para Google', type: 'textarea', rows: 2, max: 200, wide: true },
];

const VARIANTS = [
  { k: 'colors', label: 'Variantes con color', type: 'colors', wide: true },
  { k: 'variants', label: 'Largos o tallas', type: 'list', wide: true, help: 'Separadas por coma. Ej.: 40 cm, 45 cm, 50 cm. Vacío = sin opciones de largo.' },
];
const fieldsFor = (role) => [...BASIC, ...VARIANTS, ...PRICES, ...(role === 'ADMIN' ? PRIVATE : []), ...BOX, ...INSET, ...PUB];

async function refs(db) {
  const [cols, cats, pls] = await Promise.all([db.all('SELECT id, name FROM collections ORDER BY sort'), db.all('SELECT id, name FROM categories ORDER BY sort'),
    db.all('SELECT id, name, direction FROM places ORDER BY sort')]);
  return { collection_id: cols.map((r) => [r.id, r.name]), category_id: cats.map((r) => [r.id, r.name]), place_id: pls.map((r) => [r.id, `${r.direction} · ${r.name}`]) };
}

export async function list(c) {
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60);
  const col = c.url.searchParams.get('col') || '';
  const st = c.url.searchParams.get('estado') || '';
  const where = [], args = [];
  if (q) { where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.stone LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (col) { where.push(col === 'sin' ? 'p.collection_id IS NULL' : 'c.slug=?'); if (col !== 'sin') args.push(col); }
  if (st === 'demo') where.push('p.is_demo_price=1');
  else if (st === 'provisional') where.push('p.provisional_name=1');
  else if (st === 'sinhover') where.push("NOT EXISTS (SELECT 1 FROM product_media m WHERE m.product_id=p.id AND m.role='hover')");
  else if (st) { where.push('p.status=?'); args.push(st); }
  const rows = await c.db.all(`SELECT p.id, p.slug, p.name, p.sku, p.price_cents, p.offer_cents, p.status, p.is_demo_price, p.provisional_name, p.in_catalog, p.featured, p.inset_enabled,
      c.name col, l.name place, (SELECT m.path FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=p.id ORDER BY (pm.role='main') DESC, pm.sort LIMIT 1) img
      FROM products p LEFT JOIN collections c ON c.id=p.collection_id LEFT JOIN places l ON l.id=p.place_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.sort, p.sort, p.id LIMIT 300`, args);
  const cols = await c.db.all('SELECT slug, name FROM collections ORDER BY sort');
  const body = html`<form class="filters" method="get">
  <input name="q" value="${q}" placeholder="Buscar por nombre, SKU o piedra" type="search">
  <select name="col"><option value="">Todas las colecciones</option>${cols.map((x) => html`<option value="${x.slug}"${x.slug === col ? raw(' selected') : ''}>${x.name}</option>`)}<option value="sin"${col === 'sin' ? raw(' selected') : ''}>Sin colección</option></select>
  <select name="estado"><option value="">Cualquier estado</option>${[['published', 'Publicadas'], ['draft', 'Borradores'], ['archived', 'Archivadas'], ['demo', 'Con precio de ejemplo'], ['provisional', 'Con nombre provisional'], ['sinhover', 'Sin foto al pasar el cursor']].map(([v, n]) => html`<option value="${v}"${v === st ? raw(' selected') : ''}>${n}</option>`)}</select>
  <button class="btn ghost">Filtrar</button></form>
${rows.length ? html`<div class="plist">${rows.map((r) => html`<a class="pitem" href="/admin/piezas/${r.id}">
  <span class="pimg">${r.img ? html`<img src="/media/${r.img}" alt="" loading="lazy">` : ''}</span>
  <span class="ptxt"><b>${r.name}</b><small>${r.col || 'Sin colección'}${r.place ? ` · ${r.place}` : ''} · ${r.sku}</small>
  <span class="tags">${r.status !== 'published' ? badge(r.status === 'draft' ? 'Borrador' : 'Archivada', 'muted') : ''}${r.is_demo_price ? badge('Precio de ejemplo', 'warn') : ''}${r.provisional_name ? badge('Nombre provisional', 'warn') : ''}${!r.in_catalog ? badge('Solo en looks', 'muted') : ''}${r.featured ? badge('Destacada', 'gold') : ''}${r.inset_enabled ? badge('Cuadro', 'muted') : ''}</span></span>
  <span class="pprice">${r.offer_cents != null ? html`<s>${money(r.price_cents)}</s> ` : ''}${money(r.offer_cents ?? r.price_cents)}</span></a>`)}</div>` : empty('No hay piezas con esos filtros.')}`;
  return layout(c, { title: 'Piezas', active: 'products', body, actions: html`<a class="btn" href="/admin/piezas/nuevo">Agregar pieza</a>` });
}

function validate(v) {
  if (v.offer_cents != null && v.offer_cents >= v.price_cents) throw new FormError('La oferta debe ser menor que el precio detal.');
  if (v.wholesale_cents != null && v.wholesale_cents > v.price_cents) throw new FormError('El precio al mayor no puede ser mayor que el precio detal.');
  // Si la oferta queda por debajo del precio al mayor, en el carrito se cobra el menor de los dos (nunca más caro por comprar más).
  if (v.lead_min_days > v.lead_max_days) throw new FormError('Los días mínimos de elaboración no pueden superar los máximos.');
  if (v.is_bundle && !v.bundle_pieces) throw new FormError('Indica cuántas piezas trae la caja.');
  if ('min_cents' in v && v.min_cents != null && v.max_cents != null && v.min_cents > v.max_cents) throw new FormError('El mínimo de reventa no puede superar el máximo.');
  if ('suggested_cents' in v && v.suggested_cents != null && ((v.min_cents != null && v.suggested_cents < v.min_cents) || (v.max_cents != null && v.suggested_cents > v.max_cents)))
    throw new FormError('El precio sugerido debe estar entre el mínimo y el máximo.');
  if (v.inset_title.length > 40 || v.inset_note.length > 70) throw new FormError('El título y la nota del cuadro pequeño deben ser muy breves.');
}

export async function edit(c, id) {
  const { db, user } = c;
  const isNew = id === 'nuevo';
  const FIELDS = fieldsFor(user.role);
  let row = isNew ? { status: 'draft', in_catalog: 1, variants: '["40 cm","45 cm","50 cm"]', material: 'Cadena con baño de oro 18k', lead_min_days: 7, lead_max_days: 10, sort: 50, is_demo_price: 0, price_cents: 0 }
    : await db.first('SELECT * FROM products WHERE id=?', [id]);
  if (!row) throw new HttpError(404);
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    const a = f._action || 'save';
    if (!isNew && a !== 'save') return mediaAction(c, row, a, f);
    try {
      if (!f.slug && f.name) f.slug = slugify(f.name);
      const v = {};
      for (const fl of FIELDS) v[fl.k] = parseField(fl, f[fl.k]);
      validate(v);
      v.updated_at = nowIso();
      const ks = Object.keys(v);
      let nid = row.id;
      if (isNew) {
        ks.push('created_at');
        v.created_at = v.updated_at;
        nid = (await db.run(`INSERT INTO products(${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map((k) => v[k]))).id;
      } else await db.run(`UPDATE products SET ${ks.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...ks.map((k) => v[k]), row.id]);
      const changed = isNew ? { name: v.name } : Object.fromEntries(ks.filter((k) => k !== 'updated_at' && String(row[k] ?? '') !== String(v[k] ?? '')).map((k) => [k, [row[k], v[k]]]));
      await audit(db, c, isNew ? 'crear' : 'editar', 'products', nid, changed);
      await afterWrite(c);
      return redirect(`/admin/piezas/${nid}?msg=${encodeURIComponent(isNew ? 'Pieza creada. Ahora agrega sus fotos.' : 'Guardado.')}${isNew ? '#fotos' : ''}`, 303);
    } catch (e) {
      if (e instanceof FormError) err = e.message;
      else if (/UNIQUE/i.test(String(e?.message))) err = 'Ya existe una pieza con esa dirección web. Usa otra.';
      else throw e;
      row = { ...row };
      for (const fl of FIELDS) {
        const r = f[fl.k];
        row[fl.k] = fl.type === 'money' ? (r ? Math.round(Number(String(r).replace(',', '.')) * 100) || null : null) : fl.type === 'bool' ? (r ? 1 : 0) : fl.type === 'list' ? JSON.stringify(String(r || '').split(',').map((s) => s.trim()).filter(Boolean)) : r;
      }
    }
  }
  const R = await refs(db);
  const pm = isNew ? [] : await db.all(`SELECT pm.id, pm.role, pm.sort, m.id mid, m.path, m.kind, m.alt FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=? ORDER BY pm.sort, pm.id`, [row.id]);
  const looks = isNew ? [] : await db.all('SELECT l.id, l.name FROM look_items i JOIN looks l ON l.id=i.look_id WHERE i.product_id=?', [row.id]);
  const sec = (t, fields, note = '') => html`<fieldset class="card"><legend>${t}</legend>${note ? html`<p class="help">${note}</p>` : ''}<div class="grid">${fields.map((fl) => field(fl, row[fl.k], { refs: R }))}</div></fieldset>`;
  const hoverM = pm.find((x) => x.role === 'hover'), hasHover = !!hoverM, hasInset = pm.some((x) => x.role === 'inset');
  const S = await db.settings();
  const needsHoverPhoto = !isNew && (!hoverM || !isPiecePhoto(hoverM.path));
  const body = html`${err ? html`<p class="flash bad" role="alert">${err}</p>` : ''}
${!isNew ? html`<section class="card" id="fotos"><h2>Fotos</h2>
  <p class="help">La <b>principal</b> se ve en la tarjeta; la de <b>"al pasar el cursor"</b> aparece al pasar el mouse (idealmente otra foto de la misma pieza). La del <b>cuadro pequeño</b> es opcional: se activa abajo.</p>
  ${needsHoverPhoto ? html`<p class="flash warn">${hasHover ? 'Al pasar el cursor se ve la foto del lugar o del look, porque el catálogo no trae una segunda foto de esta pieza. Se queda así hasta que subas la nueva.' : 'Falta la foto "al pasar el cursor".'}</p>
  ${promptBox('Prompt para crear la segunda foto con IA', hoverPrompt(row, S['media.prompt_style']), 'Cópialo en tu herramienta de IA junto con la foto principal como referencia. Revisa que la pieza salga igual antes de subirla con el rol "Al pasar el cursor".')}` : ''}
  <form method="post" class="mgrid">${csrf(c)}<input type="hidden" name="_action" value="media_save">
    ${pm.map((m, i) => html`<div class="mcell"><img src="/media/${m.path}" alt="" loading="lazy">
      <select name="role_${m.id}" aria-label="Rol de la foto">${ROLES.map(([v, n]) => html`<option value="${v}"${m.role === v ? raw(' selected') : ''}>${n}</option>`)}</select>
      <input name="sort_${m.id}" value="${i}" inputmode="numeric" aria-label="Orden" class="sm">
      <button class="link bad" name="_remove" value="${m.id}" formnovalidate>Quitar</button></div>`)}
    ${pm.length ? html`<div class="bar wide"><button class="btn sm">Guardar fotos</button></div>` : ''}
  </form>
  <form method="post" class="addmedia" data-mpick-form>${csrf(c)}<input type="hidden" name="_action" value="media_add"><input type="hidden" name="media_id" value="">
    <select name="role" aria-label="Rol de la nueva foto">${ROLES.map(([v, n]) => html`<option value="${v}"${(!pm.length && v === 'main') || (pm.length && !hasHover && v === 'hover') ? raw(' selected') : ''}>${n}</option>`)}</select>
    <button type="button" class="btn sm" data-pick-add>Agregar foto (elegir o subir)</button></form>
</section>` : html`<p class="flash">Guarda la pieza para poder agregar fotos.</p>`}
<form method="post" class="form" data-dirty>${csrf(c)}
  ${sec('Datos de la pieza', BASIC)}
  ${sec('Variantes', VARIANTS, 'Por ejemplo, los colores de cuarzo disponibles. En la tienda se ven como pequeñas muestras al pasar el cursor sobre la pieza, y la clienta elige una al pedir.')}
  ${sec('Precios', PRICES, 'Montos en USD. El servidor recalcula todo en cada pedido; los pedidos ya creados conservan su precio.')}
  ${user.role === 'ADMIN' ? sec('Programa Aliadas (privado)', PRIVATE, 'Nunca se muestran en la tienda ni en el código de la página.') : ''}
  ${user.role === 'ADMIN' && !isNew ? html`<section class="card"><h2>Costo de producción</h2><p>${row.prod_cost_cents != null ? html`Costo actual: <b>${money(row.prod_cost_cents)}</b> (materiales + mano de obra). ` : 'Todavía no tiene receta de materiales. '}<a class="btn sm ghost" href="/admin/costos/${row.id}">Abrir la estructura de costos</a></p></section>` : ''}
  ${sec('Caja o paquete', BOX)}
  ${sec('Cuadro pequeño (opcional)', INSET, hasInset ? 'Si es una piedra, escribe su nombre y de dónde proviene: aparece al pasar el cursor o al tocar el cuadro. Si es otra foto, deja el título vacío.' : 'Primero agrega una foto con el rol "Cuadro pequeño".')}
  ${!isNew && row.inset_title ? promptBox(`Prompt para la foto de la piedra (${row.inset_title})`, stonePrompt(row.inset_title, S['media.prompt_stone_style']), 'Para crear o reemplazar la foto del cuadro pequeño. Súbela con el rol "Cuadro pequeño".') : ''}
  ${sec('Publicación y SEO', PUB)}
  <div class="bar sticky"><button class="btn">Guardar</button>${!isNew ? html`<a class="link" href="/pieza/${row.slug}" target="_blank" rel="noopener">Ver en la tienda ↗</a>` : ''}</div>
</form>
${looks.length ? html`<p class="help">Aparece en los looks: ${looks.map((l, i) => html`${i ? ', ' : ''}<a href="/admin/looks/${l.id}">${l.name}</a>`)}</p>` : ''}
${!isNew ? html`<div class="row-actions"><form method="post">${csrf(c)}<input type="hidden" name="_action" value="duplicate"><button class="btn ghost sm">Duplicar pieza</button></form>
<form method="post" data-confirm="¿Archivar esta pieza? Dejará de verse en la tienda, pero los pedidos anteriores la conservan.">${csrf(c)}<input type="hidden" name="_action" value="archive"><button class="btn ghost sm bad">Archivar</button></form></div>` : ''}`;
  return layout(c, { title: isNew ? 'Nueva pieza' : row.name, active: 'products', body, actions: html`<a class="btn ghost" href="/admin/piezas">← Piezas</a>` });
}

async function mediaAction(c, row, a, f) {
  const { db } = c;
  const back = (msg, err) => redirect(`/admin/piezas/${row.id}?${err ? 'err' : 'msg'}=${encodeURIComponent(msg)}#fotos`, 303);
  if (a === 'media_add') {
    const mid = Number(f.media_id);
    const role = ROLES.some(([r]) => r === f.role) ? f.role : 'gallery';
    if (!mid || !(await db.first('SELECT id FROM media WHERE id=?', [mid]))) return back('Elige una foto.', true);
    const n = await db.n('SELECT COUNT(*) n FROM product_media WHERE product_id=?', [row.id]);
    const stmts = [];
    if (role !== 'gallery') stmts.push(["UPDATE product_media SET role='gallery' WHERE product_id=? AND role=?", [row.id, role]]);
    stmts.push(['INSERT INTO product_media(product_id,media_id,role,sort) VALUES (?,?,?,?)', [row.id, mid, role, n]]);
    await db.batch(stmts);
    await audit(db, c, 'foto_agregada', 'products', row.id, { media: mid, role });
    await afterWrite(c);
    return back('Foto agregada.');
  }
  if (a === 'media_save') {
    const pm = await db.all('SELECT id FROM product_media WHERE product_id=?', [row.id]);
    if (f._remove) {
      await db.run('DELETE FROM product_media WHERE id=? AND product_id=?', [Number(f._remove), row.id]);
      await afterWrite(c);
      return back('Foto quitada de la pieza (sigue en la biblioteca de fotos).');
    }
    const seen = new Set();
    const stmts = [];
    for (const { id } of pm) {
      let role = ROLES.some(([r]) => r === f[`role_${id}`]) ? f[`role_${id}`] : 'gallery';
      if (role !== 'gallery' && seen.has(role)) role = 'gallery';
      seen.add(role);
      stmts.push(['UPDATE product_media SET role=?, sort=? WHERE id=? AND product_id=?', [role, Number.parseInt(f[`sort_${id}`], 10) || 0, id, row.id]]);
    }
    if (stmts.length) await db.batch(stmts);
    await afterWrite(c);
    return back('Fotos guardadas.');
  }
  if (a === 'duplicate') {
    const cols = Object.keys(row).filter((k) => !['id', 'slug', 'name', 'sku', 'status', 'created_at', 'updated_at', 'featured'].includes(k));
    let slug = `${row.slug}-copia`;
    for (let i = 2; await db.first('SELECT 1 x FROM products WHERE slug=?', [slug]); i++) slug = `${row.slug}-copia-${i}`;
    const t = nowIso();
    const nid = (await db.run(`INSERT INTO products(${cols.join(',')},slug,name,sku,status,featured,created_at,updated_at) VALUES (${cols.map(() => '?').join(',')},?,?,?,'draft',0,?,?)`,
      [...cols.map((k) => row[k]), slug, `${row.name} (copia)`, `${row.sku}-C`, t, t])).id;
    await db.run('INSERT INTO product_media(product_id,media_id,role,sort) SELECT ?, media_id, role, sort FROM product_media WHERE product_id=?', [nid, row.id]);
    await audit(db, c, 'duplicar', 'products', nid, { from: row.id });
    return redirect(`/admin/piezas/${nid}?msg=${encodeURIComponent('Copia creada como borrador.')}`, 303);
  }
  if (a === 'archive') {
    await db.run("UPDATE products SET status='archived', featured=0, updated_at=? WHERE id=?", [nowIso(), row.id]);
    await audit(db, c, 'archivar', 'products', row.id);
    await afterWrite(c);
    return redirect(`/admin/piezas?msg=${encodeURIComponent('Pieza archivada.')}`, 303);
  }
  throw new HttpError(400);
}

export { mediaMap };
