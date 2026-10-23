// Datos de demostración para la vista previa y el manual: pedidos en todos los estados, embajadoras, una emprendedora con su tienda,
// clientas con cuenta, cupones, pagos por verificar, comisiones (acreditadas, en espera y pagadas) y 30 días de visitas.
// Uso: node dev/demo.mjs [dev/.data/demo.sqlite]   (borra y vuelve a crear esa base; nunca toca la base real)
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { makeEnv } from './server.mjs';
import { DB, nowIso } from '../src/lib/db.js';
import { approvePayment, setOrderStatus } from '../src/lib/orders.js';
import { classify } from '../src/lib/analytics.js';
import { hashPw } from '../src/lib/accounts.js';

const file = process.argv[2] || 'dev/.data/demo.sqlite';
if (!/demo/.test(file)) throw new Error('Por seguridad, la base de demostración debe llamarse *demo*.sqlite');
for (const f of [file, file + '-wal', file + '-shm']) if (existsSync(f)) rmSync(f);
// Los archivos (fotos, guías y capturas) van a una carpeta junto a la base: el servidor local los vuelve a leer con THF_KVDIR
process.env.THF_KVDIR = file.replace(/\.sqlite$/, '-kv');
rmSync(process.env.THF_KVDIR, { recursive: true, force: true });
const env = await makeEnv({ file });
const worker = (await import('../src/index.js')).default;
const O = 'http://localhost';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
let ipn = 0;
const ip = () => `10.9.${Math.floor(++ipn / 250)}.${ipn % 250}`;
const call = (path, init = {}) => worker.fetch(new Request(O + path, init), env, { waitUntil() {} });
const post = (path, data, extra = {}) => call(path, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', Origin: O, 'User-Agent': UA, 'X-Real-IP': ip(), ...extra } });
const form = (path, data) => call(path, { method: 'POST', body: new URLSearchParams(data), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: O, 'X-Real-IP': ip() }, redirect: 'manual' });

await form('/setup', { token: env.SETUP_TOKEN, name: 'Ana Admin', email: 'ana@thf.test', password: 'una-clave-muy-larga-1', password2: 'una-clave-muy-larga-1' });
const db = new DB(env.DB);
const admin = await db.first('SELECT * FROM users LIMIT 1');
const ctx = () => ({ db: new DB(env.DB), env, req: new Request(O, { headers: { 'User-Agent': UA } }), base: O, url: new URL(O), waitUntil() {}, user: admin });
const set = (k, v) => db.setSetting(k, v, admin.id, 'demo');
const t0 = nowIso();

// ---- Ajustes de la tienda de demostración
await set('checkout.mode', 'mixto');
await set('payments.rate_mode', 'manual');
await db.run("INSERT INTO exchange_rates(source,bs_per_usd_milli,set_at,user_id) VALUES ('BCV',?,?,?)", [217820, t0, admin.id]); // 217,82 Bs/USD (ejemplo)
const det = {
  'pago-movil': { banco: '0134 Banesco', telefono: '0414 123 4567', documento: 'J-50123456-7', titular: 'THF Accesorios C.A.' },
  transferencia: { banco: '0134 Banesco', cuenta: '0134 0000 00 0000000000', documento: 'J-50123456-7', titular: 'THF Accesorios C.A.' },
  zelle: { correo: 'pagos@thf.test', titular: 'THF Accesorios' },
  binance: { pay_id: '123456789', usuario: 'thf.accesorios', correo: 'pagos@thf.test' },
  paypal: { correo: 'pagos@thf.test' },
};
for (const [code, d] of Object.entries(det)) await db.run('UPDATE payment_methods SET details=? WHERE code=?', [JSON.stringify(d), code]);

