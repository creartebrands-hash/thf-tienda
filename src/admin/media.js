// Biblioteca de fotos y videos, y subida de archivos.
// Las fotos se convierten a WebP en el navegador del panel (sin datos de ubicación, tamaño máximo 2000 px) y el servidor
// verifica la firma real del archivo antes de guardarlo. Las guías y ebooks van a almacenamiento privado.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { audit, randomToken } from '../lib/security.js';
import { MIME, deleteFile, maxUpload, putFile, sniff, storageMode } from '../lib/storage.js';
import { HttpError, json, readForm, redirect } from '../http.js';
import { afterWrite } from './common.js';
import { csrf, empty, fmt, layout } from './ui.js';

const REFS = [
  ['product_media', 'media_id'], ['collections', 'hero_media_id'], ['collections', 'card_media_id'], ['places', 'photo_media_id'],
  ['looks', 'media_id'], ['looks', 'place_media_id'], ['digital_products', 'cover_media_id'], ['pages', 'og_media_id'],
];

async function usage(db, id) {
  let n = 0;
  for (const [t, col] of REFS) n += await db.n(`SELECT COUNT(*) n FROM ${t} WHERE ${col}=?`, [id]);
  return n;
}

export async function library(c) {
  const kind = c.url.searchParams.get('tipo') === 'video' ? 'video' : c.url.searchParams.get('tipo') === 'imagen' ? 'image' : '';
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60);
  const pg = Math.max(0, Number.parseInt(c.url.searchParams.get('p') || '0', 10) || 0);
  const where = [], args = [];
  if (kind) { where.push('kind=?'); args.push(kind); }
  if (q) { where.push('(alt LIKE ? OR title LIKE ? OR path LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await c.db.all(`SELECT * FROM media ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 61 OFFSET ?`, [...args, pg * 60]);
  const more = rows.length > 60;
  const body = html`<p class="intro">Almacenamiento: <b>${{ kv: 'Cloudflare KV (gratis)', r2: 'Cloudflare R2', d1: 'base de datos D1 (solo archivos pequeños)' }[storageMode(c.env)]}</b> · máximo ${Math.round(maxUpload(c.env) / 1048576)} MB por archivo.
Las fotos se optimizan solas a WebP antes de subir.</p>
<div class="uploader card" data-uploader><input type="file" id="upFiles" accept="image/*,video/mp4" multiple hidden>
  <label for="upFiles" class="drop"><b>Arrastra fotos o videos aquí</b><span>o toca para elegirlos · JPG, PNG, WebP, HEIC del iPhone o MP4</span></label><div class="up-list"></div></div>
<form class="filters" method="get"><input type="search" name="q" value="${q}" placeholder="Buscar por descripción">
<select name="tipo"><option value="">Fotos y videos</option><option value="imagen"${kind === 'image' ? raw(' selected') : ''}>Solo fotos</option><option value="video"${kind === 'video' ? raw(' selected') : ''}>Solo videos</option></select><button class="btn ghost">Filtrar</button></form>
${rows.length ? html`<div class="mlib">${rows.slice(0, 60).map((m) => html`<a class="mtile" href="/admin/medios/${m.id}">${m.kind === 'video' ? html`<video src="/media/${m.path}" muted preload="metadata"></video>` : html`<img src="/media/${m.path}" alt="" loading="lazy">`}<small>${m.alt || m.path.split('/').pop()}</small></a>`)}</div>
<p class="pager">${pg ? html`<a class="btn ghost sm" href="?tipo=${c.url.searchParams.get('tipo') || ''}&q=${q}&p=${pg - 1}">← Anteriores</a>` : ''}${more ? html`<a class="btn ghost sm" href="?tipo=${c.url.searchParams.get('tipo') || ''}&q=${q}&p=${pg + 1}">Siguientes →</a>` : ''}</p>` : empty('No hay archivos con ese filtro.')}`;
  return layout(c, { title: 'Fotos y videos', active: 'media', body });
}

export async function item(c, id) {
  const m = await c.db.first('SELECT * FROM media WHERE id=?', [id]);
  if (!m) throw new HttpError(404);
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (f._action === 'delete') {
      const n = await usage(c.db, m.id);
      if (n) return redirect(`/admin/medios/${m.id}?err=${encodeURIComponent(`No se puede eliminar: se usa en ${n} lugar(es). Quítala de allí primero.`)}`, 303);
      if (m.path.startsWith('u/')) await deleteFile(c.env, c.db, m.path);
      await c.db.run('DELETE FROM media WHERE id=?', [m.id]);
      await audit(c.db, c, 'eliminar', 'media', m.id, { path: m.path });
      return redirect('/admin/medios?msg=' + encodeURIComponent('Archivo eliminado.'), 303);
    }
    await c.db.run('UPDATE media SET alt=?, title=?, tags=? WHERE id=?', [String(f.alt || '').slice(0, 200), String(f.title || '').slice(0, 120), String(f.tags || '').slice(0, 200), m.id]);
    await audit(c.db, c, 'editar', 'media', m.id);
    await afterWrite(c);
    return redirect(`/admin/medios/${m.id}?msg=${encodeURIComponent('Guardado.')}`, 303);
  }
  const n = await usage(c.db, m.id);
  const body = html`<div class="cols"><figure class="card mbig">${m.kind === 'video' ? html`<video src="/media/${m.path}" controls muted playsinline></video>` : html`<img src="/media/${m.path}" alt="${m.alt}">`}
<figcaption class="muted">${m.width ? `${m.width} × ${m.height} px · ` : ''}${m.bytes ? `${Math.round(m.bytes / 1024)} KB · ` : ''}subida ${fmt.date(m.created_at)}</figcaption></figure>
<form method="post" class="card stack">${csrf(c)}<label>Descripción de la foto (texto alternativo, ayuda al SEO y a la accesibilidad)<textarea name="alt" rows="3" maxlength="200">${m.alt}</textarea></label>
<label>Título interno<input name="title" value="${m.title}" maxlength="120"></label><label>Etiquetas<input name="tags" value="${m.tags}" maxlength="200" placeholder="alisios, modelo, piedra"></label>
<button class="btn">Guardar</button><p class="help">Dirección: <code>/media/${m.path}</code> · se usa en ${n} lugar(es).</p></form></div>
<form method="post" class="danger" data-confirm="¿Eliminar este archivo?">${csrf(c)}<input type="hidden" name="_action" value="delete"><button class="btn ghost bad sm">Eliminar archivo</button></form>`;
  return layout(c, { title: 'Archivo', active: 'media', body, actions: html`<a class="btn ghost" href="/admin/medios">← Fotos y videos</a>` });
}

