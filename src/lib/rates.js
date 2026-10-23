// Tasa del BCV: el precio real es en USD; los bolívares solo se muestran con una tasa vigente (regla de oro 10).
// Modo "manual": la escribe la dueña en el panel. Modo "auto": se consulta sola (DolarAPI, tasa oficial del BCV) y
// la dueña puede fijarla a mano cuando quiera. Siempre queda historial en exchange_rates.
import { nowIso } from './db.js';

const SOURCE_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
let lastTry = 0;

export async function latestRate(db) {
  return db.first('SELECT * FROM exchange_rates ORDER BY id DESC LIMIT 1');
}

// Tasa usable ahora (o null si no hay o está vencida)
export async function currentRate(db) {
  const r = await latestRate(db);
  if (!r) return null;
  const maxH = Number(await db.setting('payments.rate_max_age_hours', 30)) || 30;
  if (Date.now() - Date.parse(r.set_at) > maxH * 3600e3) return null;
  return { milli: r.bs_per_usd_milli, at: r.set_at, source: r.source };
}

// Bs (céntimos) = USD (centavos) × tasa
export const toBs = (usdCents, milli) => Math.round((usdCents * milli) / 1000);
export const fromBs = (bsCents, milli) => Math.round((bsCents * 1000) / milli);

export function bs(cents) {
  const c = Math.round(Number(cents) || 0);
  return `Bs. ${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(c % 100).padStart(2, '0')}`;
}
export const rateText = (milli) => (milli / 1000).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export async function fetchOfficialRate(fetchImpl = fetch) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
  try {
    const r = await fetchImpl(SOURCE_URL, { headers: { Accept: 'application/json' }, signal: ctl?.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const v = Number(j?.promedio);
    if (!Number.isFinite(v) || v <= 0 || v > 1e7) return null;
    return { milli: Math.round(v * 1000), at: j.fechaActualizacion || nowIso() };
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

// En modo automático, actualiza si la última tasa tiene más de 6 horas. Un salto mayor al 25 % no se guarda solo:
// queda para que la dueña lo confirme en el panel (protege contra una fuente caída o alterada).
export async function refreshRateIfStale(db, { force = false } = {}) {
  if ((await db.setting('payments.rate_mode', 'manual')) !== 'auto' && !force) return null;
  const last = await latestRate(db);
  if (!force && last && Date.now() - Date.parse(last.set_at) < 6 * 3600e3) return null;
  if (!force && Date.now() - lastTry < 10 * 60e3) return null;
  lastTry = Date.now();
  const got = await fetchOfficialRate();
  if (!got) return { error: 'No se pudo consultar la tasa oficial. Escríbela a mano en el panel.' };
  if (last && Math.abs(got.milli - last.bs_per_usd_milli) / last.bs_per_usd_milli > 0.25) return { error: `La tasa consultada (${rateText(got.milli)}) cambia más de 25 %. Confírmala a mano.`, milli: got.milli };
  if (last && last.bs_per_usd_milli === got.milli && last.source === 'BCV-auto') {
    await db.run('UPDATE exchange_rates SET set_at=? WHERE id=?', [nowIso(), last.id]);
    return { milli: got.milli, same: true };
  }
  await db.run("INSERT INTO exchange_rates(source,bs_per_usd_milli,set_at) VALUES ('BCV-auto',?,?)", [got.milli, nowIso()]);
  return { milli: got.milli };
}
