// Páginas públicas. Todo el contenido importante se renderiza en el servidor (buscadores y asistentes de IA lo leen sin JavaScript).
import * as INT from './lib/integrations.js';
import { toString } from './lib/html.js';
import { catalog, clientProduct, digitalProducts, mediaUrl, payMethods, publicSettings, shippingStates, zones } from './lib/repo.js';
import * as seo from './lib/seo.js';
import { buildCsp, sha256 } from './lib/security.js';
import { serveFile } from './lib/storage.js';
import { HttpError, htmlRes, redirect, text } from './http.js';
import { layout } from './views/layout.js';
import * as V from './views/pages.js';
import * as L from './views/local.js';

const lite = (lk) => ({ id: lk.id, slug: lk.slug, name: lk.name, price: lk.price, full: lk.full, discount: lk.discount, discountPct: lk.discountPct,
  photo: lk.photo, items: lk.items.map((i) => ({ slug: i.product.slug, qty: i.qty, x: i.x, y: i.y })) });
const placeLite = (p) => ({ slug: p.slug, name: p.name, title: p.title, dir: p.dir, dirName: p.dirName, lon: p.lon, lat: p.lat, coords: p.coords, mapPos: p.mapPos });

export async function render(c, { page, slug = null, title, desc, crumbs, jsonld = [], og, body, products = [], looks = [], extra = {}, noindex = false, status = 200, store = null }) {
  const { db, base } = c;
  const S = await db.settings();
  const cat = await catalog(db);
  const meta = await seo.pageMeta(db, slug, title, desc);
  const pays = await payMethods(db);
  const blocks = [seo.orgLd(base, S, pays)];
  if (page === 'home') blocks.push(seo.websiteLd(base, S));
  if (crumbs) blocks.push(seo.breadcrumbsLd(base, crumbs));
  blocks.push(...jsonld);
  const uniq = [...new Map(products.filter(Boolean).map((p) => [p.slug, p])).values()];
  const campaign = cat.campaigns[0] || null;
  const data = {
    page, S: await publicSettings(db), zones: await zones(db), pays,
    products: uniq.map(clientProduct), looks: looks.map(lite), tsk: c.env.TURNSTILE_SITEKEY || '',
    checkout: { mode: ['whatsapp', 'mixto', 'web'].includes(S['checkout.mode']) ? S['checkout.mode'] : 'whatsapp', doc: !!S['checkout.require_doc'], email: !!S['checkout.require_email'],
      terms: S['checkout.terms_text'] || '', attrDays: Number(S['programs.attribution_days'] || 30), analytics: S['analytics.enabled'] !== false },
    tags: S['analytics.enabled'] !== false ? INT.publicTags(S) : null,
    ...extra,
  };
  const html = layout({
    page, S, cols: cat.visibleCollections, body, data,
    seo: { title: meta.title, desc: meta.desc, canonical: base + c.url.pathname, og: seo.absUrl(base, og || mediaUrl(S['seo.default_og'])), noindex,
      jsonld: seo.jsonldTags(blocks) },
    assetV: c.env.ASSET_VERSION || '3', campaign: store ? null : campaign, store,
  });
  const hdr = noindex ? { 'X-Robots-Tag': 'noindex' } : {};
  if (data.tags) hdr['Content-Security-Policy'] = buildCsp({ extra: INT.cspExtra(data.tags) });
  return htmlRes(html, status, hdr);
}

const boxOf = (cat) => cat.products.find((p) => p.bundle && p.slug === 'caja-de-joyeria') || cat.products.find((p) => p.bundle);

export async function home(c) {
  const cat = await catalog(c.db);
  const S = await c.db.settings();
  const featured = cat.listed.filter((p) => p.featured);
  const box = boxOf(cat);
  const chipProducts = cat.places.flatMap((pl) => pl.products);
  return render(c, {
    page: 'home', slug: 'home', title: 'THF · Joyería artesanal de la Isla de Margarita', desc: S['brand.about'],
    body: V.homeView({ S, cat, featured, box }),
    products: [...featured, ...chipProducts, box, ...(cat.looks[0]?.items.map((i) => i.product) || [])], looks: cat.looks.slice(0, 1),
    extra: { places: cat.places.map(placeLite) },
  });
}

