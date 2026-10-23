// Versiones del esquema. Instalación nueva: schema v1 + todas las migraciones y luego los datos iniciales.
// Instalación existente: se aplican solas las migraciones pendientes (y sus datos) en la primera visita tras publicar.
import { LATEST, MIGRATIONS, MIGRATIONS_PG, SCHEMA, SCHEMA_PG } from './schema.js';
import { nowIso } from './db.js';
import { DATA_MIGRATIONS } from './seed.js';

let okVersion = 0; // caché por instancia

export async function currentVersion(db) {
  try {
    return await db.n('SELECT COALESCE(MAX(version),0) n FROM schema_version');
  } catch {
    return 0;
  }
}

const migs = (db) => (db.pg ? MIGRATIONS_PG : MIGRATIONS);

// Crea todas las tablas (sin datos) y deja la versión al día
export async function createSchema(db) {
  await db.batch((db.pg ? SCHEMA_PG : SCHEMA).map((s) => [s, []]));
  const t = nowIso();
  await db.run('INSERT INTO schema_version(version, applied_at) VALUES (1,?)', [t]);
  for (const m of migs(db)) {
    await db.batch([...m.sql.map((s) => [s, []]), ['INSERT INTO schema_version(version, applied_at) VALUES (?,?)', [m.version, t]]]);
  }
  okVersion = LATEST;
}

export async function ensureMigrated(db) {
  if (okVersion >= LATEST) return;
  const v = await currentVersion(db);
  if (v === 0) return; // no instalada todavía
  for (const m of migs(db)) {
    if (m.version <= v) continue;
    // Si dos instancias migran a la vez, la segunda falla en schema_version (clave primaria) y no repite nada: todo va en una transacción
    try {
      await db.batch([...m.sql.map((s) => [s, []]), ['INSERT INTO schema_version(version, applied_at) VALUES (?,?)', [m.version, nowIso()]]]);
    } catch (e) {
      if ((await currentVersion(db)) >= m.version) continue;
      throw e;
    }
    if (DATA_MIGRATIONS[m.version]) await DATA_MIGRATIONS[m.version](db);
  }
  okVersion = LATEST;
}

export const resetMigrationCache = () => { okVersion = 0; };
export { LATEST };
