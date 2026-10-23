// Utilidades del panel compartidas entre secciones.
import { invalidate } from '../lib/repo.js';
import { recentlyReauthed } from '../lib/security.js';
import { nowIso } from '../lib/db.js';
import { redirect } from '../http.js';

// Tras cualquier cambio: se renueva la caché del catálogo y de las páginas en el borde
export async function afterWrite(c) {
  invalidate();
  await c.db.run(`INSERT INTO settings(key,value,updated_at) VALUES ('cache.version', '2', ?)
    ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(settings.value AS INTEGER)+1 AS TEXT), updated_at=excluded.updated_at`, [nowIso()]);
  c.db._settings = null;
}

export async function mediaMap(db, ids) {
  const list = [...new Set(ids.filter((x) => x != null && x !== '').map(Number))];
  if (!list.length) return new Map();
  const rows = await db.all(`SELECT id, path, kind, alt FROM media WHERE id IN (${list.map(() => '?').join(',')})`, list);
  return new Map(rows.map((r) => [r.id, r]));
}

export function needReauth(c) {
  if (recentlyReauthed(c.sess)) return null;
  return redirect('/admin/reautenticar?next=' + encodeURIComponent(c.url.pathname), 303);
}