// ---- Socias: dos embajadoras y una emprendedora con su tienda
const pw = await hashPw(env, 'clave-demo-afiliada-1');
const addPartner = async (p) => {
  await db.run(`INSERT INTO partners(kind,name,email_key,phone_key,doc_key,email,phone,city,code,slug,store_title,store_bio,status,commission_mode,commission_bps,pw_hash,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'activa',?,?,?,?,?)`, [p.kind, p.name, p.email, p.phoneKey, p.doc, p.email, p.phone, p.city, p.code, p.slug || null, p.title || '', p.bio || '',
    p.mode || 'global', p.bps ?? null, pw, t0, t0]);
  return db.first('SELECT * FROM partners WHERE code=?', [p.code]);
};
const valentina = await addPartner({ kind: 'embajadora', name: 'Valentina Rojas', email: 'valentina@afiliadas.test', phoneKey: '584145550101', doc: 'V20111222', phone: '0414 555 0101', city: 'Porlamar', code: 'VALENTINA' });
const carla = await addPartner({ kind: 'embajadora', name: 'Carla Méndez', email: 'carla@afiliadas.test', phoneKey: '584245550202', doc: 'V19333444', phone: '0424 555 0202', city: 'Caracas', code: 'CARLA', mode: 'pct', bps: 1200 });
const luna = await addPartner({ kind: 'emprendedora', name: 'Luisa Gómez', email: 'luisa@afiliadas.test', phoneKey: '584265550303', doc: 'V18555666', phone: '0426 555 0303', city: 'Lechería', code: 'LUNA', slug: 'luna',
  title: 'Tienda Luna', bio: 'Joyería THF elegida para ti en Lechería. Te asesoro por WhatsApp y THF te la envía.' });
const P = Object.fromEntries((await db.all('SELECT * FROM products')).map((r) => [r.slug, r]));
// Imágenes para aliadas (de demostración, generadas por dev/make_aliada_demo.py): 2 opciones por pieza y 3 banners
const addMedia = async (path, alt) => { await db.run('INSERT INTO media(kind,path,width,height,bytes,alt,created_at) VALUES (?,?,?,?,?,?,?)', ['image', path, 960, 1200, 0, alt, t0]); return (await db.first('SELECT id FROM media WHERE path=?', [path])).id; };
const ALI = ['marea-rosa', 'vuelo-coral', 'ocaso', 'luz-y-fe', 'trilogia-caribe', 'verde-manglar', 'ecos-de-pampatar', 'marea-rosa-collar-para-combinar', 'vuelo-coral-pulsera-para-combinar', 'luz-y-fe-pulsera-para-combinar'];
const aopt = {};
for (const slug of ALI) for (const n of [1, 2]) {
  const mid = await addMedia(`seed/al-${slug}-${n}.webp`, `${P[slug]?.name || slug} · foto para aliadas ${n}`);
  await db.run("INSERT INTO aliada_assets(kind,product_id,media_id,title,sort,active,created_at) VALUES ('pieza',?,?,?,?,1,?)", [P[slug].id, mid, n === 1 ? 'Detalle' : 'Estudio', n, t0]);
  (aopt[slug] ||= []).push((await db.first('SELECT id FROM aliada_assets ORDER BY id DESC LIMIT 1')).id);
}
const bann = {};
for (const [k, title] of [['marea', 'Salinas rosadas'], ['atardecer', 'Atardecer en Juangriego'], ['isla', 'La isla']]) {
  const mid = await addMedia(`seed/al-banner-${k}.webp`, title);
  await db.run("INSERT INTO aliada_assets(kind,media_id,title,sort,active,created_at) VALUES ('banner',?,?,?,1,?)", [mid, title, Object.keys(bann).length + 1, t0]);
  bann[k] = (await db.first('SELECT id FROM aliada_assets ORDER BY id DESC LIMIT 1')).id;
}
await db.run('UPDATE partners SET store_subtitle=?, store_bg=?, store_fg=?, store_banner_id=? WHERE id=?', ['joyas del mar para Lechería', '#FBEDEF', '#3D1011', bann.marea, luna.id]);
for (const [slug, extra, pick] of [['marea-rosa', 600, 1], ['vuelo-coral', 500, 0], ['ocaso', 400, 1], ['luz-y-fe', 500, 0], ['trilogia-caribe', 700, 1],
  ['verde-manglar', 400, 0], ['marea-rosa-collar-para-combinar', 300, 0], ['vuelo-coral-pulsera-para-combinar', 300, 1], ['luz-y-fe-pulsera-para-combinar', 300, 0]]) {
  const p = P[slug];
  const price = Math.min(p.max_cents ?? p.price_cents + extra, (p.cost_cents ?? p.price_cents) + 1500 + extra);
  await db.run('INSERT INTO partner_prices(partner_id,product_id,price_cents,visible,asset_id,updated_at) VALUES (?,?,?,1,?,?)', [luna.id, p.id, Math.max(p.min_cents ?? 0, price), aopt[slug][pick], t0]);
}

