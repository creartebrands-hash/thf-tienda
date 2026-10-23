// Clientas: una ficha por persona (cédula, teléfono y correo únicos), sus pedidos, cupones personales y acceso a su cuenta.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { newCustomerToken } from '../lib/accounts.js';
import { waTo } from '../lib/notify.js';
import { STATUS } from '../lib/orders.js';
import { money } from '../lib/pricing.js';
import { audit } from '../lib/security.js';
import { docText, phoneText } from '../lib/validate.js';
import { HttpError, readForm, redirect } from '../http.js';
import { badge, csrf, empty, fmt, layout } from './ui.js';

export async function list(c) {
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60);
  const args = [];
  let where = '';
  if (q) { where = 'WHERE (c.name LIKE ? OR c.email_key LIKE ? OR c.phone_key LIKE ? OR c.doc_key LIKE ?)'; const d = q.replace(/\D/g, ''); args.push(`%${q}%`, `%${q.toLowerCase()}%`, `%${d || q}%`, `%${d || q}%`); }
  const rows = await c.db.all(`SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) n,
    (SELECT COALESCE(SUM(total_cents),0) FROM orders o WHERE o.customer_id=c.id AND o.status IN ('pagado','en_produccion','listo','listo_retiro','enviado','entregado')) spent
    FROM customers c ${where} ORDER BY c.id DESC LIMIT 300`, args);
  const body = html`<p class="intro">Cada clienta tiene una sola ficha: su cédula, teléfono y correo no se repiten. Así los cupones personales y los descuentos de primera compra no se pueden usar dos veces ni pasar a otra persona.</p>
<form class="filters" method="get"><input type="search" name="q" value="${q}" placeholder="Nombre, correo, teléfono o cédula"><button class="btn ghost">Buscar</button></form>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Clienta</th><th>Cédula</th><th>Teléfono</th><th>Cuenta</th><th>Pedidos</th><th>Compras pagadas</th><th>Desde</th></tr></thead><tbody>
${rows.map((r) => html`<tr><td><a href="/admin/clientas/${r.id}">${r.name}</a>${r.status !== 'activa' ? html` ${badge('Bloqueada', 'bad')}` : ''}</td><td>${docText(r.doc_key)}</td><td>${phoneText(r.phone_key)}</td><td>${r.pw_hash ? badge('Con cuenta', 'ok') : badge('Sin cuenta', 'muted')}</td><td>${r.n}</td><td>${money(r.spent)}</td><td>${fmt.date(r.created_at)}</td></tr>`)}</tbody></table></div>`
    : empty('Todavía no hay clientas registradas. Aparecen al crear su primer pedido o su cuenta.')}`;
  return layout(c, { title: 'Clientas', active: 'customers', body });
}

export async function detail(c, id) {
  const { db } = c;
  const cu = await db.first('SELECT * FROM customers WHERE id=?', [id]);
  if (!cu) throw new HttpError(404);
  let shown = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (f._action === 'notes') {
      await db.run('UPDATE customers SET notes=?, updated_at=? WHERE id=?', [String(f.notes || '').slice(0, 2000), nowIso(), id]);
      return redirect(`/admin/clientas/${id}?msg=${encodeURIComponent('Notas guardadas.')}`, 303);
    }
    if (f._action === 'toggle') {
      const to = cu.status === 'activa' ? 'bloqueada' : 'activa';
      await db.batch([['UPDATE customers SET status=?, updated_at=? WHERE id=?', [to, nowIso(), id]], ['DELETE FROM customer_sessions WHERE customer_id=?', [id]]]);
      await audit(db, c, `clienta_${to}`, 'customers', id);
      return redirect(`/admin/clientas/${id}?msg=${encodeURIComponent(to === 'activa' ? 'Cuenta activada.' : 'Cuenta bloqueada.')}`, 303);
    }
    if (f._action === 'reset') {
      const tk = await newCustomerToken(db, id, 'reset', 24);
      const link = `${c.base}/cuenta/restablecer?t=${tk}`;
      await audit(db, c, 'clienta_enlace_clave', 'customers', id);
      shown = html`<section class="card notice"><h2>Enlace para crear contraseña</h2><p>Vence en 24 horas y sirve una sola vez. Envíaselo por WhatsApp:</p><pre class="msg">${link}</pre>
        <a class="btn sm wa" href="${waTo(cu.phone, `Hola, ${cu.name.split(' ')[0]}. Este es tu enlace para crear tu contraseña de la tienda (vence en 24 horas): ${link}`)}" target="_blank" rel="noopener">Enviar por WhatsApp ↗</a></section>`;
    }
  }
  const [orders, coupons] = await Promise.all([
    db.all('SELECT id, code, status, total_cents, created_at, coupon_code, attribution_code FROM orders WHERE customer_id=? ORDER BY id DESC', [id]),
    db.all(`SELECT k.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id=k.id AND r.customer_id=?) used FROM coupons k WHERE k.customer_id=? ORDER BY k.id DESC`, [id, id]),
  ]);
  const body = html`${shown}<div class="cols"><section class="card"><h2>${cu.name}</h2>
