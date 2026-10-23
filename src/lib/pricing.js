// Motor de precios del servidor: el cliente nunca decide un precio. Dinero en centavos (enteros).
// Orden: precio de la pieza (oferta o temporada, gana el menor) → precio al mayor si aplica → tienda de aliada →
// descuento (cupón o código de embajadora, nunca los dos) → envío → recargo o descuento del método de pago.
import { activeCampaigns, campaignPrice } from './campaigns.js';
import { couponCode } from './validate.js';
import { readColors } from './variants.js';

export const MAX_QTY = 99;
export const MAX_LINES = 60;

// cents × bps / 10000 con redondeo mitad hacia arriba (simétrico para negativos)
export function pct(cents, bps) {
  const r = Math.floor((Math.abs(cents) * Math.abs(bps) + 5000) / 10000);
  return (cents >= 0) === (bps >= 0) ? r : -r;
}

export function money(cents) {
  const sign = cents < 0 ? '-' : '';
  const c = Math.abs(Math.round(Number(cents) || 0));
  const ent = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}$${ent},${String(c % 100).padStart(2, '0')}`;
}

// Precio detal vigente: oferta propia o precio de temporada, el que sea menor
export const unitRetail = (p, camps = []) => {
  const base = p.offer_cents != null ? p.offer_cents : p.price_cents;
  const cp = campaignPrice(p, camps);
  return cp && cp.price < base ? cp.price : base;
};

export class QuoteError extends Error {}

export async function lookPrice(db, lookId, camps = []) {
  const lk = await db.first('SELECT * FROM looks WHERE id=? AND active=1', [lookId]);
  if (!lk) return null;
  const items = await db.all(`SELECT li.qty AS look_qty, p.* FROM look_items li JOIN products p ON p.id=li.product_id
                              WHERE li.look_id=? AND p.status='published' ORDER BY li.sort`, [lookId]);
  if (items.length < 2) return null;
  const full = items.reduce((a, i) => a + unitRetail(i, camps) * i.look_qty, 0);
  const discount = pct(full, lk.discount_bps);
  return { full, discount, price: full - discount, items, look: lk };
}

// Afiliada activa por código o por tienda (/e/slug). Nunca se devuelve nada privado al navegador.
export async function findPartner(db, { code = '', store = '' } = {}) {
  if (store && /^[a-z0-9-]{2,40}$/.test(store)) {
    const p = await db.first("SELECT * FROM partners WHERE slug=? AND kind='emprendedora' AND status='activa'", [store]);
    if (p) return { partner: p, source: 'tienda' };
  }
  const c = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (c.length >= 3) {
    const p = await db.first("SELECT * FROM partners WHERE code=? AND status='activa'", [c]);
    if (p) return { partner: p, source: 'codigo' };
  }
  return null;
}

// Cupón: validación sin datos de la clienta (la parte personal se revisa al crear el pedido, con su identidad)
export async function couponCheck(db, code, { subtotal, mayor, lines, customerId = null }) {
  const c = await db.first('SELECT * FROM coupons WHERE code=?', [code]);
  const now = Date.now();
  if (!c || !c.active) return { error: 'Ese cupón no existe o ya no está activo.' };
  if (c.starts_at && Date.parse(c.starts_at) > now) return { error: 'Ese cupón todavía no está activo.' };
  if (c.ends_at && Date.parse(c.ends_at) <= now) return { error: 'Ese cupón ya venció.' };
  if (c.campaign_id) {
    const camp = await db.first('SELECT active, starts_at, ends_at FROM campaigns WHERE id=?', [c.campaign_id]);
    if (!camp || !camp.active || Date.parse(camp.starts_at) > now || Date.parse(camp.ends_at) <= now) return { error: 'Ese cupón es de una temporada que no está activa.' };
  }
  if (c.max_uses != null && c.uses >= c.max_uses) return { error: 'Ese cupón ya se agotó.' };
  if (c.retail_only && mayor) return { error: 'Los cupones no aplican a pedidos al mayor.' };
  if (c.customer_id && c.customer_id !== customerId) return { error: 'Ese cupón es personal: inicia sesión con la cuenta a la que pertenece.', needsLogin: !customerId };
  const eligible = lines.filter((l) => l.kind !== 'digital' && (!c.collection_id || l.collectionId === c.collection_id)).reduce((a, l) => a + l.total, 0);
  if (!eligible) return { error: c.collection_id ? 'Ese cupón es para otra colección.' : 'Ese cupón no aplica a este pedido.' };
  if (c.min_subtotal_cents != null && subtotal < c.min_subtotal_cents) return { error: `Ese cupón aplica desde ${money(c.min_subtotal_cents)}.` };
  let discount = 0, freeShipping = false;
  if (c.kind === 'pct') discount = pct(eligible, c.value);
  else if (c.kind === 'monto') discount = Math.min(c.value, eligible);
  else freeShipping = true;
  if (c.max_discount_cents != null) discount = Math.min(discount, c.max_discount_cents);
  return { coupon: c, discount, freeShipping };
}

export async function quote(db, cart, { customerId = null } = {}) {
  const linesIn = Array.isArray(cart?.lines) ? cart.lines : [];
  if (!linesIn.length) throw new QuoteError('Tu pedido está vacío.');
  if (linesIn.length > MAX_LINES) throw new QuoteError('Demasiadas líneas en el pedido.');
  const S = await db.settings();
  const wholesaleMin = Number(S['orders.wholesale_min_pieces'] ?? 6);
  const camps = await activeCampaigns(db);
  const ref = await findPartner(db, { code: cart.code, store: cart.store });
  const storeP = ref?.source === 'tienda' ? ref.partner : null;
  const storePrices = storeP ? new Map((await db.all('SELECT product_id, price_cents FROM partner_prices WHERE partner_id=? AND visible=1', [storeP.id])).map((r) => [r.product_id, r.price_cents])) : null;
  const norm = linesIn.map((raw) => {
    const kind = String(raw?.kind || 'product');
    const id = Number.parseInt(raw?.id, 10);
    const qty = Number.parseInt(raw?.qty ?? 1, 10);
    if (!Number.isInteger(id) || !Number.isInteger(qty)) throw new QuoteError('Línea de pedido inválida.');
    if (qty < 1 || qty > MAX_QTY) throw new QuoteError('Cantidad inválida.');
    return { kind, id, qty, variant: String(raw?.variant || '').slice(0, 40), color: String(raw?.color || '').trim().slice(0, 30) };
  });
  const prodCache = new Map();
  const getP = async (id) => {
    if (!prodCache.has(id)) prodCache.set(id, await db.first("SELECT * FROM products WHERE id=? AND status='published'", [id]));
    return prodCache.get(id);
  };
  let loose = 0;
  for (const l of norm) if (l.kind === 'product') { const p = await getP(l.id); if (p && !p.is_bundle) loose += l.qty; }
  // En la tienda de una aliada no hay precio al mayor: ella fija su precio de venta
  const mayor = !storeP && loose >= wholesaleMin;
  const out = [];
  let physical = false;
  const usedCamps = new Set();
  for (const l of norm) {
    if (l.kind === 'product') {
      const p = await getP(l.id);
      if (!p) throw new QuoteError('Una pieza de tu pedido ya no está disponible.');
      physical = true;
      const variants = JSON.parse(p.variants || '[]');
      let variant = l.variant;
      if (p.is_bundle || !variants.length) variant = p.is_bundle ? 'Caja' : '';
      else if (!variants.includes(variant)) variant = variants[0];
      // Variante visual (color de la piedra…): debe ser una opción disponible de esta pieza
      const colors = p.is_bundle ? null : readColors(p.colors);
      let color = '';
      if (colors) {
        const on = colors.items.filter((x) => x.on);
        const hit = l.color ? on.find((x) => x.name.toLowerCase() === l.color.toLowerCase()) : on[0];
        if (l.color && !hit) throw new QuoteError(`${p.name}: la opción "${l.color}" ya no está disponible. Elige otra.`);
        color = hit ? hit.name : '';
      }
      const label = [color, variant].filter(Boolean).join(' · ');
      const retail = unitRetail(p, camps);
      const cp = campaignPrice(p, camps);
      let unit, kind;
      if (p.is_bundle) [unit, kind] = [retail, 'caja'];
      else if (storePrices && storePrices.has(p.id)) [unit, kind] = [clampStore(storePrices.get(p.id), p), 'tienda'];
      else if (mayor && p.wholesale_cents != null) [unit, kind] = [Math.min(p.wholesale_cents, retail), 'mayor'];
      else [unit, kind] = [retail, 'detal'];
      const campaign = kind === 'detal' && cp && cp.price === retail ? cp.campaign : null;
      if (campaign) usedCamps.add(campaign.id);
      out.push({ kind: 'product', id: p.id, slug: p.slug, name: p.name, sku: p.sku, variant: label, color, size: variant, qty: l.qty, unit, total: unit * l.qty, priceKind: kind, collectionId: p.collection_id,
        snapshot: { color: color || undefined, size: variant || undefined, price: p.price_cents, offer: p.offer_cents, wholesale: p.wholesale_cents, cost: p.cost_cents, prodCost: p.prod_cost_cents, mayor, wholesaleMin,
          campaign: campaign ? { id: campaign.id, slug: campaign.slug, bps: campaign.discount_bps } : null, store: storeP ? storeP.id : null } });
    } else if (l.kind === 'look') {
      const lp = await lookPrice(db, l.id, camps);
      if (!lp) throw new QuoteError('Ese look ya no está disponible.');
      physical = true;
      out.push({ kind: 'look', id: l.id, slug: lp.look.slug, name: `Look ${lp.look.name}`, sku: `LOOK-${l.id}`, variant: 'Look completo', qty: l.qty,
        unit: lp.price, total: lp.price * l.qty, priceKind: 'look', collectionId: lp.look.collection_id,
        snapshot: { full: lp.full, discount: lp.discount, discountBps: lp.look.discount_bps,
          items: lp.items.map((i) => ({ id: i.id, name: i.name, qty: i.look_qty, unit: unitRetail(i, camps), cost: i.cost_cents, prodCost: i.prod_cost_cents })) } });
    } else if (l.kind === 'digital') {
      const d = await db.first("SELECT * FROM digital_products WHERE id=? AND status='published' AND file_path IS NOT NULL", [l.id]);
      if (!d) throw new QuoteError('Esa guía ya no está disponible.');
      out.push({ kind: 'digital', id: d.id, slug: d.slug, name: d.title, sku: `DIG-${d.id}`, variant: d.format, qty: 1, unit: d.price_cents,
        total: d.price_cents, priceKind: 'digital', collectionId: null, snapshot: { price: d.price_cents } });
    } else throw new QuoteError('Tipo de línea inválido.');
  }
  const subtotal = out.reduce((a, l) => a + l.total, 0);

  // Descuento: cupón o descuento del código de embajadora (uno solo; el cupón tiene prioridad)
  let discount = 0, discountLabel = '', couponInfo = null, freeShipping = false;
  const code = couponCode(cart.coupon);
  if (code) {
    const ck = await couponCheck(db, code, { subtotal, mayor, lines: out, customerId });
    if (ck.error) couponInfo = { code, ok: false, error: ck.error, needsLogin: !!ck.needsLogin };
    else {
      discount = ck.discount; freeShipping = ck.freeShipping;
      discountLabel = `Cupón ${code}`;
      couponInfo = { code, ok: true, id: ck.coupon.id, description: ck.coupon.description, personal: !!ck.coupon.customer_id };
    }
  }
  const refBps = ref && ref.source === 'codigo' && !mayor ? (ref.partner.client_discount_bps ?? Number(S['programs.a.client_discount_bps'] || 0)) : 0;
  if (!discount && !freeShipping && refBps > 0) {
    discount = pct(out.filter((l) => l.kind !== 'digital').reduce((a, l) => a + l.total, 0), refBps);
    discountLabel = `Código ${ref.partner.code}`;
  }
  discount = Math.min(discount, subtotal);

  let zone = await db.first('SELECT * FROM shipping_zones WHERE code=? AND active=1', [String(cart.zone || '')]);
  if (!zone) zone = await db.first('SELECT * FROM shipping_zones WHERE active=1 ORDER BY sort LIMIT 1');
  let ship = 0, shipLabel = '', freeLeft = null;
  const base = subtotal - discount;
  if (!physical) shipLabel = 'Entrega digital';
  else if (zone.fee_cents == null) shipLabel = zone.allows_cod ? 'A cobrar en destino' : 'Por cotizar por WhatsApp';
  else if (zone.fee_cents === 0) shipLabel = 'Sin costo';
  else if (freeShipping) shipLabel = 'Gratis con tu cupón';
  else if (zone.free_over_cents != null && !mayor && base >= zone.free_over_cents) shipLabel = 'Gratis';
  else {
    ship = zone.fee_cents;
    shipLabel = money(ship);
    if (zone.free_over_cents != null && !mayor) freeLeft = zone.free_over_cents - base;
  }
  let pm = await db.first('SELECT * FROM payment_methods WHERE code=? AND active=1', [String(cart.pay || '')]);
  if (!pm) pm = await db.first('SELECT * FROM payment_methods WHERE active=1 AND pickup_only=0 ORDER BY sort LIMIT 1');
  if (pm.island_only && physical && !['isla', 'retiro'].includes(zone.kind)) throw new QuoteError(`${pm.name} solo está disponible para entregas en la isla.`);
  if (pm.pickup_only && zone.kind !== 'retiro') throw new QuoteError(`${pm.name} solo está disponible si retiras tu pedido.`);
  const adj = pct(base + ship, pm.adj_bps);
  const kinds = new Set(out.map((l) => l.priceKind));
  return {
    lines: out, subtotal, discount, discountLabel, coupon: couponInfo, shipping: ship, shippingLabel: shipLabel, adj, total: base + ship + adj,
    mayor, loosePieces: loose, wholesaleMin, missingForWholesale: loose && !storeP ? Math.max(0, wholesaleMin - loose) : 0, freeLeft, physical,
    zone: { code: zone.code, name: zone.name, kind: zone.kind, eta: zone.eta },
    pay: { code: pm.code, name: pm.name, adjBps: pm.adj_bps, kind: pm.kind, currency: pm.currency },
    kind: mayor ? 'mayor' : kinds.size === 1 && kinds.has('digital') ? 'digital' : 'detal',
    campaignIds: [...usedCamps],
    ref: ref ? { code: ref.partner.code, source: ref.source, kind: ref.partner.kind, partnerId: ref.partner.id, store: storeP ? storeP.slug : '' } : null,
  };
}

// El precio de la aliada siempre queda dentro del rango permitido de la pieza
export function clampStore(price, p) {
  const min = p.min_cents ?? p.price_cents, max = p.max_cents ?? p.price_cents * 2;
  return Math.max(min, Math.min(max, price));
}

export function whatsappMessage(code, qt, c, attribution, elab, extra = {}) {
  const L = [`*Pedido ${code}*`, `Tipo: ${qt.mayor ? 'Al mayor' : 'Detal'}`, ''];
  for (const l of qt.lines) L.push(`• ${l.name} (${l.sku})${l.variant ? ' ' + l.variant : ''} × ${l.qty} · ${money(l.unit)} c/u = ${money(l.total)}`);
  L.push('', `Subtotal: ${money(qt.subtotal)}`);
  if (qt.discount) L.push(`${qt.discountLabel || 'Descuento'}: -${money(qt.discount)}`);
  L.push(`Envío (${qt.zone.name}): ${qt.shippingLabel}`);
  if (qt.adj) L.push(`${qt.adj > 0 ? 'Recargo' : 'Descuento'} ${qt.pay.name}: ${money(qt.adj)}`);
  L.push(`*Total: ${money(qt.total)} USD*`);
  if (extra.totalBs) L.push(`En bolívares: ${extra.totalBs} (tasa BCV ${extra.rate})`);
  L.push('');
  if (qt.physical) L.push(`Elaboración: ${elab}`);
  L.push(`Pago preferido: ${qt.pay.name}`, '', `Cliente: ${c.name}`, `Teléfono: ${c.phone}`);
  if (c.doc) L.push(`Cédula/RIF: ${c.doc}`);
  if (c.email) L.push(`Correo: ${c.email}`);
  if (c.address) L.push(`Dirección: ${[c.address, c.city, c.state].filter(Boolean).join(', ')}`);
  if (c.notes) L.push(`Notas: ${c.notes}`);
  L.push(`Referida por: ${attribution || 'nadie (venta directa)'}`);
  if (extra.link) L.push('', `Ver y pagar mi pedido: ${extra.link}`);
  return L.join('\n');
}
