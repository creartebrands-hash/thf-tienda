// Programas: comisiones de embajadoras y ganancias de aliadas. Solo THF cobra a la clienta; a la afiliada se le
// reconoce su parte en un libro de movimientos que no se edita ni se borra (las correcciones son movimientos nuevos).
import { nowIso } from './db.js';
import { pct } from './pricing.js';

// Regla de comisión vigente para una afiliada (la suya o la global)
export function commissionRule(partner, S) {
  const own = partner.commission_mode && partner.commission_mode !== 'global';
  const mode = own ? partner.commission_mode : S['programs.a.commission_mode'] || 'pct';
  const bps = own ? partner.commission_bps ?? 0 : Math.round(Number(S['programs.a.commission_pct'] || 0) * 100);
  const fixed = own ? partner.commission_fixed_cents ?? 0 : Number(S['programs.a.commission_fixed_cents'] || 0);
  const per = own ? partner.fixed_per : S['programs.a.fixed_per'] || 'pedido';
  return { mode, bps: mode === 'monto' ? 0 : bps, fixed: mode === 'pct' ? 0 : fixed, per, own };
}

// Monto que le corresponde a la afiliada por un pedido (con la instantánea de sus líneas)
export function partnerAmount(o, lines, partner, S) {
  const goods = lines.filter((l) => l.kind !== 'digital');
  const storeLines = goods.filter((l) => (JSON.parse(l.snapshot || '{}').store ?? null) === partner.id);
  if (partner.kind === 'emprendedora' && storeLines.length) {
    // Ganancia = su precio de venta − el costo de aliada de cada pieza
    let total = 0;
    const detail = [];
    for (const l of storeLines) {
      const s = JSON.parse(l.snapshot || '{}');
      const cost = s.cost ?? null;
      const g = cost == null ? 0 : Math.max(0, (l.unit_cents - cost) * l.qty);
      total += g;
      detail.push({ line: l.id, unit: l.unit_cents, cost, qty: l.qty, gain: g });
    }
    return { kind: 'ganancia', amount: total, rule: { type: 'ganancia', detail } };
  }
  const rule = commissionRule(partner, S);
  // Pedidos al mayor: por defecto no generan comisión (interruptor en Ajustes → Programas)
  if (o.kind === 'mayor' && !S['programs.a.commission_on_wholesale']) return { kind: 'comision', amount: 0, rule: { type: 'comision', ...rule, wholesale: true } };
  const base = Math.max(0, goods.reduce((a, l) => a + l.total_cents, 0) - (o.discount_cents || 0));
  const pieces = goods.reduce((a, l) => a + l.qty, 0);
  const amount = pct(base, rule.bps) + rule.fixed * (rule.per === 'pieza' ? pieces : 1);
  return { kind: 'comision', amount, rule: { type: 'comision', ...rule, base, pieces } };
}

export async function creditOnPaid(db, o, userId = null) {
  if (!o.partner_id) return null;
  const partner = await db.first('SELECT * FROM partners WHERE id=?', [o.partner_id]);
  if (!partner) return null;
  const lines = await db.all('SELECT * FROM order_lines WHERE order_id=?', [o.id]);
  const S = await db.settings();
  const r = partnerAmount(o, lines, partner, S);
  if (!r.amount) return null;
  try {
    await db.run('INSERT INTO ledger_entries(partner_id,order_id,kind,amount_cents,rule,note,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [partner.id, o.id, r.kind, r.amount, JSON.stringify(r.rule), `Pedido ${o.code}`, userId, nowIso()]);
  } catch (e) {
    if (!/UNIQUE/i.test(String(e?.message))) throw e; // ya estaba acreditado
  }
  return r;
}

export async function reverseOnCancel(db, o, userId = null, reason = '') {
  if (!o.partner_id) return null;
  const sum = await db.n("SELECT COALESCE(SUM(amount_cents),0) n FROM ledger_entries WHERE order_id=? AND partner_id=? AND kind IN ('comision','ganancia')", [o.id, o.partner_id]);
  if (!sum) return null;
  try {
    await db.run("INSERT INTO ledger_entries(partner_id,order_id,kind,amount_cents,note,user_id,created_at) VALUES (?,?,'reversa',?,?,?,?)",
      [o.partner_id, o.id, -sum, `Reversa del pedido ${o.code}${reason ? ': ' + reason : ''}`, userId, nowIso()]);
  } catch (e) {
    if (!/UNIQUE/i.test(String(e?.message))) throw e;
  }
  return -sum;
}

// Saldo: total, disponible (pasados los días de espera) y pagado
export async function balance(db, partnerId) {
  const S = await db.settings();
  const hold = Number(S['programs.hold_days'] || 0);
  const cut = new Date(Date.now() - hold * 86400e3).toISOString();
  const [total, held, paid] = await Promise.all([
    db.n('SELECT COALESCE(SUM(amount_cents),0) n FROM ledger_entries WHERE partner_id=?', [partnerId]),
    db.n("SELECT COALESCE(SUM(amount_cents),0) n FROM ledger_entries WHERE partner_id=? AND kind IN ('comision','ganancia') AND created_at>?", [partnerId, cut]),
    db.n("SELECT COALESCE(-SUM(amount_cents),0) n FROM ledger_entries WHERE partner_id=? AND kind='pago'", [partnerId]),
  ]);
  return { total, available: total - held, held, paid };
}

export const partnerLink = (base, p) => `${base}/a/${p.code}`;
export const storeLink = (base, p) => (p.slug ? `${base}/e/${p.slug}` : '');
