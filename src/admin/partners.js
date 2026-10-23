// Programas: afiliadas (embajadoras y aliadas), sus enlaces personales, comisiones editables, libro de movimientos,
// pagos de comisiones y "Ver como ella" (su portal en solo lectura).
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { waTo } from '../lib/notify.js';
import { balance, commissionRule, partnerLink, storeLink } from '../lib/partners.js';
import { money } from '../lib/pricing.js';
import { audit, randomToken, sha256 } from '../lib/security.js';
import * as V from '../lib/validate.js';
import { HttpError, readForm, redirect } from '../http.js';
import { dashboardData } from '../portal.js';
import { render } from '../public.js';
import { portalDashboard } from '../views/portal.js';
import { needReauth } from './common.js';
import { emit } from '../lib/webhooks.js';
import { FormError, badge, csrf, empty, field, fmt, layout, parseField, slugify } from './ui.js';

const KIND = { embajadora: 'Embajadora', emprendedora: 'Aliada' };
const STAT = { activa: ['Activa', 'ok'], pausada: ['Pausada', 'warn'], baja: ['De baja', 'muted'] };

export async function list(c) {
  const k = KIND[c.url.searchParams.get('tipo')] ? c.url.searchParams.get('tipo') : '';
  const rows = await c.db.all(`SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status IN ('pagado','en_produccion','listo','listo_retiro','enviado','entregado')) paid,
    (SELECT COALESCE(SUM(amount_cents),0) FROM ledger_entries l WHERE l.partner_id=p.id) bal FROM partners p ${k ? 'WHERE p.kind=?' : ''} ORDER BY p.status, p.name`, k ? [k] : []);
  const body = html`<p class="intro">Cada afiliada tiene su <b>código</b>, su <b>enlace personal</b> (con QR) y, si es aliada, su <b>tienda</b>. Las ventas que llegan por ellos quedan "referidas por" ella. Las comisiones se acreditan solas cuando el pedido se marca como pagado y se revierten si se cancela.</p>
<nav class="tabs"><a href="/admin/afiliadas"${!k ? raw(' aria-current="page"') : ''}>Todas</a><a href="?tipo=embajadora"${k === 'embajadora' ? raw(' aria-current="page"') : ''}>Embajadoras</a><a href="?tipo=emprendedora"${k === 'emprendedora' ? raw(' aria-current="page"') : ''}>Aliadas</a><a href="/admin/comisiones">Comisiones por pagar</a></nav>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Afiliada</th><th>Tipo</th><th>Código</th><th>Ventas pagadas</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>
${rows.map((r) => html`<tr><td><a href="/admin/afiliadas/${r.id}">${r.name}</a><br><small class="muted">${r.city || ''}</small></td><td>${KIND[r.kind]}</td><td class="mono">${r.code}</td><td>${r.paid}</td><td>${money(r.bal)}</td><td>${badge(STAT[r.status][0], STAT[r.status][1])}</td></tr>`)}</tbody></table></div>`
    : empty('Todavía no hay afiliadas. Créalas desde una solicitud aprobada (Solicitudes) o con "Nueva afiliada".')}`;
  return layout(c, { title: 'Afiliadas', active: 'partners', body, actions: html`<a class="btn" href="/admin/afiliadas/nueva">Nueva afiliada</a>` });
}

const FIELDS = [
  { k: 'kind', label: 'Programa', type: 'select', options: [['embajadora', 'Embajadora (comisión por venta)'], ['emprendedora', 'Aliada (tienda propia, gana la diferencia)']] },
  { k: 'status', label: 'Estado', type: 'select', options: [['activa', 'Activa'], ['pausada', 'Pausada (su enlace no suma)'], ['baja', 'De baja']] },
  { k: 'name', label: 'Nombre y apellido', req: true, max: 80 }, { k: 'email', label: 'Correo (para entrar a su portal)', type: 'email', req: true },
  { k: 'phone', label: 'WhatsApp', req: true, max: 30 }, { k: 'doc', label: 'Cédula (opcional)', max: 14, ph: 'V12345678' }, { k: 'city', label: 'Ciudad', max: 60 },
  { k: 'code', label: 'Código para compartir', req: true, max: 24, help: 'Letras y números. Es también su enlace: /a/CÓDIGO' },
  { k: 'slug', label: 'Dirección de su tienda (aliadas)', type: 'text', max: 40, help: '/e/esta-direccion · vacío = sin tienda' },
  { k: 'store_title', label: 'Nombre de su tienda', max: 60, help: 'Ella también lo puede cambiar desde su portal.' }, { k: 'store_bio', label: 'Presentación de su tienda', type: 'textarea', rows: 2, max: 300, wide: true },
  { k: 'commission_mode', label: 'Comisión', type: 'select', options: [['global', 'La general de Ajustes'], ['pct', 'Porcentaje propio'], ['monto', 'Monto fijo propio'], ['pct_monto', 'Porcentaje + monto fijo']] },
  { k: 'commission_bps', label: 'Porcentaje propio', type: 'pct', min: 0, maxv: 60 }, { k: 'commission_fixed_cents', label: 'Monto fijo propio', type: 'money' },
  { k: 'fixed_per', label: 'El monto fijo es por', type: 'select', options: [['pedido', 'Pedido'], ['pieza', 'Pieza']] },
  { k: 'client_discount_bps', label: 'Descuento para quien use su código', type: 'pct', min: 0, maxv: 50, help: 'Vacío = el general de Ajustes. No se suma a cupones.' },
  { k: 'payout_info', label: 'Cómo se le paga (privado)', type: 'textarea', rows: 2, wide: true, max: 400, help: 'Ej.: Pago Móvil Banesco 0414…, Zelle…' },
  { k: 'notes', label: 'Notas internas', type: 'textarea', rows: 2, wide: true, max: 1000 },
];

export async function edit(c, id) {
  const { db } = c;
  const isNew = id === 'nueva';
  let row;
  if (isNew) {
    const req = /^\d+$/.test(c.url.searchParams.get('solicitud') || '') ? await db.first('SELECT * FROM requests WHERE id=?', [Number(c.url.searchParams.get('solicitud'))]) : null;
    row = { kind: req?.kind === 'emprendedora' ? 'emprendedora' : 'embajadora', status: 'activa', commission_mode: 'global', fixed_per: 'pedido', name: req?.name || '', phone: req?.phone || '', city: req?.city || '', request_id: req?.id || null,
      code: req ? V.couponCode(req.name.split(' ')[0]).slice(0, 12) + String(Math.floor(Math.random() * 90) + 10) : '' };
    if (row.kind === 'emprendedora' && req) row.slug = slugify(req.name).slice(0, 30);
  } else row = await db.first('SELECT * FROM partners WHERE id=?', [id]);
  if (!row) throw new HttpError(404);
  if (!isNew) row.doc = row.doc_key || '';
  let err = '', shown = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (!isNew && f._action === 'access') {
      const tk = randomToken(24);
      await db.run('UPDATE partners SET access_token_hash=?, access_expires=? WHERE id=?', [await sha256(tk), new Date(Date.now() + 72 * 3600e3).toISOString(), row.id]);
      await audit(db, c, 'socia_enlace_acceso', 'partners', row.id);
      const link = `${c.base}/afiliadas/acceso?t=${tk}`;
      shown = html`<section class="card notice"><h2>Enlace de acceso para ${row.name.split(' ')[0]}</h2><p>Sirve una vez y vence en 72 horas. Con él crea su contraseña y entra a su portal.</p><pre class="msg">${link}</pre>