export async function catalogPage(c) {
  const cat = await catalog(c.db);
  const S = await c.db.settings();
  return render(c, {
    page: 'catalogo', slug: 'catalogo', title: 'Catálogo THF', desc: '',
    crumbs: [['Inicio', '/'], ['Catálogo', '/catalogo']], jsonld: [seo.itemListLd(c.base, 'Catálogo THF', cat.listed)],
    body: V.catalogView({ S, cat }), products: cat.listed,
    extra: { collections: cat.visibleCollections.map((x) => ({ slug: x.slug, name: x.name })), places: cat.places.map(placeLite) },
  });
}

export async function collectionPage(c, slug) {
  const cat = await catalog(c.db);
  const S = await c.db.settings();
  const col = cat.visibleCollections.find((x) => x.slug === slug);
  if (!col) throw new HttpError(404);
  const prods = cat.listed.filter((p) => p.collectionId === col.id);
  const groups = [];
  if (col.groupByPlace) for (const pl of cat.places) {
    const items = prods.filter((p) => p.placeId === pl.id);
    if (items.length) groups.push([pl, items]);
  }
  const looks = cat.looks.filter((l) => l.collectionId === col.id);
  const others = cat.visibleCollections.filter((x) => x.id !== col.id);
  return render(c, {
    page: 'coleccion', title: col.seoTitle || `${col.name} · THF`, desc: col.seoDesc || col.intro,
    crumbs: [['Inicio', '/'], ['Colecciones', '/catalogo'], [col.name, col.url]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: col.name, description: col.intro, url: c.base + col.url, inLanguage: 'es-VE',
      isPartOf: { '@id': c.base + '/#web' } }, seo.itemListLd(c.base, col.name, prods)],
    og: col.hero || col.card, body: V.collectionView({ S, col, prods, groups, looks, others }),
    products: [...prods, ...looks.flatMap((l) => l.items.map((i) => i.product))], looks,
  });
}

export async function productPage(c, slug) {
  const cat = await catalog(c.db);
  const S = await c.db.settings();
  const p = cat.pBySlug.get(slug);
  if (!p) throw new HttpError(404);
  const looks = cat.looks.filter((l) => l.items.some((i) => i.product.id === p.id));
  const same = p.placeId ? cat.listed.filter((x) => x.placeId === p.placeId && x.id !== p.id) : [];
  const more = cat.listed.filter((x) => x.collectionId === p.collectionId && x.id !== p.id && (!p.placeId || x.placeId !== p.placeId)).slice(0, 4);
  const crumbs = [['Inicio', '/'], ['Catálogo', '/catalogo']];
  if (p.collection) crumbs.push([p.collectionName, `/coleccion/${p.collection}`]);
  crumbs.push([p.name, p.url]);
  return render(c, {
    page: 'pieza', title: p.seoTitle || `${p.name} · ${p.type} con baño de oro 18k · THF Margarita`,
    desc: p.seoDesc || `${p.detail}. ${String(p.story).slice(0, 90)} Hecha a mano en Margarita, envíos a toda Venezuela.`.trim(),
    crumbs, jsonld: [seo.productLd(c.base, p, await zones(c.db), S)], og: p.img.main,
    body: V.productView({ S, p, looks, same, more }),
    products: [p, ...same, ...more, ...looks.flatMap((l) => l.items.map((i) => i.product))], looks,
  });
}

export async function looksPage(c) {
  const cat = await catalog(c.db);
  return render(c, {
    page: 'looks', slug: 'compra-el-look', title: 'Compra el look · THF', desc: '',
    crumbs: [['Inicio', '/'], ['Compra el look', '/compra-el-look']],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Compra el look', itemListElement: cat.looks.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: `Look ${l.name}`,
      item: { '@type': 'Product', name: `Look ${l.name}`, image: seo.absUrl(c.base, l.photo), brand: { '@type': 'Brand', name: 'THF' }, description: l.story,
        offers: { '@type': 'Offer', priceCurrency: 'USD', price: (l.price / 100).toFixed(2), availability: 'https://schema.org/MadeToOrder', url: `${c.base}/compra-el-look#${l.slug}` } } })) }],
    og: cat.looks[0]?.photo, body: V.looksView({ cat }),
    products: cat.looks.flatMap((l) => l.items.map((i) => i.product)), looks: cat.looks,
  });
}

