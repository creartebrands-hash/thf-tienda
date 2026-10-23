// Primera instalación: crea las tablas y carga colecciones, lugares, piezas, looks, envíos y ajustes.
import { nowIso } from './db.js';
import { createSchema } from './migrate.js';
import { recomputeProductCost, unitCostMc } from './costs.js';
import { SEED as S } from './seed-data.js';

const CARE = 'Guárdala por separado en su bolsita. Evita perfumes, cremas, agua salada y cloro. Límpiala con un paño suave y seco. Las piedras y perlas naturales varían de una pieza a otra.';
const CARE_KIDS = 'Contiene piezas pequeñas: úsala con supervisión de un adulto y guárdala fuera del alcance de niños menores de 3 años. Quítala para dormir, bañarse o nadar.';
const ALTS = {
  'ocaso-juangriego': 'Atardecer sobre la bahía con el sol tocando el horizonte', 'macanao-cerros': 'Cerros de arcilla de la Península de Macanao',
  'punta-arenas-aerea': 'Vista aérea de Punta Arenas', 'valle-espiritu-santo': 'Basílica del Valle del Espíritu Santo', 'salinas-rosa': 'Estanques de sal rosados',
  'pampatar-fortin': 'Fortín colonial de Pampatar frente al mar', 'flamenco-vuelo': 'Flamenco en vuelo', manglar: 'Manglares sobre agua mansa',
  'cubagua-ruinas': 'Ruinas de Nueva Cádiz en Cubagua', conchas: 'Conchas y perlas en la arena',
  'venezuela-collage': 'Paisajes de Venezuela: playa, salto de agua, médanos y montaña', 'rel-portada': 'Collar de perlas con medalla y pulsera de perlas',
  'cg-deco-donas': 'Donas de colores', 'caja-abierta': 'Caja de joyería abierta con piezas en sobres',
};

// Cuadro pequeño de la tarjeta: [título, nota breve, activo]. Vienen activos los que ya se veían en el sitio; todo se edita en el panel.
// Si el cuadro es una piedra, el título y la nota aparecen al pasar el cursor o al tocarlo. Sin título, el cuadro es solo una foto.
const INSETS = {
  ocaso: ['Amatista', 'Cuarzo violeta · Brasil y Uruguay', 1],
  'ecos-de-nueva-cadiz': ['Perla', 'Gema orgánica que nace en una ostra', 0],
  'trilogia-caribe': ['Perla', 'Gema orgánica del mar y los ríos', 0],
  'fuego-y-viento': ['Cerros de Macanao', 'Oeste de Margarita', 0],
  'luz-y-fe': ['', '', 1],
  'marea-rosa': ['Salinas y flamencos', 'Este de Margarita', 0],
  'punta-arenas': ['Punta Arenas', 'Oeste de Margarita', 0],
  'vuelo-coral': ['Flamenco', 'Lagunas del sur', 0],
  'verde-manglar': ['Manglares', 'Sur de Margarita', 0],
  'ecos-de-pampatar': ['Fortín de Pampatar', 'Este de Margarita', 0],
  'mapa-de-venezuela': ['Venezuela', 'De Los Roques a los Andes', 0],
  'latido-tricolor': ['Venezuela', 'De Los Roques a los Andes', 0],
};

export async function isInstalled(db) {
  try {
    return (await db.n('SELECT COUNT(*) n FROM schema_version')) > 0;
  } catch {
    return false;
  }
}