// ---------------------------------------------------------------- API del panel (JSON)
export async function apiList(c) {
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60);
  const kind = c.url.searchParams.get('kind') === 'video' ? 'video' : c.url.searchParams.get('kind') === 'all' ? '' : 'image';
  const off = Math.max(0, Number.parseInt(c.url.searchParams.get('off') || '0', 10) || 0);
  const where = [], args = [];
  if (kind) { where.push('kind=?'); args.push(kind); }
  if (q) { where.push('(alt LIKE ? OR title LIKE ? OR tags LIKE ? OR path LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await c.db.all(`SELECT id, kind, path, alt FROM media ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 48 OFFSET ?`, [...args, off]);
  return json({ items: rows.map((r) => ({ id: r.id, kind: r.kind, url: `/media/${r.path}`, alt: r.alt })), more: rows.length === 48 });
}

async function readUpload(c, max) {
  const len = Number(c.req.headers.get('Content-Length') || 0);
  if (!len) throw new HttpError(411, 'Falta el tamaño del archivo.');
  if (len > max) throw new HttpError(413, `El archivo supera el máximo de ${Math.round(max / 1048576)} MB.`);
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > max) throw new HttpError(413, 'Archivo demasiado grande.');
  return bytes;
}

export async function apiUpload(c) {
  const kind = c.url.searchParams.get('kind') === 'video' ? 'video' : 'image';
  const max = Math.min(maxUpload(c.env), kind === 'image' ? 8 * 1048576 : maxUpload(c.env));
  const bytes = await readUpload(c, max);
  const type = sniff(bytes.slice(0, 64));
  const okTypes = kind === 'image' ? ['webp', 'jpeg', 'png'] : ['mp4'];
  if (!okTypes.includes(type)) throw new HttpError(415, kind === 'image' ? 'Formato no permitido. Sube JPG, PNG o WebP.' : 'Solo se admiten videos MP4.');
  const d = new Date();
  const path = `u/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomToken(9)}.${type === 'jpeg' ? 'jpg' : type}`;
  const info = await putFile(c.env, c.db, path, bytes, MIME[type], { maxBytes: max });
  const w = Number.parseInt(c.req.headers.get('X-Width') || '', 10) || null, h = Number.parseInt(c.req.headers.get('X-Height') || '', 10) || null;
  const alt = decodeURIComponent(c.req.headers.get('X-Alt') || '').slice(0, 200);
  const r = await c.db.run('INSERT INTO media(kind,path,width,height,bytes,alt,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [kind, path, w, h, info.size, alt, c.user.id, nowIso()]);
  await audit(c.db, c, 'subir', 'media', r.id, { path, bytes: info.size });
  return json({ id: r.id, url: `/media/${path}`, kind });
}

export async function apiDigitalFile(c, id) {
  const d = await c.db.first('SELECT * FROM digital_products WHERE id=?', [id]);
  if (!d) throw new HttpError(404);
  const bytes = await readUpload(c, maxUpload(c.env));
  const type = sniff(bytes.slice(0, 64));
  if (!['pdf', 'epub', 'zip'].includes(type)) throw new HttpError(415, 'Sube un PDF, EPUB o ZIP.');
  const name = (decodeURIComponent(c.req.headers.get('X-Filename') || '') || `${d.slug}.${type}`).replace(/[^\w.\- ]/g, '').slice(0, 100) || `${d.slug}.${type}`;
  const path = `p/digital/${randomToken(12)}.${type}`;
  const info = await putFile(c.env, c.db, path, bytes, MIME[type], { maxBytes: maxUpload(c.env) });
  const old = d.file_path;
  await c.db.run('UPDATE digital_products SET file_path=?, file_name=?, file_bytes=?, file_sha256=?, format=?, updated_at=? WHERE id=?',
    [path, name, info.size, info.sha256, type === 'zip' ? 'ZIP' : type.toUpperCase(), nowIso(), d.id]);
  if (old && old !== path) await deleteFile(c.env, c.db, old).catch(() => {});
  await audit(c.db, c, 'subir_archivo', 'digital_products', d.id, { name, bytes: info.size, sha256: info.sha256 });
  await afterWrite(c);
  return json({ ok: true, name, size: info.size });
}
