// Estructura de costos por pieza (solo interno): materiales de proveedores + mano de obra + otros costos → costo de producción
// y precio sugerido con el factor de precio. Los costos unitarios se guardan en diezmilésimas de USD (mc) para no perder
// precisión en materiales baratos (una argolla de $0,005); los totales se redondean al centavo.
import { nowIso } from './db.js';

export const MC_PER_CENT = 100; // 1 USD = 10.000 mc = 100 centavos

// Costo por unidad de un material: precio del paquete ÷ unidades, más el recargo del proveedor (envío o importación)
export function unitCostMc(packCostCents, packQty, shippingBps = 0) {
  const q = Number(packQty) > 0 ? Number(packQty) : 1;
  return Math.round(((packCostCents * MC_PER_CENT) / q) * (1 + (shippingBps || 0) / 10000));
}

export const mcToCents = (mc) => Math.round(mc / MC_PER_CENT);

export function fmtMc(mc) {
  const v = mc / 10000;
  return `$${v.toLocaleString('es-VE', { minimumFractionDigits: v < 0.1 ? 3 : 2, maximumFractionDigits: v < 0.1 ? 4 : 2 })}`;
}

// Redondea hacia arriba al múltiplo indicado (p. ej. 10 centavos)
export const roundUp = (cents, step) => (step > 1 ? Math.ceil(cents / step) * step : cents);

export async function costBreakdown(db, productId) {
  const p = await db.first('SELECT id, name, slug, price_cents, offer_cents, wholesale_cents, cost_cents, labor_cents, extra_cost_cents, markup_bps, prod_cost_cents FROM products WHERE id=?', [productId]);
  if (!p) return null;
  const rows = await db.all(`SELECT b.id, b.qty, b.note, m.id material_id, m.name, m.unit, m.unit_cost_mc, m.category, s.name supplier
    FROM product_bom b JOIN materials m ON m.id=b.material_id LEFT JOIN suppliers s ON s.id=m.supplier_id WHERE b.product_id=? ORDER BY b.sort, b.id`, [productId]);
  const S = await db.settings();
  const lines = rows.map((r) => ({ ...r, total_mc: Math.round(r.qty * r.unit_cost_mc) }));
  const materialsMc = lines.reduce((a, l) => a + l.total_mc, 0);
  const materials = mcToCents(materialsMc);
  const labor = p.labor_cents ?? 0, extra = p.extra_cost_cents ?? 0;
  const total = materials + labor + extra;
  const markup = p.markup_bps ?? S['costs.markup_bps'] ?? 40000;
  const wmarkup = S['costs.wholesale_markup_bps'] ?? 25000;
  const step = Number(S['costs.round_cents'] ?? 10);
  const retail = p.offer_cents ?? p.price_cents;
  return {
    p, lines, materialsMc, materials, labor, extra, total,
    markup, suggested: roundUp(Math.round((total * markup) / 10000), step), suggestedWholesale: roundUp(Math.round((total * wmarkup) / 10000), step),
    marginRetail: retail ? retail - total : null, marginPct: retail ? Math.round(((retail - total) / retail) * 1000) / 10 : null,
    marginWholesale: p.wholesale_cents != null ? p.wholesale_cents - total : null,
  };
}

// Recalcula y guarda el costo de producción; deja una fila en el historial si cambió el costo o el precio
export async function recomputeProductCost(db, productId, userId = null, note = '') {
  const b = await costBreakdown(db, productId);
  if (!b) return null;
  const last = await db.first('SELECT prod_cost_cents, price_cents FROM product_cost_history WHERE product_id=? ORDER BY id DESC LIMIT 1', [productId]);
  const t = nowIso();
  await db.run('UPDATE products SET prod_cost_cents=?, cost_updated_at=? WHERE id=?', [b.lines.length || b.labor || b.extra ? b.total : null, t, productId]);
  const price = b.p.offer_cents ?? b.p.price_cents;
  if (!last || last.prod_cost_cents !== b.total || last.price_cents !== price) {
    await db.run('INSERT INTO product_cost_history(product_id,prod_cost_cents,price_cents,detail,user_id,created_at) VALUES (?,?,?,?,?,?)',
      [productId, b.total, price, JSON.stringify({ note, materials: b.materials, labor: b.labor, extra: b.extra, lines: b.lines.map((l) => [l.name, l.qty, l.unit_cost_mc]) }), userId, t]);
  }
  return b;
}

// Cuando cambia el costo de un material, se recalculan las piezas que lo usan
export async function recomputeByMaterial(db, materialId, userId = null) {
  const ps = await db.all('SELECT DISTINCT product_id FROM product_bom WHERE material_id=?', [materialId]);
  for (const r of ps) await recomputeProductCost(db, r.product_id, userId, 'Cambio de costo de material');
  return ps.length;
}
