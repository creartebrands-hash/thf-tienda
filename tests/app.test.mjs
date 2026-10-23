// Pruebas de las reglas de oro y de seguridad. Uso: npm test  (node --test, sin dependencias)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { makeEnv } from '../dev/server.mjs';
import { money, pct } from '../src/lib/pricing.js';
import { totpAt } from '../src/lib/security.js';
import { putFile, serveFile, sniff } from '../src/lib/storage.js';
import { createGrant } from '../src/lib/downloads.js';
import { DB } from '../src/lib/db.js';

const worker = (await import('../src/index.js')).default;
const env = await makeEnv();
const O = 'http://localhost';
const call = (path, init = {}) => worker.fetch(new Request(O + path, init), env, { waitUntil() {} });
const post = (path, data) => call(path, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', Origin: O } });
const form = (path, data, cookie) => call(path, { method: 'POST', body: new URLSearchParams(data), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: O, ...(cookie ? { Cookie: cookie } : {}) } });
const db = new DB(env.DB);

// instalación
await form('/setup', { token: env.SETUP_TOKEN, name: 'Ana Admin', email: 'ana@thf.test', password: 'una-clave-muy-larga-1', password2: 'una-clave-muy-larga-1' });
const P = Object.fromEntries((await db.all('SELECT id, slug, price_cents, offer_cents, wholesale_cents, cost_cents FROM products')).map((r) => [r.slug, r]));

test('dinero en centavos y redondeo mitad hacia arriba', () => {
  assert.equal(pct(1000, 1000), 100);
  assert.equal(pct(1005, 1000), 101); // 100,5 → 101
  assert.equal(pct(-1005, 1000), -101);
  assert.equal(money(123456), '$1.234,56');
});

test('TOTP cumple el vector de RFC 6238', async () => {
  assert.equal(await totpAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59), '287082');
});

test('el servidor recalcula precios e ignora montos enviados por el cliente', async () => {
  const r = await post('/api/quote', { lines: [{ kind: 'product', id: P.ocaso.id, qty: 1, price: 1, unit: 1 }], zone: 'retiro' });
  const q = await r.json();
  assert.equal(r.status, 200);
  assert.equal(q.lines[0].unit, P.ocaso.offer_cents ?? P.ocaso.price_cents);
  assert.equal(q.total, q.lines[0].unit);
});

test('precio al mayor desde el mínimo de piezas sueltas; la caja no cuenta', async () => {
  const min = await db.setting('orders.wholesale_min_pieces');
  const few = await (await post('/api/quote', { lines: [{ kind: 'product', id: P.ocaso.id, qty: min - 1 }, { kind: 'product', id: P['caja-de-joyeria'].id, qty: 1 }] })).json();
  assert.equal(few.mayor, false);
  const many = await (await post('/api/quote', { lines: [{ kind: 'product', id: P.ocaso.id, qty: min }] })).json();
  assert.equal(many.mayor, true);
  assert.equal(many.lines[0].unit, Math.min(P.ocaso.wholesale_cents, P.ocaso.offer_cents ?? P.ocaso.price_cents));
});

test('con oferta por debajo del precio al mayor, se cobra el menor', async () => {
  const p = P['fuego-y-viento'];
  const q = await (await post('/api/quote', { lines: [{ kind: 'product', id: p.id, qty: 6 }] })).json();
  assert.ok(q.lines[0].unit <= (p.offer_cents ?? p.price_cents));
});

test('el look completo tiene su descuento calculado en el servidor', async () => {
  const lk = await db.first('SELECT id, discount_bps FROM looks ORDER BY id LIMIT 1');
  const items = await db.all('SELECT p.price_cents, p.offer_cents, i.qty FROM look_items i JOIN products p ON p.id=i.product_id WHERE i.look_id=?', [lk.id]);
  const full = items.reduce((a, i) => a + (i.offer_cents ?? i.price_cents) * i.qty, 0);
  const q = await (await post('/api/quote', { lines: [{ kind: 'look', id: lk.id, qty: 1 }] })).json();
  assert.equal(q.lines[0].unit, full - pct(full, lk.discount_bps));
});