// ---- Variantes con color (muestras al pasar el cursor y selector en la ficha)
const colorsOf = (label, items, shape = 'circle') => JSON.stringify({ label, shape, items: items.map(([name, hex, on = true]) => ({ name, hex, on })) });
for (const [slug, json] of [
  ['marea-rosa', colorsOf('Color del cuarzo', [['Cuarzo rosa', '#F2C6CF'], ['Cuarzo blanco', '#EFECE6'], ['Cuarzo fresa', '#E7A1A8'], ['Cuarzo ahumado', '#7A6656', false]])],
  ['ocaso', colorsOf('Piedra', [['Amatista', '#9A6CB4'], ['Cuarzo rosa', '#F2C6CF'], ['Ónix', '#1E1C1C']])],
  ['vuelo-coral', colorsOf('Color', [['Coral', '#E36F59'], ['Negro', '#1E1C1C']])],
  ['verde-manglar', colorsOf('Piedra', [['Jade', '#5E9A73'], ['Turquesa', '#3FB2AE'], ['Ojo de tigre', '#A4672A']], 'square')],
  ['trilogia-caribe', colorsOf('Perla', [['Blanca', '#F1E8DA'], ['Rosada', '#EBCFC8'], ['Gris', '#B9B6B2']])],
]) await db.run('UPDATE products SET colors=? WHERE slug=?', [json, slug]);

// ---- Cupones y enlaces UTM
await db.run(`INSERT INTO coupons(code,description,kind,value,active,max_uses,per_customer,first_order_only,uses,created_by,created_at,updated_at)
  VALUES ('BIENVENIDA10','10 % en tu primera compra','pct',1000,1,200,1,1,0,?,?,?)`, [admin.id, t0, t0]);
await db.run(`INSERT INTO coupons(code,description,kind,value,active,max_uses,per_customer,first_order_only,retail_only,uses,created_by,created_at,updated_at)
  VALUES ('ENVIOGRATIS','Envío gratis a toda Venezuela','envio',0,1,50,1,0,1,0,?,?,?)`, [admin.id, t0, t0]);