const BOX_FAQ = [
  ['¿Tengo que unirme a un programa para comprar la caja?', 'No. La Caja de joyería es una compra directa a THF, sin registro ni compromisos.'],
  ['¿Qué trae la caja?', '12 collares y 12 pulseras variados, hechos a mano, cada uno en su sobre con tarjeta, con cadenas con baño de oro 18k.'],
  ['Si la compro para revender, ¿cómo cobro?', 'Las piezas pasan a ser tuyas: las vendes y cobras a tu manera. Esto es distinto de los programas, donde solo THF cobra.'],
  ['¿De qué material son las cadenas?', 'Las cadenas tienen baño de oro 18k.'],
];
export async function boxPage(c) {
  const cat = await catalog(c.db);
  const S = await c.db.settings();
  const box = boxOf(cat);
  if (!box) throw new HttpError(404);
  return render(c, {
    page: 'caja', slug: 'caja-de-joyeria', title: 'Caja de joyería THF', desc: '',
    crumbs: [['Inicio', '/'], ['Caja de joyería', '/caja-de-joyeria']], jsonld: [seo.productLd(c.base, box, await zones(c.db), S), seo.faqLd(BOX_FAQ)],
    og: box.img.main, body: V.boxView({ S, box }), products: [box],
  });
}

export async function customPage(c) {
  const S = await c.db.settings();
  return render(c, {
    page: 'personalizada', slug: 'joyeria-personalizada', title: 'Joyería personalizada · THF', desc: '',
    crumbs: [['Inicio', '/'], ['Joyería personalizada', '/joyeria-personalizada']],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Service', name: 'Joyería personalizada THF', serviceType: 'Diseño y elaboración de joyería a medida',
      provider: { '@id': c.base + '/#tienda' }, areaServed: 'VE', description: 'Diseñamos joyería a medida para marcas y personas. Primero apruebas el diseño; las muestras físicas se pagan porque usan material.' },
    seo.faqLd([['¿Las muestras físicas tienen costo?', 'Sí. Toda muestra física de una propuesta se paga, porque se elabora con material real.'],
      ['¿Pueden diseñar por mí?', 'Sí. Puedes traer tu diseño o pedirnos una propuesta; la elaboración empieza cuando apruebas el diseño.']])],
    body: V.customView({ S }),
  });
}

export async function programsPage(c) {
  const S = await c.db.settings();
  return render(c, {
    page: 'programas', slug: 'programas', title: 'Programas THF', desc: '',
    crumbs: [['Inicio', '/'], ['Programas', '/programas']],
    jsonld: [seo.faqLd([['¿Esto es un esquema piramidal?', 'No. Solo ganas por piezas vendidas a clientes reales, nunca por reclutar personas.'],
      ['¿Tengo que comprar mercancía?', 'No. Las piezas se elaboran bajo pedido y THF las despacha.'],
      ['¿Quién cobra a la clienta?', 'Solo THF, por su WhatsApp oficial. Las embajadoras y emprendedoras nunca reciben pagos de clientes.']])],
    body: V.programsView({ S }),
    // Simulador: números de MUESTRA definidos en Ajustes, nunca el costo real de una pieza
    extra: { sim: (S['programs.b.sim_examples'] || []).map((x) => ({ name: x.name, img: x.img, base: x.cost, sug: x.sug, min: x.min, max: x.max })) },
  });
}

export async function libraryPage(c) {
  const items = await digitalProducts(c.db);
  return render(c, {
    page: 'biblioteca', slug: 'biblioteca', title: 'Guías y ebooks THF', desc: '',
    crumbs: [['Inicio', '/'], ['Guías y ebooks', '/guias']],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Guías y ebooks THF', itemListElement: items.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: c.base + d.url, name: d.title })) }],
    body: V.libraryView({ items }),
  });
}

