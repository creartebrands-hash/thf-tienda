// Estructura de costos por pieza (solo Administración): la receta de materiales de cada pieza con la MISMA foto del catálogo,
// mano de obra, otros costos, factor de precio y precio sugerido. Reemplaza la hoja de Excel que se llenaba en cada venta:
// el costo queda guardado en cada pieza, se recalcula solo al cambiar un material y cada pedido guarda su costo del momento.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { costBreakdown, fmtMc, mcToCents, recomputeProductCost, unitCostMc } from '../lib/costs.js';
import { money } from '../lib/pricing.js';
import { audit } from '../lib/security.js';
import { HttpError, readForm, redirect } from '../http.js';
import { afterWrite } from './common.js';
import { FormError, badge, csrf, empty, field, fmt, layout, parseField } from './ui.js';

const UNIT_TXT = { unidad: 'u', cm: 'cm', metro: 'm', gramo: 'g', par: 'par', paquete: 'paq.' };

export async function overview(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const S = await c.db.settings();
  const col = c.url.searchParams.get('col') || '';
  const rows = await c.db.all(`SELECT p.id, p.name, p.sku, p.price_cents, p.offer_cents, p.wholesale_cents, p.prod_cost_cents, p.labor_cents, p.cost_updated_at, c.name col, c.slug cslug,
    (SELECT COUNT(*) FROM product_bom b WHERE b.product_id=p.id) nb,
    (SELECT m.path FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=p.id ORDER BY (pm.role='main') DESC, pm.sort LIMIT 1) img
    FROM products p LEFT JOIN collections c ON c.id=p.collection_id WHERE p.status<>'archived' ${col ? 'AND c.slug=?' : ''} ORDER BY c.sort, p.sort, p.id`, col ? [col] : []);
  const cols = await c.db.all('SELECT slug, name FROM collections ORDER BY sort');
  const low = await c.db.all('SELECT id, name, stock_qty, min_stock, unit FROM materials WHERE active=1 AND min_stock>0 AND stock_qty<min_stock ORDER BY name');
  const mk = (S['costs.markup_bps'] || 0) / 10000;
  const body = html`<p class="intro">Aquí está el costo real de cada pieza: materiales (con su proveedor) + mano de obra + otros costos. Con el factor de precio (hoy ×${String(mk).replace('.', ',')} al detal) se calcula un precio sugerido. Cada pieza usa la misma foto del catálogo, así no hay que volver a subirla.</p>
${low.length ? html`<section class="card notice"><h2>Materiales por reponer</h2><ul class="mini">${low.map((m) => html`<li><a href="/admin/materiales/${m.id}">${m.name}</a>: quedan ${m.stock_qty} ${UNIT_TXT[m.unit] || m.unit} (mínimo ${m.min_stock})</li>`)}</ul></section>` : ''}
<form class="filters" method="get"><select name="col"><option value="">Todas las colecciones</option>${cols.map((x) => html`<option value="${x.slug}"${x.slug === col ? raw(' selected') : ''}>${x.name}</option>`)}</select><button class="btn ghost">Filtrar</button>
<a class="btn ghost" href="/admin/materiales">Materiales</a><a class="btn ghost" href="/admin/proveedores">Proveedores</a></form>
${rows.length ? html`<div class="plist">${rows.map((r) => { const price = r.offer_cents ?? r.price_cents; const m = r.prod_cost_cents && price ? Math.round(((price - r.prod_cost_cents) / price) * 100) : null;
    return html`<a class="pitem" href="/admin/costos/${r.id}"><span class="pimg">${r.img ? html`<img src="/media/${r.img}" alt="" loading="lazy">` : ''}</span>
  <span class="ptxt"><b>${r.name}</b><small>${r.col || 'Sin colección'} · ${r.sku}</small><span class="tags">${!r.nb ? badge('Sin receta', 'warn') : badge(`${r.nb} materiales`, 'muted')}${m != null ? badge(`Margen ${m} %`, m < 50 ? 'bad' : 'ok') : ''}</span></span>
  <span class="pprice"><small>Costo</small> ${r.prod_cost_cents != null ? money(r.prod_cost_cents) : '—'}<br><small>Precio</small> ${money(price)}</span></a>`; })}</div>` : empty('No hay piezas.')}`;
  return layout(c, { title: 'Costos por pieza', active: 'costs', body });
}

