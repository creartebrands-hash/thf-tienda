// Imágenes para aliadas: THF decide qué banners y qué fotos de cada pieza pueden usar las tiendas aliadas (/e/slug).
// Las aliadas solo eligen entre estas opciones; no suben nada. Las fotos de la tienda principal no se usan en sus tiendas.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { mediaUrl } from '../lib/repo.js';
import { audit } from '../lib/security.js';
import * as V from '../lib/validate.js';
import { HttpError, readForm, redirect } from '../http.js';
import { csrf, empty, layout } from './ui.js';

export async function page(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db } = c;
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    const back = (k, m, hash = '') => redirect(`/admin/aliadas-imagenes?${k}=${encodeURIComponent(m)}${hash}`, 303);
    if (f._action === 'add') {
      const kind = f.kind === 'banner' ? 'banner' : 'pieza';
      const mediaId = Number(f.media_id), productId = kind === 'pieza' ? Number(f.product_id) : null;
      const m = Number.isInteger(mediaId) && (await db.first("SELECT id, kind FROM media WHERE id=?", [mediaId]));
      if (!m || m.kind !== 'image') return back('err', 'Elige una foto (no video).');
      if (kind === 'pieza' && !(await db.first('SELECT id FROM products WHERE id=?', [productId]))) return back('err', 'Esa pieza no existe.');
      if (await db.first('SELECT id FROM aliada_assets WHERE kind=? AND media_id=? AND COALESCE(product_id,0)=?', [kind, mediaId, productId || 0])) return back('err', 'Esa foto ya está agregada.');
      const sort = await db.n('SELECT COALESCE(MAX(sort),0)+1 n FROM aliada_assets WHERE kind=? AND COALESCE(product_id,0)=?', [kind, productId || 0]);
      await db.run('INSERT INTO aliada_assets(kind,product_id,media_id,title,sort,active,created_at) VALUES (?,?,?,?,?,1,?)', [kind, productId, mediaId, V.line(f.title, 60), sort, nowIso()]);
      await audit(db, c, 'imagen_aliadas_agregar', 'aliada_assets', null, { kind, product: productId, media: mediaId });
      return back('msg', kind === 'banner' ? 'Banner agregado.' : 'Foto agregada.', kind === 'banner' ? '#banners' : `#p${productId}`);
    }
    if (f._action === 'del') {
      const row = await db.first('SELECT * FROM aliada_assets WHERE id=?', [Number(f.id)]);
      if (!row) return back('err', 'No se encontró.');
      // Quien la usaba vuelve a la primera opción disponible (o sin banner)
      await db.batch([['UPDATE partners SET store_banner_id=NULL WHERE store_banner_id=?', [row.id]], ['UPDATE partner_prices SET asset_id=NULL WHERE asset_id=?', [row.id]], ['DELETE FROM aliada_assets WHERE id=?', [row.id]]]);
      await audit(db, c, 'imagen_aliadas_quitar', 'aliada_assets', row.id, { kind: row.kind, product: row.product_id });
      return back('msg', 'Quitada.', row.kind === 'banner' ? '#banners' : `#p${row.product_id}`);
    }
    throw new HttpError(400);
  }
  const assets = await db.all('SELECT a.*, m.path FROM aliada_assets a JOIN media m ON m.id=a.media_id ORDER BY a.kind, a.product_id, a.sort, a.id');
  const prods = await db.all(`SELECT p.id, p.name, p.sku, c.name col, (SELECT m.path FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=p.id AND pm.role='main' LIMIT 1) main
    FROM products p LEFT JOIN collections c ON c.id=p.collection_id WHERE p.status='published' AND p.is_bundle=0 ORDER BY c.sort, p.sort, p.id`);
  const uses = new Map((await db.all('SELECT asset_id, COUNT(*) n FROM partner_prices WHERE asset_id IS NOT NULL GROUP BY asset_id')).map((r) => [r.asset_id, r.n]));
  const bannerUses = new Map((await db.all('SELECT store_banner_id id, COUNT(*) n FROM partners WHERE store_banner_id IS NOT NULL GROUP BY store_banner_id')).map((r) => [r.id, r.n]));
  const banners = assets.filter((a) => a.kind === 'banner');
  const by = new Map();
  for (const a of assets.filter((x) => x.kind === 'pieza')) { if (!by.has(a.product_id)) by.set(a.product_id, []); by.get(a.product_id).push(a); }
  const missing = prods.filter((p) => !by.has(p.id)).length;
  const thumb = (a, n) => html`<figure class="al-th"><img src="${mediaUrl(a.path)}" alt="" loading="lazy"><figcaption>${n ? `En uso por ${n}` : 'Sin usar'}<form method="post" class="inline">${csrf(c)}<input type="hidden" name="_action" value="del"><input type="hidden" name="id" value="${a.id}"><button class="link bad">Quitar</button></form></figcaption></figure>`;
  const addForm = (kind, pid = '') => html`<form method="post" class="inline al-add">${csrf(c)}<input type="hidden" name="_action" value="add"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="product_id" value="${pid}"><input type="hidden" name="media_id" value="">
    ${kind === 'banner' ? html`<input name="title" maxlength="60" placeholder="Nombre (ej. Atardecer en Pampatar)">` : ''}<button type="button" class="btn sm ghost" data-pick-add>+ ${kind === 'banner' ? 'Agregar banner' : 'Agregar foto'}</button></form>`;
  const body = html`<p class="intro">Las tiendas de las aliadas no usan las fotos de la tienda principal. Aquí eliges qué <b>banners</b> y qué <b>fotos de cada pieza</b> pueden usar; cada aliada escoge uno de los banners y una foto por pieza en su portal. Las piezas sin fotos aquí no aparecen en sus tiendas.</p>
${missing ? html`<p class="flash warn">${missing} pieza(s) todavía no tienen fotos para aliadas y no se pueden mostrar en sus tiendas.</p>` : ''}
<section class="card" id="banners"><h2>Banners</h2><p class="help">Foto horizontal, idealmente 1800 × 700 px. Se ve arriba de su tienda.</p>
<div class="al-grid wide">${banners.map((a) => thumb(a, bannerUses.get(a.id)))}</div>${banners.length ? '' : html`<p class="muted">Todavía no hay banners.</p>`}<p>${addForm('banner')}</p></section>
<section class="card"><h2>Fotos por pieza</h2><p class="help">Agrega una o varias fotos por pieza (distintas a las de la tienda principal). La aliada elige una.</p>
${prods.length ? html`<div class="al-list">${prods.map((p) => html`<div class="al-row" id="p${p.id}"><div class="al-ref">${p.main ? html`<img src="${mediaUrl(p.main)}" alt="" loading="lazy">` : ''}<div><b>${p.name}</b><small class="muted">${p.col || ''} · ${p.sku}</small><small class="muted">Foto de la tienda principal (no se usa)</small></div></div>
  <div class="al-grid">${(by.get(p.id) || []).map((a) => thumb(a, uses.get(a.id)))}${by.has(p.id) ? '' : html`<p class="muted small">Sin fotos para aliadas</p>`}</div><div>${addForm('pieza', p.id)}</div></div>`)}</div>` : empty('No hay piezas publicadas.')}</section>`;
  return layout(c, { title: 'Imágenes para aliadas', active: 'aliada_assets', body });
}
