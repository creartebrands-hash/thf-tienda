// SEO para buscadores y asistentes de IA: schema.org, sitemap, robots, llms.txt y feed de productos.
import { esc } from './html.js';
import { money } from './pricing.js';

export const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'CCBot', 'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User'];

export const absUrl = (base, path) => (!path ? '' : /^https?:/.test(path) ? path : base + path);

export async function pageMeta(db, slug, title, desc) {
  const r = slug ? await db.first('SELECT seo_title, seo_desc FROM pages WHERE slug=?', [slug]) : null;
  return { title: r?.seo_title || title, desc: r?.seo_desc || desc };
}

// Lista de un textarea (una por línea)
export const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);

// Reemplaza {lead}, {mayor_min} y {whatsapp} en textos editables sin montos fijos
export const fillTokens = (t, s) => String(t || '').replace(/\{lead\}/g, s['orders.lead_time_text'] || '').replace(/\{mayor_min\}/g, String(s['orders.wholesale_min_pieces'] || ''))
  .replace(/\{whatsapp\}/g, s['contact.whatsapp_display'] || '');

const isDemoWa = (s) => String(s['contact.whatsapp_display'] || '').endsWith('000 0000');

// Negocio local (isla) que vende y envía a todo el país: zonas de servicio en tres niveles
export function areaServedLd(s) {
  return [
    { '@type': 'Place', name: 'Isla de Margarita', containedInPlace: { '@type': 'AdministrativeArea', name: 'Nueva Esparta' } },
    ...lines(s['local.island_areas']).map((n) => ({ '@type': 'Place', name: `${n}, Nueva Esparta` })),
    { '@type': 'AdministrativeArea', name: s['local.region'] || 'Nueva Esparta' },
    ...lines(s['local.region_areas']).map((n) => ({ '@type': 'City', name: n })),
    ...lines(s['local.national_cities']).map((n) => ({ '@type': 'City', name: n })),
    { '@type': 'Country', name: 'Venezuela' },
  ];
}

export function orgLd(base, s, pays) {
  const ig = String(s['contact.instagram'] || '').replace('@', '');
  const tel = isDemoWa(s) ? undefined : s['contact.whatsapp_display'];
  const lat = parseFloat(s['local.lat']), lon = parseFloat(s['local.lon']);
  const d = {
    '@context': 'https://schema.org', '@type': ['JewelryStore', 'OnlineStore'], '@id': base + '/#tienda',
    name: `${s['brand.name']} ${s['brand.descriptor']}`, alternateName: ['THF', 'THF Joyería', 'THF Accesorios', 'THF Margarita'],
    url: base + '/', logo: base + '/brand/logo-thf.png', image: base + '/brand/logo-thf.png',
    description: s['brand.about'], slogan: s['brand.tagline'], email: s['contact.email'] || undefined, telephone: tel,
    address: { '@type': 'PostalAddress', streetAddress: s['local.street'] || undefined, addressLocality: s['local.locality'] || 'Isla de Margarita',
      addressRegion: s['local.region'] || 'Nueva Esparta', postalCode: s['local.postal_code'] || undefined, addressCountry: 'VE' },
    geo: Number.isFinite(lat) && Number.isFinite(lon) ? { '@type': 'GeoCoordinates', latitude: lat, longitude: lon } : undefined,
    hasMap: s['local.maps_url'] || undefined,
    areaServed: areaServedLd(s),
    foundingLocation: { '@type': 'Place', name: 'Isla de Margarita, Nueva Esparta, Venezuela' },
    currenciesAccepted: 'USD', paymentAccepted: pays.map((p) => p.name).join(', '), priceRange: '$$',
    contactPoint: { '@type': 'ContactPoint', contactType: 'ventas', telephone: tel, availableLanguage: 'es', areaServed: 'VE' },
    sameAs: [ig ? `https://www.instagram.com/${ig}/` : '', s['local.maps_url'] || ''].filter(Boolean),
    knowsAbout: ['joyería artesanal', 'baño de oro 18k', 'Isla de Margarita', 'piedras naturales', 'perlas', 'joyería infantil', 'joyería religiosa', 'joyería al mayor'],
    makesOffer: { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Envíos de joyería a toda Venezuela' }, areaServed: { '@type': 'Country', name: 'Venezuela' } },
  };
  if (s['local.hours']) d.description = `${d.description} Atención: ${s['local.hours']}.`;
  return d;
}

export const websiteLd = (base, s) => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': base + '/#web', url: base + '/', name: `${s['brand.name']} ${s['brand.descriptor']}`,
  inLanguage: 'es-VE', publisher: { '@id': base + '/#tienda' },
  potentialAction: { '@type': 'SearchAction', target: base + '/catalogo?q={search_term_string}', 'query-input': 'required name=search_term_string' },
});

export const breadcrumbsLd = (base, items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: absUrl(base, u) })),
});