export async function recipe(c, pid) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db } = c;
  const p = await db.first('SELECT * FROM products WHERE id=?', [pid]);
  if (!p) throw new HttpError(404);
  const S = await db.settings();
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    const back = (k, m) => redirect(`/admin/costos/${pid}?${k}=${encodeURIComponent(m)}`, 303);
    try {
      if (f._action === 'add') {
        const mid = Number(f.material_id);
        const qty = Number(String(f.qty || '').replace(',', '.'));
        if (!(await db.first('SELECT 1 x FROM materials WHERE id=?', [mid]))) throw new FormError('Elige un material.');
        if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) throw new FormError('Escribe la cantidad que lleva la pieza.');
        const n = await db.n('SELECT COUNT(*) n FROM product_bom WHERE product_id=?', [pid]);
        await db.run('INSERT INTO product_bom(product_id,material_id,qty,note,sort) VALUES (?,?,?,?,?)', [pid, mid, qty, String(f.note || '').slice(0, 80), n]);
      } else if (f._action === 'lines') {
        for (const b of await db.all('SELECT id FROM product_bom WHERE product_id=?', [pid])) {
          if (f[`del_${b.id}`]) { await db.run('DELETE FROM product_bom WHERE id=? AND product_id=?', [b.id, pid]); continue; }
          const qty = Number(String(f[`qty_${b.id}`] ?? '').replace(',', '.'));
          if (Number.isFinite(qty) && qty > 0 && qty <= 100000) await db.run('UPDATE product_bom SET qty=? WHERE id=? AND product_id=?', [qty, b.id, pid]);
        }
      } else if (f._action === 'labor') {
        const fl = [{ k: 'labor_cents', label: 'Mano de obra', type: 'money' }, { k: 'extra_cost_cents', label: 'Otros costos', type: 'money' }, { k: 'markup_bps', label: 'Factor de precio propio', type: 'real', min: 1, maxv: 20 }];
        const v = Object.fromEntries(fl.map((x) => [x.k, parseField(x, f[x.k])]));
        await db.run('UPDATE products SET labor_cents=?, extra_cost_cents=?, markup_bps=? WHERE id=?', [v.labor_cents, v.extra_cost_cents, v.markup_bps === '' || v.markup_bps == null ? null : Math.round(v.markup_bps * 10000), pid]);
      } else if (f._action === 'apply' || f._action === 'apply_w') {
        const b = await costBreakdown(db, pid);
        if (!b.total) throw new FormError('Primero carga la receta o la mano de obra.');
        if (f._action === 'apply') {
          if (p.offer_cents != null && p.offer_cents >= b.suggested) throw new FormError('La pieza tiene una oferta mayor o igual al nuevo precio: quítala o ajústala en la ficha.');
          await db.run('UPDATE products SET price_cents=?, is_demo_price=0, updated_at=? WHERE id=?', [b.suggested, nowIso(), pid]);
        } else await db.run('UPDATE products SET wholesale_cents=?, updated_at=? WHERE id=?', [Math.min(b.suggestedWholesale, p.price_cents), nowIso(), pid]);
        await audit(db, c, f._action === 'apply' ? 'precio_sugerido' : 'precio_mayor_sugerido', 'products', pid, { from: f._action === 'apply' ? p.price_cents : p.wholesale_cents, to: f._action === 'apply' ? b.suggested : b.suggestedWholesale });
        await afterWrite(c);
      }
      await recomputeProductCost(db, pid, c.user.id, 'Cambio en la receta');
      await audit(db, c, 'receta', 'products', pid, { action: f._action });
      return back('msg', f._action.startsWith('apply') ? 'Precio actualizado.' : 'Guardado.');
    } catch (e) {
      if (e instanceof FormError) return back('err', e.message);
      throw e;
    }
  }
  const b = await costBreakdown(db, pid);
  const [img, mats, hist, sold] = await Promise.all([
    db.first("SELECT m.path FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=? ORDER BY (pm.role='main') DESC, pm.sort LIMIT 1", [pid]),
    db.all('SELECT m.id, m.name, m.unit, m.unit_cost_mc, s.name supplier FROM materials m LEFT JOIN suppliers s ON s.id=m.supplier_id WHERE m.active=1 ORDER BY m.category, m.name'),
    db.all('SELECT h.*, u.name uname FROM product_cost_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.product_id=? ORDER BY h.id DESC LIMIT 20', [pid]),
    db.n("SELECT COALESCE(SUM(l.qty),0) n FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE l.kind='product' AND l.ref_id=? AND o.status IN ('pagado','en_produccion','listo','listo_retiro','enviado','entregado')", [pid]),
  ]);
  const price = p.offer_cents ?? p.price_cents;
  const markupTxt = (b.markup / 10000).toLocaleString('es-VE', { maximumFractionDigits: 2 });
  const body = html`<div class="cost-head card"><div class="cost-photo">${img ? html`<img src="/media/${img.path}" alt="${p.name}">` : html`<em>Sin foto</em>`}</div>
<div><p class="muted">${p.sku} · vendidas: ${sold}</p><h2>${p.name}</h2>
<dl class="cost-sum"><div><dt>Materiales</dt><dd>${money(b.materials)}</dd></div><div><dt>Mano de obra</dt><dd>${money(b.labor)}</dd></div><div><dt>Otros</dt><dd>${money(b.extra)}</dd></div><div class="t"><dt>Costo total</dt><dd>${money(b.total)}</dd></div></dl>
<dl class="cost-sum"><div><dt>Precio actual</dt><dd>${money(price)}</dd></div><div><dt>Ganancia</dt><dd>${b.marginRetail != null ? money(b.marginRetail) : '—'}${b.marginPct != null ? html` <small>(${String(b.marginPct).replace('.', ',')} %)</small>` : ''}</dd></div>
<div><dt>Sugerido ×${markupTxt}</dt><dd>${money(b.suggested)}</dd></div><div><dt>Al mayor sugerido</dt><dd>${money(b.suggestedWholesale)}</dd></div></dl>
<div class="row-actions"><form method="post" data-confirm="¿Cambiar el precio detal a ${money(b.suggested)}? Los pedidos ya creados no cambian.">${csrf(c)}<input type="hidden" name="_action" value="apply"><button class="btn sm"${b.total ? '' : raw(' disabled')}>Usar precio sugerido</button></form>
<form method="post" data-confirm="¿Cambiar el precio al mayor a ${money(Math.min(b.suggestedWholesale, p.price_cents))}?">${csrf(c)}<input type="hidden" name="_action" value="apply_w"><button class="btn sm ghost"${b.total ? '' : raw(' disabled')}>Usar precio al mayor sugerido</button></form>
<a class="btn sm ghost" href="/admin/piezas/${pid}">Ficha de la pieza</a></div></div></div>
<section class="card"><h2>Receta de materiales</h2>
${b.lines.length ? html`<form method="post">${csrf(c)}<input type="hidden" name="_action" value="lines"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Material</th><th>Proveedor</th><th>Cantidad</th><th>Costo por unidad</th><th>Total</th><th>Quitar</th></tr></thead><tbody>
${b.lines.map((l) => html`<tr><td><a href="/admin/materiales/${l.material_id}">${l.name}</a>${l.note ? html`<br><small class="muted">${l.note}</small>` : ''}</td><td>${l.supplier || '—'}</td><td><input name="qty_${l.id}" value="${String(l.qty).replace('.', ',')}" inputmode="decimal" class="sm" aria-label="Cantidad"> ${UNIT_TXT[l.unit] || l.unit}</td><td>${fmtMc(l.unit_cost_mc)}</td><td>${money(mcToCents(l.total_mc))}</td><td><input type="checkbox" name="del_${l.id}" value="1" aria-label="Quitar ${l.name}"></td></tr>`)}
</tbody><tfoot><tr><td colspan="4"><b>Materiales</b></td><td><b>${money(b.materials)}</b></td><td></td></tr></tfoot></table></div><div class="bar"><button class="btn sm">Guardar cantidades</button></div></form>` : html`<p class="muted">Todavía no tiene receta. Agrega los materiales que lleva una pieza.</p>`}
<form method="post" class="addrow">${csrf(c)}<input type="hidden" name="_action" value="add">
<select name="material_id" aria-label="Material" required><option value="">Elige un material</option>${mats.map((m) => html`<option value="${m.id}">${m.name}${m.supplier ? ` · ${m.supplier}` : ''} · ${fmtMc(m.unit_cost_mc)}/${UNIT_TXT[m.unit] || m.unit}</option>`)}</select>
<input name="qty" inputmode="decimal" placeholder="Cantidad" required class="sm" aria-label="Cantidad"><input name="note" placeholder="Nota (opcional)" maxlength="80"><button class="btn sm">Agregar</button></form>
<p class="help">¿Falta un material? <a href="/admin/materiales/nuevo">Créalo aquí</a> con el precio del paquete y las unidades que trae.</p></section>
<form method="post" class="card form">${csrf(c)}<input type="hidden" name="_action" value="labor"><h2>Mano de obra y precio</h2><div class="grid">
${field({ k: 'labor_cents', label: 'Mano de obra por pieza', type: 'money', help: `Valor inicial: ${money(S['costs.labor_default_cents'] || 0)}` }, p.labor_cents)}
${field({ k: 'extra_cost_cents', label: 'Otros costos (empaque, tarjeta…)', type: 'money' }, p.extra_cost_cents)}
${field({ k: 'markup_bps', label: 'Factor de precio de esta pieza', type: 'real', help: `Vacío = el general (×${(Number(S['costs.markup_bps'] || 0) / 10000).toLocaleString('es-VE')}). Ej.: 4 = el precio es 4 veces el costo.` }, p.markup_bps != null ? p.markup_bps / 10000 : '')}
</div><div class="bar"><button class="btn sm">Guardar</button></div></form>
<section class="card"><h2>Historial de costo y precio</h2>${hist.length ? html`<table class="tbl small"><thead><tr><th>Fecha</th><th>Costo</th><th>Precio</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>${hist.map((h) => html`<tr><td>${fmt.date(h.created_at)}</td><td>${money(h.prod_cost_cents)}</td><td>${money(h.price_cents)}</td><td>${JSON.parse(h.detail || '{}').note || ''}</td><td>${h.uname || '—'}</td></tr>`)}</tbody></table>` : html`<p class="muted">Sin cambios todavía.</p>`}
<p class="help">Cada pedido guarda el costo de producción del momento en que se creó: los reportes de ganancia usan ese valor aunque después cambien los materiales.</p></section>`;
  return layout(c, { title: `Costos · ${p.name}`, active: 'costs', body, actions: html`<a class="btn ghost" href="/admin/costos">← Costos</a>` });
}

