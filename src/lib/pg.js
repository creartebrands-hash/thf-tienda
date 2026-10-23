// Adaptador PostgreSQL (Supabase) con la misma interfaz que Cloudflare D1, para que el resto del código no cambie.
// Recibe un "driver" con query(text, params) y transaction(fn). En Vercel el driver es el paquete `pg` (api/index.js);
// en pruebas locales, dev/pgwire.mjs. Traduce el dialecto SQLite del proyecto: ? → $n, LIKE → ILIKE y RETURNING id.

const NO_ID = new Set(['settings', 'rate_events', 'shipping_states', 'file_chunks', 'files', 'pages', 'partner_prices', 'schema_version']);

export function pgSql(sql) {
  let out = '', n = 0, q = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") q = !q;
    if (!q && ch === '?') { out += `$${++n}`; continue; }
    out += ch;
  }
  // LIKE de SQLite no distingue mayúsculas; en PostgreSQL eso es ILIKE (fuera de comillas)
  out = out.replace(/('(?:[^']|'')*')|\bLIKE\b/g, (m, lit) => (lit ? lit : 'ILIKE'));
  const ins = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(out);
  if (ins && !NO_ID.has(ins[1].toLowerCase()) && !/\bRETURNING\b/i.test(out)) out += ' RETURNING id';
  return out;
}

const toBuf = (u) => (typeof Buffer !== 'undefined' && !Buffer.isBuffer(u) ? Buffer.from(u.buffer, u.byteOffset, u.byteLength) : u);
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v instanceof ArrayBuffer ? toBuf(new Uint8Array(v)) : v instanceof Uint8Array ? toBuf(v) : v);

function mapError(e) {
  const code = e?.code;
  const msg = String(e?.message || e);
  let m = msg;
  if (code === '23505') m = `UNIQUE constraint failed: ${e.constraint || ''} ${e.detail || msg}`;
  else if (code === '23503') m = `FOREIGN KEY constraint failed: ${e.detail || msg}`;
  else if (code === '23514') m = `CHECK constraint failed: ${e.constraint || msg}`;
  else if (code === '23502') m = `NOT NULL constraint failed: ${e.column || msg}`;
  const err = new Error(m);
  err.code = code;
  err.cause = e;
  return err;
}

class Stmt {
  constructor(drv, sql, args = []) { this.drv = drv; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.drv, this.sql, a.map(norm)); }
  async _q(q = this.drv.query.bind(this.drv)) {
    try {
      return await q(pgSql(this.sql), this.args);
    } catch (e) {
      throw mapError(e);
    }
  }
  async all(q) { const r = await this._q(q); return { results: r.rows, success: true, meta: {} }; }
  async first(col, q) { const r = await this._q(q); const row = r.rows[0]; return row ? (col ? row[col] : row) : null; }
  async run(q) {
    const r = await this._q(q);
    return { success: true, meta: { last_row_id: r.rows?.[0]?.id != null ? Number(r.rows[0].id) : null, changes: r.rowCount ?? 0 } };
  }
}

export function makePgD1(drv) {
  return {
    dialect: 'pg',
    prepare: (sql) => new Stmt(drv, sql),
    async batch(stmts) {
      return drv.transaction(async (q) => {
        const res = [];
        for (const s of stmts) res.push(/^\s*(SELECT|WITH)/i.test(s.sql) ? await s.all(q) : await s.run(q));
        return res;
      });
    },
    async exec(sql) {
      await drv.query(sql, []);
      return { count: 1 };
    },
  };
}