export async function install(db) {
  await createSchema(db);
  const t = nowIso();
  const media = {};
  const mstmts = Object.entries(S.MEDIA).map(([name, [w, h, b]]) => {
    const isVideo = name.endsWith('.mp4');
    const path = isVideo ? `seed/${name}` : `seed/${name}.webp`;
    return ['INSERT INTO media(kind,path,width,height,bytes,alt,created_at) VALUES (?,?,?,?,?,?,?)', [isVideo ? 'video' : 'image', path, w || null, h || null, b, ALTS[name] || '', t]];
  });
  await db.batch(mstmts);
  for (const r of await db.all('SELECT id, path FROM media')) media[r.path.replace(/^seed\//, '').replace(/\.webp$/, '')] = r.id;
  const M = (n) => (n ? media[n] ?? null : null);

  for (const [k, v] of Object.entries(S.SETTINGS)) await db.setSetting(k, v, null, 'Valor inicial');
  await db.batch(S.CATEGORIES.map(([slug, name, sort]) => ['INSERT INTO categories(slug,name,sort) VALUES (?,?,?)', [slug, name, sort]]));
  await db.batch(S.COLLECTIONS.map((c) => [`INSERT INTO collections(slug,name,kicker,tagline,intro,story,audience,theme,hero_media_id,card_media_id,group_by_place,sort,seo_title,seo_desc,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [c.slug, c.name, c.kicker, c.tagline, c.intro, c.story, c.audience || '', c.theme, M(c.hero), M(c.card), c.group_by_place || 0, c.sort, c.seo_title, c.seo_desc, t]]));
  await db.batch(S.PLACES.map((p, i) => [`INSERT INTO places(slug,name,region,direction,title,subtitle,story,lon,lat,photo_media_id,sort,direction_note,map_pos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.slug, p.name, p.region, p.direction, p.title, p.subtitle, p.story, (S.PLACE_FIX[p.slug] || [p.lon])[0], (S.PLACE_FIX[p.slug] || [0, p.lat])[1], M(p.photo), i + 1, p.direction_note || '', S.MAP_POS[p.slug] || 's']]));
  const ids = async (tbl) => Object.fromEntries((await db.all(`SELECT id, slug FROM ${tbl}`)).map((r) => [r.slug, r.id]));
  const cols = await ids('collections'), cats = await ids('categories'), places = await ids('places');

  const prods = [];
  const add = (o) => prods.push(o);
  S.ALISIOS.forEach((a, i) => {
    const [slug, name, cat, place, type, stone, detail, story, price, offer, wh, cost, im, hov, ins, sku] = a;
    const sug = Math.round(((offer || price) * 0.8) / 100) * 100;
    add({ slug, name, col: 'alisios-de-margarita', cat, place, type, stone, detail, story, price, offer, wh, cost, imgs: [['main', im], ['hover', hov], ['inset', ins]], sku, sort: i + 1,
      sug, min: Math.round(sug * 0.8), max: Math.round(sug * 1.5), featured: S.FEATURED.includes(slug) });
  });
  S.VENEZUELA.forEach((v, i) => {
    const [slug, name, cat, type, stone, detail, story, price, im, hov, ins, sku] = v;
    add({ slug, name, col: 'venezuela-sigue-latiendo', cat, type, stone, detail, story, price, wh: Math.round(price * 0.65), imgs: [['main', im], ['hover', ins], ['inset', hov]], sku, sort: i + 1, provisional: 1 });
  });
  S.CANDY.forEach(([slug, name, price], i) => add({
    slug: `candy-girl-${slug}`, name, col: 'candy-girl', cat: 'sets', type: 'Set collar + pulsera', stone: 'Piedras semipreciosas, perlas y nácar',
    detail: 'Cuentas de colores, perlas y nácar con detalles con baño de oro 18k',
    story: `Set ${name} de la colección Candy Girl: un collar y una pulsera pensados para niñas de 4 a 10 años, hechos a mano con colores que cuentan su sabor favorito.`,
    price, imgs: [['main', `cg-${slug}`], ['hover', `cg-${slug}-nina`]], sku: `THF-CG-${String(i + 1).padStart(2, '0')}`, sort: i + 1,
    audience: 'Niñas de 4 a 10 años', demo: 0, variants: ['Talla infantil'], care: CARE_KIDS, material: 'Detalles con baño de oro 18k' }));
  S.RELIGIOSA.forEach(([name, stone], i) => {
    const n = String(i + 1).padStart(2, '0');
    add({ slug: `religiosa-${n}`, name, col: 'linea-religiosa', cat: 'sets', type: 'Set collar + pulsera', stone, detail: `${stone}, en cadena con baño de oro 18k`,
      story: 'Un símbolo de fe pequeño y delicado para llevar cerca cada día. Hecho a mano en Margarita, con la elegancia serena de toda la casa THF.',
      price: 3700, imgs: [['main', `rel-${n}`], ['hover', `rel-${n}-modelo`]], sku: `THF-REL-${n}`, sort: i + 1, provisional: 1, demo: 0 });
  });
  add({ slug: 'caja-de-joyeria', name: 'Caja de joyería', cat: 'cajas', type: '12 collares + 12 pulseras', stone: 'Variadas', detail: '12 collares variados y 12 pulseras variadas',
    story: 'Una caja kraft con 24 piezas hechas a mano, cada una en su sobre con tarjeta: 12 collares y 12 pulseras variadas, con cadenas con baño de oro 18k. Para emprender, para regalar o para ti.',
    price: 16750, offer: 13400, imgs: [['main', 'caja-abierta'], ['hover', 'caja-manos'], ['inset', 'caja-foto'], ['gallery', 'caja-cerrada'], ['gallery', 'caja-tarjeta']],
    sku: 'THF-CAJA-24', sort: 1, bundle: 1, pieces: 24, variants: [], material: 'Cadenas con baño de oro 18k · empaque kraft con sobre individual por pieza' });
  S.LOOKS.forEach(([lslug, name, place, main, stone, photos], i) => {
    const n = String(i + 1).padStart(2, '0');
    add({ slug: `${main}-collar-para-combinar`, name: `Collar para combinar · ${name}`, col: 'alisios-de-margarita', cat: 'collares', place, type: 'Collar para capas', stone,
      detail: `Collar para llevar en capas con el set ${name}`, story: `Pieza que acompaña al set ${name} en el look para combinar del catálogo.`,
      price: 1600, wh: 1000, cost: 600, imgs: [['main', photos[1] || photos[0]], ['hover', photos[0]]], sku: `THF-CMB-${n}C`, sort: 50 + i, provisional: 1, inCatalog: 0 });
    add({ slug: `${main}-pulsera-para-combinar`, name: `Pulsera para combinar · ${name}`, col: 'alisios-de-margarita', cat: 'pulseras', place, type: 'Pulsera para capas', stone,
      detail: `Pulsera para combinar con el set ${name}`, story: `Pulsera que acompaña al set ${name} en el look para combinar del catálogo.`,
      price: 1200, wh: 800, cost: 450, imgs: [['main', photos[photos.length - 1]], ['hover', photos[0]]], sku: `THF-CMB-${n}P`, sort: 60 + i, provisional: 1, inCatalog: 0, variants: ['16 cm', '18 cm'] });
  });
  await db.batch(prods.map((p) => [`INSERT INTO products(slug,name,provisional_name,collection_id,category_id,place_id,type,stone,material,detail,story,care,audience,
      price_cents,offer_cents,wholesale_cents,cost_cents,suggested_cents,min_cents,max_cents,is_bundle,bundle_pieces,variants,sku,status,featured,in_catalog,is_demo_price,sort,
      lead_min_days,lead_max_days,created_at,updated_at,inset_title,inset_note,inset_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [p.slug, p.name, p.provisional || 0, cols[p.col] ?? null, cats[p.cat] ?? null, places[p.place] ?? null, p.type, p.stone, p.material || 'Cadena con baño de oro 18k',
    p.detail, p.story, p.care || CARE, p.audience || '', p.price, p.offer ?? null, p.wh ?? null, p.cost ?? null, p.sug ?? null, p.min ?? null, p.max ?? null,
    p.bundle || 0, p.pieces ?? null, JSON.stringify(p.variants || ['40 cm', '45 cm', '50 cm']), p.sku, 'published', p.featured ? 1 : 0,
    p.inCatalog === 0 ? 0 : 1, p.demo === 0 ? 0 : 1, p.sort, S.LEAD[0], S.LEAD[1], t, t, INSETS[p.slug]?.[0] || '', INSETS[p.slug]?.[1] || '', INSETS[p.slug]?.[2] || 0]]));
  const pid = await ids('products');
  const pm = [];
  for (const p of prods) p.imgs.forEach(([role, m], k) => { if (M(m)) pm.push(['INSERT INTO product_media(product_id,media_id,role,sort) VALUES (?,?,?,?)', [pid[p.slug], M(m), role, k]]); });
  await db.batch(pm);

  const placeRows = Object.fromEntries((await db.all('SELECT slug, photo_media_id FROM places')).map((r) => [r.slug, r.photo_media_id]));
  await db.batch(S.LOOKS.map(([lslug, name, place, main, stone, photos, story], i) => [
    'INSERT INTO looks(slug,name,subtitle,story,collection_id,place_id,media_id,place_media_id,discount_bps,sort,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [lslug, name, 'Set para combinar', story, cols['alisios-de-margarita'], places[place], M(photos[0]), placeRows[place], 1000, i + 1, t]]));
  await db.run('INSERT INTO looks(slug,name,subtitle,story,collection_id,media_id,place_media_id,discount_bps,sort,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ['look-venezuela-sigue-latiendo', 'Venezuela sigue latiendo', 'Set exclusivo', 'El mapa en Y y el latido tricolor juntos: dos cadenas para llevar el país en capas.',
      cols['venezuela-sigue-latiendo'], M('look-venezuela-1'), M('venezuela-collage'), 1000, 20, t]);
  const lid = await ids('looks');
  const li = [];
  S.LOOKS.forEach(([lslug, , , main]) => {
    [[pid[main], 50, 36], [pid[`${main}-collar-para-combinar`], 58, 56], [pid[`${main}-pulsera-para-combinar`], 36, 80]].forEach(([p, x, y], k) =>
      li.push(['INSERT INTO look_items(look_id,product_id,qty,x,y,sort) VALUES (?,?,?,?,?,?)', [lid[lslug], p, 1, x, y, k]]));
  });
  li.push(['INSERT INTO look_items(look_id,product_id,qty,x,y,sort) VALUES (?,?,?,?,?,?)', [lid['look-venezuela-sigue-latiendo'], pid['mapa-de-venezuela'], 1, 52, 52, 0]]);
  li.push(['INSERT INTO look_items(look_id,product_id,qty,x,y,sort) VALUES (?,?,?,?,?,?)', [lid['look-venezuela-sigue-latiendo'], pid['latido-tricolor'], 1, 46, 30, 1]]);
  await db.batch(li);

  await db.batch(S.SHIPPING.map((z, i) => ['INSERT INTO shipping_zones(code,name,kind,fee_cents,free_over_cents,allows_cod,eta,sort) VALUES (?,?,?,?,?,?,?,?)',
    [z.code, z.name, z.kind, z.fee_cents, z.free_over_cents, z.allows_cod || 0, z.eta, i]]));
  await db.batch(S.STATES.map((st, i) => ['INSERT INTO shipping_states(state,zone_code,sort) VALUES (?,?,?)', [st, st === 'Nueva Esparta' ? 'isla' : 'nacional', i]]));
  await db.batch(S.PAYMENTS.map((m, i) => [`INSERT INTO payment_methods(code,name,currency,adj_bps,island_only,instructions,sort,kind,details,description,proof,pickup_only,active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [m.code, m.name, m.currency, m.adj_bps || 0, m.island_only || 0, '', i, m.kind, JSON.stringify(m.details || {}), m.description || '',
    m.proof || 'ref', m.pickup_only || 0, m.active === 0 ? 0 : 1]]));
  await db.batch(S.DIGITAL.map((d, i) => ['INSERT INTO digital_products(slug,title,subtitle,description,audience,format,pages,price_cents,cover_media_id,status,sort,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [d.slug, d.title, d.subtitle, d.description, d.audience, d.format, d.pages, d.price_cents, M(d.cover), d.status, i, t]]));
  await db.batch(S.PAGES.map(([slug, title, st, sd], i) => {
    const pc = S.PAGE_CONTENT[slug] || {};
    return ['INSERT INTO pages(slug,title,seo_title,seo_desc,heading,intro,body,faq,updated_at,sort) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [slug, title, st, sd, pc.heading || '', pc.intro || '', pc.body || '', JSON.stringify(pc.faq || []), t, i]];
  }));
  await seedV2(db);
  await seedV3(db);
  await seedV4(db);
}

// ---------------------------------------------------------------- versión 2 (idempotente: solo agrega lo que falta)
async function fillSettings(db) {
  const have = new Set((await db.all('SELECT key FROM settings')).map((r) => r.key));
  for (const [k, v] of Object.entries(S.SETTINGS)) if (!have.has(k)) await db.setSetting(k, v, null, 'Valor inicial (versión 2)');
}

async function seedV2(db) {
  const t = nowIso();
  await fillSettings(db);
  // fotos semilla nuevas (portadas de las guías)
  const known = new Set((await db.all("SELECT path FROM media WHERE path LIKE 'seed/%'")).map((r) => r.path));
  const add = Object.entries(S.MEDIA).filter(([name]) => !name.endsWith('.mp4') && !known.has(`seed/${name}.webp`));
  if (add.length) await db.batch(add.map(([name, [w, h, b]]) => ['INSERT INTO media(kind,path,width,height,bytes,alt,created_at) VALUES (?,?,?,?,?,?,?)', ['image', `seed/${name}.webp`, w, h, b, ALTS[name] || '', t]]));
  const media = Object.fromEntries((await db.all("SELECT id, path FROM media WHERE path LIKE 'seed/%'")).map((r) => [r.path.replace(/^seed\//, '').replace(/\.webp$/, ''), r.id]));
  // guías: las que falten
  const slugs = new Set((await db.all('SELECT slug FROM digital_products')).map((r) => r.slug));
  const nd = S.DIGITAL.map((d, i) => [d, i]).filter(([d]) => !slugs.has(d.slug));
  if (nd.length) await db.batch(nd.map(([d, i]) => ['INSERT INTO digital_products(slug,title,subtitle,description,audience,format,pages,price_cents,cover_media_id,status,sort,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [d.slug, d.title, d.subtitle, d.description, d.audience, d.format, d.pages, d.price_cents, media[d.cover] ?? null, d.status, i, t]]));
  // métodos de pago: completa el tipo y los campos de los que aún no se tocaron
  const pms = await db.all('SELECT id, code, kind FROM payment_methods');
  for (const m of S.PAYMENTS) {
    const cur = pms.find((x) => x.code === m.code);
    if (cur && cur.kind === 'otro') await db.run('UPDATE payment_methods SET kind=?, details=?, description=?, proof=?, pickup_only=? WHERE id=?',
      [m.kind, JSON.stringify(m.details || {}), m.description || '', m.proof || 'ref', m.pickup_only || 0, cur.id]);
    if (!cur) await db.run(`INSERT INTO payment_methods(code,name,currency,adj_bps,island_only,instructions,sort,kind,details,description,proof,pickup_only,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [m.code, m.name, m.currency, m.adj_bps || 0, m.island_only || 0, '', 50, m.kind, JSON.stringify(m.details || {}), m.description || '', m.proof || 'ref', m.pickup_only || 0, m.active === 0 ? 0 : 1]);
  }
  // orden de las páginas
  await db.batch(S.PAGES.map(([slug], i) => ['UPDATE pages SET sort=? WHERE slug=?', [i, slug]]));
  // temporadas (apagadas)
  if (!(await db.n('SELECT COUNT(*) n FROM campaigns'))) await db.batch(S.CAMPAIGNS.map((c, i) => [`INSERT INTO campaigns(slug,name,kind,starts_at,ends_at,active,discount_bps,scope,banner_title,banner_text,banner_cta,theme,media_id,page_intro,show_countdown,sort,updated_at)
    VALUES (?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?)`, [c.slug, c.name, c.kind, c.starts_at, c.ends_at, c.discount_bps, c.scope, c.banner_title, c.banner_text, c.banner_cta, c.theme, media[c.media] ?? null, c.page_intro, c.show_countdown, i, t]]));
  // proveedores, materiales y receta de ejemplo
  if (!(await db.n('SELECT COUNT(*) n FROM suppliers'))) {
    await db.batch(S.SUPPLIERS.map((x) => ['INSERT INTO suppliers(name,url,country,shipping_bps,updated_at) VALUES (?,?,?,?,?)', [x.name, x.url, x.country, x.shipping_bps, t]]));
    const sup = Object.fromEntries((await db.all('SELECT id, name, shipping_bps FROM suppliers')).map((r) => [r.name, r]));
    await db.batch(S.MATERIALS.map((m) => ['INSERT INTO materials(supplier_id,name,category,unit,pack_qty,pack_cost_cents,unit_cost_mc,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [sup[m.supplier]?.id ?? null, m.name, m.category, m.unit, m.pack_qty, m.pack_cost_cents, unitCostMc(m.pack_cost_cents, m.pack_qty, sup[m.supplier]?.shipping_bps || 0), t]]));
    const mats = Object.fromEntries((await db.all('SELECT id, name FROM materials')).map((r) => [r.name, r.id]));
    const prods = Object.fromEntries((await db.all('SELECT id, slug FROM products')).map((r) => [r.slug, r.id]));
    for (const [slug, rows] of Object.entries(S.BOM)) {
      if (!prods[slug]) continue;
      await db.batch(rows.map(([name, qty], i) => ['INSERT INTO product_bom(product_id,material_id,qty,sort) VALUES (?,?,?,?)', [prods[slug], mats[name], qty, i]]));
      await db.run('UPDATE products SET labor_cents=? WHERE id=?', [S.SETTINGS['costs.labor_default_cents'], prods[slug]]);
      await recomputeProductCost(db, prods[slug], null, 'Receta de ejemplo');
    }
  }
}

// ---------------------------------------------------------------- versión 3: categorías básicas de las tiendas aliadas e integraciones
async function seedV3(db) {
  await fillSettings(db);
  const have = new Map((await db.all('SELECT slug, sort FROM categories')).map((r) => [r.slug, r.sort]));
  const missing = S.CATEGORIES.filter(([slug]) => !have.has(slug));
  if (missing.length) await db.batch(missing.map(([slug, name, sort]) => ['INSERT INTO categories(slug,name,sort) VALUES (?,?,?)', [slug, name, sort]]));
  // Orden del menú (collares, zarcillos, pulseras, sets, anillos, cajas) solo si nadie lo cambió
  const old = { collares: 1, pulseras: 2, sets: 3, cajas: 4 };
  if (Object.entries(old).every(([k, v]) => have.get(k) === v)) await db.batch(S.CATEGORIES.map(([slug, , sort]) => ['UPDATE categories SET sort=? WHERE slug=?', [sort, slug]]));
}

// v4: crédito de la agencia en el pie de página (ajustes nuevos)
async function seedV4(db) { await fillSettings(db); }

export const DATA_MIGRATIONS = { 2: seedV2, 3: seedV3, 4: seedV4 };
// Para las instalaciones que ya existían: carga en el almacenamiento privado los PDF incluidos en /files
export { fillSettings };
