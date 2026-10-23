// Lectura del catálogo en bloque (pocas consultas por página) y DTO públicos construidos campo a campo:
// nunca se expone costo, rangos de aliada, instrucciones de pago ni rutas privadas.
import { lookPrice, unitRetail } from './pricing.js';
import { publicColors } from './variants.js';
import { activeCampaigns, campaignPrice, publicCampaign } from './campaigns.js';

export const DIR_NAMES = { O: 'Oeste', N: 'Norte', E: 'Este', S: 'Sur' };
export const THEMES = ['arena', 'marino', 'burdeos', 'oliva', 'rosa', 'negro'];
export const mediaUrl = (path) => (path ? `/media/${path}` : '');

let snap = null; // caché por instancia, unos segundos

export function invalidate() {
  snap = null;
}

export async function catalog(db, { fresh = false } = {}) {
  if (!fresh && snap && Date.now() - snap.at < 20000) return snap.data;
  const camps = await activeCampaigns(db);
  const [collections, categories, places, products, pm, media, looks, items] = await Promise.all([
    db.all('SELECT * FROM collections ORDER BY sort, id'),
    db.all('SELECT * FROM categories ORDER BY sort, id'),
    db.all('SELECT * FROM places ORDER BY sort, id'),
    db.all("SELECT * FROM products WHERE status='published' ORDER BY sort, id"),
    db.all('SELECT product_id, media_id, role, sort, id FROM product_media ORDER BY sort, id'),
    db.all('SELECT id, kind, path, thumb_path, alt FROM media'),
    db.all('SELECT * FROM looks WHERE active=1 ORDER BY sort, id'),
    db.all('SELECT * FROM look_items ORDER BY sort, id'),
  ]);
  const mById = new Map(media.map((m) => [m.id, m]));
  const colById = new Map(collections.map((c) => [c.id, c]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const plById = new Map(places.map((p) => [p.id, p]));
  const pmBy = new Map();
  for (const r of pm) {
    if (!pmBy.has(r.product_id)) pmBy.set(r.product_id, []);
    pmBy.get(r.product_id).push(r);
  }
  const prods = products.map((p) => productDTO(p, { colById, catById, plById, pmBy, mById, camps }));
  const pBySlug = new Map(prods.map((p) => [p.slug, p]));
  const pById = new Map(prods.map((p) => [p.id, p]));
  const cols = collections.map((c) => ({
    id: c.id, slug: c.slug, name: c.name, kicker: c.kicker, tagline: c.tagline, intro: c.intro, story: c.story, audience: c.audience,
    theme: THEMES.includes(c.theme) ? c.theme : 'arena', hero: mediaUrl(mById.get(c.hero_media_id)?.path),
    card: mediaUrl(mById.get(c.card_media_id)?.path) || mediaUrl(mById.get(c.hero_media_id)?.path),
    groupByPlace: !!c.group_by_place, comingSoon: !!c.coming_soon, visible: !!c.visible, sort: c.sort,
    seoTitle: c.seo_title, seoDesc: c.seo_desc, url: `/coleccion/${c.slug}`,
    count: prods.filter((p) => p.collectionId === c.id && p.inCatalog).length,
  }));
  const visibleCols = new Set(cols.filter((c) => c.visible).map((c) => c.id));
  const listed = prods.filter((p) => p.inCatalog && (p.collectionId == null || visibleCols.has(p.collectionId)));
  const pls = places.filter((p) => p.visible).map((r) => ({
    id: r.id, slug: r.slug, name: r.name, region: r.region, dir: r.direction, dirName: DIR_NAMES[r.direction], title: r.title,
    subtitle: r.subtitle, story: r.story, lon: r.lon, lat: r.lat, coords: coordsText(r.lat, r.lon), photo: mediaUrl(mById.get(r.photo_media_id)?.path), mapPos: r.map_pos || 's',
    products: listed.filter((p) => p.placeId === r.id),
  }));
  const lks = [];
  for (const lk of looks) {
    const its = items.filter((i) => i.look_id === lk.id && pById.has(i.product_id));
    if (its.length < 2) continue;
    const full = its.reduce((a, i) => a + pById.get(i.product_id).unit * i.qty, 0);
    const discount = Math.floor((full * lk.discount_bps + 5000) / 10000);
    const pl = plById.get(lk.place_id);
    lks.push({
      id: lk.id, slug: lk.slug, name: lk.name, subtitle: lk.subtitle, story: lk.story, collectionId: lk.collection_id,
      place: pl?.name || '', placeSlug: pl?.slug || '', dirName: pl ? DIR_NAMES[pl.direction] : '',
      photo: mediaUrl(mById.get(lk.media_id)?.path), placePhoto: mediaUrl(mById.get(lk.place_media_id)?.path),
      full, discount, price: full - discount, discountPct: Math.round(lk.discount_bps / 100),
      items: its.map((i) => ({ product: pById.get(i.product_id), qty: i.qty, x: i.x, y: i.y })),
    });
  }
  const data = { campaigns: camps.map(publicCampaign), collections: cols, visibleCollections: cols.filter((c) => c.visible), places: pls, products: prods, listed, looks: lks, pBySlug, pById };
  snap = { at: Date.now(), data };
  return data;
}

function productDTO(p, { colById, catById, plById, pmBy, mById, camps = [] }) {
  const col = colById.get(p.collection_id), cat = catById.get(p.category_id), pl = plById.get(p.place_id);
  const img = { main: '', hover: '', inset: '', model: '', gallery: [], alt: '', insetOn: !!p.inset_enabled, insetTitle: p.inset_title || '', insetNote: p.inset_note || '' };
  for (const r of pmBy.get(p.id) || []) {
    const m = mById.get(r.media_id);
    if (!m) continue;
    const u = mediaUrl(m.path);
    if (['main', 'hover', 'inset', 'model'].includes(r.role) && !img[r.role]) {
      img[r.role] = u;
      if (r.role === 'main') img.alt = m.alt;
    }
    img.gallery.push(u);
  }
  img.main = img.main || img.gallery[0] || '';
  img.hover = img.hover || img.model || img.main;
  if (!img.inset) img.insetOn = false;
  const unit = unitRetail(p, camps);
  const cp = campaignPrice(p, camps);
  const byCampaign = !!cp && cp.price === unit && unit < (p.offer_cents ?? p.price_cents);
  const d = {
    id: p.id, slug: p.slug, name: p.name, provisional: !!p.provisional_name,
    collectionId: p.collection_id, collection: col?.slug || '', collectionName: col?.name || '',
    cat: cat?.slug || '', catName: cat?.name || '', placeId: p.place_id, place: pl?.name || '', placeSlug: pl?.slug || '',
    dir: pl?.direction || '', dirName: pl ? DIR_NAMES[pl.direction] : '',
    type: p.type, stone: p.stone, material: p.material, detail: p.detail, story: p.story, care: p.care, audience: p.audience,
    price: p.price_cents, offer: byCampaign ? unit : p.offer_cents, unit, campaign: byCampaign ? cp.campaign.name : '', mayor: p.wholesale_cents == null ? null : Math.min(p.wholesale_cents, unit), bundle: !!p.is_bundle, pieces: p.bundle_pieces,
    leadMin: p.lead_min_days, leadMax: p.lead_max_days, variants: JSON.parse(p.variants || '[]'), colors: p.is_bundle ? null : publicColors(p.colors), sku: p.sku,
    featured: !!p.featured, inCatalog: !!p.in_catalog, sort: p.sort, img, url: `/pieza/${p.slug}`,
    seoTitle: p.seo_title, seoDesc: p.seo_desc, updatedAt: p.updated_at,
  };
  if (d.bundle && d.pieces) d.perPiece = Math.floor((unit + Math.floor(d.pieces / 2)) / d.pieces);
  d.offPct = d.offer != null && d.price ? Math.round((1 - d.offer / d.price) * 100) : 0;
  d.eyebrow = d.bundle ? `Caja · ${d.pieces} piezas` : d.place && d.dirName ? `${d.dirName} · ${d.place}` : d.collectionName;
  return d;
}

// Versión ligera para el JSON del navegador (sin historia larga)
export function clientProduct(p) {
  const { care, seoTitle, seoDesc, updatedAt, collectionId, placeId, sort, ...rest } = p;
  return { ...rest, story: String(p.story || '').slice(0, 420) };
}

export function coordsText(lat, lon) {
  const dms = (v, pos, neg) => {
    const h = v >= 0 ? pos : neg;
    v = Math.abs(v);
    let d = Math.floor(v), m = Math.round((v - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    return `${d}°${String(m).padStart(2, '0')}′${h}`;
  };
  return `${dms(lat, 'N', 'S')} · ${dms(lon, 'E', 'O')}`;
}

export async function digitalProducts(db, publishedOnly = true) {
  const rows = await db.all(`SELECT d.*, m.path cover_path FROM digital_products d LEFT JOIN media m ON m.id=d.cover_media_id
                             ${publishedOnly ? "WHERE d.status='published'" : ''} ORDER BY d.sort, d.id`);
  return rows.map((d) => ({ id: d.id, slug: d.slug, title: d.title, subtitle: d.subtitle, description: d.description, audience: d.audience,
    format: d.format, pages: d.pages, price: d.price_cents, cover: mediaUrl(d.cover_path), hasFile: !!d.file_path, url: `/guias/${d.slug}`,
    seoTitle: d.seo_title, seoDesc: d.seo_desc, updatedAt: d.updated_at }));
}

export async function zones(db) {
  return (await db.all('SELECT * FROM shipping_zones WHERE active=1 ORDER BY sort')).map((z) => ({
    code: z.code, name: z.name, kind: z.kind, fee: z.fee_cents, freeOver: z.free_over_cents, cod: !!z.allows_cod, eta: z.eta }));
}

export async function payMethods(db) {
  return (await db.all('SELECT * FROM payment_methods WHERE active=1 ORDER BY sort')).map((m) => ({
    code: m.code, name: m.name, adj: m.adj_bps, islandOnly: !!m.island_only, pickupOnly: !!m.pickup_only, currency: m.currency, kind: m.kind, desc: m.description }));
}

export const PUBLIC_SETTINGS = ['brand.name', 'brand.descriptor', 'brand.tagline', 'brand.about', 'contact.whatsapp_display', 'contact.instagram', 'contact.email',
  'orders.wholesale_min_pieces', 'orders.lead_time_text', 'programs.a.commission_pct', 'programs.payout_min_usd'];

export async function publicSettings(db) {
  const s = await db.settings();
  return Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? '']));
}

export { lookPrice };

export async function shippingStates(db) {
  return (await db.all('SELECT * FROM shipping_states WHERE active=1 ORDER BY sort, state')).map((r) => ({ state: r.state, zone: r.zone_code, eta: r.eta, note: r.note }));
}
