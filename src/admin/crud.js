// Altas, bajas y cambios genéricos a partir de una especificación por entidad.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { THEMES } from '../lib/repo.js';
import { audit } from '../lib/security.js';
import { HttpError, readForm, redirect } from '../http.js';
import { FormError, badge, csrf, empty, field, fmt, layout, parseField } from './ui.js';
import { afterWrite, mediaMap, needReauth } from './common.js';

const THEME_NAMES = { arena: 'Arena (claro)', marino: 'Marino', burdeos: 'Burdeos', oliva: 'Oliva', rosa: 'Rosa (infantil)', negro: 'Negro' };
const SEO_FIELDS = [
  { k: 'seo_title', label: 'Título para Google (máx. 60 caracteres)', max: 70, wide: true, help: 'Si lo dejas vacío se genera solo.' },
  { k: 'seo_desc', label: 'Descripción para Google (máx. 155 caracteres)', type: 'textarea', rows: 2, max: 200, wide: true },
];

const UNITS = [['unidad', 'Unidad'], ['cm', 'Centímetro'], ['metro', 'Metro'], ['gramo', 'Gramo'], ['par', 'Par'], ['paquete', 'Paquete']];
const MCATS = [['cadena', 'Cadenas'], ['piedra', 'Piedras'], ['perla', 'Perlas'], ['dije', 'Dijes y medallas'], ['cierre', 'Cierres'], ['argolla', 'Argollas'], ['hilo', 'Hilos y alambres'], ['cuenta', 'Cuentas'], ['empaque', 'Empaque'], ['otro', 'Otros']];