test('el costo de emprendedora nunca aparece en HTML ni JSON públicos', async () => {
  const costs = Object.values(P).map((p) => p.cost_cents).filter(Boolean);
  const pages = ['/', '/catalogo', '/coleccion/alisios-de-margarita', '/coleccion/candy-girl', '/pieza/ocaso', '/compra-el-look', '/caja-de-joyeria', '/programas', '/llms-full.txt', '/feeds/google-merchant.xml', '/sitemap.xml'];
  for (const u of pages) {
    const t = await (await call(u)).text();
    assert.ok(!/cost_cents|"cost"|costo_emprendedora|suggested_cents|min_cents|max_cents/i.test(t), `fuga en ${u}`);
    const data = t.match(/<script type="application\/json" id="thf-data">([\s\S]*?)<\/script>/);
    if (data) for (const p of JSON.parse(data[1]).products || []) assert.equal(p.cost, undefined, `costo en ${u}`);
  }
  const q = await (await post('/api/quote', { lines: [{ kind: 'product', id: P.ocaso.id, qty: 1 }] })).text();
  assert.ok(!/snapshot|"cost"/.test(q));
  assert.ok(costs.length > 0);
});

test('el WhatsApp sale solo de los ajustes y el enlace se arma en el servidor', async () => {
  await db.setSetting('contact.whatsapp', '584141234567', null, 'test');
  const data = { lines: [{ kind: 'product', id: P.ocaso.id, qty: 1 }], zone: 'retiro', pay: 'zelle', terms: true, wa: '15550000000', phone: '15550000000',
    customer: { name: 'María Pérez', phone: '0414 555 1234', address: 'Porlamar', docType: 'V', docNumber: '12345678', email: 'maria@correo.test' }, idem: 'idem-test-1' };
  const r = await (await post('/api/orders', data)).json();
  assert.match(r.wa, /^https:\/\/wa\.me\/584141234567\?text=/);
  assert.ok(!r.wa.includes('15550000000'));
  assert.match(r.code, /^THF-\d{4}-\d{6}$/);
  const again = await (await post('/api/orders', data)).json();
  assert.equal(again.code, r.code); // doble clic: mismo pedido
  const snap = JSON.parse((await db.first('SELECT snapshot FROM order_lines ORDER BY id DESC LIMIT 1')).snapshot);
  assert.equal(snap.cost, P.ocaso.cost_cents); // instantánea privada guardada
  const red = await call('/ir/whatsapp?text=hola');
  assert.equal(red.headers.get('Location'), 'https://wa.me/584141234567?text=hola');
  // la página del pedido exige el token
  assert.equal((await call(`/pedido/${r.code}`)).status, 404);
  assert.equal((await call(r.status)).status, 200);
});

test('las API rechazan otro origen y el robot del campo trampa', async () => {
  const r = await call('/api/quote', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'https://otro.com' } });
  assert.equal(r.status, 403);
  const h = await post('/api/orders', { website: 'x', lines: [] });
  assert.equal(h.status, 400);
});

test('el panel exige sesión, CSRF y verificación en dos pasos', async () => {
  const r = await call('/admin');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), '/admin/login');
  const bad = await form('/admin/login', { email: 'ana@thf.test', password: 'incorrecta-1234567' });
  assert.match(await bad.text(), /incorrectos/);
  const ok = await form('/admin/login', { email: 'ana@thf.test', password: 'una-clave-muy-larga-1' });
  assert.equal(ok.headers.get('Location'), '/admin/2fa/activar');
  const cookie = ok.headers.get('Set-Cookie').split(';')[0];
  assert.match(ok.headers.get('Set-Cookie'), /HttpOnly/);
  // sin 2FA no entra al panel
  const dash = await call('/admin/piezas', { headers: { Cookie: cookie } });
  assert.equal(dash.headers.get('Location'), '/admin/2fa/activar');
  // POST sin token CSRF
  const noCsrf = await form('/admin/2fa/activar', { code: '000000' }, cookie);
  assert.equal(noCsrf.status, 403);
});

test('enlaces de descarga vencen', async () => {
  const d = await db.first("SELECT id FROM digital_products WHERE file_path IS NOT NULL LIMIT 1");
  assert.ok(d, 'la guía gratis debe tener archivo');
  const g = await createGrant(env, db, { digitalId: d.id, hours: -1, max: 3 });
  assert.equal((await call(g.url)).status, 410);
  const ok = await createGrant(env, db, { digitalId: d.id, hours: 1, max: 1 });
  const r1 = await call(ok.url);
  assert.equal(r1.status, 200);
  assert.match(r1.headers.get('Content-Disposition'), /attachment/);
  assert.equal((await call(ok.url)).status, 410); // máximo de descargas
});

