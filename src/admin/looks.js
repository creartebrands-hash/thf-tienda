// Compra el look: combos de varios sets. Precio = suma de piezas − descuento del look (lo calcula el servidor).
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { money, pct, unitRetail } from '../lib/pricing.js';
import { audit } from '../lib/security.js';
import { HttpError, readForm, redirect } from '../http.js';
import { afterWrite, mediaMap } from './common.js';
import { FormError, badge, csrf, empty, field, layout, parseField, slugify } from './ui.js';

const F = [
  { k: 'name', label: 'Nombre del look', req: true, max: 80 }, { k: 'slug', label: 'Identificador', type: 'slug', req: true },
  { k: 'subtitle', label: 'Antetítulo', ph: 'Set para combinar' }, { k: 'collection_id', label: 'Colección', type: 'ref' },
  { k: 'place_id', label: 'Lugar', type: 'ref' }, { k: 'discount_bps', label: 'Descuento del look completo', type: 'pct', min: 0, maxv: 60, req: true },
  { k: 'story', label: 'Texto', type: 'textarea', rows: 3, wide: true },
  { k: 'media_id', label: 'Foto del look (con los puntos)', type: 'media' }, { k: 'place_media_id', label: 'Foto del lugar', type: 'media' },
  { k: 'active', label: 'Activo', type: 'bool' }, { k: 'sort', label: 'Orden', type: 'int' },
];

export async function list(c) {
  const rows = await c.db.all(`SELECT l.*, m.path, (SELECT COUNT(*) FROM look_items i WHERE i.look_id=l.id) n, c.name col FROM looks l
     LEFT JOIN media m ON m.id=l.media_id LEFT JOIN collections c ON c.id=l.collection_id ORDER BY l.sort, l.id`);
  const body = html`<p class="intro">Cada look combina varias piezas. La clienta puede comprarlo completo con descuento o elegir solo algunas piezas (sin descuento).</p>
${rows.length ? html`<div class="plist">${rows.map((r) => html`<a class="pitem" href="/admin/looks/${r.id}"><span class="pimg">${r.path ? html`<img src="/media/${r.path}" alt="" loading="lazy">` : ''}</span>
<span class="ptxt"><b>${r.name}</b><small>${r.col || '—'} · ${r.n} piezas · −${r.discount_bps / 100} %</small><span class="tags">${r.active ? '' : badge('Inactivo', 'muted')}</span></span></a>`)}</div>` : empty('Todavía no hay looks.')}`;
  return layout(c, { title: 'Compra el look', active: 'looks', body, actions: html`<a class="btn" href="/admin/looks/nuevo">Crear look</a>` });
}