export const SPECS = {
  proveedores: {
    table: 'suppliers', title: 'Proveedores', one: 'proveedor', active: 'suppliers', order: 'name', stamp: true, adminOnly: true,
    intro: 'Dónde compras los materiales (Pandahall, AliExpress, Nijao Jewelry, Piedra Bellísima, Cristal Supply…). El recargo cubre envío o importación: se suma al costo de cada material de ese proveedor.',
    cols: [['name', 'Proveedor'], ['country', 'País'], ['shipping_bps', 'Recargo', (v) => (v ? `${v / 100} %` : '—')], ['n', 'Materiales'], ['active', 'Activo', fmt.bool]],
    listSql: 'SELECT s.*, (SELECT COUNT(*) FROM materials m WHERE m.supplier_id=s.id) n FROM suppliers s ORDER BY s.name',
    fields: [
      { k: 'name', label: 'Nombre', req: true, max: 80 }, { k: 'url', label: 'Página web', type: 'url' }, { k: 'country', label: 'País', max: 40 },
      { k: 'shipping_bps', label: 'Recargo por envío o importación', type: 'pct', min: 0, maxv: 300, req: true, help: 'Ej.: 15 % si el envío desde China suma eso al costo.' },
      { k: 'notes', label: 'Notas', type: 'textarea', rows: 3, wide: true }, { k: 'active', label: 'Activo', type: 'bool' },
    ],
    defaults: { shipping_bps: 0, active: 1 },
    afterSave: async (c, id) => {
      const { recomputeByMaterial, unitCostMc } = await import('../lib/costs.js');
      const s = await c.db.first('SELECT shipping_bps FROM suppliers WHERE id=?', [id]);
      for (const m of await c.db.all('SELECT id, pack_cost_cents, pack_qty FROM materials WHERE supplier_id=?', [id])) {
        await c.db.run('UPDATE materials SET unit_cost_mc=? WHERE id=?', [unitCostMc(m.pack_cost_cents, m.pack_qty, s.shipping_bps), m.id]);
        await recomputeByMaterial(c.db, m.id, c.user.id);
      }
    },
  },
  materiales: {
    table: 'materials', title: 'Materiales e insumos', one: 'material', active: 'materials', order: 'category, name', stamp: true, adminOnly: true,
    intro: 'Cada material con lo que pagas por el paquete y cuántas unidades trae: el costo por unidad se calcula solo (con el recargo del proveedor). Si cambias un precio, se recalcula el costo de todas las piezas que lo usan.',
    cols: [['name', 'Material'], ['supplier', 'Proveedor'], ['unit_cost_mc', 'Costo por unidad', (v) => `$${(v / 10000).toFixed(4).replace('.', ',')}`], ['unit', 'Unidad'], ['stock_qty', 'Existencia'], ['n', 'Piezas']],
    listSql: 'SELECT m.*, s.name supplier, (SELECT COUNT(DISTINCT product_id) FROM product_bom b WHERE b.material_id=m.id) n FROM materials m LEFT JOIN suppliers s ON s.id=m.supplier_id ORDER BY m.category, m.name',
    fields: [
      { k: 'name', label: 'Nombre', req: true, max: 120, ph: 'Perla de río 4 mm' }, { k: 'supplier_id', label: 'Proveedor', type: 'ref' },
      { k: 'category', label: 'Tipo', type: 'select', options: MCATS }, { k: 'unit', label: 'Se mide por', type: 'select', options: UNITS },
      { k: 'pack_cost_cents', label: 'Precio del paquete (USD)', type: 'money', req: true }, { k: 'pack_qty', label: 'Unidades en el paquete', type: 'real', req: true, min: 0.0001, maxv: 1000000, help: 'Ej.: 100 perlas, 5 metros.' },
      { k: 'sku', label: 'Código del proveedor', max: 60 }, { k: 'url', label: 'Enlace del producto', type: 'url' },
      { k: 'stock_qty', label: 'Existencia actual', type: 'real', min: -1000000, maxv: 10000000, help: 'Se descuenta sola cuando un pedido pasa a "En preparación".' },
      { k: 'min_stock', label: 'Avisar cuando queden menos de', type: 'real', min: 0, maxv: 1000000 },
      { k: 'photo_media_id', label: 'Foto', type: 'media' }, { k: 'notes', label: 'Notas', type: 'textarea', rows: 2, wide: true }, { k: 'active', label: 'Activo', type: 'bool' },
    ],
    defaults: { unit: 'unidad', category: 'otro', pack_qty: 1, pack_cost_cents: 0, stock_qty: 0, min_stock: 0, active: 1 },
    prepare: async (vals, c, row) => {
      const { unitCostMc } = await import('../lib/costs.js');
      c._stockDiff = Number(vals.stock_qty || 0) - Number(row?.stock_qty || 0);
      const s = vals.supplier_id ? await c.db.first('SELECT shipping_bps FROM suppliers WHERE id=?', [vals.supplier_id]) : null;
      vals.unit_cost_mc = unitCostMc(vals.pack_cost_cents || 0, vals.pack_qty || 1, s?.shipping_bps || 0);
    },
    afterSave: async (c, id, vals) => {
      const { recomputeByMaterial } = await import('../lib/costs.js');
      if (c._stockDiff) await c.db.run("INSERT INTO material_moves(material_id,qty,kind,unit_cost_mc,note,user_id,created_at) VALUES (?,?,'ajuste',?,?,?,?)",
        [id, c._stockDiff, vals.unit_cost_mc, 'Ajuste desde la ficha del material', c.user.id, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')]);
      await recomputeByMaterial(c.db, id, c.user.id);
    },
  },
  colecciones: {
    table: 'collections', title: 'Colecciones', one: 'colección', active: 'collections', order: 'sort, id',
    cols: [['name', 'Nombre'], ['slug', 'Dirección'], ['theme', 'Tono'], ['visible', 'Visible', fmt.bool], ['n', 'Piezas']],
    listSql: 'SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.collection_id=c.id AND p.status=\'published\') n FROM collections c ORDER BY c.sort, c.id',
    publicUrl: (r) => `/coleccion/${r.slug}`,
    fields: [
      { k: 'name', label: 'Nombre', req: true, max: 80 }, { k: 'slug', label: 'Dirección web', type: 'slug', req: true, help: 'thf…/coleccion/esta-direccion' },
      { k: 'kicker', label: 'Antetítulo', ph: 'Colección cápsula' }, { k: 'tagline', label: 'Frase en letra script', ph: 'una bitácora en cuatro vientos' },
      { k: 'audience', label: 'Público', ph: 'Niñas de 4 a 10 años' },
      { k: 'theme', label: 'Tono de color', type: 'select', options: THEMES.map((t) => [t, THEME_NAMES[t]]) },
      { k: 'intro', label: 'Introducción corta', type: 'textarea', rows: 2, wide: true, max: 400 },
      { k: 'story', label: 'Historia (un párrafo por línea)', type: 'textarea', rows: 7, wide: true },
      { k: 'hero_media_id', label: 'Foto grande', type: 'media' }, { k: 'card_media_id', label: 'Foto de tarjeta', type: 'media' },
      { k: 'group_by_place', label: 'Agrupar las piezas por lugar de la Bitácora', type: 'bool', wide: true },
      { k: 'visible', label: 'Visible en la tienda', type: 'bool' }, { k: 'coming_soon', label: 'Mostrar como "muy pronto"', type: 'bool' },
      { k: 'sort', label: 'Orden', type: 'int' }, ...SEO_FIELDS,
    ],
    defaults: { theme: 'arena', visible: 1, sort: 10 }, stamp: true,
  },
  lugares: {
    table: 'places', title: 'Bitácora · lugares', one: 'lugar', active: 'places', order: 'sort, id',
    intro: 'Cada lugar es un capítulo de la Bitácora del inicio, en el orden de la ruta (oeste → norte → este → sur). Cada pieza pertenece a un solo lugar.',
    cols: [['sort', '#'], ['name', 'Lugar'], ['direction', 'Punto'], ['n', 'Piezas'], ['visible', 'Visible', fmt.bool]],
    listSql: 'SELECT l.*, (SELECT COUNT(*) FROM products p WHERE p.place_id=l.id AND p.status=\'published\' AND p.in_catalog=1) n FROM places l ORDER BY l.sort, l.id',
    publicUrl: (r) => `/#lugar-${r.slug}`,
    fields: [
      { k: 'name', label: 'Nombre', req: true }, { k: 'slug', label: 'Identificador', type: 'slug', req: true },
      { k: 'region', label: 'Zona', ph: 'Bahía de Juangriego' },
      { k: 'direction', label: 'Punto cardinal', type: 'select', options: [['O', 'Oeste'], ['N', 'Norte'], ['E', 'Este'], ['S', 'Sur']] },
      { k: 'title', label: 'Título del capítulo (también es el nombre en el mapa)', req: true, max: 30 }, { k: 'subtitle', label: 'Frase en letra script' },
      { k: 'map_pos', label: 'Nombre en el mapa', type: 'select', options: [['s', 'Debajo del punto'], ['n', 'Encima del punto'], ['e', 'A la derecha'], ['w', 'A la izquierda']], help: 'Cámbialo si el nombre choca con otro.' },
      { k: 'story', label: 'Texto', type: 'textarea', rows: 4, wide: true },
      { k: 'lat', label: 'Latitud', type: 'real', req: true, help: 'Ej. 11.085 (Google Maps → clic derecho)' }, { k: 'lon', label: 'Longitud', type: 'real', req: true, help: 'Ej. -63.97' },
      { k: 'photo_media_id', label: 'Foto del lugar', type: 'media' }, { k: 'sort', label: 'Orden en la ruta', type: 'int' },
      { k: 'visible', label: 'Visible', type: 'bool' }, { k: 'direction_note', label: 'Nota interna', wide: true },
    ],
    defaults: { direction: 'N', visible: 1, sort: 99, lat: 11.0, lon: -63.9, map_pos: 's' },
  },
  categorias: {
    table: 'categories', title: 'Categorías', one: 'categoría', active: 'categories', order: 'sort, id',
    cols: [['name', 'Nombre'], ['slug', 'Identificador'], ['sort', 'Orden']],
    fields: [{ k: 'name', label: 'Nombre', req: true }, { k: 'slug', label: 'Identificador', type: 'slug', req: true }, { k: 'sort', label: 'Orden', type: 'int' }],
    defaults: { sort: 10 },
  },
  envios: {
    table: 'shipping_zones', title: 'Envíos', one: 'zona de envío', active: 'shipping', order: 'sort, id',
    intro: 'El costo de envío lo calcula el servidor con estos valores. Deja el costo vacío para "por cotizar" o "cobro a destino".',
    introLink: ['/admin/envios/estados', 'Editar lo que ve cada estado →'],
    cols: [['name', 'Zona'], ['kind', 'Tipo'], ['fee_cents', 'Costo', fmt.money], ['free_over_cents', 'Gratis desde', fmt.money], ['eta', 'Tiempo'], ['active', 'Activa', fmt.bool]],
    fields: [
      { k: 'name', label: 'Nombre visible', req: true }, { k: 'code', label: 'Código', type: 'slug', req: true },
      { k: 'kind', label: 'Tipo', type: 'select', options: [['isla', 'Delivery en la isla'], ['retiro', 'Retiro'], ['nacional', 'Nacional'], ['internacional', 'Internacional']] },
      { k: 'fee_cents', label: 'Costo', type: 'money', help: 'Vacío = por cotizar' }, { k: 'free_over_cents', label: 'Gratis desde (compras al detal)', type: 'money', help: 'Vacío = nunca gratis' },
      { k: 'allows_cod', label: 'Cobro a destino', type: 'bool' }, { k: 'eta', label: 'Tiempo de entrega', ph: '24 a 48 horas' },
      { k: 'active', label: 'Activa', type: 'bool' }, { k: 'sort', label: 'Orden', type: 'int' },
    ],
    defaults: { kind: 'isla', active: 1, sort: 10 },
  },
  pagos: {
    table: 'payment_methods', title: 'Métodos de pago', one: 'método de pago', active: 'payments', order: 'sort, id', sensitive: true, adminOnly: true,
    intro: 'Los datos de cada cuenta nunca aparecen en las páginas públicas: la clienta los ve solo en la pantalla de pago de SU pedido (o se los envías por WhatsApp). Cambiar un método pide confirmar tu identidad.',
    cols: [['name', 'Método'], ['kind', 'Tipo'], ['currency', 'Moneda'], ['adj_bps', 'Ajuste', (v) => (v ? `${v / 100} %` : '—')], ['island_only', 'Solo isla', fmt.bool], ['active', 'Activo', fmt.bool]],
    fields: [
      { k: 'name', label: 'Nombre visible', req: true }, { k: 'code', label: 'Código', type: 'slug', req: true },
      { k: 'kind', label: 'Tipo', type: 'select', options: [['pago_movil', 'Pago Móvil'], ['transferencia', 'Transferencia'], ['zelle', 'Zelle'], ['binance', 'Binance Pay'], ['paypal', 'PayPal'], ['efectivo', 'Efectivo'], ['tienda', 'Pago en la tienda'], ['otro', 'Otro']] },
      { k: 'currency', label: 'Moneda', type: 'select', options: [['USD', 'USD'], ['Bs', 'Bolívares (con la tasa del BCV)']] },
      { k: 'adj_bps', label: 'Recargo (+) o descuento (−)', type: 'pct', min: -50, maxv: 50, help: 'PayPal: 5' },
      { k: 'proof', label: 'Qué pide al pagar', type: 'select', options: [['ref', 'Referencia (captura opcional)'], ['ref_capture', 'Referencia y captura obligatoria'], ['none', 'Nada: se paga al recibir o retirar']] },
      { k: 'island_only', label: 'Solo para entregas en la isla', type: 'bool' }, { k: 'pickup_only', label: 'Solo si retira en un punto de retiro', type: 'bool' }, { k: 'active', label: 'Activo', type: 'bool' },
      { k: 'description', label: 'Texto corto para la clienta', wide: true, max: 200 },
      { k: 'instructions', label: 'Datos para enviar por WhatsApp (privado)', type: 'textarea', rows: 4, wide: true, help: 'Para el cierre por WhatsApp: se copian desde el pedido.' },
      { k: 'sort', label: 'Orden', type: 'int' },
    ],
    defaults: { currency: 'USD', adj_bps: 0, active: 1, sort: 10, kind: 'otro', proof: 'ref' },
  },
  biblioteca: {
    table: 'digital_products', title: 'Guías y ebooks', one: 'guía', active: 'digital', order: 'sort, id', stamp: true,
    intro: 'Sube el archivo (PDF, EPUB o ZIP). Nunca queda público: se entrega con enlaces personales que vencen. La duración de los enlaces se cambia en Ajustes → Descargas.',
    listActions: (c) => html`<form method="post" action="/admin/biblioteca/incluidas" class="inline">${csrf(c)}<button class="btn ghost" title="Copia al almacenamiento privado los PDF de las guías gratuitas que vienen con la tienda">Cargar las guías incluidas</button></form>`,
    cols: [['title', 'Título'], ['price_cents', 'Precio', (v) => (v ? fmt.money(v) : 'Gratis')], ['status', 'Estado', (v) => ({ draft: 'Borrador', published: 'Publicada', archived: 'Archivada' }[v] || v)], ['file_name', 'Archivo', (v) => v || '— falta —']],
    publicUrl: (r) => `/guias/${r.slug}`,
    fields: [
      { k: 'title', label: 'Título', req: true, max: 120 }, { k: 'slug', label: 'Dirección web', type: 'slug', req: true },
      { k: 'subtitle', label: 'Subtítulo', wide: true, max: 200 }, { k: 'description', label: 'Descripción (un párrafo por línea)', type: 'textarea', rows: 6, wide: true },
      { k: 'audience', label: 'Para quién' }, { k: 'format', label: 'Formato', type: 'select', options: [['PDF', 'PDF'], ['EPUB', 'EPUB'], ['ZIP', 'ZIP (kit)']] },
      { k: 'pages', label: 'Páginas', type: 'int' }, { k: 'price_cents', label: 'Precio (0 = gratis)', type: 'money', req: true },
      { k: 'cover_media_id', label: 'Portada', type: 'media' },
      { k: 'status', label: 'Estado', type: 'select', options: [['draft', 'Borrador'], ['published', 'Publicada'], ['archived', 'Archivada']] },
      { k: 'sort', label: 'Orden', type: 'int' }, ...SEO_FIELDS,
    ],
    defaults: { format: 'PDF', price_cents: 0, status: 'draft', sort: 10 },
  },
};

export async function list(c, spec, key) {
  if (spec.adminOnly && c.user.role !== 'ADMIN') throw new HttpError(403);
  const rows = await c.db.all(spec.listSql || `SELECT * FROM ${spec.table} ORDER BY ${spec.order}`);
  const body = html`${spec.intro ? html`<p class="intro">${spec.intro}${spec.introLink ? html` <a href="${spec.introLink[0]}">${spec.introLink[1]}</a>` : ''}</p>` : ''}
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${spec.cols.map(([, l]) => html`<th>${l}</th>`)}<th></th></tr></thead><tbody>
${rows.map((r) => html`<tr>${spec.cols.map(([k, , f], i) => html`<td>${i === 0 ? html`<a href="/admin/${key}/${r.id}">${f ? f(r[k]) : r[k]}</a>` : f ? f(r[k]) : r[k] ?? '—'}</td>`)}
<td class="r">${spec.publicUrl ? html`<a class="link" href="${spec.publicUrl(r)}" target="_blank" rel="noopener">Ver ↗</a>` : ''}</td></tr>`)}</tbody></table></div>` : empty('Todavía no hay registros.')}`;
  return layout(c, { title: spec.title, active: spec.active, body, actions: html`${spec.listActions ? spec.listActions(c) : ''}<a class="btn" href="/admin/${key}/nuevo">Agregar ${spec.one}</a>` });
}

export async function edit(c, spec, key, id, extra = {}) {
  if (spec.adminOnly && c.user.role !== 'ADMIN') throw new HttpError(403);
  if (spec.sensitive) { const r = needReauth(c); if (r) return r; }
  const isNew = id === 'nuevo';
  let row = isNew ? { ...spec.defaults } : await c.db.first(`SELECT * FROM ${spec.table} WHERE id=?`, [id]);
  if (!row) throw new HttpError(404);
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (f._action === 'delete' && !isNew) return remove(c, spec, key, row);
    try {
      const vals = {};
      for (const fl of spec.fields) if (!fl.ro) vals[fl.k] = parseField(fl, f[fl.k]);
      if (spec.validate) spec.validate(vals);
      if (spec.prepare) await spec.prepare(vals, c, row);
      const ks = Object.keys(vals);
      if (spec.stamp) { ks.push('updated_at'); vals.updated_at = nowIso(); }
      let newId = row.id;
      if (isNew) newId = (await c.db.run(`INSERT INTO ${spec.table}(${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map((k) => vals[k]))).id;
      else await c.db.run(`UPDATE ${spec.table} SET ${ks.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...ks.map((k) => vals[k]), row.id]);
      await audit(c.db, c, isNew ? 'crear' : 'editar', spec.table, newId, spec.table === 'payment_methods' ? { name: vals.name } : vals);
      if (spec.afterSave) await spec.afterSave(c, newId, vals);
      await afterWrite(c);
      return redirect(`/admin/${key}/${newId}?msg=${encodeURIComponent('Guardado.')}`, 303);
    } catch (e) {
      if (e instanceof FormError) err = e.message;
      else if (/UNIQUE/i.test(String(e?.message))) err = 'Ya existe un registro con ese identificador o dirección. Usa otro.';
      else throw e;
      row = { ...row, ...Object.fromEntries(spec.fields.map((fl) => [fl.k, f[fl.k]])) };
      for (const fl of spec.fields) if (fl.type === 'money' && typeof row[fl.k] === 'string') row[fl.k] = row[fl.k] === '' ? null : Math.round(Number(row[fl.k].replace(',', '.')) * 100);
    }
  }
  const media = await mediaMap(c.db, spec.fields.filter((x) => x.type === 'media').map((x) => row[x.k]));
  const body = html`${err ? html`<p class="flash bad" role="alert">${err}</p>` : ''}
<form method="post" class="card form" data-dirty>${csrf(c)}
  <div class="grid">${spec.fields.map((fl) => field(fl, row[fl.k], { media, refs: extra.refs }))}</div>
  <div class="bar"><button class="btn">Guardar</button>${!isNew && spec.publicUrl ? html`<a class="link" href="${spec.publicUrl(row)}" target="_blank" rel="noopener">Ver en la tienda ↗</a>` : ''}</div>
</form>
${extra.after || ''}
${!isNew ? html`<form method="post" class="danger" data-confirm="¿Eliminar esta ${spec.one}? No se puede deshacer.">${csrf(c)}<input type="hidden" name="_action" value="delete"><button class="btn ghost bad sm">Eliminar ${spec.one}</button></form>` : ''}`;
  return layout(c, { title: isNew ? `Nueva ${spec.one}` : row.name || row.title || spec.one, active: spec.active, body, actions: html`<a class="btn ghost" href="/admin/${key}">← ${spec.title}</a>` });
}

async function remove(c, spec, key, row) {
  try {
    await c.db.run(`DELETE FROM ${spec.table} WHERE id=?`, [row.id]);
  } catch (e) {
    if (/FOREIGN KEY|constraint/i.test(String(e?.message))) {
      return redirect(`/admin/${key}/${row.id}?err=${encodeURIComponent('No se puede eliminar porque está en uso. Desactívala u ocúltala en su lugar.')}`, 303);
    }
    throw e;
  }
  await audit(c.db, c, 'eliminar', spec.table, row.id, { name: row.name || row.title });
  await afterWrite(c);
  return redirect(`/admin/${key}?msg=${encodeURIComponent('Eliminado.')}`, 303);
}

export { badge, raw };