for (const [code, name, src, med, camp, cont] of [['ig-bio', 'Instagram · enlace de la bio', 'instagram', 'social', 'bio', ''], ['ig-historias-navidad', 'Instagram · historias de Navidad', 'instagram', 'historias', 'navidad-adelanto', 'historia-1'],
  ['fb-ads-otono', 'Facebook · anuncio de otoño', 'facebook', 'paid_social', 'lanzamiento-otono', 'carrusel'], ['tiktok-video-caja', 'TikTok · video de la caja', 'tiktok', 'social', 'caja-de-joyeria', 'video-1']])
  await db.run('INSERT INTO utm_links(code,name,dest,utm_source,utm_medium,utm_campaign,utm_content,clicks,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [code, name, '/', src, med, camp, cont, 20 + code.length * 7, admin.id, t0]);

// ---- Existencias de materiales (una por debajo del mínimo para ver la alerta)
await db.run("UPDATE materials SET stock_qty=CASE WHEN unit='metro' THEN 25 ELSE 200 END, min_stock=CASE WHEN unit='metro' THEN 5 ELSE 20 END");
await db.run("UPDATE materials SET stock_qty=6, min_stock=10 WHERE name LIKE 'Amatista%'");

// ---- Pedidos (del más antiguo al más reciente) y lo que pasó con cada uno
const refCookie = async (code) => (await call(`/a/${code}`, { redirect: 'manual', headers: { 'User-Agent': UA } })).headers.get('Set-Cookie').split(';')[0];
let docN = 14000000;
const docs = new Map();
const person = (name, phone, state, city, more = {}) => ({ name, phone, docType: 'V', docNumber: docs.get(name) || (docs.set(name, String(++docN)), docs.get(name)), email: name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.') + '@correo.test',
  address: more.address || 'Calle Principal, casa 12', state, city, ...more });
const proof = new File([readFileSync(new URL('./demo/captura-demo.png', import.meta.url))], 'captura.png', { type: 'image/png' });
let idem = 0;
const plan = [
  { ago: 27, who: person('Ana Rodríguez', '0414 555 1001', 'Nueva Esparta', 'Pampatar'), lines: [['ocaso', 1], ['marea-rosa', 1]], zone: 'isla-pampatar', pay: 'pago-movil', src: { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'bio' }, flow: ['pagado', 'en_produccion', 'listo', 'enviado', 'entregado'] },
  { ago: 25, who: person('Carmen Díaz', '0412 555 1002', 'Distrito Capital', 'Caracas'), lines: [['trilogia-caribe', 1]], zone: 'nacional', pay: 'zelle', ref: 'VALENTINA', flow: ['pagado', 'en_produccion', 'enviado', 'entregado'], ship: ['MRW', '0123456789'] },
  { ago: 22, who: person('Luisa Martínez', '0416 555 1003', 'Nueva Esparta', 'Porlamar'), lines: [['luz-y-fe', 1]], zone: 'retiro', pay: 'pago-movil', src: { ref_host: 'www.google.com' }, flow: ['pagado', 'listo_retiro', 'entregado'] },
  { ago: 20, who: person('Patricia Gil', '0424 555 1004', 'Anzoátegui', 'Lechería'), lines: [['marea-rosa', 2]], zone: 'nacional', pay: 'pago-movil', store: 'luna', flow: ['pagado', 'en_produccion', 'enviado', 'entregado'], ship: ['Tealca', 'TE-55821'] },
  { ago: 18, who: person('Rosa Pérez', '0414 555 1005', 'Nueva Esparta', 'La Asunción'), lines: [['punta-arenas', 1]], zone: 'isla-norte', pay: 'binance', src: { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'lanzamiento-otono', utm_content: 'carrusel' }, flow: ['pagado', 'en_produccion', 'listo', 'enviado', 'entregado'] },
  { ago: 15, who: person('Boutique Coral', '0414 555 1006', 'Sucre', 'Cumaná', { notes: 'Pedido al mayor para la tienda' }), lines: [['ocaso', 3], ['marea-rosa', 3], ['vuelo-coral', 2]], zone: 'nacional', pay: 'transferencia', src: { ref_host: 'wa.me' }, flow: ['pagado', 'en_produccion'] },
  { ago: 12, who: person('María Pérez', '0414 555 1234', 'Nueva Esparta', 'Porlamar', { address: 'Av. 4 de Mayo, edificio Azul' }), lines: [['verde-manglar', 1]], zone: 'isla-pampatar', pay: 'pago-movil', coupon: 'BIENVENIDA10', src: { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'bio' }, flow: ['pagado', 'en_produccion', 'listo', 'enviado', 'entregado'] },
  { ago: 10, who: person('Daniela Suárez', '0426 555 1008', 'Nueva Esparta', 'Juan Griego'), lines: [['fuego-y-viento', 1]], zone: 'isla-macanao', pay: 'zelle', code: 'CARLA', flow: ['pagado', 'en_produccion', 'enviado'] },
  { ago: 8, who: person('Gabriela León', '0412 555 1009', 'Carabobo', 'Valencia'), lines: [['candy-girl-gummy-star', 1], ['candy-girl-arcoiris', 1]], zone: 'nacional', pay: 'paypal', src: { ref_host: 'www.pinterest.com' }, flow: ['pagado'] },
  { ago: 6, who: person('Sofía Ramos', '0414 555 1010', 'Nueva Esparta', 'Porlamar'), lines: [['religiosa-03', 1]], zone: 'retiro', pay: 'efectivo', ref: 'VALENTINA', flow: ['cancelado'] },
  { ago: 4, who: person('Mariela Torres', '0416 555 1011', 'Nueva Esparta', 'Pampatar'), lines: [['ecos-de-pampatar', 1]], zone: 'isla-pampatar', pay: 'pago-movil', src: { utm_source: 'instagram', utm_medium: 'historias', utm_campaign: 'navidad-adelanto', utm_content: 'historia-1' }, report: { bank: '0102', phone: '0416 555 1011', reference: '004512378', proof: true } },
  { ago: 3, who: person('Karla Medina', '0424 555 1012', 'Lara', 'Barquisimeto'), lines: [['latido-tricolor', 1], ['mapa-de-venezuela', 1]], zone: 'nacional', pay: 'zelle', src: { ref_host: 'wa.me' } },
  { ago: 2, who: person('Andrea Castillo', '0414 555 1013', 'Anzoátegui', 'Barcelona'), lines: [['vuelo-coral', 1]], zone: 'nacional', pay: 'pago-movil', store: 'luna', report: { bank: '0105', phone: '0414 555 1013', reference: '781245', proof: false } },
  { ago: 1, who: person('Elena Fuentes', '0412 555 1014', 'Miranda', 'Los Teques'), lines: [['ocaso', 1], ['luz-y-fe', 1]], zone: 'nacional', pay: 'zelle', ref: 'VALENTINA', flow: ['pagado'] },
  { ago: 0, who: person('María Pérez', '0414 555 1234', 'Nueva Esparta', 'Porlamar', { address: 'Av. 4 de Mayo, edificio Azul' }), lines: [['marea-rosa', 1]], zone: 'isla-pampatar', pay: 'pago-movil', src: { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'bio' } },
];
const pad = (n) => String(n).padStart(2, '0');
const shiftIso = (iso, ms) => (iso ? new Date(Date.parse(iso) - ms).toISOString().replace(/\.\d{3}Z$/, 'Z') : iso);
const out = [];
const audits = [];
for (const [i, p] of plan.entries()) {
  const headers = p.ref ? { Cookie: await refCookie(p.ref) } : {};
  const body = { lines: p.lines.map(([slug, qty]) => ({ kind: 'product', id: P[slug].id, qty, variant: '45 cm' })), zone: p.zone, pay: p.pay, terms: true, idem: `demo-${++idem}`, customer: p.who,
    src: { landing: '/', vid: `v${i}`, ...(p.src || {}) }, ...(p.code ? { code: p.code } : {}), ...(p.store ? { store: p.store } : {}), ...(p.coupon ? { coupon: p.coupon } : {}), ...(p.ref ? { refSource: 'enlace' } : {}) };
  const r = await post('/api/orders', body, headers);
  const j = await r.json();
  if (!r.ok) throw new Error(`${p.who.name}: ${j.error}`);
  let o = await db.first('SELECT * FROM orders WHERE code=?', [j.code]);
  const tok = j.status ? new URL(O + j.status).searchParams.get('t') : '';
  if (p.report) {
    const fd = new FormData();
    const due = await db.first('SELECT total_bs_cents FROM orders WHERE id=?', [o.id]);
    Object.entries({ t: tok, bank: p.report.bank, phone: p.report.phone, reference: p.report.reference, date: new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), amount: (due.total_bs_cents / 100).toFixed(2).replace('.', ',') }).forEach(([k, v]) => fd.set(k, v));
    if (p.report.proof) fd.set('proof', proof);
    const rep = await call(`/api/orders/${o.code}/pago`, { method: 'POST', body: fd, headers: { Origin: O, 'X-Real-IP': ip(), 'User-Agent': UA } });
    if (!rep.ok) throw new Error('pago: ' + (await rep.text()));
  }
  for (const to of p.flow || []) {
    o = await db.first('SELECT * FROM orders WHERE id=?', [o.id]);
    if (to === 'pagado' && ['pago-movil', 'transferencia', 'zelle', 'binance', 'paypal'].includes(o.pay_code)) {
      // Se reporta y se verifica el pago como en la vida real
      const fd = new FormData();
      const bsAmt = o.total_bs_cents;
      const isBs = ['pago-movil', 'transferencia'].includes(o.pay_code);
      Object.entries({ t: tok, bank: isBs ? '0102' : '', phone: o.pay_code === 'pago-movil' ? p.who.phone : '', name: o.pay_code === 'zelle' ? p.who.name : '', reference: String(10000000 + i * 7919),
        date: new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), amount: isBs ? (bsAmt / 100).toFixed(2).replace('.', ',') : (o.total_cents / 100).toFixed(2) }).forEach(([k, v]) => v && fd.set(k, v));
      const rep = await call(`/api/orders/${o.code}/pago`, { method: 'POST', body: fd, headers: { Origin: O, 'X-Real-IP': ip(), 'User-Agent': UA } });
      if (!rep.ok) throw new Error(`${o.code} pago: ${await rep.text()}`);
      const pay = await db.first("SELECT * FROM payments WHERE order_id=? AND status='reportado'", [o.id]);
      await approvePayment(ctx(), pay, { userId: admin.id, markPaid: true });
      audits.push([o.id, 'pago_verificado', 'payments', pay.id, { order: o.code, ref: pay.reference }]);
      continue;
    }
    const opts = { userId: admin.id };
    if (to === 'enviado') Object.assign(opts, { carrier: (p.ship || ['Zoom'])[0], tracking: (p.ship || ['', 'ZM-' + (900000 + i)])[1] });
    if (to === 'listo_retiro') opts.pickup = 'retiro';
    await setOrderStatus(ctx(), o, to, opts);
    audits.push([o.id, 'estado_pedido', 'orders', o.id, { from: o.status, to }]);
  }
  // Fechas: el pedido ocurrió hace "ago" días y cada paso, unas horas después
  const ms = p.ago * 86400e3 - (i % 5) * 3600e3;
  if (ms > 0) {
    o = await db.first('SELECT * FROM orders WHERE id=?', [o.id]);
    await db.run('UPDATE orders SET created_at=?, updated_at=?, paid_at=? WHERE id=?', [shiftIso(o.created_at, ms), shiftIso(o.updated_at, ms - 3 * 86400e3 > 0 ? ms - 3 * 86400e3 : ms), shiftIso(o.paid_at, ms - 6 * 3600e3), o.id]);
    const evs = await db.all('SELECT id, at FROM order_events WHERE order_id=? ORDER BY id', [o.id]);
    for (const [k, e] of evs.entries()) await db.run('UPDATE order_events SET at=? WHERE id=?', [shiftIso(e.at, Math.max(0, ms - k * 20 * 3600e3)), e.id]);
    for (const n of await db.all('SELECT id, created_at FROM notifications WHERE order_id=?', [o.id])) await db.run("UPDATE notifications SET created_at=?, status=CASE WHEN status='pendiente' THEN 'enviada' ELSE status END WHERE id=?", [shiftIso(n.created_at, ms - 3600e3), n.id]);
    for (const pmt of await db.all('SELECT id, created_at, reviewed_at FROM payments WHERE order_id=?', [o.id])) await db.run('UPDATE payments SET created_at=?, reviewed_at=? WHERE id=?', [shiftIso(pmt.created_at, ms - 4 * 3600e3), shiftIso(pmt.reviewed_at, ms - 6 * 3600e3), pmt.id]);
  }
  for (const [k, [, action, entity, eid, data]] of audits.filter((a) => a[0] === o.id).entries())
    await db.run('INSERT INTO audit_log(at,user_id,action,entity,entity_id,data,ip) VALUES (?,?,?,?,?,?,?)', [shiftIso(nowIso(), Math.max(0, ms - (k + 1) * 18 * 3600e3)), admin.id, action, entity, String(eid), JSON.stringify(data), '190.202.10.15']);
  out.push(`${o.code} · ${p.who.name} · ${(await db.first('SELECT status FROM orders WHERE id=?', [o.id])).status}${tok ? ` · /pedido/${o.code}?t=${tok}` : ''}`);
}
// El libro de comisiones guarda la fecha real de cada movimiento: aquí se lleva a la fecha del pago de cada pedido (solo en la demo)
await env.DB.exec('DROP TRIGGER IF EXISTS ledger_no_update');
for (const l of await db.all('SELECT l.id, o.paid_at FROM ledger_entries l JOIN orders o ON o.id=l.order_id WHERE o.paid_at IS NOT NULL')) await db.run('UPDATE ledger_entries SET created_at=? WHERE id=?', [l.paid_at, l.id]);
await env.DB.exec("CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'ledger inmutable'); END;");
// Pago de comisiones de la primera quincena a Valentina
const bal = await db.n("SELECT COALESCE(SUM(amount_cents),0) n FROM ledger_entries WHERE partner_id=? AND created_at < ?", [valentina.id, new Date(Date.now() - 14 * 86400e3).toISOString()]);
if (bal > 0) await db.run("INSERT INTO ledger_entries(partner_id,kind,amount_cents,note,ref,user_id,created_at) VALUES (?, 'pago', ?, ?, ?, ?, ?)",
  [valentina.id, -bal, 'Pago de comisiones · 1.ª quincena de octubre', 'Pago Móvil ref. 009871', admin.id, new Date(Date.now() - 6 * 86400e3).toISOString()]);