export async function edit(c, id) {
  const { db } = c;
  const isNew = id === 'nuevo';
  let row = isNew ? { discount_bps: 1000, active: 1, sort: 50, subtitle: 'Set para combinar' } : await db.first('SELECT * FROM looks WHERE id=?', [id]);
  if (!row) throw new HttpError(404);
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (!isNew && f._action === 'items') return saveItems(c, row, f);
    if (!isNew && f._action === 'delete') {
      await db.run('DELETE FROM looks WHERE id=?', [row.id]);
      await audit(db, c, 'eliminar', 'looks', row.id, { name: row.name });
      await afterWrite(c);
      return redirect('/admin/looks?msg=' + encodeURIComponent('Look eliminado.'), 303);
    }
    try {
      if (!f.slug && f.name) f.slug = 'look-' + slugify(f.name);
      const v = Object.fromEntries(F.map((fl) => [fl.k, parseField(fl, f[fl.k])]));
      v.updated_at = nowIso();
      const ks = Object.keys(v);
      let nid = row.id;
      if (isNew) nid = (await db.run(`INSERT INTO looks(${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map((k) => v[k]))).id;
      else await db.run(`UPDATE looks SET ${ks.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...ks.map((k) => v[k]), row.id]);
      await audit(db, c, isNew ? 'crear' : 'editar', 'looks', nid, { name: v.name, discount_bps: v.discount_bps });
      await afterWrite(c);
      return redirect(`/admin/looks/${nid}?msg=${encodeURIComponent('Guardado.')}`, 303);
    } catch (e) {
      if (e instanceof FormError) err = e.message;
      else if (/UNIQUE/i.test(String(e?.message))) err = 'Ya existe un look con ese identificador.';
      else throw e;
    }
  }
  const [cols, pls, prods] = await Promise.all([db.all('SELECT id, name FROM collections ORDER BY sort'), db.all('SELECT id, name FROM places ORDER BY sort'),
    db.all(`SELECT p.id, p.name, p.price_cents, p.offer_cents, c.name col FROM products p LEFT JOIN collections c ON c.id=p.collection_id WHERE p.status='published' AND p.is_bundle=0 ORDER BY c.sort, p.sort`)]);
  const refs = { collection_id: cols.map((r) => [r.id, r.name]), place_id: pls.map((r) => [r.id, r.name]) };
  const media = await mediaMap(db, [row.media_id, row.place_media_id]);
  const items = isNew ? [] : await db.all(`SELECT i.*, p.name, p.price_cents, p.offer_cents, p.status FROM look_items i JOIN products p ON p.id=i.product_id WHERE i.look_id=? ORDER BY i.sort, i.id`, [row.id]);
  const full = items.reduce((a, i) => a + unitRetail(i) * i.qty, 0);
  const disc = pct(full, row.discount_bps);
  const photo = media.get(row.media_id);
  const body = html`${err ? html`<p class="flash bad" role="alert">${err}</p>` : ''}
<form method="post" class="card form" data-dirty>${csrf(c)}<div class="grid">${F.map((fl) => field(fl, row[fl.k], { media, refs }))}</div><div class="bar"><button class="btn">Guardar</button></div></form>
${!isNew ? html`<section class="card"><h2>Piezas del look</h2>
  <p class="help">Toca una pieza de la lista y luego toca la foto para colocar su punto. Precio: suma de piezas ${money(full)} − ${row.discount_bps / 100} % = <b>${money(full - disc)}</b>.</p>
  <form method="post" class="look-edit" data-hotspots>${csrf(c)}<input type="hidden" name="_action" value="items">
    <div class="hs-photo">${photo ? html`<img src="/media/${photo.path}" alt="">` : html`<p class="empty">Primero elige la foto del look.</p>`}
      ${items.map((it, n) => html`<span class="hs" data-hs="${it.id}" style="left:${it.x}%;top:${it.y}%">${n + 1}</span>`)}</div>
    <ol class="hs-list">${items.map((it, n) => html`<li data-hs-item="${it.id}"><button type="button" class="hs-sel">${n + 1}</button><span>${it.name}${it.status !== 'published' ? badge('No publicada', 'bad') : ''}<small>${money(unitRetail(it))}</small></span>
      <label>Cant. <input name="qty_${it.id}" value="${it.qty}" class="sm" inputmode="numeric"></label><input type="hidden" name="x_${it.id}" value="${it.x}"><input type="hidden" name="y_${it.id}" value="${it.y}">
      <button class="link bad" name="_remove" value="${it.id}">Quitar</button></li>`)}</ol>
    <div class="addrow"><select name="add_product" aria-label="Agregar pieza"><option value="">Agregar una pieza…</option>${prods.map((p) => html`<option value="${p.id}">${p.col ? p.col + ' · ' : ''}${p.name} (${money(unitRetail(p))})</option>`)}</select></div>
    <div class="bar"><button class="btn">Guardar piezas y puntos</button></div>
  </form></section>
<form method="post" class="danger" data-confirm="¿Eliminar este look?">${csrf(c)}<input type="hidden" name="_action" value="delete"><button class="btn ghost bad sm">Eliminar look</button></form>` : ''}`;
  return layout(c, { title: isNew ? 'Nuevo look' : `Look ${row.name}`, active: 'looks', body, actions: html`<a class="btn ghost" href="/admin/looks">← Looks</a>` });
}

async function saveItems(c, row, f) {
  const { db } = c;
  const items = await db.all('SELECT id FROM look_items WHERE look_id=?', [row.id]);
  const stmts = [];
  if (f._remove) stmts.push(['DELETE FROM look_items WHERE id=? AND look_id=?', [Number(f._remove), row.id]]);
  const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 50));
  items.forEach(({ id }, n) => {
    if (String(id) === String(f._remove)) return;
    const q = Math.max(1, Math.min(20, Number.parseInt(f[`qty_${id}`], 10) || 1));
    stmts.push(['UPDATE look_items SET qty=?, x=?, y=?, sort=? WHERE id=? AND look_id=?', [q, clamp(f[`x_${id}`]), clamp(f[`y_${id}`]), n, id, row.id]]);
  });
  if (f.add_product && /^\d+$/.test(f.add_product)) {
    if (!(await db.first("SELECT id FROM products WHERE id=? AND status='published'", [Number(f.add_product)]))) throw new HttpError(400);
    stmts.push(['INSERT INTO look_items(look_id,product_id,qty,x,y,sort) VALUES (?,?,1,50,50,?)', [row.id, Number(f.add_product), items.length]]);
  }
  stmts.push(['UPDATE looks SET updated_at=? WHERE id=?', [nowIso(), row.id]]);
  await db.batch(stmts);
  await audit(db, c, 'editar_piezas', 'looks', row.id);
  await afterWrite(c);
  return redirect(`/admin/looks/${row.id}?msg=${encodeURIComponent('Piezas guardadas.')}`, 303);
}
