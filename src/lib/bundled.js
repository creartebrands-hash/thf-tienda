// Guías incluidas con la tienda (public/files/*.pdf): se copian al almacenamiento privado para entregarlas con enlaces que vencen.
// Se usa al instalar y desde el panel (Guías y ebooks → "Cargar las guías incluidas") en tiendas que ya estaban instaladas.
import { SEED } from './seed-data.js';
import { putFile } from './storage.js';

async function fetchAsset(c, path) {
  if (c.env.PLATFORM === 'vercel') {
    // En Vercel los PDF van incluidos en la función (vercel.json → includeFiles): se leen del disco
    try {
      const fsMod = 'node:fs/promises'; // especificador en variable: el empaquetador de Cloudflare no intenta incluirlo
      const { readFile } = await import(fsMod);
      return new Uint8Array(await readFile(new URL(`../../public${path}`, import.meta.url)));
    } catch {}
  }
  const req = new Request(c.url.origin + path);
  const r = c.env.ASSETS ? await c.env.ASSETS.fetch(req) : await fetch(req);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}

export async function loadBundledFiles(c, { replace = false } = {}) {
  const { env, db } = c;
  let n = 0;
  for (const d of SEED.DIGITAL) {
    if (!d.file) continue;
    const row = await db.first('SELECT id, file_path FROM digital_products WHERE slug=?', [d.slug]);
    if (!row || (row.file_path && !replace)) continue;
    const bytes = await fetchAsset(c, `/files/${d.file}`);
    if (!bytes || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') continue;
    const path = `p/digital/${d.file}`;
    const info = await putFile(env, db, path, bytes, 'application/pdf', { maxBytes: 20 * 1024 * 1024 });
    await db.run('UPDATE digital_products SET file_path=?, file_name=?, file_bytes=?, file_sha256=? WHERE id=?', [path, d.file, info.size, info.sha256, row.id]);
    n++;
  }
  return n;
}