// Cada clienta "existe" desde su primer pedido
for (const cu of await db.all('SELECT c.id, MIN(o.created_at) f FROM customers c JOIN orders o ON o.customer_id=c.id GROUP BY c.id')) await db.run('UPDATE customers SET created_at=? WHERE id=?', [cu.f, cu.id]);
// Solicitudes nuevas desde la web
for (const r of [
  { kind: 'embajadora', name: 'Fernanda Salazar', phone: '0414 555 2001', city: 'Porlamar', data: { age: true, terms: true, ig: 'https://instagram.com/fer.salazar', f: '3.200', why: 'Me encanta la joyería artesanal de la isla y tengo una comunidad de amigas que compra por Instagram.' } },
  { kind: 'emprendedora', name: 'Alejandra Núñez', phone: '0424 555 2002', city: 'Maracaibo', data: { age: true, terms: true, ig: 'https://instagram.com/ale.boutique', f: '8.500', why: 'Tengo una tienda online de accesorios y quiero sumar piezas hechas a mano.' } },
  { kind: 'personalizada', name: 'Hotel Costa Azul', phone: '0295 555 2003', city: 'Pampatar', data: { who: 'Marca', what: ['Pulseras'], qty: '50', design: 'Con su logo', sample: 'Sí, quiero muestra', colors: 'Dorado y azul', date: '2026-12-10', idea: 'Detalle para huéspedes en Navidad.' } },
]) await post('/api/requests', r);
// Clienta con cuenta (María) y su cupón personal
const maria = await db.first("SELECT * FROM customers WHERE email_key='maria.perez@correo.test'");
await db.run('UPDATE customers SET pw_hash=? WHERE id=?', [await hashPw(env, 'MariaDemo-2026'), maria.id]);
await db.run(`INSERT INTO coupons(code,description,kind,value,active,max_uses,per_customer,customer_id,uses,created_by,created_at,updated_at)
  VALUES ('MARIA-VIP','15 % por ser clienta frecuente','pct',1500,1,1,1,?,0,?,?,?)`, [maria.id, admin.id, t0, t0]);

