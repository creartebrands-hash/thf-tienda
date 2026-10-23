// Temporadas y ofertas (Navidad, Black Friday…) y cupones. Las temporadas no se ven hasta encenderlas y llegar su fecha;
// se pueden revisar antes con un enlace de vista previa. Los cupones personales solo funcionan con la cuenta de esa clienta.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { money } from '../lib/pricing.js';
import { audit } from '../lib/security.js';
import { couponCode } from '../lib/validate.js';
import { HttpError, readForm, redirect } from '../http.js';
import { previewToken } from '../shop.js';
import { afterWrite, mediaMap } from './common.js';
import { FormError, badge, csrf, empty, field, fmt, layout, parseField } from './ui.js';

const THEMES = [['burdeos', 'Burdeos'], ['negro', 'Negro'], ['marino', 'Marino'], ['oliva', 'Oliva'], ['arena', 'Arena (claro)'], ['rosa', 'Rosa']];
const campState = (k) => {
  const now = Date.now();
  if (!k.active) return ['Apagada (oculta)', 'muted'];
  if (Date.parse(k.starts_at) > now) return ['Programada', 'blue'];
  if (Date.parse(k.ends_at) <= now) return ['Terminada', 'muted'];
  return ['Visible ahora', 'ok'];
};

export async function campaigns(c) {
  const rows = await c.db.all('SELECT * FROM campaigns ORDER BY starts_at DESC, id DESC');
  const body = html`<p class="intro">Una temporada muestra una franja arriba de la tienda, su propia página y, si quieres, un descuento automático en las piezas. <b>Solo se ve si está encendida y dentro de sus fechas</b>: puedes dejarla lista desde ya y se activa sola. Antes de encenderla, revísala con "Vista previa".</p>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Temporada</th><th>Desde</th><th>Hasta</th><th>Descuento</th><th>Estado</th><th></th></tr></thead><tbody>
${rows.map((k) => { const [t, tone] = campState(k); return html`<tr><td><a href="/admin/temporadas/${k.id}">${k.name}</a></td><td>${fmt.date(k.starts_at)}</td><td>${fmt.date(k.ends_at)}</td><td>${k.discount_bps ? `${k.discount_bps / 100} %` : '—'}</td><td>${badge(t, tone)}</td><td class="r"><a class="link" href="/temporada/${k.slug}">Ver ↗</a></td></tr>`; })}</tbody></table></div>`
    : empty('No hay temporadas.')}`;
  return layout(c, { title: 'Temporadas y ofertas', active: 'campaigns', body, actions: html`<a class="btn" href="/admin/temporadas/nuevo">Nueva temporada</a>` });
}

const CF = [
  { k: 'name', label: 'Nombre', req: true, max: 60, ph: 'Navidad' }, { k: 'slug', label: 'Dirección web', type: 'slug', req: true, help: '/temporada/esta-direccion' },
  { k: 'kind', label: 'Tipo', type: 'select', options: [['temporada', 'Temporada'], ['oferta', 'Oferta'], ['lanzamiento', 'Lanzamiento']] },
  { k: 'active', label: 'Encendida (se ve en la tienda entre las fechas)', type: 'bool', wide: true },
  { k: 'starts_at', label: 'Empieza (hora de Venezuela)', type: 'datetime', req: true }, { k: 'ends_at', label: 'Termina (hora de Venezuela)', type: 'datetime', req: true },
  { k: 'discount_bps', label: 'Descuento automático en las piezas', type: 'pct', min: 0, maxv: 90, help: '0 = sin descuento (solo franja y página). No se suma a la oferta propia: se cobra el menor precio.' },
  { k: 'scope', label: 'El descuento aplica a', type: 'select', options: [['todo', 'Todas las piezas (no cajas)'], ['coleccion', 'Una colección'], ['piezas', 'Piezas elegidas'], ['ninguno', 'Ninguna (sin descuento)']] },
  { k: 'collection_id', label: 'Colección', type: 'ref' },
  { k: 'banner_title', label: 'Título de la franja y la página', max: 80, wide: true }, { k: 'banner_text', label: 'Texto corto de la franja', max: 160, wide: true },
  { k: 'banner_cta', label: 'Texto del botón', max: 30, ph: 'Ver las piezas' }, { k: 'theme', label: 'Color', type: 'select', options: THEMES },
  { k: 'media_id', label: 'Foto de la página', type: 'media' }, { k: 'show_countdown', label: 'Mostrar cuenta regresiva', type: 'bool' },
  { k: 'coupon_code', label: 'Cupón que se muestra (opcional)', max: 24, help: 'Créalo en Cupones y escribe aquí su código.' },
  { k: 'page_intro', label: 'Introducción de la página', type: 'textarea', rows: 3, wide: true, max: 600 }, { k: 'sort', label: 'Orden', type: 'int' },
];

export async function campaignEdit(c, id) {
  const { db } = c;
  const isNew = id === 'nuevo';
  let row = isNew ? { kind: 'temporada', active: 0, discount_bps: 0, scope: 'ninguno', theme: 'burdeos', show_countdown: 1, product_ids: '[]', sort: 10 } : await db.first('SELECT * FROM campaigns WHERE id=?', [id]);
  if (!row) throw new HttpError(404);
  let err = '';
  const prods = await db.all("SELECT id, name, sku FROM products WHERE status='published' AND in_catalog=1 AND is_bundle=0 ORDER BY sort, id");
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (f._action === 'delete' && !isNew) {
      if (await db.n('SELECT COUNT(*) n FROM orders WHERE campaign_id=?', [row.id])) return redirect(`/admin/temporadas/${row.id}?err=${encodeURIComponent('Tiene pedidos: apágala en lugar de eliminarla.')}`, 303);
      await db.run('UPDATE coupons SET campaign_id=NULL WHERE campaign_id=?', [row.id]);
      await db.run('DELETE FROM campaigns WHERE id=?', [row.id]);
      await audit(db, c, 'eliminar', 'campaigns', row.id);
      await afterWrite(c);
      return redirect('/admin/temporadas?msg=' + encodeURIComponent('Eliminada.'), 303);
    }
    try {
      const v = {};
      for (const fl of CF) v[fl.k] = parseField(fl, f[fl.k]);
      v.coupon_code = couponCode(v.coupon_code);
      v.discount_bps = v.discount_bps ?? 0;
      if (Date.parse(v.ends_at) <= Date.parse(v.starts_at)) throw new FormError('La fecha de fin debe ser después del inicio.');
      if (v.scope === 'coleccion' && !v.collection_id) throw new FormError('Elige la colección.');
      const ids = [].concat(f.products || []).map(Number).filter((n) => prods.some((p) => p.id === n));
      if (v.scope === 'piezas' && !ids.length) throw new FormError('Elige al menos una pieza.');
      v.product_ids = JSON.stringify(ids);
      v.updated_at = nowIso();
      const ks = Object.keys(v);
      let nid = row.id;
      if (isNew) nid = (await db.run(`INSERT INTO campaigns(${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map((k) => v[k]))).id;
      else await db.run(`UPDATE campaigns SET ${ks.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...ks.map((k) => v[k]), row.id]);
      await audit(db, c, isNew ? 'crear' : 'editar', 'campaigns', nid, { name: v.name, active: v.active, starts: v.starts_at, ends: v.ends_at, pct: v.discount_bps });
      await afterWrite(c);
      return redirect(`/admin/temporadas/${nid}?msg=${encodeURIComponent('Guardado.')}`, 303);
    } catch (e) {
      if (e instanceof FormError) err = e.message;
      else if (/UNIQUE/i.test(String(e?.message))) err = 'Ya existe una temporada con esa dirección.';
      else throw e;
      row = { ...row, ...Object.fromEntries(CF.map((fl) => [fl.k, f[fl.k]])) };
    }
  }
  const cols = await db.all('SELECT id, name FROM collections ORDER BY sort');
  const media = await mediaMap(db, [row.media_id]);
  const sel = new Set(JSON.parse(row.product_ids || '[]'));
  const pv = isNew ? '' : `/temporada/${row.slug}?vista=${await previewToken(c.env, row.slug)}`;
  const [st, tone] = isNew ? ['Nueva', 'muted'] : campState(row);
  const body = html`${err ? html`<p class="flash bad">${err}</p>` : ''}
${!isNew ? html`<section class="card"><p>Estado: ${badge(st, tone)} ${pv ? html` · <a class="link" href="${pv}" target="_blank" rel="noopener">Vista previa ↗</a> <small class="muted">(enlace privado, sirve aunque esté apagada)</small>` : ''}</p></section>` : ''}
<form method="post" class="card form" data-dirty>${csrf(c)}<div class="grid">${CF.map((fl) => field(fl, row[fl.k], { media, refs: { collection_id: cols.map((x) => [x.id, x.name]) } }))}</div>
<fieldset class="pick"><legend>Piezas elegidas (si el descuento aplica a "Piezas elegidas")</legend><div class="checks">${prods.map((p) => html`<label class="chk"><input type="checkbox" name="products" value="${p.id}"${sel.has(p.id) ? raw(' checked') : ''}> ${p.name} <small class="muted">${p.sku}</small></label>`)}</div></fieldset>
<div class="bar"><button class="btn">Guardar</button></div></form>
${!isNew ? html`<form method="post" class="danger" data-confirm="¿Eliminar esta temporada?">${csrf(c)}<input type="hidden" name="_action" value="delete"><button class="btn ghost bad sm">Eliminar</button></form>` : ''}`;
  return layout(c, { title: isNew ? 'Nueva temporada' : row.name, active: 'campaigns', body, actions: html`<a class="btn ghost" href="/admin/temporadas">← Temporadas</a>` });
}

// ---------------------------------------------------------------- cupones
const kindText = (k) => (k.kind === 'pct' ? `${k.value / 100} %` : k.kind === 'monto' ? money(k.value) : 'Envío gratis');

export async function coupons(c) {
  const rows = await c.db.all('SELECT k.*, cu.name cname, ca.name camp FROM coupons k LEFT JOIN customers cu ON cu.id=k.customer_id LEFT JOIN campaigns ca ON ca.id=k.campaign_id ORDER BY k.id DESC LIMIT 300');
  const body = html`<p class="intro">Un cupón puede ser general (para quien lo tenga), de temporada (solo funciona mientras la temporada está activa) o <b>personal</b> (solo lo usa esa clienta con su cuenta iniciada; no se puede transferir). Cada uso queda registrado con la clienta y el pedido.</p>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Código</th><th>Descuento</th><th>Para</th><th>Usos</th><th>Vence</th><th>Activo</th></tr></thead><tbody>
${rows.map((k) => html`<tr><td><a href="/admin/cupones/${k.id}"><b>${k.code}</b></a>${k.description ? html`<br><small class="muted">${k.description}</small>` : ''}</td><td>${kindText(k)}</td><td>${k.cname ? html`Personal: <a href="/admin/clientas/${k.customer_id}">${k.cname}</a>` : k.camp ? `Temporada ${k.camp}` : 'General'}</td><td>${k.uses}${k.max_uses != null ? ` / ${k.max_uses}` : ''}</td><td>${k.ends_at ? fmt.date(k.ends_at) : '—'}</td><td>${fmt.bool(k.active)}</td></tr>`)}</tbody></table></div>`
    : empty('No hay cupones.')}`;
  return layout(c, { title: 'Cupones', active: 'coupons', body, actions: html`<a class="btn" href="/admin/cupones/nuevo">Nuevo cupón</a>` });
}

