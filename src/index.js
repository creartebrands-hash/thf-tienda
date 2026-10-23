// THF · Cloudflare Worker: sitio, tienda, API y panel en un solo lugar (Workers + D1 + KV + archivos estáticos, plan gratuito).
import * as admin from './admin/index.js';
import * as api from './api.js';
import { DB } from './lib/db.js';
import { securityHeaders } from './lib/security.js';
import { isInstalled } from './lib/seed.js';
import { ensureMigrated } from './lib/migrate.js';
import { HttpError, json, redirect } from './http.js';
import * as P from './public.js';
import { setupPage } from './setup.js';
import * as shop from './shop.js';
import { portal } from './portal.js';
import { activeCampaigns } from './lib/campaigns.js';
import { refreshRateIfStale } from './lib/rates.js';

const PAGES = [
  [/^\/$/, (c) => P.home(c)],
  [/^\/catalogo\/?$/, (c) => P.catalogPage(c)],
  [/^\/coleccion\/([a-z0-9-]+)\/?$/, (c, m) => P.collectionPage(c, m[1])],
  [/^\/pieza\/([a-z0-9-]+)\/?$/, (c, m) => P.productPage(c, m[1])],
  [/^\/compra-el-look\/?$/, (c) => P.looksPage(c)],
  [/^\/caja-de-joyeria\/?$/, (c) => P.boxPage(c)],
  [/^\/joyeria-personalizada\/?$/, (c) => P.customPage(c)],
  [/^\/programas\/?$/, (c) => P.programsPage(c)],
  [/^\/guias\/?$/, (c) => P.libraryPage(c)],
  [/^\/joyeria-en-margarita\/?$/, (c) => P.localPage(c)],
  [/^\/envios-venezuela\/?$/, (c) => P.shippingPage(c)],
  [/^\/preguntas-frecuentes\/?$/, (c) => P.faqPage(c)],
  [/^\/guias\/([a-z0-9-]+)\/?$/, (c, m) => P.digitalPage(c, m[1])],
];
const SEO = {
  '/robots.txt': (c) => P.robots(c), '/sitemap.xml': (c) => P.sitemap(c), '/llms.txt': (c) => P.llms(c, false), '/llms-full.txt': (c) => P.llms(c, true),
  '/feeds/google-merchant.xml': (c) => P.merchant(c),
};

async function route(c) {
  const { req, url } = c;
  const path = url.pathname;
  const method = req.method;

  if (path === '/setup' || path.startsWith('/setup/')) return setupPage(c);
  if (!(await isInstalled(c.db))) {
    if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    return redirect('/setup');
  }
  await ensureMigrated(c.db);
  if (path.startsWith('/admin')) return admin.handle(c);

  // Tasa del BCV en modo automático: se actualiza sola en segundo plano
  c.waitUntil(refreshRateIfStale(c.db).catch(() => {}));
  if (path.startsWith('/api/')) {
    if (path === '/api/me' && method === 'GET') return api.me(c);
    if (method !== 'POST') throw new HttpError(405);
    if (path === '/api/quote') return api.quoteApi(c);
    if (path === '/api/orders') return api.createOrder(c);
    if (path === '/api/requests') return api.createRequest(c);
    if (path === '/api/t') return api.track(c);
    let m = path.match(/^\/api\/digital\/([a-z0-9-]+)\/free$/);
    if (m) return api.freeDownload(c, m[1]);
    m = path.match(/^\/api\/orders\/(THF-\d{4}-\d{6})\/(pago|metodo|monto)$/);
    if (m) return m[2] === 'pago' ? api.orderPayment(c, m[1]) : m[2] === 'metodo' ? api.orderMethod(c, m[1]) : api.orderDue(c, m[1]);
    throw new HttpError(404);
  }
  if (path === '/cuenta' || path.startsWith('/cuenta/')) return shop.account(c);
  if (path === '/socias' || path.startsWith('/socias/')) return redirect('/afiliadas' + path.slice(7) + url.search, 301); // nombre anterior
  if (path === '/afiliadas' || path.startsWith('/afiliadas/')) return portal(c);
  if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405);
  { const r = path.match(/^\/a\/([A-Za-z0-9]{3,24})(\/[a-z0-9\-/]*)?$/); if (r) return shop.refLink(c, r[1], r[2] || '/'); }
  { const r = path.match(/^\/r\/([a-z0-9-]{2,40})$/); if (r) return shop.utmLink(c, r[1]); }
  { const r = path.match(/^\/temporada\/([a-z0-9-]+)$/); if (r) return c.url.searchParams.has('vista') ? shop.campaignPage(c, r[1]) : cachedPage(c, () => shop.campaignPage(c, r[1])); }
  { const r = path.match(/^\/e\/([a-z0-9-]{2,40})$/); if (r) return cachedPage(c, () => shop.storePage(c, r[1])); }
  if (SEO[path]) return SEO[path](c);
  if (path.startsWith('/media/u/')) return P.media(c, path.slice(7));
  if (path === '/ir/whatsapp') return P.goWhatsapp(c);
  // Los PDF incluidos solo se entregan con enlace que vence (límite de descargas): la ruta directa lleva a las guías
  if (path.startsWith('/files/')) return redirect('/guias', 302);
  if (path === '/favicon.ico') return redirect('/brand/favicon.svg', 301);
  let m = path.match(/^\/pedido\/(THF-\d{4}-\d{6})$/);
  if (m) return shop.orderPage(c, m[1]);
  m = path.match(/^\/descarga\/([\w-]{20,80})$/);
  if (m) return P.download(c, m[1]);
  if (P.LEGACY[path]) return redirect(P.LEGACY[path], 301);
  { const old = path.match(/^\/biblioteca\/([a-z0-9-]+)\/?$/); if (old) return redirect(`/guias/${old[1]}`, 301); }
  for (const [re, fn] of PAGES) {
    const mm = path.match(re);
    if (mm) {
      if (path.length > 1 && path.endsWith('/')) return redirect(path.slice(0, -1) + url.search, 301);
      return cachedPage(c, () => fn(c, mm));
    }
  }
  throw new HttpError(404);
}