<a class="btn sm wa" href="${waTo(row.phone, `Hola, ${row.name.split(' ')[0]}. Bienvenida a THF. Entra aquí para crear tu contraseña y ver tu portal (vence en 72 horas): ${link}\n\nTu enlace para compartir es ${partnerLink(c.base, row)} y tu código ${row.code}.`)}" target="_blank" rel="noopener">Enviar por WhatsApp ↗</a></section>`;
    } else if (!isNew && (f._action === 'payout' || f._action === 'adjust')) {
      const r = needReauth(c);
      if (r) return r;
      try {
        const amt = V.amountCents(f.amount);
        if (!amt) throw new FormError('Escribe el monto.');
        const note = V.line(f.note, 200);
        if (f._action === 'adjust' && !note) throw new FormError('Escribe el motivo del ajuste.');
        const bal = await balance(db, row.id);
        if (f._action === 'payout' && amt > bal.available) throw new FormError(`Ese pago es mayor que el saldo disponible (${money(bal.available)}).`);
        const signed = f._action === 'payout' ? -amt : f.sign === '-' ? -amt : amt;
        await db.run('INSERT INTO ledger_entries(partner_id,kind,amount_cents,note,ref,user_id,created_at) VALUES (?,?,?,?,?,?,?)',
          [row.id, f._action === 'payout' ? 'pago' : 'ajuste', signed, note || 'Pago de comisiones', V.line(f.ref, 80), c.user.id, nowIso()]);
        await audit(db, c, f._action === 'payout' ? 'pago_socia' : 'ajuste_socia', 'partners', row.id, { amount: signed, ref: f.ref });
        if (f._action === 'payout') await emit(c, 'pago_afiliada', { codigo: row.code, nombre: row.name, programa: row.kind === 'emprendedora' ? 'aliada' : 'embajadora', monto_usd: amt / 100, referencia: V.line(f.ref, 80), nota: note });
        return redirect(`/admin/afiliadas/${row.id}?msg=${encodeURIComponent(f._action === 'payout' ? 'Pago registrado.' : 'Ajuste registrado.')}#saldo`, 303);
      } catch (e) {
        if (!(e instanceof FormError || e instanceof V.ValidationError)) throw e;
        return redirect(`/admin/afiliadas/${row.id}?err=${encodeURIComponent(e.message)}#saldo`, 303);
      }
    } else {
      try {
        const v = {};
        for (const fl of FIELDS) v[fl.k] = parseField(fl, f[fl.k]);
        v.code = V.couponCode(v.code);
        if (v.code.length < 3) throw new FormError('El código debe tener al menos 3 letras o números.');
        if (await db.first('SELECT 1 x FROM coupons WHERE code=?', [v.code])) throw new FormError('Ese código ya es un cupón. Usa otro.');
        v.slug = v.slug ? slugify(v.slug).slice(0, 40) : null;
        if (v.kind !== 'emprendedora') v.slug = null;
        v.email_key = V.emailKey(v.email); v.email = v.email_key;
        v.phone_key = V.phoneKey(v.phone);
        v.doc_key = v.doc ? V.docKey(v.doc.replace(/[^VEJPG]/gi, '').slice(0, 1) || 'V', v.doc) : null;
        delete v.doc;
        V.personName(v.name);
        v.updated_at = nowIso();
        const ks = Object.keys(v);
        let nid = row.id;
        if (isNew) {
          ks.push('created_at', 'request_id'); v.created_at = v.updated_at; v.request_id = row.request_id;
          nid = (await db.run(`INSERT INTO partners(${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map((k) => v[k]))).id;
          if (row.request_id) await db.run("UPDATE requests SET status='aprobada', updated_at=? WHERE id=?", [v.updated_at, row.request_id]);
        } else await db.run(`UPDATE partners SET ${ks.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...ks.map((k) => v[k]), row.id]);
        if (v.status === 'baja') await db.run('DELETE FROM partner_sessions WHERE partner_id=?', [nid]);
        await audit(db, c, isNew ? 'crear' : 'editar', 'partners', nid, { code: v.code, kind: v.kind, status: v.status, commission: [v.commission_mode, v.commission_bps, v.commission_fixed_cents] });
        return redirect(`/admin/afiliadas/${nid}?msg=${encodeURIComponent(isNew ? 'Afiliada creada. Envíale su enlace de acceso.' : 'Guardado.')}`, 303);
      } catch (e) {
        if (e instanceof FormError || e instanceof V.ValidationError) err = e.message;
        else if (/UNIQUE/i.test(String(e?.message))) err = 'Ese código, correo, teléfono, cédula o tienda ya está en uso por otra afiliada.';
        else throw e;
        row = { ...row, ...Object.fromEntries(FIELDS.map((fl) => [fl.k, f[fl.k]])) };
      }
    }
  }
  const form = html`${err ? html`<p class="flash bad">${err}</p>` : ''}<form method="post" class="card form" data-dirty>${csrf(c)}<div class="grid">${FIELDS.map((fl) => field(fl, row[fl.k]))}</div><div class="bar"><button class="btn">Guardar</button></div></form>`;
  if (isNew) return layout(c, { title: 'Nueva afiliada', active: 'partners', body: form, actions: html`<a class="btn ghost" href="/admin/afiliadas">← Afiliadas</a>` });
  const S = await db.settings();
  const [bal, ledger, orders, clicks] = await Promise.all([
    balance(db, row.id), db.all('SELECT l.*, u.name uname, o.code FROM ledger_entries l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN orders o ON o.id=l.order_id WHERE l.partner_id=? ORDER BY l.id DESC LIMIT 200', [row.id]),
    db.all('SELECT id, code, status, subtotal_cents, discount_cents, attribution_source, created_at FROM orders WHERE partner_id=? ORDER BY id DESC LIMIT 100', [row.id]),
    db.n("SELECT COUNT(*) n FROM events WHERE partner_id=? AND type='ref_click'", [row.id]),
  ]);
  const rule = commissionRule(row, S);
  const link = partnerLink(c.base, row), store = storeLink(c.base, row);
  const min = Number(S['programs.payout_min_usd'] || 0) * 100;
  const body = html`${shown}
<div class="kpis"><div class="kpi"><small>Visitas por su enlace</small><b>${clicks}</b></div><div class="kpi"><small>Pedidos</small><b>${orders.length}</b></div>
<div class="kpi"><small>Disponible para pagar</small><b>${money(bal.available)}</b></div><div class="kpi"><small>En espera · ya pagado</small><b>${money(bal.held)} · ${money(bal.paid)}</b></div></div>
<div class="cols"><section class="card"><h2>Enlace y código</h2><p class="mono">${link}</p><p><button class="btn sm ghost" data-copy="${link}">Copiar enlace</button> <a class="btn sm ghost" href="/admin/afiliadas/${row.id}/qr.svg" download="qr-${row.code}.svg">Descargar QR</a></p>
${store ? html`<p>Tienda: <a href="${store}" target="_blank" rel="noopener">${store}</a></p>
<p class="help">Ella edita en su portal (Mi tienda) el título, el subtítulo, los colores de fondo y de texto y el banner; en Mis piezas elige precio y foto de cada pieza.
${row.store_bg ? html`Colores actuales: <span class="swatch" style="background:${/^#[0-9A-F]{6}$/i.test(row.store_bg) ? row.store_bg : '#fff'}"></span> fondo · <span class="swatch" style="background:${/^#[0-9A-F]{6}$/i.test(row.store_fg || '') ? row.store_fg : '#000'}"></span> texto. ` : ''}Las fotos que puede elegir se preparan en <a href="/admin/aliadas-imagenes">Imágenes para aliadas</a>.</p>` : ''}
<p class="help">Comisión: ${rule.mode === 'pct' ? `${rule.bps / 100} %` : rule.mode === 'monto' ? `${money(rule.fixed)} por ${rule.per}` : `${rule.bps / 100} % + ${money(rule.fixed)} por ${rule.per}`}${rule.own ? ' (propia)' : ' (general)'}${row.kind === 'emprendedora' ? ' · en su tienda gana la diferencia entre su precio y el costo de aliada' : ''}.</p></section>
<aside class="stack"><section class="card"><h2>Acceso a su portal</h2><p>${row.pw_hash ? `Ya creó su contraseña · último acceso ${fmt.date(row.last_login_at)}` : 'Todavía no entra a su portal.'}</p>
<form method="post">${csrf(c)}<input type="hidden" name="_action" value="access"><button class="btn sm ghost">Crear enlace de acceso</button></form>
<p><a class="btn sm ghost" href="/admin/afiliadas/${row.id}/vista" target="_blank" rel="noopener">Ver como ella ↗</a></p></section></aside></div>
<section class="card" id="saldo"><h2>Saldo y movimientos</h2>
<p>Disponible: <b>${money(bal.available)}</b>${bal.available >= min ? html` · ${badge('Lista para pagar', 'ok')}` : html` · <small class="muted">el mínimo para pagar es ${money(min)}</small>`}</p>
${row.payout_info ? html`<p class="help">Cómo se le paga: ${row.payout_info}</p>` : ''}
<div class="cols"><form method="post" class="card form stack">${csrf(c)}<input type="hidden" name="_action" value="payout"><h3>Registrar pago a la afiliada</h3>
<label>Monto USD<input name="amount" inputmode="decimal" required value="${bal.available > 0 ? (bal.available / 100).toFixed(2) : ''}"></label><label>Referencia del pago<input name="ref" maxlength="80" required></label><label>Nota<input name="note" maxlength="200" placeholder="Pago de comisiones de octubre"></label>
<button class="btn sm">Registrar pago</button><p class="help">Pide confirmar tu identidad. Queda en el libro y no se puede borrar.</p></form>
<form method="post" class="card form stack">${csrf(c)}<input type="hidden" name="_action" value="adjust"><h3>Ajuste</h3><label>Tipo<select name="sign"><option value="+">Sumar</option><option value="-">Restar</option></select></label>
<label>Monto USD<input name="amount" inputmode="decimal" required></label><label>Motivo<input name="note" maxlength="200" required></label><button class="btn sm ghost">Registrar ajuste</button></form></div>
${ledger.length ? html`<div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Monto</th><th>Usuario</th></tr></thead><tbody>${ledger.map((l) => html`<tr><td>${fmt.date(l.created_at)}</td><td>${l.kind}</td><td>${l.code ? html`<a href="/admin/pedidos/${l.order_id}">${l.code}</a> · ` : ''}${l.note}${l.ref ? ` · ref. ${l.ref}` : ''}</td><td>${money(l.amount_cents)}</td><td>${l.uname || 'sistema'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Sin movimientos.</p>`}
<p class="help">El libro no se edita ni se borra: los errores se corrigen con un ajuste.</p></section>
<section class="card"><h2>Pedidos referidos</h2>${orders.length ? html`<table class="tbl small"><thead><tr><th>Pedido</th><th>Cómo llegó</th><th>Venta</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${orders.map((o) => html`<tr><td><a href="/admin/pedidos/${o.id}">${o.code}</a></td><td>${o.attribution_source || '—'}</td><td>${money(o.subtotal_cents - o.discount_cents)}</td><td>${o.status}</td><td>${fmt.date(o.created_at)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Aún no hay pedidos.</p>`}</section>
<h2 class="sec">Datos y comisión</h2>${form}`;
  return layout(c, { title: row.name, active: 'partners', body, actions: html`<a class="btn ghost" href="/admin/afiliadas">← Afiliadas</a>` });
}

// "Ver como ella": su portal tal cual, sin poder cambiar nada
export async function viewAs(c, id) {
  const p = await c.db.first('SELECT * FROM partners WHERE id=?', [id]);
  if (!p) throw new HttpError(404);
  await audit(c.db, c, 'ver_como_socia', 'partners', id);
  const d = await dashboardData(c, p);
  const res = await render(c, { page: 'socias', title: `Portal de ${p.name}`, desc: '', noindex: true, body: portalDashboard({ ...d, csrf: '', readonly: true }) });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function qr(c, id) {
  const p = await c.db.first('SELECT code FROM partners WHERE id=?', [id]);
  if (!p) throw new HttpError(404);
  const { qrSvg } = await import('../lib/qr.js');
  return new Response(qrSvg(partnerLink(c.base, p)), { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `attachment; filename="qr-${p.code}.svg"`, 'Cache-Control': 'no-store' } });
}

// Comisiones por pagar: todas las afiliadas con saldo disponible
export async function payable(c) {
  const S = await c.db.settings();
  const min = Number(S['programs.payout_min_usd'] || 0) * 100;
  const ps = await c.db.all("SELECT id, name, kind, code, payout_info, phone FROM partners WHERE status<>'baja' ORDER BY name");
  const rows = [];
  for (const p of ps) { const b = await balance(c.db, p.id); if (b.total) rows.push({ ...p, ...b }); }
  rows.sort((a, b) => b.available - a.available);
  if (c.url.pathname.endsWith('.csv')) {
    // Para el banco: USD y Bs con la tasa vigente (el saldo sigue en USD)
    const rate = await c.db.first('SELECT bs_per_usd_milli FROM exchange_rates ORDER BY id DESC LIMIT 1');
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
    const lines = [['Afiliada', 'Código', 'Programa', 'Disponible USD', 'Tasa Bs/USD', 'Disponible Bs', 'Cómo se le paga'].map(q).join(',')];
    for (const r of rows.filter((x) => x.available >= min)) lines.push([r.name, r.code, r.kind, (r.available / 100).toFixed(2), rate ? (rate.bs_per_usd_milli / 1000).toFixed(4) : '', rate ? (Math.round(r.available * rate.bs_per_usd_milli / 1000) / 100).toFixed(2) : '', r.payout_info].map(q).join(','));
    await audit(c.db, c, 'exportar_comisiones', 'partners', null, { n: lines.length - 1 });
    return new Response('\ufeff' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="comisiones-por-pagar.csv"', 'Cache-Control': 'no-store' } });
  }
  const body = html`<p class="intro">Saldo de cada afiliada. "Disponible" ya pasó los ${S['programs.hold_days']} días de espera por cambios o devoluciones. Se paga desde ${money(min)} (Ajustes → Programas). Para pagar, entra a la afiliada y usa "Registrar pago".</p>
<nav class="tabs"><a href="/admin/afiliadas">Afiliadas</a><a href="/admin/comisiones" aria-current="page">Comisiones por pagar</a><a href="/admin/comisiones.csv">Descargar CSV para el banco</a></nav>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Afiliada</th><th>Disponible</th><th>En espera</th><th>Ya pagado</th><th>Cómo se le paga</th><th></th></tr></thead><tbody>
${rows.map((r) => html`<tr><td><a href="/admin/afiliadas/${r.id}#saldo">${r.name}</a> <small class="muted">${r.code}</small></td><td><b>${money(r.available)}</b> ${r.available >= min ? badge('Pagar', 'ok') : ''}</td><td>${money(r.held)}</td><td>${money(r.paid)}</td><td><small>${r.payout_info || '—'}</small></td><td class="r"><a class="btn sm ghost" href="/admin/afiliadas/${r.id}#saldo">Pagar</a></td></tr>`)}</tbody></table></div>`
    : empty('Todavía no hay comisiones.')}`;
  return layout(c, { title: 'Comisiones por pagar', active: 'payable', body });
}