const KF = [
  { k: 'code', label: 'Código', req: true, max: 24, help: 'Letras y números, sin espacios. Ej.: NAVIDAD10' }, { k: 'description', label: 'Descripción (la ve la clienta)', max: 120 },
  { k: 'kind', label: 'Tipo', type: 'select', options: [['pct', 'Porcentaje'], ['monto', 'Monto fijo (USD)'], ['envio', 'Envío gratis']] },
  { k: 'pct_value', label: 'Porcentaje', type: 'pct', min: 0, maxv: 90 }, { k: 'money_value', label: 'Monto', type: 'money' },
  { k: 'min_subtotal_cents', label: 'Compra mínima', type: 'money', help: 'Vacío = sin mínimo' }, { k: 'max_discount_cents', label: 'Descuento máximo', type: 'money' },
  { k: 'starts_at', label: 'Válido desde', type: 'datetime' }, { k: 'ends_at', label: 'Válido hasta', type: 'datetime' },
  { k: 'max_uses', label: 'Usos totales (vacío = sin límite)', type: 'int', min: 1, maxv: 1000000 }, { k: 'per_customer', label: 'Usos por clienta', type: 'int', min: 1, maxv: 100, req: true },
  { k: 'customer_id', label: 'Cupón personal de', type: 'ref', help: 'Solo esa clienta, con su sesión iniciada.' }, { k: 'campaign_id', label: 'Solo durante la temporada', type: 'ref' },
  { k: 'collection_id', label: 'Solo para la colección', type: 'ref' },
  { k: 'first_order_only', label: 'Solo para la primera compra', type: 'bool' }, { k: 'retail_only', label: 'No aplica a pedidos al mayor', type: 'bool' }, { k: 'active', label: 'Activo', type: 'bool' },
];

