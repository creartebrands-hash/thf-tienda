import { makeEnv } from './server.mjs';
const worker = (await import('../src/index.js')).default;
const env = await makeEnv();
const call = async (path, init = {}) => worker.fetch(new Request('http://localhost' + path, init), env, { waitUntil() {} });
let r = await call('/');
console.log('/ ->', r.status, r.headers.get('location'));
const body = new URLSearchParams({ token: env.SETUP_TOKEN, name: 'Ana Admin', email: 'ana@thf.test', password: 'una-clave-muy-larga-1', password2: 'una-clave-muy-larga-1' });
r = await call('/setup', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' } });
console.log('setup', r.status, r.headers.get('location'));
for (const p of ['/', '/catalogo', '/coleccion/alisios-de-margarita', '/coleccion/candy-girl', '/coleccion/linea-religiosa', '/coleccion/venezuela-sigue-latiendo', '/pieza/ocaso', '/pieza/caja-de-joyeria', '/compra-el-look', '/caja-de-joyeria', '/joyeria-personalizada', '/programas', '/guias', '/guias/guia-cuidado-bano-de-oro', '/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/feeds/google-merchant.xml', '/no-existe', '/ir/whatsapp?text=hola']) {
  const t0 = performance.now();
  r = await call(p);
  const txt = await r.text();
  console.log(p.padEnd(42), r.status, (performance.now() - t0).toFixed(0) + 'ms', txt.length, r.headers.get('location') || '', /cost_cents|costo emprendedora|"cost"/i.test(txt) ? 'LEAK!' : '');
}
