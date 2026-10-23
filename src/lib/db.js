// Acceso a Cloudflare D1 (SQLite). Consultas siempre parametrizadas.
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export class DB {
  constructor(d1) {
    this.d1 = d1;
    this.pg = d1?.dialect === 'pg';
    this._settings = null;
  }
  prep(sql, args = []) {
    return this.d1.prepare(sql).bind(...args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a)));
  }
  async all(sql, args = []) {
    const r = await this.prep(sql, args).all();
    return r.results || [];
  }
  async first(sql, args = []) {
    return (await this.prep(sql, args).first()) || null;
  }
  async run(sql, args = []) {
    const r = await this.prep(sql, args).run();
    return { id: r.meta?.last_row_id ?? null, changes: r.meta?.changes ?? 0 };
  }
  async n(sql, args = []) {
    const r = await this.first(sql, args);
    return r ? Number(Object.values(r)[0]) || 0 : 0;
  }
  // Varias sentencias atómicas (D1 no admite BEGIN/COMMIT explícitos)
  async batch(stmts) {
    return this.d1.batch(stmts.map(([sql, args]) => this.prep(sql, args || [])));
  }
  async exec(script) {
    return this.d1.exec(script);
  }

  // ----- ajustes editables con historial
  async settings() {
    if (!this._settings) {
      const rows = await this.all('SELECT key, value FROM settings');
      this._settings = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    }
    return this._settings;
  }
  async setting(key, def = null) {
    const s = await this.settings();
    return key in s && s[key] !== null ? s[key] : def;
  }
  async setSetting(key, value, userId = null, reason = '') {
    const cur = await this.first('SELECT value FROM settings WHERE key=?', [key]);
    const nv = JSON.stringify(value);
    if (cur && cur.value === nv) return false;
    const t = nowIso();
    await this.batch([
      ['INSERT INTO settings(key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by', [key, nv, t, userId]],
      ['INSERT INTO setting_revisions(key,old_value,new_value,user_id,reason,at) VALUES (?,?,?,?,?,?)', [key, cur ? cur.value : null, nv, userId, reason, t]],
    ]);
    this._settings = null;
    return true;
  }
}
