// Cliente mínimo del protocolo de PostgreSQL (solo para pruebas locales con autenticación "trust", sin dependencias).
// En producción (Vercel) se usa el paquete `pg`. Expone la misma interfaz de driver: query(text, params) y transaction(fn).
import net from 'node:net';

const INT = new Set([20, 21, 23, 26]), FLOAT = new Set([700, 701, 1700]);
function parse(v, oid) {
  if (v === null) return null;
  if (INT.has(oid) || FLOAT.has(oid)) return Number(v);
  if (oid === 16) return v === 't';
  if (oid === 17) return Uint8Array.from(Buffer.from(v.slice(2), 'hex'));
  return v;
}

export async function connect({ host = '/tmp', port = 55432, user = 'postgres', database = 'postgres' } = {}) {
  const sock = host.startsWith('/') ? net.createConnection(`${host}/.s.PGSQL.${port}`) : net.createConnection(port, host);
  await new Promise((ok, ko) => { sock.once('connect', ok); sock.once('error', ko); });
  let buf = Buffer.alloc(0);
  const waiters = [];
  const msgs = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 5) {
      const len = buf.readInt32BE(1);
      if (buf.length < len + 1) break;
      msgs.push({ t: String.fromCharCode(buf[0]), b: buf.subarray(5, len + 1) });
      buf = buf.subarray(len + 1);
    }
    while (msgs.length && waiters.length) waiters.shift()(msgs.shift());
  });
  const next = () => (msgs.length ? Promise.resolve(msgs.shift()) : new Promise((r) => waiters.push(r)));
  const cstr = (s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
  const msg = (t, body) => { const h = Buffer.alloc(5); h.write(t, 0); h.writeInt32BE(body.length + 4, 1); return Buffer.concat([h, body]); };
  const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };

  const start = Buffer.concat([i32(196608), cstr('user'), cstr(user), cstr('database'), cstr(database), cstr('client_encoding'), cstr('UTF8'), Buffer.from([0])]);
  sock.write(Buffer.concat([i32(start.length + 4), start]));
  for (;;) {
    const m = await next();
    if (m.t === 'R' && m.b.readInt32BE(0) !== 0) throw new Error('pgwire: solo autenticación trust');
    if (m.t === 'E') throw new Error('pgwire: ' + m.b.toString());
    if (m.t === 'Z') break;
  }
  sock.unref(); // no impide que termine el proceso de pruebas
  const errOf = (b) => {
    const f = {};
    let i = 0;
    while (i < b.length && b[i] !== 0) { const k = String.fromCharCode(b[i]); const e = b.indexOf(0, i + 1); f[k] = b.subarray(i + 1, e).toString(); i = e + 1; }
    const err = new Error(f.M || 'error');
    Object.assign(err, { code: f.C, detail: f.D, constraint: f.n, column: f.c });
    return err;
  };

  let chain = Promise.resolve(), pending = 0;
  // El socket mantiene vivo el proceso solo mientras hay consultas en curso
  const serial = (fn) => {
    pending++;
    sock.ref();
    const p = chain.then(fn, fn).finally(() => { if (--pending === 0) sock.unref(); });
    chain = p.catch(() => {});
    return p;
  };

  async function rawQuery(text, params = []) {
    const vals = params.map((v) => (v === null || v === undefined ? null : v instanceof Uint8Array ? '\\x' + Buffer.from(v).toString('hex') : String(v)));
    const bind = [cstr(''), cstr(''), i16(0), i16(vals.length)];
    for (const v of vals) {
      if (v === null) bind.push(i32(-1));
      else { const b = Buffer.from(v, 'utf8'); bind.push(i32(b.length), b); }
    }
    bind.push(i16(0));
    sock.write(Buffer.concat([msg('P', Buffer.concat([cstr(''), cstr(text), i16(0)])), msg('B', Buffer.concat(bind)), msg('D', Buffer.concat([Buffer.from('P'), cstr('')])),
      msg('E', Buffer.concat([cstr(''), i32(0)])), msg('S', Buffer.alloc(0))]));
    let fields = [], rows = [], rowCount = 0, error = null;
    for (;;) {
      const m = await next();
      if (m.t === 'T') {
        const n = m.b.readInt16BE(0);
        let o = 2;
        fields = [];
        for (let i = 0; i < n; i++) { const e = m.b.indexOf(0, o); const name = m.b.subarray(o, e).toString(); o = e + 1; const oid = m.b.readInt32BE(o + 6); o += 18; fields.push({ name, oid }); }
      } else if (m.t === 'D') {
        const n = m.b.readInt16BE(0);
        let o = 2;
        const row = {};
        for (let i = 0; i < n; i++) {
          const len = m.b.readInt32BE(o); o += 4;
          const v = len < 0 ? null : m.b.subarray(o, o + len).toString('utf8');
          if (len > 0) o += len;
          row[fields[i].name] = parse(v, fields[i].oid);
        }
        rows.push(row);
      } else if (m.t === 'C') {
        const tag = m.b.subarray(0, m.b.length - 1).toString();
        const num = Number(tag.split(' ').pop());
        rowCount = Number.isFinite(num) ? num : rows.length;
      } else if (m.t === 'E') error = errOf(m.b);
      else if (m.t === 'Z') break;
    }
    if (error) throw error;
    return { rows, rowCount };
  }
  async function simple(text) {
    sock.write(msg('Q', cstr(text)));
    let error = null;
    for (;;) { const m = await next(); if (m.t === 'E') error = errOf(m.b); if (m.t === 'Z') break; }
    if (error) throw error;
  }
  return {
    query: (text, params) => serial(() => (params && params.length ? rawQuery(text, params) : /;\s*\S/.test(text) ? simple(text).then(() => ({ rows: [], rowCount: 0 })) : rawQuery(text, []))),
    transaction: (fn) => serial(async () => {
      await rawQuery('BEGIN');
      try {
        const r = await fn((t, p) => rawQuery(t, p));
        await rawQuery('COMMIT');
        return r;
      } catch (e) {
        await rawQuery('ROLLBACK');
        throw e;
      }
    }),
    simple: (t) => serial(() => simple(t)),
    end: () => sock.end(),
  };
}
