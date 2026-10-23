// Almacenamiento de archivos subidos desde el panel. Cuatro modos, se elige solo según lo que esté configurado:
// - "supabase" (Vercel + Supabase): Supabase Storage en un bucket PRIVADO (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, solo en el servidor).
// - "kv" (recomendado, gratis y sin tarjeta): Workers KV, binding FILES. Hasta 25 MB por archivo, 1 GB en total gratis.
// - "r2" (opcional): bucket R2, binding MEDIA. 10 GB gratis, pero Cloudflare pide registrar un método de pago.
// - "d1" (respaldo): trozos de 1 MB dentro de D1. Útil solo para archivos pequeños.
// Rutas: u/... = público (fotos, videos) · p/... = privado (guías y ebooks: nunca se sirven directo).
import { nowIso } from './db.js';

const CHUNK = 1024 * 1024;
export const KV_MAX = 25 * 1024 * 1024;

export const storageMode = (env) => (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : env.MEDIA ? 'r2' : env.FILES ? 'kv' : 'd1');
export const maxUpload = (env) => ({ supabase: 48 * 1024 * 1024, r2: 95 * 1024 * 1024, kv: KV_MAX }[storageMode(env)] || 8 * 1024 * 1024);

// ---------- Supabase Storage (API REST; la clave de servicio nunca sale del servidor)
const sbBucket = (env) => env.SUPABASE_BUCKET || 'thf';
const sbUrl = (env, path, kind = 'object') => `${String(env.SUPABASE_URL).replace(/\/$/, '')}/storage/v1/${kind}/${sbBucket(env)}/${path.split('/').map(encodeURIComponent).join('/')}`;
const sbAuth = (env) => ({ Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY });
export async function ensureBucket(env) {
  if (storageMode(env) !== 'supabase') return;
  await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/storage/v1/bucket`, { method: 'POST', headers: { ...sbAuth(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: sbBucket(env), name: sbBucket(env), public: false, file_size_limit: maxUpload(env) }) }).catch(() => {});
}

async function toBytesAll(body, maxBytes) {
  if (body instanceof Uint8Array) {
    if (body.length > maxBytes) throw new Error('too_big');
    return body;
  }
  const reader = body.getReader();
  const parts = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error('too_big');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const hexOf = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');

// Guarda un flujo (ReadableStream) o bytes. Devuelve { size, sha256 }.
export async function putFile(env, db, path, body, contentType, { maxBytes }) {
  const mode = storageMode(env);
  maxBytes = Math.min(maxBytes, maxUpload(env));
  const bytes = await toBytesAll(body, maxBytes);
  const sha = await hexOf(bytes);
  if (mode === 'supabase') {
    const r = await fetch(sbUrl(env, path), { method: 'POST', headers: { ...sbAuth(env), 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': path.startsWith('p/') ? 'no-store' : 'max-age=31536000' }, body: bytes });
    if (!r.ok) throw new Error(`storage ${r.status}`);
  } else if (mode === 'r2') {
    await env.MEDIA.put(path, bytes, { httpMetadata: { contentType, cacheControl: path.startsWith('p/') ? 'private, no-store' : 'public, max-age=31536000, immutable' } });
  } else if (mode === 'kv') {
    await env.FILES.put(path, bytes, { metadata: { ct: contentType, size: bytes.length } });
  } else {
    const stmts = [['DELETE FROM file_chunks WHERE path=?', [path]]];
    let seq = 0;
    for (let o = 0; o < bytes.length || seq === 0; o += CHUNK) {
      const part = bytes.slice(o, o + CHUNK);
      stmts.push(['INSERT INTO file_chunks(path,seq,data) VALUES (?,?,?)', [path, seq++, part.buffer]]);
      if (!bytes.length) break;
    }
    stmts.push(['INSERT INTO files(path,content_type,size,chunks,created_at) VALUES (?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET content_type=excluded.content_type,size=excluded.size,chunks=excluded.chunks',
      [path, contentType, bytes.length, seq, nowIso()]]);
    await db.batch(stmts);
  }
  return { size: bytes.length, sha256: sha };
}

export async function readAll(env, db, path) {
  const mode = storageMode(env);
  if (mode === 'supabase') {
    const r = await fetch(sbUrl(env, path), { headers: sbAuth(env) });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  if (mode === 'r2') {
    const o = await env.MEDIA.get(path);
    return o ? new Uint8Array(await o.arrayBuffer()) : null;
  }
  if (mode === 'kv') {
    const b = await env.FILES.get(path, { type: 'arrayBuffer' });
    return b ? new Uint8Array(b) : null;
  }
  const rows = await db.all('SELECT data FROM file_chunks WHERE path=? ORDER BY seq', [path]);
  if (!rows.length) return null;
  const parts = rows.map((r) => toBytes(r.data));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function exists(env, db, path) {
  const mode = storageMode(env);
  if (mode === 'supabase') return (await fetch(sbUrl(env, path, 'object/info'), { headers: sbAuth(env) })).ok;
  if (mode === 'r2') return !!(await env.MEDIA.head(path));
  if (mode === 'kv') return (await env.FILES.list({ prefix: path, limit: 1 })).keys.some((k) => k.name === path);
  return !!(await db.first('SELECT 1 x FROM files WHERE path=?', [path]));
}

export async function deleteFile(env, db, path) {
  const mode = storageMode(env);
  if (mode === 'supabase') return fetch(sbUrl(env, path), { method: 'DELETE', headers: sbAuth(env) });
  if (mode === 'r2') return env.MEDIA.delete(path);
  if (mode === 'kv') return env.FILES.delete(path);
  await db.batch([['DELETE FROM file_chunks WHERE path=?', [path]], ['DELETE FROM files WHERE path=?', [path]]]);
}

// Respuesta HTTP con soporte de Range (necesario para reproducir video en iPhone)
export async function serveFile(env, db, path, req, { download = null, cache = 'public, max-age=31536000, immutable' } = {}) {
  const range = parseRange(req.headers.get('Range'));
  const base = { 'Cache-Control': cache, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  if (download) base['Content-Disposition'] = `attachment; filename="${download.replace(/[^\w.\- ]/g, '')}"`;
  const mode = storageMode(env);
  if (mode === 'supabase') {
    const hd = { ...sbAuth(env) };
    if (range) hd.Range = `bytes=${range.start}-${range.end ?? ''}`;
    const r = await fetch(sbUrl(env, path), { headers: hd });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok && r.status !== 206) return null;
    const h = new Headers(base);
    h.set('Content-Type', r.headers.get('Content-Type') || 'application/octet-stream');
    for (const k of ['Content-Length', 'Content-Range']) if (r.headers.get(k)) h.set(k, r.headers.get(k));
    return new Response(r.body, { status: r.status === 206 ? 206 : 200, headers: h });
  }
  if (mode === 'r2') {
    const o = await env.MEDIA.get(path, range ? { range: range.end == null ? { offset: range.start } : { offset: range.start, length: range.end - range.start + 1 } } : undefined);
    if (!o) return null;
    const h = new Headers(base);
    h.set('Content-Type', o.httpMetadata?.contentType || 'application/octet-stream');
    if (range && o.range) {
      const end = o.range.offset + o.range.length - 1;
      h.set('Content-Range', `bytes ${o.range.offset}-${end}/${o.size}`);
      h.set('Content-Length', String(o.range.length));
      return new Response(o.body, { status: 206, headers: h });
    }
    h.set('Content-Length', String(o.size));
    return new Response(o.body, { headers: h });
  }
  let bytes, ct;
  if (mode === 'kv') {
    if (!range) {
      const r = await env.FILES.getWithMetadata(path, { type: 'stream' });
      if (!r || !r.value) return null;
      const h = new Headers(base);
      h.set('Content-Type', r.metadata?.ct || 'application/octet-stream');
      if (r.metadata?.size) h.set('Content-Length', String(r.metadata.size));
      return new Response(r.value, { headers: h });
    }
    const r = await env.FILES.getWithMetadata(path, { type: 'arrayBuffer' });
    if (!r || !r.value) return null;
    bytes = new Uint8Array(r.value);
    ct = r.metadata?.ct || 'application/octet-stream';
  } else {
    const f = await db.first('SELECT * FROM files WHERE path=?', [path]);
    if (!f) return null;
    bytes = await readAll(env, db, path);
    ct = f.content_type;
  }
  const size = bytes.length;
  const h = new Headers(base);
  h.set('Content-Type', ct);
  if (range && range.start < size) {
    const end = range.end == null ? size - 1 : Math.min(range.end, size - 1);
    h.set('Content-Range', `bytes ${range.start}-${end}/${size}`);
    h.set('Content-Length', String(end - range.start + 1));
    return new Response(bytes.slice(range.start, end + 1), { status: 206, headers: h });
  }
  if (range) {
    h.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers: h });
  }
  h.set('Content-Length', String(size));
  return new Response(bytes, { headers: h });
}

function parseRange(v) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(v || '');
  return m ? { start: Number(m[1]), end: m[2] === '' ? null : Number(m[2]) } : null;
}
function toBytes(d) {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (Array.isArray(d)) return Uint8Array.from(d);
  return new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
}

// Firma de bytes: el tipo real del archivo, no la extensión
export function sniff(h) {
  if (!h || h.length < 12) return '';
  const s = (a, b) => String.fromCharCode(...h.slice(a, b));
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'jpeg';
  if (h[0] === 0x89 && s(1, 4) === 'PNG') return 'png';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'webp';
  if (s(4, 8) === 'ftyp') return ['heic', 'heix', 'mif1', 'msf1'].includes(s(8, 12)) ? 'heic' : 'mp4';
  if (s(0, 5) === '%PDF-') return 'pdf';
  if (h[0] === 0x50 && h[1] === 0x4b && h[2] === 3 && h[3] === 4) return s(30, 38) === 'mimetype' && s(38, 58) === 'application/epub+zip' ? 'epub' : 'zip';
  return '';
}

export const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', pdf: 'application/pdf', epub: 'application/epub+zip', zip: 'application/zip' };