export async function digitalPage(c, slug) {
  const items = await digitalProducts(c.db);
  const d = items.find((i) => i.slug === slug);
  if (!d) throw new HttpError(404);
  const ld = { '@context': 'https://schema.org', '@type': 'Book', name: d.title, description: d.description || d.subtitle, bookFormat: 'https://schema.org/EBook',
    inLanguage: 'es', url: c.base + d.url, author: { '@id': c.base + '/#tienda' }, publisher: { '@id': c.base + '/#tienda' }, image: d.cover ? seo.absUrl(c.base, d.cover) : undefined,
    numberOfPages: d.pages || undefined,
    offers: { '@type': 'Offer', price: (d.price / 100).toFixed(2), priceCurrency: 'USD', availability: d.hasFile ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', url: c.base + d.url } };
  return render(c, {
    page: 'digital', title: d.seoTitle || `${d.title} · Guías THF`, desc: d.seoDesc || d.subtitle,
    crumbs: [['Inicio', '/'], ['Guías y ebooks', '/guias'], [d.title, d.url]], jsonld: [ld], og: d.cover,
    body: V.digitalView({ d, S: await c.db.settings(), others: items.filter((i) => i.slug !== slug).slice(0, 3) }),
    extra: { digital: [{ id: d.id, slug: d.slug, title: d.title, price: d.price, format: d.format, cover: d.cover, hasFile: d.hasFile }] },
  });
}

// ---------------------------------------------------------------- SEO local: isla, región y país
async function contentPage(c, slug) {
  const pg = await c.db.first('SELECT * FROM pages WHERE slug=?', [slug]);
  if (!pg) throw new HttpError(404);
  return pg;
}
const webPageLd = (c, pg, about) => ({ '@context': 'https://schema.org', '@type': 'WebPage', name: pg.heading || pg.title, url: c.base + c.url.pathname, inLanguage: 'es-VE',
  isPartOf: { '@id': c.base + '/#web' }, about, publisher: { '@id': c.base + '/#tienda' } });

export async function localPage(c) {
  const S = await c.db.settings();
  const pg = await contentPage(c, 'joyeria-en-margarita');
  const cat = await catalog(c.db);
  const faq = L.parseFaq(pg, S);
  return render(c, {
    page: 'local', slug: pg.slug, title: pg.title, desc: '', crumbs: [['Inicio', '/'], [pg.title, '/joyeria-en-margarita']],
    jsonld: [webPageLd(c, pg, { '@type': 'Place', name: 'Isla de Margarita', address: { '@type': 'PostalAddress', addressRegion: 'Nueva Esparta', addressCountry: 'VE' } }), ...(faq.length ? [seo.faqLd(faq)] : [])],
    og: cat.places.find((p) => p.slug === 'juangriego')?.photo, body: L.localView({ S, pg, zones: await zones(c.db), places: cat.places, faq }),
  });
}

export async function shippingPage(c) {
  const S = await c.db.settings();
  const pg = await contentPage(c, 'envios-venezuela');
  const states = await shippingStates(c.db);
  const faq = L.parseFaq(pg, S);
  return render(c, {
    page: 'envios', slug: pg.slug, title: pg.title, desc: '', crumbs: [['Inicio', '/'], [pg.title, '/envios-venezuela']],
    jsonld: [webPageLd(c, pg, { '@type': 'Country', name: 'Venezuela' }), ...(faq.length ? [seo.faqLd(faq)] : [])],
    body: L.shippingView({ S, pg, zones: await zones(c.db), pays: await payMethods(c.db), faq, states }),
    extra: { states },
  });
}

export async function faqPage(c) {
  const S = await c.db.settings();
  const pg = await contentPage(c, 'preguntas-frecuentes');
  const faq = L.parseFaq(pg, S);
  return render(c, {
    page: 'faq', slug: pg.slug, title: pg.title, desc: '', crumbs: [['Inicio', '/'], [pg.title, '/preguntas-frecuentes']],
    jsonld: faq.length ? [seo.faqLd(faq)] : [], body: L.faqView({ S, pg, faq }),
  });
}

// Todas las preguntas (para llms.txt)
export async function allFaq(db) {
  const S = await db.settings();
  const rows = await db.all("SELECT slug, faq FROM pages WHERE faq<>'[]' ORDER BY CASE slug WHEN 'preguntas-frecuentes' THEN 0 ELSE 1 END");
  const seen = new Set();
  return rows.flatMap((r) => L.parseFaq(r, S)).filter(([q]) => (seen.has(q) ? false : seen.add(q)));
}

export async function download(c, token) {
  const g = await c.db.first('SELECT * FROM download_grants WHERE token_hash=?', [await sha256(token)]);
  if (!g) throw new HttpError(404);
  if (Date.parse(g.expires_at) < Date.now() || g.downloads >= g.max_downloads)
    return errorPage(c, 410, 'El enlace venció', 'Este enlace de descarga ya no está activo. Escríbenos por WhatsApp y te enviamos uno nuevo.');
  const d = await c.db.first('SELECT * FROM digital_products WHERE id=?', [g.digital_product_id]);
  if (!d || !d.file_path) throw new HttpError(404);
  const r = await c.db.run('UPDATE download_grants SET downloads=downloads+1 WHERE id=? AND downloads<max_downloads', [g.id]);
  if (!r.changes) return errorPage(c, 410, 'El enlace venció', 'Este enlace ya alcanzó el máximo de descargas.');
  const res = await serveFile(c.env, c.db, d.file_path, new Request(c.req.url), { download: d.file_name || `${d.slug}.pdf`, cache: 'private, no-store' });
  if (!res) throw new HttpError(404);
  res.headers.set('X-Robots-Tag', 'noindex');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

export async function media(c, path) {
  if (!/^u\/[\w\-./]+$/.test(path) || path.includes('..')) throw new HttpError(404);
  const res = await serveFile(c.env, c.db, path, c.req);
  if (!res) throw new HttpError(404);
  return res;
}

export async function errorPage(c, code, title, msg) {
  try {
    return await render(c, { page: 'error', title: `${title} · THF`, desc: msg, noindex: true, status: code, body: V.errorView({ code, title, msg }) });
  } catch {
    return htmlRes(`<!doctype html><meta charset="utf-8"><title>${code}</title><p>${title}</p>`, code);
  }
}

// ---------------------------------------------------------------- SEO e IA
export async function robots(c) {
  return text(seo.robotsTxt(c.base, !!(await c.db.setting('seo.allow_ai_crawlers', true))), 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
}

export async function sitemap(c) {
  const cat = await catalog(c.db);
  const digital = await digitalProducts(c.db);
  const urls = [['/', null, 'weekly', '1.0'], ['/catalogo', null, 'weekly', '0.9'], ['/joyeria-en-margarita', null, 'monthly', '0.9'], ['/envios-venezuela', null, 'monthly', '0.8'],
    ['/compra-el-look', null, 'weekly', '0.8'], ['/caja-de-joyeria', null, 'monthly', '0.8'], ['/joyeria-personalizada', null, 'monthly', '0.7'], ['/programas', null, 'monthly', '0.7'],
    ['/preguntas-frecuentes', null, 'monthly', '0.6'], ['/guias', null, 'monthly', '0.6']];
  for (const col of cat.visibleCollections) urls.push([col.url, null, 'weekly', '0.9', [col.hero, col.card]]);
  for (const p of cat.listed) urls.push([p.url, p.updatedAt, 'monthly', '0.8', [...new Set([p.img.main, p.img.hover, ...p.img.gallery])]]);
  for (const d of digital) urls.push([d.url, d.updatedAt, 'monthly', '0.5']);
  return text(seo.sitemapXml(c.base, urls), 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
}

export async function llms(c, full) {
  const S = await c.db.settings();
  const cat = await catalog(c.db);
  const body = seo.llmsTxt(c.base, S, { cols: cat.visibleCollections, prods: cat.listed, looks: cat.looks, digital: await digitalProducts(c.db),
    zones: await zones(c.db), pays: await payMethods(c.db), full, faq: await allFaq(c.db) });
  return text(body, 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
}

export async function merchant(c) {
  const cat = await catalog(c.db);
  return text(seo.merchantFeed(c.base, cat.listed), 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
}

// WhatsApp: el número sale SOLO del ajuste global y el enlace se arma en el servidor
export async function waUrl(db, textMsg = '') {
  const num = String(await db.setting('contact.whatsapp', '')).replace(/\D/g, '');
  return `https://wa.me/${num}${textMsg ? `?text=${encodeURIComponent(textMsg)}` : ''}`;
}
export async function goWhatsapp(c) {
  const t = String(c.url.searchParams.get('text') || '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').slice(0, 1500);
  return redirect(await waUrl(c.db, t), 302, { 'X-Robots-Tag': 'noindex' });
}

export const LEGACY = { '/biblioteca': '/guias', '/index.html': '/', '/catalogo.html': '/catalogo', '/caja.html': '/caja-de-joyeria', '/personalizada.html': '/joyeria-personalizada', '/programas.html': '/programas' };
export { toString };