// Debajo de la ficha de cada material: compras (suman existencia) y movimientos
export async function materialExtra(c, id) {
  const moves = await c.db.all('SELECT mv.*, o.code, u.name uname FROM material_moves mv LEFT JOIN orders o ON o.id=mv.order_id LEFT JOIN users u ON u.id=mv.user_id WHERE mv.material_id=? ORDER BY mv.id DESC LIMIT 50', [id]);
  const used = await c.db.all('SELECT p.id, p.name, b.qty FROM product_bom b JOIN products p ON p.id=b.product_id WHERE b.material_id=? ORDER BY p.name', [id]);
  return html`<section class="card"><h2>Registrar una compra</h2><form method="post" action="/admin/materiales/${id}/compra" class="addrow">${csrf(c)}
<input name="qty" inputmode="decimal" placeholder="Unidades compradas" required aria-label="Unidades"><input name="total" inputmode="decimal" placeholder="Total pagado USD (opcional)" aria-label="Total pagado"><input name="note" placeholder="Nota" maxlength="80"><button class="btn sm">Sumar a la existencia</button></form>
<p class="help">Si escribes el total pagado, el costo por unidad se actualiza con esa compra y se recalculan las piezas.</p></section>
${used.length ? html`<section class="card"><h2>Lo usan estas piezas</h2><ul class="mini">${used.map((u) => html`<li><a href="/admin/costos/${u.id}">${u.name}</a> · ${u.qty}</li>`)}</ul></section>` : ''}
<section class="card"><h2>Movimientos</h2>${moves.length ? html`<table class="tbl small"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Detalle</th></tr></thead><tbody>${moves.map((m) => html`<tr><td>${fmt.date(m.created_at)}</td><td>${m.kind}</td><td>${m.qty > 0 ? '+' : ''}${Math.round(m.qty * 1000) / 1000}</td><td>${m.code ? html`Pedido ${m.code}` : m.note}${m.uname ? ` · ${m.uname}` : ''}</td></tr>`)}</tbody></table>` : html`<p class="muted">Sin movimientos.</p>`}</section>`;
}