export async function couponEdit(c, id) {
  const { db } = c;
  const isNew = id === 'nuevo';
  let row = isNew ? { kind: 'pct', value: 1000, per_customer: 1, active: 1, retail_only: 1, customer_id: Number(c.url.searchParams.get('clienta')) || null } : await db.first('SELECT * FROM coupons WHERE id=?', [id]);
  if (!row) throw new HttpError(404);
  row.pct_value = row.kind === 'pct' ? row.value : null;
  row.money_value = row.kind === 'monto' ? row.value : null;
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    try {
      const v = {};
      for (const fl of KF) v[fl.k] = parseField(fl, f[fl.k]);
      v.code = couponCode(v.code);
      if (v.code.length < 3) throw new FormError('El código debe tener al menos 3 letras o números.');
      if (await db.first('SELECT 1 x FROM partners WHERE code=?', [v.code])) throw new FormError('Ese código ya es de una embajadora. Usa otro.');
      v.value = v.kind === 'pct' ? v.pct_value ?? 0 : v.kind === 'monto' ? v.money_value ?? 0 : 0;
      if (v.kind !== 'envio' && v.value <= 0) throw new FormError('Indica el porcentaje o el monto del descuento.');
      if (v.starts_at && v.ends_at && Date.parse(v.ends_at) <= Date.parse(v.starts_at)) throw new FormError('La fecha final debe ser después de la inicial.');
      delete v.pct_value; delete v.money_value;
      v.updated_at = nowIso();
      const ks = Object.keys(v);
      let nid = row.id;
      if (isNew) {
        ks.push('created_at', 'created_by'); v.created_at = v.updated_at; v.created_by = c.user.id;
        nid = (await db.run(`INSERT INTO coupons(${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map((k) => v[k]))).id;
      } else await db.run(`UPDATE coupons SET ${ks.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...ks.map((k) => v[k]), row.id]);
      await audit(db, c, isNew ? 'crear' : 'editar', 'coupons', nid, { code: v.code, kind: v.kind, value: v.value, customer: v.customer_id });
      return redirect(`/admin/cupones/${nid}?msg=${encodeURIComponent('Guardado.')}`, 303);
    } catch (e) {
      if (e instanceof FormError) err = e.message;
      else if (/UNIQUE/i.test(String(e?.message))) err = 'Ya existe un cupón con ese código.';
      else throw e;
      row = { ...row, ...Object.fromEntries(KF.map((fl) => [fl.k, f[fl.k]])) };
    }
  }
  const [cust, camps, cols, uses] = await Promise.all([
    db.all('SELECT id, name, doc_key FROM customers ORDER BY name LIMIT 2000'), db.all('SELECT id, name FROM campaigns ORDER BY starts_at DESC'), db.all('SELECT id, name FROM collections ORDER BY sort'),
    isNew ? [] : db.all('SELECT r.*, o.code, o.id oid, cu.name FROM coupon_redemptions r JOIN orders o ON o.id=r.order_id JOIN customers cu ON cu.id=r.customer_id WHERE r.coupon_id=? ORDER BY r.id DESC', [row.id]),
  ]);
  const refs = { customer_id: cust.map((x) => [x.id, `${x.name} · ${x.doc_key}`]), campaign_id: camps.map((x) => [x.id, x.name]), collection_id: cols.map((x) => [x.id, x.name]) };
  const body = html`${err ? html`<p class="flash bad">${err}</p>` : ''}<form method="post" class="card form" data-dirty>${csrf(c)}<div class="grid">${KF.map((fl) => field(fl, row[fl.k], { refs }))}</div><div class="bar"><button class="btn">Guardar</button></div></form>
${uses.length ? html`<section class="card"><h2>Usos</h2><table class="tbl"><thead><tr><th>Pedido</th><th>Clienta</th><th>Descuento</th><th>Fecha</th></tr></thead><tbody>${uses.map((u) => html`<tr><td><a href="/admin/pedidos/${u.oid}">${u.code}</a></td><td>${u.name}</td><td>${money(u.discount_cents)}</td><td>${fmt.date(u.created_at)}</td></tr>`)}</tbody></table></section>` : ''}`;
  return layout(c, { title: isNew ? 'Nuevo cupón' : row.code, active: 'coupons', body, actions: html`<a class="btn ghost" href="/admin/cupones">← Cupones</a>` });
}