test('almacenamiento en KV con soporte de Range para video', async () => {
  const bytes = new Uint8Array(5000).map((_, i) => i % 256);
  await putFile(env, db, 'u/test/video.mp4', bytes, 'video/mp4', { maxBytes: 1e6 });
  const r = await serveFile(env, db, 'u/test/video.mp4', new Request(O, { headers: { Range: 'bytes=100-199' } }));
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Range'), 'bytes 100-199/5000');
  const got = new Uint8Array(await r.arrayBuffer());
  assert.equal(got.length, 100);
  assert.equal(got[0], 100);
  await assert.rejects(putFile(env, db, 'u/test/big.bin', new Uint8Array(2000), 'application/octet-stream', { maxBytes: 1000 }));
  assert.equal(sniff(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0])), 'pdf');
  assert.equal(sniff(new TextEncoder().encode('<html><script>alert(1)')), '');
});

test('cabeceras de seguridad y páginas privadas sin indexar', async () => {
  const r = await call('/');
  assert.match(r.headers.get('Content-Security-Policy'), /default-src 'self'/);
  assert.equal(r.headers.get('X-Frame-Options'), 'DENY');
  const a = await call('/admin/login');
  assert.match(a.headers.get('X-Robots-Tag') || '', /noindex/);
  const robots = await (await call('/robots.txt')).text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /User-agent: GPTBot\nAllow: \//);
});

test('el cuadro pequeño es opcional y muestra la nota de la piedra', async () => {
  const id = P.ocaso.id;
  let t = await (await call('/catalogo')).text();
  assert.match(t, /aria-label="Amatista: /);
  await db.run('UPDATE products SET inset_enabled=0 WHERE id=?', [id]);
  (await import('../src/lib/repo.js')).invalidate();
  t = await (await call('/pieza/ocaso')).text();
  assert.ok(!t.includes('pp-stone'));
});

test('ningún archivo usa el nombre prohibido', () => {
  const bad = new RegExp('cre' + 'arte', 'i'); // armado por partes para no contener la palabra
  const walk = (d) => readdirSync(d).flatMap((n) => {
    const f = join(d, n);
    if (n === 'node_modules' || n === '.data' || n === 'media') return [];
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
  for (const f of walk(fileURLToPath(new URL('..', import.meta.url))).filter((f) => /\.(js|mjs|html|css|sql|toml|json|md|txt)$/.test(f)))
    assert.ok(!bad.test(readFileSync(f, 'utf8')), f);
});

test('SEO local: isla, región y país en datos estructurados, páginas y llms.txt', async () => {
  const home = await (await call('/')).text();
  assert.match(home, /<meta name="geo.region" content="VE-O">/);
  assert.match(home, /"addressRegion":"Nueva Esparta"/);
  assert.match(home, /"@type":"Country","name":"Venezuela"/);
  assert.match(home, /href="\/envios-venezuela"/);
  for (const u of ['/joyeria-en-margarita', '/envios-venezuela', '/preguntas-frecuentes']) {
    const r = await call(u);
    assert.equal(r.status, 200, u);
    const t = await r.text();
    assert.match(t, /"@type":"FAQPage"/, u);
    assert.ok(!/\{lead\}|\{mayor_min\}|\{whatsapp\}/.test(t), `token sin reemplazar en ${u}`);
  }
  const prod = await (await call('/pieza/ocaso')).text();
  assert.match(prod, /"addressRegion":"VE-O"/); // envío por zona de la isla
  const sm = await (await call('/sitemap.xml')).text();
  assert.match(sm, /joyeria-en-margarita/);
  assert.match(sm, /<image:image>/);
  const llms = await (await call('/llms.txt')).text();
  assert.match(llms, /## Ubicación y cobertura/);
  assert.match(llms, /Porlamar/);
  assert.match(llms, /todos los estados de Venezuela/);
});

test('envíos por estado: datos editables en la página y el chat de WhatsApp sin número en el HTML del enlace', async () => {
  await db.run("UPDATE shipping_states SET eta='2 a 4 días hábiles', note='Retiras en la agencia de tu ciudad' WHERE state='Lara'");
  const t = await (await call('/envios-venezuela')).text();
  assert.match(t, /data-state="Lara"/);
  const data = JSON.parse(t.match(/<script type="application\/json" id="thf-data">([\s\S]*?)<\/script>/)[1]);
  const lara = data.states.find((x) => x.state === 'Lara');
  assert.equal(lara.eta, '2 a 4 días hábiles');
  assert.equal(data.states.find((x) => x.state === 'Nueva Esparta').zone, 'isla');
  assert.match(t, /class="wa-chat"/);
  assert.match(t, /data-wa-q="Precio al mayor"/);
  assert.ok(!/wa\.me\//.test(t)); // el enlace de WhatsApp se arma en el servidor (/ir/whatsapp)
  assert.equal((await call('/biblioteca')).headers.get('Location'), '/guias');
});
