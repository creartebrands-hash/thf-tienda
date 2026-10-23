// Servidor local para desarrollo y pruebas, sin dependencias: simula D1 (con node:sqlite), KV y los archivos estáticos.
// Uso: node dev/server.mjs [puerto]   (base de datos en dev/.data/thf.sqlite)
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');

// ---------------------------------------------------------------- D1 sobre SQLite
export function makeD1(file) {
  if (file && file !== ':memory:') {
    const d = dirname(file);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const conv = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) && !(v instanceof Uint8Array) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : v);
  const out = (row) => {
    if (!row) return row;
    const o = { ...row };
    for (const k in o) if (o[k] instanceof Uint8Array) o[k] = Array.from(o[k]); // D1 devuelve BLOB como arreglo
    return o;
  };
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...a) { return new Stmt(this.sql, a.map(conv)); }
    _p() { return db.prepare(this.sql); }
    async all() { return { results: this._p().all(...this.args).map(out), success: true, meta: {} }; }
    async first(col) { const r = out(this._p().get(...this.args)); return r ? (col ? r[col] : r) : null; }
    async run() { const r = this._p().run(...this.args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; }
    async raw() { return this._p().all(...this.args).map((r) => Object.values(out(r))); }
  }
  return {
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const res = [];
        for (const s of stmts) res.push(/^\s*(SELECT|WITH)/i.test(s.sql) ? await s.all() : await s.run());
        db.exec('COMMIT');
        return res;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
    _db: db,
  };
}

// ---------------------------------------------------------------- KV en memoria
// Con THF_KVDIR los archivos se guardan también en esa carpeta (sobreviven al reiniciar el servidor local)
export function makeKV(dir = process.env.THF_KVDIR) {
  const m = new Map();
  const fileOf = (k) => join(dir, Buffer.from(k).toString('base64url'));
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (!f.endsWith('.meta')) { const k = Buffer.from(f, 'base64url').toString(); m.set(k, { v: new Uint8Array(readFileSync(join(dir, f))), meta: existsSync(join(dir, f + '.meta')) ? JSON.parse(readFileSync(join(dir, f + '.meta'), 'utf8')) : null }); }
  }
  return {
    async put(k, v, o = {}) {
      const e = { v: new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer ? v.slice() : new TextEncoder().encode(String(v))), meta: o.metadata || null };
      m.set(k, e);
      if (dir) { writeFileSync(fileOf(k), e.v); if (e.meta) writeFileSync(fileOf(k) + '.meta', JSON.stringify(e.meta)); }
    },
    async get(k, o) {
      const e = m.get(k); if (!e) return null;
      const type = typeof o === 'string' ? o : o?.type;
      if (type === 'arrayBuffer') return e.v.buffer.slice(e.v.byteOffset, e.v.byteOffset + e.v.byteLength);
      if (type === 'stream') return new Response(e.v).body;
      return new TextDecoder().decode(e.v);
    },
    async getWithMetadata(k, o) { const e = m.get(k); if (!e) return { value: null, metadata: null }; return { value: await this.get(k, o), metadata: e.meta }; },
    async delete(k) { m.delete(k); if (dir) for (const f of [fileOf(k), fileOf(k) + '.meta']) if (existsSync(f)) unlinkSync(f); },
    async list({ prefix = '', limit = 1000 } = {}) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((name) => ({ name })), list_complete: true }; },
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.txt': 'text/plain', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export function assetFor(pathname) {
  const p = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const f = join(PUBLIC, p);
  if (!f.startsWith(PUBLIC) || !existsSync(f) || !statSync(f).isFile() || p.startsWith('/_')) return null;
  return new Response(readFileSync(f), { headers: { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=60' } });
}

// THF_DB=pg usa un PostgreSQL local (como Supabase) en lugar de SQLite: crea una base nueva por ejecución
export async function makePg() {
  const { connect } = await import('./pgwire.mjs');
  const { makePgD1 } = await import('../src/lib/pg.js');
  const host = process.env.PGHOST || '/tmp', port = Number(process.env.PGPORT || 55432);
  const admin = await connect({ host, port });
  const name = `thf_test_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${name}`);
  admin.end();
  return makePgD1(await connect({ host, port, database: name }));
}

export async function makeEnv({ file = ':memory:', kv = true } = {}) {
  return {
    DB: process.env.THF_DB === 'pg' ? await makePg() : makeD1(file), FILES: kv ? makeKV() : undefined,
    ASSETS: { fetch: async (req) => assetFor(new URL(req.url).pathname) || new Response('Not found', { status: 404 }) },
    THF_PEPPER: 'dev-pepper-0123456789-abcdefghijklmnopqrstuvwxyz', SETUP_TOKEN: 'dev-setup-token-123456', NO_EDGE_CACHE: '1', PW_ITER: '10000',
  };
}

// ---------------------------------------------------------------- servidor
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] || 8787);
  const dir = join(ROOT, 'dev/.data');
  mkdirSync(dir, { recursive: true });
  // THF_SQLITE elige otra base (p. ej. la de demostración) y THF_NOKV=1 guarda los archivos en la base para que no se pierdan al reiniciar
  const env = await makeEnv({ file: process.env.THF_SQLITE || join(dir, 'thf.sqlite'), kv: !process.env.THF_NOKV });
  const worker = (await import('../src/index.js')).default;
  createServer(async (nreq, nres) => {
    try {
      const url = new URL(nreq.url, `http://localhost:${port}`);
      // Como en Cloudflare: si existe un archivo estático, se sirve sin pasar por el Worker
      const a = (nreq.method === 'GET' || nreq.method === 'HEAD') && url.pathname !== '/' && !url.pathname.startsWith('/files/') ? assetFor(url.pathname) : null;
      let res;
      if (a) res = a;
      else {
        const chunks = [];
        for await (const ch of nreq) chunks.push(ch);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(nreq.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
        const req = new Request(url, { method: nreq.method, headers, body: ['GET', 'HEAD'].includes(nreq.method) ? undefined : body });
        res = await worker.fetch(req, env, { waitUntil: () => {} });
      }
      const h = {};
      res.headers.forEach((v, k) => { if (k === 'set-cookie') return; h[k] = v; });
      const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      if (cookies.length) h['set-cookie'] = cookies;
      nres.writeHead(res.status, h);
      if (res.body && nreq.method !== 'HEAD') nres.end(Buffer.from(await res.arrayBuffer()));
      else nres.end();
    } catch (e) {
      console.error(e);
      nres.writeHead(500); nres.end('error');
    }
  }).listen(port, () => console.log(`THF local: http://localhost:${port}`));
}
