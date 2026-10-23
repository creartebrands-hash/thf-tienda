// Datos de cada método de pago que la clienta ve en la pantalla de pago de su pedido (con botones para copiar).
import { html } from '../lib/html.js';
import { audit } from '../lib/security.js';
import { HttpError, readForm, redirect } from '../http.js';
import { DETAIL_LABELS, KIND_FIELDS } from '../views/shop.js';
import { afterWrite, needReauth } from './common.js';
import { csrf } from './ui.js';

const HELP = { banco: 'Ej.: 0134 Banesco', telefono: 'Ej.: 0414 123 4567', documento: 'Ej.: J-50123456-7 o V-12.345.678', titular: 'Como aparece en el banco', cuenta: '20 dígitos', correo: 'Correo de la cuenta', pay_id: 'Binance Pay ID', usuario: 'Usuario de Binance' };

export async function detailsBox(c, id) {
  const m = await c.db.first('SELECT kind, details FROM payment_methods WHERE id=?', [id]);
  if (!m) return '';
  const keys = KIND_FIELDS[m.kind] || [];
  if (!keys.length) return html`<section class="card"><h2>Datos para la clienta</h2><p class="help">Este tipo de método no necesita datos de cuenta${m.kind === 'otro' ? ': elige el tipo y guarda para ver sus campos' : ''}.</p></section>`;
  let d = {};
  try { d = JSON.parse(m.details || '{}'); } catch {}
  return html`<form method="post" action="/admin/pagos/${id}/datos" class="card form">${csrf(c)}<h2>Datos que ve la clienta al pagar</h2>
<p class="help">Aparecen solo en la pantalla de pago de cada pedido, con un botón para copiar cada dato y otro para copiarlos todos juntos; la clienta ve solo los del método que elige. Nunca en las páginas públicas.</p>
<div class="grid">${keys.map((k) => html`<div class="fld"><label for="d_${k}">${DETAIL_LABELS[k]}</label><input id="d_${k}" name="d_${k}" value="${d[k] || ''}" maxlength="80"><small class="help">${HELP[k] || ''}</small></div>`)}</div>
<div class="bar"><button class="btn">Guardar datos</button></div></form>`;
}

export async function saveDetails(c, id) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const r = needReauth(c);
  if (r) return r;
  const m = await c.db.first('SELECT kind FROM payment_methods WHERE id=?', [id]);
  if (!m) throw new HttpError(404);
  const f = await readForm(c.req);
  const out = {};
  for (const k of KIND_FIELDS[m.kind] || []) out[k] = String(f[`d_${k}`] || '').replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 80);
  await c.db.run('UPDATE payment_methods SET details=? WHERE id=?', [JSON.stringify(out), id]);
  await audit(c.db, c, 'datos_pago', 'payment_methods', id, { keys: Object.keys(out) });
  await afterWrite(c);
  return redirect(`/admin/pagos/${id}?msg=${encodeURIComponent('Datos guardados.')}`, 303);
}