<dl class="dl"><dt>Cédula o RIF</dt><dd>${docText(cu.doc_key)}</dd><dt>WhatsApp</dt><dd>${phoneText(cu.phone_key)}</dd><dt>Correo</dt><dd>${cu.email_key}</dd>
<dt>Ubicación</dt><dd>${[cu.address, cu.city, cu.state].filter(Boolean).join(', ') || '—'}</dd><dt>Cuenta</dt><dd>${cu.pw_hash ? `Con contraseña · último acceso ${fmt.date(cu.last_login_at)}` : 'Compró sin crear cuenta'}</dd>
<dt>Novedades</dt><dd>${cu.marketing_ok ? 'Acepta recibir novedades' : 'No'}</dd><dt>Desde</dt><dd>${fmt.date(cu.created_at)}</dd></dl>
<p><a class="btn sm ghost" href="${waTo(cu.phone, `Hola, ${cu.name.split(' ')[0]}.`)}" target="_blank" rel="noopener">Escribirle por WhatsApp ↗</a></p></section>
<aside class="stack"><section class="card"><h2>Acciones</h2>
<form method="post" class="stack">${csrf(c)}<input type="hidden" name="_action" value="reset"><button class="btn sm ghost">Crear enlace para su contraseña</button><p class="help">Para clientas que olvidaron la contraseña o compraron sin cuenta y quieren una.</p></form>
<form method="post" data-confirm="¿Seguro?">${csrf(c)}<input type="hidden" name="_action" value="toggle"><button class="btn sm ghost ${cu.status === 'activa' ? 'bad' : ''}">${cu.status === 'activa' ? 'Bloquear cuenta' : 'Activar cuenta'}</button></form>
<a class="btn sm" href="/admin/cupones/nuevo?clienta=${cu.id}">Crear cupón personal</a></section>
<form method="post" class="card stack">${csrf(c)}<input type="hidden" name="_action" value="notes"><label>Notas internas<textarea name="notes" rows="4">${cu.notes}</textarea></label><button class="btn sm ghost">Guardar notas</button></form></aside></div>
<section class="card"><h2>Pedidos</h2>${orders.length ? html`<table class="tbl"><thead><tr><th>Pedido</th><th>Estado</th><th>Total</th><th>Cupón</th><th>Fecha</th></tr></thead><tbody>${orders.map((o) => html`<tr><td><a href="/admin/pedidos/${o.id}">${o.code}</a></td><td>${badge(STATUS[o.status]?.[0] || o.status, STATUS[o.status]?.[1])}</td><td>${money(o.total_cents)}</td><td>${o.coupon_code || '—'}</td><td>${fmt.date(o.created_at)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Sin pedidos.</p>`}</section>
<section class="card"><h2>Cupones personales</h2>${coupons.length ? html`<table class="tbl"><thead><tr><th>Cupón</th><th>Descuento</th><th>Usado</th><th>Vence</th></tr></thead><tbody>${coupons.map((k) => html`<tr><td><a href="/admin/cupones/${k.id}">${k.code}</a></td><td>${k.kind === 'pct' ? `${k.value / 100} %` : k.kind === 'monto' ? money(k.value) : 'Envío gratis'}</td><td>${k.used}/${k.per_customer}</td><td>${k.ends_at ? fmt.date(k.ends_at) : '—'}</td></tr>`)}</tbody></table>` : html`<p class="muted">No tiene cupones personales.</p>`}</section>`;
  return layout(c, { title: cu.name, active: 'customers', body, actions: html`<a class="btn ghost" href="/admin/clientas">← Clientas</a>` });
}

export { raw };