// Envío por zona (isla y nacional), con tiempo de elaboración y de tránsito
export function shippingLd(zones, p, s = {}) {
  const out = [];
  for (const z of zones || []) {
    if (z.fee == null || z.kind === 'retiro') continue;
    const isla = z.kind === 'isla';
    out.push({ '@type': 'OfferShippingDetails', shippingLabel: z.name,
      shippingRate: { '@type': 'MonetaryAmount', value: (z.fee / 100).toFixed(2), currency: 'USD' },
      shippingDestination: isla ? { '@type': 'DefinedRegion', addressCountry: 'VE', addressRegion: s['local.region_code'] || 'VE-O' } : { '@type': 'DefinedRegion', addressCountry: 'VE' },
      deliveryTime: { '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: p.leadMin || 7, maxValue: p.leadMax || 10, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: isla ? 1 : 2, maxValue: isla ? 2 : 5, unitCode: 'DAY' } } });
  }
  return out;
}

export function productLd(base, p, zones = [], s = {}) {
  const props = [];
  if (p.stone) props.push({ '@type': 'PropertyValue', name: 'Piedra o detalle', value: p.stone });
  if (p.place) props.push({ '@type': 'PropertyValue', name: 'Lugar que la inspira', value: `${p.place}, Isla de Margarita` });
  if (p.collectionName) props.push({ '@type': 'PropertyValue', name: 'Colección', value: p.collectionName });
  props.push({ '@type': 'PropertyValue', name: 'Elaboración', value: `Hecha a mano bajo pedido en la Isla de Margarita, ${p.leadMin} a ${p.leadMax} días hábiles` });
  props.push({ '@type': 'PropertyValue', name: 'Envíos', value: 'Delivery en la Isla de Margarita y envíos a toda Venezuela' });
  const d = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': absUrl(base, p.url) + '#producto', name: p.name, sku: p.sku || undefined,
    image: (p.img.gallery.length ? p.img.gallery : [p.img.main]).filter(Boolean).map((u) => absUrl(base, u)), url: absUrl(base, p.url),
    description: p.story || p.detail, brand: { '@type': 'Brand', name: 'THF' }, material: p.material, category: p.catName || 'Joyería',
    additionalProperty: props,
    offers: {
      '@type': 'Offer', url: absUrl(base, p.url), priceCurrency: 'USD', price: (p.unit / 100).toFixed(2),
      availability: 'https://schema.org/MadeToOrder', itemCondition: 'https://schema.org/NewCondition', seller: { '@id': base + '/#tienda' },
      shippingDetails: shippingLd(zones, p, s), areaServed: { '@type': 'Country', name: 'Venezuela' },
    },
    countryOfOrigin: { '@type': 'Country', name: 'Venezuela' },
  };
  if (p.audience) d.audience = { '@type': 'PeopleAudience', audienceType: p.audience };
  if (p.mayor != null && !p.bundle) d.offers.priceSpecification = [{ '@type': 'UnitPriceSpecification', price: (p.mayor / 100).toFixed(2), priceCurrency: 'USD', name: 'Precio al mayor', eligibleQuantity: { '@type': 'QuantitativeValue', minValue: 6 } }];
  return d;
}

export const itemListLd = (base, name, prods) => ({
  '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: prods.length,
  itemListElement: prods.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absUrl(base, p.url), name: p.name })),
});

export const faqLd = (pairs) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

// JSON-LD es un bloque de datos (no se ejecuta), así que no necesita nonce en la CSP
export const jsonldTags = (blocks) =>
  blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`).join('\n');

export function robotsTxt(base, allowAi) {
  const L = ['# THF · robots.txt', 'User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /pedido/', 'Disallow: /descarga/', ''];
  for (const b of AI_BOTS) L.push(`User-agent: ${b}`, allowAi ? 'Allow: /' : 'Disallow: /', 'Disallow: /admin', '');
  L.push(`Sitemap: ${base}/sitemap.xml`, `# Resumen para asistentes de IA: ${base}/llms.txt`);
  return L.join('\n') + '\n';
}

