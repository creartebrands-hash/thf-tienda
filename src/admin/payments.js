// Pagos por verificar: la cola de comprobantes que reportan las clientas ("Ya pagué"), con su captura privada.
import { html } from '../lib/html.js';
import { serveFile } from '../lib/storage.js';
import { HttpError } from '../http.js';
import { payCard } from './orders.js';
import { empty, layout } from './ui.js';

export async function queue(c) {
  const tab = c.url.searchParams.get('ver') === 'revisados' ? 'revisados' : 'pendientes';
  const rows = await c.db.all(`SELECT p.*, u.name rname, o.code, o.id oid, o.total_cents, o.customer_name, o.status ostatus, m.name method_name FROM payments p JOIN orders o ON o.id=p.order_id LEFT JOIN payment_methods m ON m.code=p.method_code LEFT JOIN users u ON u.id=p.reviewed_by
    WHERE ${tab === 'pendientes' ? "p.status='reportado'" : "p.status<>'reportado'"} ORDER BY p.id ${tab === 'pendientes' ? 'ASC' : 'DESC'} LIMIT 100`);
  const body = html`<p class="intro">Cada vez que una clienta toca "Ya pagué" su comprobante llega aquí. Revisa en tu banco que el dinero llegó y verifícalo: el pedido pasa a pagado y te mostramos el aviso para la clienta. Si conectas la verificación automática (Ajustes → Pagos), los pagos confirmados por el banco se aprueban solos.</p>
<nav class="tabs"><a href="/admin/pagos-recibidos"${tab === 'pendientes' ? html` aria-current="page"` : ''}>Por verificar</a><a href="?ver=revisados"${tab === 'revisados' ? html` aria-current="page"` : ''}>Revisados</a></nav>
${rows.length ? rows.map((p) => html`<section class="card"><h2><a href="/admin/pedidos/${p.oid}">${p.code}</a> · ${p.customer_name}</h2>${payCard(c, { id: p.oid, total_cents: p.total_cents }, p, tab === 'pendientes')}</section>`)
    : empty(tab === 'pendientes' ? 'No hay pagos por verificar.' : 'Todavía no hay pagos revisados.')}`;
  return layout(c, { title: 'Pagos por verificar', active: 'payq', body });
}

// La captura solo se ve con sesión del panel; nunca tiene dirección pública
export async function proof(c, id) {
  const p = await c.db.first('SELECT proof_path FROM payments WHERE id=?', [id]);
  if (!p || !p.proof_path || !p.proof_path.startsWith('p/comprobantes/')) throw new HttpError(404);
  const res = await serveFile(c.env, c.db, p.proof_path, c.req, { cache: 'private, no-store' });
  if (!res) throw new HttpError(404);
  res.headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  return res;
}