// Caché en el borde de Cloudflare para páginas públicas (solo funciona con dominio propio; en workers.dev se ignora).
// La clave incluye una versión que el panel incrementa al guardar cambios, así nunca se sirve contenido viejo.
async function cachedPage(c, build) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (c.env.PLATFORM === 'vercel' && !c.env.NO_EDGE_CACHE) {
    // En Vercel: caché corta en su CDN (las páginas públicas son iguales para todas; nada personal va en ellas)
    const res = await build();
    if (res.status === 200) { res.headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60'); }
    return res;
  }
  if (!cache || c.env.NO_EDGE_CACHE) return build();
  const ver = await c.db.setting('cache.version', 1);
  const key = new URL(c.url.origin + c.url.pathname);
  key.searchParams.set('__v', String(ver));
  // Si empieza o termina una temporada, cambia la clave: nunca se sirve un precio de temporada vencido
  key.searchParams.set('__c', (await activeCampaigns(c.db)).map((x) => x.id).join('.') || '0');
  const hit = await cache.match(key.toString());
  if (hit) return hit;
  const res = await build();
  if (res.status === 200) {
    const toCache = new Response(res.clone().body, res);
    toCache.headers.set('Cache-Control', 'public, max-age=300');
    c.waitUntil(cache.put(key.toString(), toCache));
  }
  return res;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const c = {
      req, env, url, db: new DB(env.DB), secure: url.protocol === 'https:',
      base: String(env.SITE_URL || url.origin).replace(/\/$/, ''),
      waitUntil: (p) => ctx?.waitUntil ? ctx.waitUntil(p) : p,
    };
    let res;
    try {
      res = await route(c);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('THF error', url.pathname, e?.stack || e);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/')) res = json({ error: (e instanceof HttpError && e.message) || 'Ocurrió un error. Intenta de nuevo.' }, status);
      else if (status === 404) res = await P.errorPage(c, 404, 'Esta página no existe', 'Puede que el enlace haya cambiado. Te dejamos el catálogo y el inicio.');
      else if (status === 500) res = await P.errorPage(c, 500, 'Algo salió mal', 'Ya quedó registrado. Intenta de nuevo en un momento.');
      else res = await P.errorPage(c, status, 'No se pudo completar', (e instanceof HttpError && e.message) || 'Solicitud no permitida.');
    }
    // Las páginas públicas en HTML no se guardan en el navegador por mucho tiempo, para que los cambios del panel se vean pronto
    const ct = res.headers.get('Content-Type') || '';
    if (ct.startsWith('text/html') && !res.headers.has('Cache-Control')) {
      res = new Response(res.body, res);
      res.headers.set('Cache-Control', 'public, max-age=60, must-revalidate');
    }
    return securityHeaders(res, { path: url.pathname, secure: c.secure });
  },
};