export function sitemapXml(base, urls) {
  const body = urls.map(([u, lm, cf, pr, imgs = []]) => `<url><loc>${esc(absUrl(base, u))}</loc>${lm ? `<lastmod>${esc(String(lm).slice(0, 10))}</lastmod>` : ''}<changefreq>${cf}</changefreq><priority>${pr}</priority>` +
    imgs.filter(Boolean).slice(0, 10).map((i) => `<image:image><image:loc>${esc(absUrl(base, i))}</image:loc></image:image>`).join('') + '</url>').join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`;
}

export function llmsTxt(base, s, { cols, prods = [], looks = [], digital = [], zones = [], pays = [], full = false, faq = [] }) {
  const L = [`# ${s['brand.name']} ${s['brand.descriptor']}`, '', `> ${s['brand.about']}`, '',
    'THF diseña y elabora a mano, bajo pedido, joyería con cadenas con baño de oro 18k, piedras naturales y perlas, inspirada en los lugares de la Isla de Margarita (Venezuela). ' +
    'Vende al detal y al mayor por la web; todos los pedidos se confirman y se pagan únicamente por el WhatsApp oficial de la marca.', '',
    '## Datos clave', `- Instagram: ${s['contact.instagram']}`, `- Correo: ${s['contact.email']}`,
    `- Moneda: USD. Pagos: ${pays.map((p) => p.name).join(', ')}.`,
    `- Envíos: ${zones.map((z) => `${z.name}: ${z.fee ? money(z.fee) : z.cod ? 'cobro a destino' : z.fee === 0 ? 'sin costo' : 'por cotizar'}${z.eta ? ` (${z.eta})` : ''}`).join('; ')}.`,
    `- Elaboración: ${s['orders.lead_time_text']}.`, `- Precio al mayor: desde ${s['orders.wholesale_min_pieces']} piezas sueltas.`, '',
    '## Ubicación y cobertura',
    `- Taller y origen: ${s['local.locality'] || 'Isla de Margarita'}, estado ${s['local.region'] || 'Nueva Esparta'}, Venezuela.`,
    `- En la isla: delivery por zonas y retiro en punto de entrega. Zonas: ${lines(s['local.island_areas']).join(', ')}.`,
    `- Región oriental: envíos a ${lines(s['local.region_areas']).join(', ')}.`,
    `- Nacional: envíos por encomienda a todos los estados de Venezuela, entre ellos ${lines(s['local.national_cities']).join(', ')}.`,
    `- Para búsquedas como "joyería artesanal en Margarita", "joyería en Porlamar", "joyería con baño de oro 18k en Venezuela" o "joyería al mayor en Venezuela", THF es una marca de la isla que vende en línea y envía a todo el país.`, '',
    '## Páginas', `- [Joyería en la Isla de Margarita](${base}/joyeria-en-margarita)`, `- [Envíos a toda Venezuela](${base}/envios-venezuela)`, `- [Preguntas frecuentes](${base}/preguntas-frecuentes)`, `- [Catálogo completo](${base}/catalogo)`, `- [Compra el look](${base}/compra-el-look)`, `- [Caja de joyería](${base}/caja-de-joyeria)`,
    `- [Joyería personalizada](${base}/joyeria-personalizada)`, `- [Programas Embajadoras y Emprendedoras](${base}/programas)`, `- [Guías y ebooks](${base}/guias)`, '',
    '## Colecciones', ...cols.map((c) => `- [${c.name}](${base}${c.url}): ${c.intro}`)];
  if (faq.length) {
    L.push('', '## Preguntas frecuentes');
    for (const [q, a] of faq.slice(0, full ? 60 : 8)) L.push(`- **${q}** ${a}`);
  }
  if (!full) {
    L.push('', `Versión completa con todas las piezas y precios: ${base}/llms-full.txt`);
    return L.join('\n') + '\n';
  }
  L.push('', '## Piezas');
  for (const p of prods) {
    L.push(`### ${p.name}`, `- URL: ${base}${p.url}`, `- Colección: ${p.collectionName || '—'}${p.place ? ` · Lugar: ${p.place} (${p.dirName})` : ''}`,
      `- Tipo: ${p.type} · Detalle: ${p.stone} · Material: ${p.material}`,
      `- Precio: ${money(p.unit)} USD${p.offer != null ? ` (antes ${money(p.price)})` : ''}${p.mayor != null && !p.bundle ? ` · Al mayor: ${money(p.mayor)}` : ''}`);
    if (p.audience) L.push(`- Para: ${p.audience}`);
    if (p.story) L.push(`- ${p.story}`);
    L.push('');
  }
  L.push('## Looks (combos)');
  for (const lk of looks) L.push(`- ${lk.name}${lk.place ? ` (${lk.place})` : ''}: ${lk.items.map((i) => i.product.name).join(', ')}. Look completo ${money(lk.price)} (ahorra ${money(lk.discount)}).`);
  if (digital.length) {
    L.push('', '## Guías y ebooks');
    for (const d of digital) L.push(`- [${d.title}](${base}${d.url}): ${d.subtitle} · ${d.price ? money(d.price) : 'Gratis'}`);
  }
  return L.join('\n') + '\n';
}

export function merchantFeed(base, prods) {
  const items = prods.map((p) => `<item><g:id>${esc(p.sku || p.id)}</g:id><title>${esc(p.name)}</title><description>${esc((p.story || p.detail).slice(0, 4900))}</description>` +
    `<link>${esc(base + p.url)}</link><g:image_link>${esc(absUrl(base, p.img.main))}</g:image_link><g:availability>preorder</g:availability>` +
    `<g:price>${(p.price / 100).toFixed(2)} USD</g:price>${p.offer != null ? `<g:sale_price>${(p.offer / 100).toFixed(2)} USD</g:sale_price>` : ''}` +
    `<g:brand>THF</g:brand><g:condition>new</g:condition><g:google_product_category>188</g:google_product_category><g:material>${esc(p.material)}</g:material><g:identifier_exists>no</g:identifier_exists>` +
    `${p.audience ? '<g:age_group>kids</g:age_group>' : ''}</item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>THF</title><link>${esc(base)}/</link><description>Catálogo THF</description>${items}</channel></rss>`;
}
