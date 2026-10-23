// Temporadas y ofertas (Navidad, Black Friday…): se ven solo si están encendidas Y dentro de sus fechas.
// El descuento lo aplica el servidor en el precio de cada pieza; nunca se acumula con la oferta propia: gana el menor precio.
const pct = (c, bps) => Math.floor((Math.abs(c) * bps + 5000) / 10000); // igual que pricing.pct para montos positivos

export async function activeCampaigns(db, at = Date.now()) {
  const rows = await db.all('SELECT * FROM campaigns WHERE active=1 ORDER BY sort, id');
  return rows.filter((c) => Date.parse(c.starts_at) <= at && at < Date.parse(c.ends_at)).map(parseCampaign);
}

export function parseCampaign(c) {
  let ids = [];
  try { ids = JSON.parse(c.product_ids || '[]').map(Number).filter(Number.isInteger); } catch {}
  return { ...c, productIds: new Set(ids) };
}

export function campaignApplies(c, p) {
  if (!c.discount_bps || c.scope === 'ninguno' || p.is_bundle) return false;
  if (c.scope === 'todo') return true;
  if (c.scope === 'coleccion') return c.collection_id != null && p.collection_id === c.collection_id;
  if (c.scope === 'piezas') return c.productIds.has(p.id);
  return false;
}

// Mejor precio de temporada para una pieza (o null si ninguna aplica)
export function campaignPrice(p, camps = []) {
  let best = null;
  for (const c of camps) {
    if (!campaignApplies(c, p)) continue;
    const v = p.price_cents - pct(p.price_cents, c.discount_bps);
    if (best == null || v < best.price) best = { price: v, campaign: c };
  }
  return best;
}

export function publicCampaign(c) {
  return { slug: c.slug, name: c.name, kind: c.kind, title: c.banner_title || c.name, text: c.banner_text, cta: c.banner_cta, theme: c.theme,
    endsAt: c.ends_at, countdown: !!c.show_countdown, discountPct: Math.round(c.discount_bps / 100), coupon: c.coupon_code || '', url: `/temporada/${c.slug}` };
}