// ---- 30 días de visitas (analítica propia, sin datos personales)
const SRC = [[34, { utm_source: 'instagram', utm_medium: 'social' }], [12, { ref_host: 'l.instagram.com' }], [16, { ref_host: 'www.google.com' }], [9, { ref_host: 'wa.me' }],
  [8, { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'lanzamiento-otono' }], [5, { utm_source: 'instagram', utm_medium: 'historias', utm_campaign: 'navidad-adelanto' }], [4, { ref_host: 'www.pinterest.com' }],
  [3, { utm_source: 'tiktok', utm_medium: 'social', utm_campaign: 'caja-de-joyeria' }], [9, {}], [5, { partner: true }]];
const total = SRC.reduce((a, [w]) => a + w, 0);
const pick = (r) => { let x = r * total; for (const [w, s] of SRC) { if ((x -= w) < 0) return s; } return SRC[0][1]; };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const prods = ['ocaso', 'marea-rosa', 'trilogia-caribe', 'luz-y-fe', 'vuelo-coral', 'punta-arenas', 'verde-manglar', 'fuego-y-viento', 'ecos-de-pampatar', 'candy-girl-gummy-star', 'religiosa-03', 'latido-tricolor'];
const landings = ['/', '/', '/', '/coleccion/alisios-de-margarita', '/catalogo', '/caja-de-joyeria', '/compra-el-look', '/pieza/ocaso', '/pieza/marea-rosa', '/programas'];
const devs = ['movil', 'movil', 'movil', 'movil', 'escritorio', 'tablet'];
const rows = [];
for (let d = 29; d >= 0; d--) {
  const day = new Date(Date.now() - d * 86400e3 - 4 * 3600e3).toISOString().slice(0, 10);
  const sessions = Math.round(38 + (29 - d) * 2.2 + rnd() * 22 + (new Date(day).getUTCDay() % 6 === 0 ? 14 : 0));
  for (let s = 0; s < sessions; s++) {
    const src = pick(rnd());
    const { channel, traffic } = classify({ utm_source: src.utm_source, utm_medium: src.utm_medium, ref_host: src.ref_host || '', partner: !!src.partner });
    const sid = `s${d}-${s}`, vid = `v${Math.floor(rnd() * sessions * 22)}`;
    const at = `${day}T${pad(12 + Math.floor(rnd() * 12) % 24)}:${pad(Math.floor(rnd() * 60))}:00Z`;
    const dev = devs[Math.floor(rnd() * devs.length)];
    const base = { at, day, vid, sid, channel, traffic, utm_source: src.utm_source || '', utm_medium: src.utm_medium || '', utm_campaign: src.utm_campaign || '', ref_host: src.ref_host || '', device: dev, partner_id: src.partner ? valentina.id : null };
    const land = landings[Math.floor(rnd() * landings.length)];
    rows.push({ ...base, type: 'page', path: land });
    const depth = 1 + Math.floor(rnd() * 4);
    for (let k = 1; k < depth; k++) rows.push({ ...base, type: 'page', path: ['/catalogo', '/pieza/' + prods[Math.floor(rnd() * prods.length)], '/compra-el-look', '/caja-de-joyeria'][Math.floor(rnd() * 4)] });
    if (rnd() < 0.55) {
      const pr = prods[Math.floor(rnd() * prods.length)];
      rows.push({ ...base, type: 'view_item', path: '/pieza/' + pr, product_id: P[pr].id });
      if (rnd() < 0.22) { rows.push({ ...base, type: 'add_to_cart', path: '/pieza/' + pr, product_id: P[pr].id }); if (rnd() < 0.45) rows.push({ ...base, type: 'begin_checkout', path: '/pieza/' + pr }); }
    }
  }
}
await db.batch(rows.map((e) => ['INSERT INTO events(at,day,vid,sid,type,path,product_id,channel,traffic,utm_source,utm_medium,utm_campaign,utm_content,ref_host,device,country,partner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  [e.at, e.day, e.vid, e.sid, e.type, e.path, e.product_id ?? null, e.channel, e.traffic, e.utm_source, e.utm_medium, e.utm_campaign, '', e.ref_host, e.device, 'VE', e.partner_id]]));

console.log(out.join('\n'));
console.log(`${rows.length} eventos de visitas · base: ${file}`);
console.log('Panel: ana@thf.test / una-clave-muy-larga-1 · Afiliadas: valentina@afiliadas.test, carla@afiliadas.test, luisa@afiliadas.test / clave-demo-afiliada-1 · Clienta: maria.perez@correo.test / MariaDemo-2026');