export async function materialPurchase(c, id) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const m = await c.db.first('SELECT m.*, s.shipping_bps FROM materials m LEFT JOIN suppliers s ON s.id=m.supplier_id WHERE m.id=?', [id]);
  if (!m) throw new HttpError(404);
  const f = await readForm(c.req);
  const qty = Number(String(f.qty || '').replace(',', '.'));
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10000000) return redirect(`/admin/materiales/${id}?err=${encodeURIComponent('Escribe cuántas unidades compraste.')}`, 303);
  let total = null;
  if (String(f.total || '').trim()) {
    const v = Number(String(f.total).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 1000000) return redirect(`/admin/materiales/${id}?err=${encodeURIComponent('Revisa el total pagado.')}`, 303);
    total = Math.round(v * 100);
  }
  const t = nowIso();
  const unit = total != null ? unitCostMc(total, qty, m.shipping_bps || 0) : m.unit_cost_mc;
  const stmts = [["INSERT INTO material_moves(material_id,qty,kind,unit_cost_mc,note,user_id,created_at) VALUES (?,?,'compra',?,?,?,?)", [id, qty, unit, String(f.note || '').slice(0, 80) || 'Compra', c.user.id, t]],
    ['UPDATE materials SET stock_qty=stock_qty+?, updated_at=? WHERE id=?', [qty, t, id]]];
  if (total != null) stmts.push(['UPDATE materials SET pack_cost_cents=?, pack_qty=?, unit_cost_mc=? WHERE id=?', [total, qty, unit, id]]);
  await c.db.batch(stmts);
  if (total != null) { const { recomputeByMaterial } = await import('../lib/costs.js'); await recomputeByMaterial(c.db, id, c.user.id); }
  await audit(c.db, c, 'compra_material', 'materials', id, { qty, total });
  return redirect(`/admin/materiales/${id}?msg=${encodeURIComponent('Compra registrada.')}`, 303);
}
