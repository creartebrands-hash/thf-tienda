// Inicio del panel, ajustes, SEO, usuarios, auditoría y solicitudes.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import { money } from '../lib/pricing.js';
import { audit, hashPassword, passwordProblem, randomToken } from '../lib/security.js';
import { storageMode } from '../lib/storage.js';
import { HttpError, readForm, redirect } from '../http.js';
import { changePassword } from './auth.js';
import { isPiecePhoto } from './products.js';
import { DEFAULT_STONE_STYLE, DEFAULT_STYLE } from '../lib/prompts.js';
import { afterWrite, mediaMap, needReauth } from './common.js';
import { STATUS } from './orders.js';
import { FormError, badge, csrf, empty, field, fmt, layout, parseField } from './ui.js';

// ---------------------------------------------------------------- inicio
export async function dashboard(c) {
  const { db } = c;
  const S = await db.settings();
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [open, month, sales, reqs, demo, prov, noHover, noPayInfo, digNoFile, recent] = await Promise.all([
    db.n("SELECT COUNT(*) n FROM orders WHERE status IN ('creado','confirmado_por_whatsapp','pago_reportado','anticipo_recibido','pagado','en_produccion','listo','listo_retiro','enviado')"),
    db.n('SELECT COUNT(*) n FROM orders WHERE created_at>=?', [since]),
    db.n("SELECT COALESCE(SUM(total_cents),0) n FROM orders WHERE created_at>=? AND status IN ('pagado','en_produccion','listo','enviado','entregado')", [since]),
    db.n("SELECT COUNT(*) n FROM requests WHERE status='nueva'"),
    db.n("SELECT COUNT(*) n FROM products WHERE is_demo_price=1 AND status='published'"),
    db.n("SELECT COUNT(*) n FROM products WHERE provisional_name=1 AND status='published'"),
    db.n("SELECT COUNT(*) n FROM products p WHERE status='published' AND in_catalog=1 AND NOT EXISTS (SELECT 1 FROM product_media m WHERE m.product_id=p.id AND m.role='hover')"),
    db.n("SELECT COUNT(*) n FROM payment_methods WHERE active=1 AND kind NOT IN ('efectivo','tienda','otro') AND (instructions='' OR instructions LIKE 'Datos de la cuenta: por cargar%') AND (details IS NULL OR details='{}' OR details LIKE '%\"\"%')"),
    db.n("SELECT COUNT(*) n FROM digital_products WHERE status='published' AND file_path IS NULL"),
    db.all('SELECT id, code, status, customer_name, total_cents, created_at FROM orders ORDER BY id DESC LIMIT 6'),
  ]);
  const hoverLike = (await db.all(`SELECT m.path FROM products p JOIN product_media pm ON pm.product_id=p.id AND pm.role='hover' JOIN media m ON m.id=pm.media_id
    WHERE p.status='published' AND p.in_catalog=1`)).filter((r) => !isPiecePhoto(r.path)).length;
  const [payq, lowStock, payable, nextCamp] = await Promise.all([
    db.n("SELECT COUNT(*) n FROM payments WHERE status='reportado'"),
    db.n('SELECT COUNT(*) n FROM materials WHERE active=1 AND min_stock>0 AND stock_qty<min_stock'),
    db.n("SELECT COUNT(*) n FROM (SELECT partner_id, SUM(amount_cents) s FROM ledger_entries GROUP BY partner_id) x WHERE x.s>=?", [Number(S['programs.payout_min_usd'] || 0) * 100]),
    db.first("SELECT name, starts_at, active FROM campaigns WHERE ends_at>? ORDER BY starts_at LIMIT 1", [new Date().toISOString()]),
  ]);
  const rate = await db.first('SELECT set_at FROM exchange_rates ORDER BY id DESC LIMIT 1');
  const rateOld = S['checkout.mode'] !== 'whatsapp' && (!rate || Date.now() - Date.parse(rate.set_at) > Number(S['payments.rate_max_age_hours'] || 30) * 3600e3);
  const noPmData = S['checkout.mode'] !== 'whatsapp' ? await db.n("SELECT COUNT(*) n FROM payment_methods WHERE active=1 AND kind IN ('pago_movil','transferencia','zelle','binance','paypal') AND (details='{}' OR details LIKE '%\"\"%')") : 0;
  const todo = [
    [payq > 0, `${payq} pago(s) por verificar.`, '/admin/pagos-recibidos'],
    [rateOld, 'La tasa del BCV está vencida: los montos en bolívares no se muestran.', '/admin/ajustes#tasa'],
    [noPmData > 0, `${noPmData} método(s) de pago sin los datos que ve la clienta al pagar.`, '/admin/pagos'],
    [lowStock > 0, `${lowStock} material(es) por debajo del mínimo.`, '/admin/costos'],
    [payable > 0, `${payable} afiliada(s) con comisiones listas para pagar.`, '/admin/comisiones'],
    [nextCamp && !nextCamp.active && Date.parse(nextCamp.starts_at) - Date.now() < 21 * 86400e3, `La temporada "${nextCamp?.name}" empieza pronto y está apagada.`, '/admin/temporadas'],
    [String(S['contact.whatsapp_display'] || '').endsWith('000 0000'), 'El WhatsApp oficial todavía es de ejemplo.', '/admin/ajustes#contacto'],
    [noPayInfo > 0 && !noPmData, `${noPayInfo} método(s) de pago sin datos de cuenta.`, '/admin/pagos'],
    [demo > 0, `${demo} pieza(s) con precio de ejemplo.`, '/admin/piezas?estado=demo'],
    [prov > 0, `${prov} pieza(s) con nombre provisional.`, '/admin/piezas?estado=provisional'],
    [noHover > 0, `${noHover} pieza(s) sin foto "al pasar el cursor".`, '/admin/piezas?estado=sinhover'],
    [hoverLike > 0, `${hoverLike} pieza(s) muestran la foto del lugar al pasar el cursor porque no hay segunda foto de la pieza. Cada ficha trae su prompt para crearla.`, '/admin/piezas?col=alisios-de-margarita'],
    [digNoFile > 0, `${digNoFile} guía(s) publicada(s) sin archivo (se muestran como "muy pronto").`, '/admin/biblioteca'],
    [storageMode(c.env) === 'd1', 'Las fotos se guardan en D1. Conecta Cloudflare KV (gratis) para subir videos y fotos grandes.', '/admin/medios'],
  ].filter((x) => x[0]);
  const body = html`<div class="kpis">
  <a class="kpi" href="/admin/pedidos?estado=abiertos"><small>Pedidos abiertos</small><b>${open}</b></a>
  <div class="kpi"><small>Pedidos · 30 días</small><b>${month}</b></div>
  <div class="kpi"><small>Pagado · 30 días</small><b>${money(sales)}</b></div>
  <a class="kpi" href="/admin/pagos-recibidos"><small>Pagos por verificar</small><b>${payq}</b></a>
  <a class="kpi" href="/admin/solicitudes"><small>Solicitudes nuevas</small><b>${reqs}</b></a></div>
<div class="cols">
<section class="card"><h2>Pendientes</h2>${todo.length ? html`<ul class="todo">${todo.map(([, t, href]) => html`<li><a href="${href}">${t}</a></li>`)}</ul>` : html`<p>Todo en orden.</p>`}</section>
<section class="card"><h2>Últimos pedidos</h2>${recent.length ? html`<ul class="mini">${recent.map((o) => html`<li><a href="/admin/pedidos/${o.id}">${o.code}</a> · ${o.customer_name} · ${money(o.total_cents)} ${badge(STATUS[o.status]?.[0] || o.status, STATUS[o.status]?.[1])}</li>`)}</ul>` : html`<p class="muted">Aún no hay pedidos.</p>`}</section>
</div>
<section class="card"><h2>Atajos</h2><div class="quick"><a class="btn ghost" href="/admin/piezas/nuevo">Nueva pieza</a><a class="btn ghost" href="/admin/medios">Subir fotos</a><a class="btn ghost" href="/admin/colecciones/nuevo">Nueva colección</a><a class="btn ghost" href="/admin/looks/nuevo">Nuevo look</a><a class="btn ghost" href="/admin/envios">Precios de envío</a><a class="btn ghost" href="/admin/biblioteca/nuevo">Nueva guía o ebook</a></div></section>`;
  return layout(c, { title: `Hola, ${c.user.name.split(' ')[0]}`, active: 'home', body });
}

// ---------------------------------------------------------------- ajustes
const GROUPS = [
  ['marca', 'Marca', [
    { k: 'brand.name', label: 'Nombre', req: true, max: 40 }, { k: 'brand.descriptor', label: 'Descriptor', type: 'select', options: [['Accesorios', 'Accesorios'], ['Joyería', 'Joyería']] },
    { k: 'brand.tagline', label: 'Frase de la marca', wide: true, max: 140 }, { k: 'brand.about', label: 'Quiénes somos (para Google y asistentes de IA)', type: 'textarea', rows: 3, wide: true, max: 600 },
    { k: 'footer.credit_text', label: 'Crédito en el pie de página', max: 60, ph: 'Creado por Theo Ideas', help: 'Vacío = no se muestra.' },
    { k: 'footer.credit_url', label: 'Enlace del crédito', type: 'url', max: 300, ph: 'https://…', help: 'La página de la agencia. Debe empezar con https://' },
  ]],
  ['contacto', 'Contacto', [
    { k: 'contact.whatsapp_display', label: 'WhatsApp tal como se muestra', ro: true, help: 'Se cambia con el botón "Cambiar WhatsApp oficial".' },
    { k: 'contact.instagram', label: 'Instagram', ph: '@thfjoyeria', max: 60 }, { k: 'contact.email', label: 'Correo', type: 'email' },
  ]],
  ['pedidos', 'Pedidos', [
    { k: 'orders.wholesale_min_pieces', label: 'Piezas sueltas para precio al mayor', type: 'int', min: 1, maxv: 500, req: true },
    { k: 'orders.lead_time_text', label: 'Tiempo de elaboración (texto)', req: true, max: 60 },
    { k: 'orders.expire_hours', label: 'Horas para expirar un pedido sin confirmar', type: 'int', min: 1, maxv: 720 },
  ]],
  ['descargas', 'Descargas de guías y ebooks', [
    { k: 'downloads.free_hours', label: 'Guías gratis: horas que dura el enlace', type: 'int', min: 1, maxv: 2160, req: true, help: 'Ej.: 48 = dos días. Cada descarga gratis crea un enlace personal.' },
    { k: 'downloads.free_max', label: 'Guías gratis: descargas por enlace', type: 'int', min: 1, maxv: 100, req: true },
    { k: 'downloads.paid_days', label: 'Ebooks pagados: días que dura el enlace', type: 'int', min: 1, maxv: 365, req: true, help: 'Se crea al marcar el pedido como pagado.' },
    { k: 'downloads.paid_max', label: 'Ebooks pagados: descargas por enlace', type: 'int', min: 1, maxv: 100, req: true },
  ]],
  ['tienda', 'Editor de la tienda', [
    { k: 'store.announcement', label: 'Barra de aviso superior (vacío = la frase de la marca)', max: 140, wide: true, ph: 'Hecho a mano bajo pedido · Cadenas con baño de oro 18k · Envíos a toda Venezuela' },
    { k: 'store.announcement_link', label: 'Enlace de la barra (opcional)', type: 'link', wide: true, help: 'Una página de la tienda (/catalogo) o un enlace https://' },
    { k: 'theme.burdeos', label: 'Color burdeos', type: 'color', def: '#3D1011' }, { k: 'theme.marino', label: 'Color marino', type: 'color', def: '#192543' },
    { k: 'theme.oliva', label: 'Color oliva', type: 'color', def: '#262818' }, { k: 'theme.beige', label: 'Color beige', type: 'color', def: '#E7D6C3' },
    { k: 'theme.arena', label: 'Color de fondo (arena)', type: 'color', def: '#F3EBE1' }, { k: 'theme.oro', label: 'Oro de filetes y bordes', type: 'color', def: '#B8912F' },
  ]],
  ['cierre', 'Cierre del pedido y datos de la clienta', [
    { k: 'checkout.mode', label: 'Cómo se cierra el pedido', type: 'select', wide: true, options: [['whatsapp', 'Solo por WhatsApp (como al empezar)'], ['mixto', 'WhatsApp o pago en la web (Pago Móvil, "Ya pagué")'], ['web', 'Solo pago en la web']],
      help: 'El WhatsApp oficial sigue siendo el canal de atención en todos los modos.' },
    { k: 'checkout.require_doc', label: 'Pedir cédula o RIF', type: 'bool' }, { k: 'checkout.require_email', label: 'Pedir correo', type: 'bool' },
    { k: 'checkout.terms_text', label: 'Texto que acepta la clienta', wide: true, max: 300 },
  ]],
  ['pagos', 'Pagos y tasa del BCV', [
    { k: 'payments.rate_mode', label: 'Tasa del BCV', type: 'select', options: [['manual', 'La escribo yo'], ['auto', 'Automática (se consulta sola cada 6 horas)']] },
    { k: 'payments.rate_max_age_hours', label: 'Horas que vale una tasa', type: 'int', min: 1, maxv: 240, req: true, help: 'Después no se muestran montos en Bs hasta actualizarla.' },
    { k: 'payments.rate_lock_hours', label: 'Horas que se respeta la tasa de un pedido', type: 'int', min: 1, maxv: 168, req: true },
    { k: 'payments.review_text', label: 'Mensaje mientras se verifica un pago', type: 'textarea', rows: 2, wide: true, max: 300 },
    { k: 'payments.auto_verify', label: 'Verificación automática de pagos (requiere contratar el servicio del banco o de un verificador)', type: 'bool', wide: true },
  ]],
  ['programas', 'Programas: embajadoras y aliadas', [
    { k: 'programs.a.commission_mode', label: 'Comisión general de embajadoras', type: 'select', options: [['pct', 'Porcentaje de la venta'], ['monto', 'Monto fijo'], ['pct_monto', 'Porcentaje + monto fijo']] },
    { k: 'programs.a.commission_pct', label: 'Porcentaje (%)', type: 'int', min: 0, maxv: 60, req: true },
    { k: 'programs.a.commission_fixed_cents', label: 'Monto fijo (USD)', type: 'money', help: 'Ej.: 2,00' },
    { k: 'programs.a.fixed_per', label: 'El monto fijo es por', type: 'select', options: [['pedido', 'Pedido'], ['pieza', 'Pieza']] },
    { k: 'programs.a.commission_on_wholesale', label: 'Los pedidos al mayor también generan comisión', type: 'bool', wide: true },
    { k: 'programs.a.client_discount_bps', label: 'Descuento para quien use un código', type: 'pct', min: 0, maxv: 50, help: '0 = sin descuento. No se suma a cupones.' },
    { k: 'programs.attribution_days', label: 'Días que dura el enlace de una afiliada', type: 'int', min: 1, maxv: 365, req: true },
    { k: 'programs.hold_days', label: 'Días de espera antes de pagar una comisión', type: 'int', min: 0, maxv: 120, req: true, help: 'Por cambios o devoluciones.' },
    { k: 'programs.payout_min_usd', label: 'Mínimo para pagar comisiones (USD)', type: 'int', min: 0, maxv: 100000, req: true },
  ]],
  ['costos', 'Costos (interno)', [
    { k: 'costs.markup_bps', label: 'Factor de precio al detal', type: 'factor', min: 1, maxv: 20, req: true, help: 'Ej.: 4 = el precio sugerido es 4 veces el costo.' },
    { k: 'costs.wholesale_markup_bps', label: 'Factor de precio al mayor', type: 'factor', min: 1, maxv: 20, req: true, help: 'Ej.: 2,5.' },
    { k: 'costs.labor_default_cents', label: 'Mano de obra por pieza (USD)', type: 'money', req: true },
    { k: 'costs.round_cents', label: 'Redondear precios sugeridos a (USD)', type: 'money', req: true, help: '0,10 = a 10 centavos; 0,50 = a medio dólar; 1,00 = al dólar.' },
  ]],
  ['analitica', 'Analítica', [
    { k: 'analytics.enabled', label: 'Medir visitas (sin cookies de terceros)', type: 'bool' }, { k: 'analytics.retention_days', label: 'Días que se guardan las visitas', type: 'int', min: 30, maxv: 1500, req: true },
  ]],
  ['chat', 'Chat de WhatsApp', [
    { k: 'chat.greeting', label: 'Saludo del chat', type: 'textarea', rows: 3, wide: true, max: 300, req: true },
    { k: 'chat.status', label: 'Línea bajo el nombre', max: 60, ph: 'WhatsApp oficial · pedidos y pagos' },
    { k: 'chat.quick_replies', label: 'Respuestas rápidas (una por línea, máximo 6)', type: 'textarea', rows: 6, wide: true, max: 600,
      help: 'Al tocarlas se abre WhatsApp con ese mensaje escrito. El número siempre es el WhatsApp oficial de los ajustes.' },
  ]],
  ['ubicacion', 'Ubicación y zonas (SEO local)', [
    { k: 'local.locality', label: 'Localidad', req: true, max: 60, ph: 'Isla de Margarita', help: 'Ciudad o isla donde está el taller. Ej.: Pampatar o Isla de Margarita.' },
    { k: 'local.region', label: 'Estado', req: true, max: 40, ph: 'Nueva Esparta' },
    { k: 'local.street', label: 'Dirección (opcional)', max: 140, help: 'Déjala vacía si no atiendes público en un local: Google la mostraría en el mapa.' },
    { k: 'local.postal_code', label: 'Código postal (opcional)', max: 10 },
    { k: 'local.lat', label: 'Latitud (opcional)', type: 'real', min: -90, maxv: 90, help: 'Del pin de Google Maps. Solo si tienes local o punto de retiro fijo.' },
    { k: 'local.lon', label: 'Longitud (opcional)', type: 'real', min: -180, maxv: 180 },
    { k: 'local.hours', label: 'Horario de atención (opcional)', max: 120, ph: 'Lunes a sábado, 9:00 a 18:00 por WhatsApp' },
    { k: 'local.maps_url', label: 'Enlace a tu perfil de Google Maps (opcional)', type: 'url', max: 300 },
    { k: 'local.island_areas', label: 'Zonas de la isla donde entregas (una por línea)', type: 'textarea', rows: 6, wide: true, max: 1200 },
    { k: 'local.region_areas', label: 'Ciudades del oriente (una por línea)', type: 'textarea', rows: 4, wide: true, max: 800 },
    { k: 'local.national_cities', label: 'Ciudades del país a destacar (una por línea)', type: 'textarea', rows: 5, wide: true, max: 1200,
      help: 'Aparecen en la página de envíos, en los datos para Google y en el resumen para asistentes de IA.' },
  ]],
  ['fotos-ia', 'Fotos con IA', [
    { k: 'media.prompt_style', label: 'Estilo común para la segunda foto de cada pieza', type: 'textarea', rows: 4, wide: true, max: 1200, ph: DEFAULT_STYLE,
      help: 'Se agrega al final del prompt que aparece en la ficha de cada pieza. Déjalo vacío para usar el estilo por defecto.' },
    { k: 'media.prompt_stone_style', label: 'Estilo para fotos de piedras (cuadro pequeño)', type: 'textarea', rows: 3, wide: true, max: 1200, ph: DEFAULT_STONE_STYLE,
      help: 'Escribe [PIEDRA] donde va el nombre de la piedra.' },
  ]],
];

export async function settings(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db } = c;
  const S = await db.settings();
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    try {
      if (f._action === 'rate') return saveRate(c, f);
      const changes = [];
      for (const [, , fields] of GROUPS) for (const fl of fields) {
        if (fl.ro) continue;
        let v = parseField(fl, f[fl.k]);
        if (fl.type === 'int' && v == null) v = S[fl.k];
        if (JSON.stringify(v ?? '') !== JSON.stringify(S[fl.k] ?? '')) changes.push([fl.k, v]);
      }
      if (f['sim_examples'] != null) {
        let sim;
        try { sim = JSON.parse(f.sim_examples); } catch { throw new FormError('Los ejemplos del simulador no tienen un formato válido.'); }
        if (!Array.isArray(sim) || sim.length > 6 || sim.some((x) => !x || typeof x.name !== 'string' || ![x.cost, x.sug, x.min, x.max].every(Number.isInteger) || x.min > x.sug || x.sug > x.max))
          throw new FormError('Revisa los ejemplos del simulador: nombre, costo, sugerido, mínimo y máximo en centavos.');
        if (JSON.stringify(sim) !== JSON.stringify(S['programs.b.sim_examples'])) changes.push(['programs.b.sim_examples', sim]);
      }
      for (const [k, v] of changes) await db.setSetting(k, v, c.user.id, String(f.reason || '').slice(0, 200));
      if (changes.length) {
        await audit(db, c, 'ajustes', 'settings', null, Object.fromEntries(changes));
        await afterWrite(c);
      }
      return redirect('/admin/ajustes?msg=' + encodeURIComponent(changes.length ? `${changes.length} ajuste(s) guardado(s).` : 'Sin cambios.'), 303);
    } catch (e) {
      if (e instanceof FormError) err = e.message;
      else throw e;
    }
  }
  const rate = await db.first('SELECT * FROM exchange_rates ORDER BY id DESC LIMIT 1');
  const revs = await db.all('SELECT r.*, u.name uname FROM setting_revisions r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 12');
  const body = html`${err ? html`<p class="flash bad">${err}</p>` : ''}
<form method="post" class="form" data-dirty>${csrf(c)}
${GROUPS.map(([id, t, fields]) => html`<fieldset class="card" id="${id}"><legend>${t}</legend><div class="grid">${fields.map((fl) => field(fl, S[fl.k]))}</div>
${id === 'contacto' ? html`<p><a class="btn sm ghost" href="/admin/ajustes/whatsapp">Cambiar WhatsApp oficial</a> <small class="muted">Pide confirmar tu identidad. Es el único número de pedidos y pagos.</small></p>` : ''}
${id === 'programas' ? html`<div class="fld wide"><label for="sim">Ejemplos del simulador de Aliadas (JSON, montos en centavos)</label><textarea id="sim" name="sim_examples" rows="5" class="mono">${JSON.stringify(S['programs.b.sim_examples'] || [], null, 1)}</textarea><small class="help">Son números de muestra. Nunca pongas aquí los costos reales.</small></div>` : ''}</fieldset>`)}
<div class="card"><label class="fld wide">Motivo del cambio (queda en el historial)<input name="reason" maxlength="200"></label></div>
<div class="bar sticky"><button class="btn">Guardar ajustes</button></div></form>
<section class="card" id="tasa"><h2>Tasa del BCV</h2><p class="help">El precio real es en USD. Con la tasa se calcula el monto exacto en bolívares para Pago Móvil y transferencias. ${rate ? html`Actual: <b>${(rate.bs_per_usd_milli / 1000).toLocaleString('es-VE')}</b> Bs por USD (${fmt.date(rate.set_at)} · ${rate.source}).` : 'Todavía no hay tasa.'}</p>
<form method="post" action="/admin/ajustes/tasa-bcv" class="inline">${csrf(c)}<button class="btn sm ghost">Consultar la tasa oficial ahora</button></form>
<form method="post" class="addrow">${csrf(c)}<input type="hidden" name="_action" value="rate"><input name="rate" inputmode="decimal" placeholder="Bs por USD" required><label class="chk"><input type="checkbox" name="confirm" value="1"> Confirmo un cambio mayor al 10 %</label><button class="btn sm">Guardar tasa</button></form>
<label class="chk"><a href="/admin/ajustes/bs">${S['currency.show_bs'] ? 'Ocultar' : 'Mostrar'} montos en Bs en la tienda</a></label></section>
<section class="card"><h2>Historial de cambios</h2><ul class="mini">${revs.map((r) => html`<li><code>${r.key}</code> · ${fmt.date(r.at)}${r.uname ? ` · ${r.uname}` : ''}${r.reason ? html` · <i>${r.reason}</i>` : ''}</li>`)}</ul></section>`;
  return layout(c, { title: 'Ajustes', active: 'settings', body });
}

async function saveRate(c, f) {
  const v = Number(String(f.rate || '').replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0 || v > 1e7) return redirect('/admin/ajustes?err=' + encodeURIComponent('Escribe una tasa válida.') + '#tasa', 303);
  const prev = await c.db.first('SELECT bs_per_usd_milli FROM exchange_rates ORDER BY id DESC LIMIT 1');
  const milli = Math.round(v * 1000);
  if (prev && Math.abs(milli - prev.bs_per_usd_milli) / prev.bs_per_usd_milli > 0.1 && !f.confirm)
    return redirect('/admin/ajustes?err=' + encodeURIComponent('La tasa cambia más de 10 %. Marca la confirmación si es correcto.') + '#tasa', 303);
  await c.db.run('INSERT INTO exchange_rates(bs_per_usd_milli,set_at,user_id) VALUES (?,?,?)', [milli, nowIso(), c.user.id]);
  await audit(c.db, c, 'tasa', 'exchange_rates', null, { bs: v });
  await afterWrite(c);
  return redirect('/admin/ajustes?msg=' + encodeURIComponent('Tasa guardada.') + '#tasa', 303);
}

export async function fetchRate(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { refreshRateIfStale } = await import('../lib/rates.js');
  const r = await refreshRateIfStale(c.db, { force: true });
  await audit(c.db, c, 'tasa_consultada', 'exchange_rates', null, r);
  await afterWrite(c);
  if (r?.error) return redirect('/admin/ajustes?err=' + encodeURIComponent(r.error) + '#tasa', 303);
  return redirect('/admin/ajustes?msg=' + encodeURIComponent(`Tasa del BCV: ${(r.milli / 1000).toLocaleString('es-VE')} Bs por USD.`) + '#tasa', 303);
}

export async function toggleBs(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  if (c.req.method === 'POST') {
    await readForm(c.req);
    const cur = !!(await c.db.setting('currency.show_bs', false));
    await c.db.setSetting('currency.show_bs', !cur, c.user.id, 'Mostrar/ocultar Bs');
    await afterWrite(c);
    return redirect('/admin/ajustes?msg=' + encodeURIComponent('Listo.') + '#tasa', 303);
  }
  return layout(c, { title: 'Montos en bolívares', active: 'settings', body: html`<form method="post" class="card stack">${csrf(c)}<p>¿Cambiar la visibilidad de los montos en Bs en la tienda?</p><button class="btn">Confirmar</button></form>` });
}

export async function whatsapp(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const r = needReauth(c);
  if (r) return r;
  const S = await c.db.settings();
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    const num = String(f.number || '').replace(/\D/g, '');
    const disp = String(f.display || '').trim().slice(0, 30);
    if (!/^58\d{10}$/.test(num)) err = 'Escribe el número con código de país, por ejemplo 584141234567.';
    else if (num !== String(f.number2 || '').replace(/\D/g, '')) err = 'Los números no coinciden.';
    else {
      await c.db.setSetting('contact.whatsapp', num, c.user.id, 'Cambio de WhatsApp oficial');
      await c.db.setSetting('contact.whatsapp_display', disp || `+${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5, 8)} ${num.slice(8)}`, c.user.id, 'Cambio de WhatsApp oficial');
      await audit(c.db, c, 'whatsapp_oficial', 'settings', 'contact.whatsapp', { from: S['contact.whatsapp'], to: num });
      await afterWrite(c);
      return redirect('/admin/ajustes?msg=' + encodeURIComponent('WhatsApp oficial actualizado.') + '#contacto', 303);
    }
  }
  const body = html`${err ? html`<p class="flash bad">${err}</p>` : ''}<form method="post" class="card stack narrow">${csrf(c)}
<p>Actual: <b>${S['contact.whatsapp_display']}</b>. Todos los pedidos y pagos de la tienda irán a este número. Ninguna otra persona puede cambiarlo desde la web.</p>
<label>Número con código de país (solo dígitos)<input name="number" inputmode="tel" required placeholder="584141234567"></label>
<label>Repite el número<input name="number2" inputmode="tel" required></label>
<label>Cómo se muestra (opcional)<input name="display" placeholder="+58 414 123 4567"></label><button class="btn">Cambiar</button></form>`;
  return layout(c, { title: 'WhatsApp oficial', active: 'settings', body, actions: html`<a class="btn ghost" href="/admin/ajustes">← Ajustes</a>` });
}

// ---------------------------------------------------------------- SEO e IA
export async function seoPage(c) {
  const { db } = c;
  const S = await db.settings();
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    const pages = await db.all('SELECT slug FROM pages');
    const stmts = pages.map((p) => ['UPDATE pages SET seo_title=?, seo_desc=?, updated_at=? WHERE slug=?', [String(f[`t_${p.slug}`] || '').slice(0, 70), String(f[`d_${p.slug}`] || '').slice(0, 200), nowIso(), p.slug]]);
    await db.batch(stmts);
    if (c.user.role === 'ADMIN') {
      await db.setSetting('seo.allow_ai_crawlers', f.allow_ai === '1', c.user.id, 'SEO');
      await db.setSetting('seo.google_verification', String(f.gv || '').replace(/[^\w\-]/g, '').slice(0, 80), c.user.id, 'SEO');
      await db.setSetting('seo.bing_verification', String(f.bv || '').replace(/[^\w\-]/g, '').slice(0, 80), c.user.id, 'SEO');
      if (/^\d+$/.test(f.og || '')) {
        const m = await db.first("SELECT path FROM media WHERE id=? AND kind='image'", [Number(f.og)]);
        if (m) await db.setSetting('seo.default_og', m.path, c.user.id, 'SEO');
      }
    }
    await audit(db, c, 'seo', 'pages');
    await afterWrite(c);
    return redirect('/admin/seo?msg=' + encodeURIComponent('Guardado.'), 303);
  }
  const pages = await db.all('SELECT * FROM pages ORDER BY sort, slug');
  const [noAlt, noSeoP] = await Promise.all([db.n("SELECT COUNT(*) n FROM media WHERE kind='image' AND alt=''"), db.n("SELECT COUNT(*) n FROM products WHERE status='published' AND in_catalog=1 AND seo_desc=''")]);
  const og = await db.first('SELECT id FROM media WHERE path=?', [S['seo.default_og']]);
  const media = await mediaMap(db, [og?.id]);
  const body = html`<section class="card"><h2>Lo que la tienda ya hace sola</h2><ul class="check">
<li>Cada página se arma en el servidor: Google y los asistentes de IA leen todo el contenido sin JavaScript.</li>
<li>Datos estructurados (schema.org): tienda, piezas con precio y disponibilidad "hecho bajo pedido", colecciones, preguntas frecuentes, migas de pan y guías.</li>
<li><a href="/sitemap.xml" target="_blank">Mapa del sitio</a> y <a href="/robots.txt" target="_blank">robots.txt</a> actualizados solos.</li>
<li><a href="/llms.txt" target="_blank">llms.txt</a> y <a href="/llms-full.txt" target="_blank">llms-full.txt</a>: resumen de la marca, piezas, precios, envíos y pagos para ChatGPT, Claude, Perplexity y Gemini.</li>
<li><a href="/feeds/google-merchant.xml" target="_blank">Feed de productos</a> para Google Merchant Center (aparecer gratis en Google Shopping).</li></ul>
<p class="flash warn">En Cloudflare → Seguridad → Bots, <b>desactiva "Block AI bots"</b> (viene activo por defecto) para que los asistentes de IA puedan leer la tienda.</p></section>
<section class="card"><h2>Para mejorar</h2><ul class="todo">${noAlt ? html`<li><a href="/admin/medios">${noAlt} foto(s) sin descripción</a>: describe qué se ve; ayuda a Google Imágenes.</li>` : ''}${noSeoP ? html`<li><a href="/admin/piezas">${noSeoP} pieza(s) sin descripción para Google</a>: se genera una automática, pero una escrita a mano funciona mejor.</li>` : ''}<li>Registra el sitio en <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a> y en <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</a> (Bing alimenta a ChatGPT y Copilot) y envía el mapa del sitio.</li><li><b>SEO local:</b> crea gratis el <a href="https://www.google.com/business/" target="_blank" rel="noopener">Perfil de Empresa de Google</a> (categoría "Joyería", zona de servicio: Nueva Esparta y Venezuela), <a href="https://www.bingplaces.com/" target="_blank" rel="noopener">Bing Places</a> y <a href="https://businessconnect.apple.com/" target="_blank" rel="noopener">Apple Business Connect</a>, con el mismo nombre, WhatsApp e Instagram que aquí. Pega el enlace de Google Maps en <a href="/admin/ajustes#ubicacion">Ajustes → Ubicación</a>.</li>
<li>Pide reseñas en Google a tus clientas después de cada entrega: es lo que más pesa para aparecer en "joyería cerca de mí" en Margarita.</li></ul></section>
<form method="post" class="form">${csrf(c)}
${c.user.role === 'ADMIN' ? html`<fieldset class="card"><legend>General</legend><div class="grid">
${field({ k: 'allow_ai', label: 'Permitir que los asistentes de IA lean la tienda', type: 'bool', wide: true }, S['seo.allow_ai_crawlers'])}
${field({ k: 'gv', label: 'Código de verificación de Google', ph: 'solo el código' }, S['seo.google_verification'])}${field({ k: 'bv', label: 'Código de verificación de Bing' }, S['seo.bing_verification'])}
${field({ k: 'og', label: 'Imagen al compartir en redes (por defecto)', type: 'media' }, og?.id, { media })}</div></fieldset>` : ''}
<fieldset class="card"><legend>Páginas fijas</legend><p class="help">Las páginas <b>Joyería en Margarita</b>, <b>Envíos a toda Venezuela</b> y <b>Preguntas frecuentes</b> posicionan la tienda en la isla, la región y el país. Su texto y sus preguntas se editan con "Editar contenido".</p><div class="seo-pages">${pages.map((p) => html`<div class="seo-row"><b>${p.title}</b>${p.heading || p.faq !== '[]' ? html` <a class="link" href="/admin/seo/${p.slug}">Editar contenido</a>` : ''}
<label><span>Título (${raw('<span data-count></span>')}/60)</span><input name="t_${p.slug}" value="${p.seo_title}" maxlength="70" data-counter="60"></label>
<label><span>Descripción (${raw('<span data-count></span>')}/155)</span><textarea name="d_${p.slug}" rows="2" maxlength="200" data-counter="155">${p.seo_desc}</textarea></label></div>`)}</div></fieldset>
<div class="bar sticky"><button class="btn">Guardar</button></div></form>`;
  return layout(c, { title: 'SEO, IA y GEO', active: 'seo', body });
}

// Contenido de páginas locales: título visible, introducción, texto y preguntas frecuentes
export async function seoContent(c, slug) {
  const { db } = c;
  const pg = await db.first('SELECT * FROM pages WHERE slug=?', [slug]);
  if (!pg) throw new HttpError(404);
  let err = '';
  const toText = (faq) => { try { return JSON.parse(faq || '[]').map(([q, a]) => `P: ${q}\nR: ${a}`).join('\n\n'); } catch { return ''; } };
  let row = { ...pg, faqText: toText(pg.faq) };
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    row = { ...pg, heading: String(f.heading || '').trim().slice(0, 120), intro: String(f.intro || '').trim().slice(0, 600), body: String(f.body || '').replace(/\r\n?/g, '\n').trim().slice(0, 8000), faqText: String(f.faq || '') };
    const faq = [];
    for (const block of row.faqText.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
      const q = block.match(/^\s*P:\s*([\s\S]*?)\n\s*R:/), a = block.match(/\n\s*R:\s*([\s\S]*)$/);
      if (!block.trim()) continue;
      if (!q || !a) { err = 'Cada pregunta debe tener una línea "P:" y una línea "R:", separadas de la siguiente por una línea vacía.'; break; }
      faq.push([q[1].trim().slice(0, 200), a[1].trim().replace(/\s+/g, ' ').slice(0, 900)]);
    }
    if (!err && faq.length > 40) err = 'Máximo 40 preguntas por página.';
    if (!err) {
      await db.run('UPDATE pages SET heading=?, intro=?, body=?, faq=?, updated_at=? WHERE slug=?', [row.heading, row.intro, row.body, JSON.stringify(faq), nowIso(), slug]);
      await audit(db, c, 'contenido', 'pages', slug);
      await afterWrite(c);
      return redirect(`/admin/seo/${slug}?msg=` + encodeURIComponent('Guardado.'), 303);
    }
  }
  const url = slug === 'home' ? '/' : `/${slug}`;
  const body = html`${err ? html`<p class="flash bad" role="alert">${err}</p>` : ''}
<form method="post" class="form">${csrf(c)}
<fieldset class="card"><legend>Texto de la página</legend>
<p class="help">Escribe sin montos: usa <code>{lead}</code> para el tiempo de elaboración, <code>{mayor_min}</code> para las piezas del precio al mayor y <code>{whatsapp}</code> para el número oficial. Las tarifas de envío y los métodos de pago se muestran solos desde sus secciones.</p>
<div class="grid">
${field({ k: 'heading', label: 'Título visible (H1)', wide: true, max: 120 }, row.heading)}
${field({ k: 'intro', label: 'Introducción', type: 'textarea', rows: 3, wide: true, max: 600 }, row.intro)}
${field({ k: 'body', label: 'Texto', type: 'textarea', rows: 14, wide: true, max: 8000, help: 'Un párrafo por línea. "## " al inicio crea un subtítulo; "1. " crea una lista de pasos.' }, row.body)}
</div></fieldset>
<fieldset class="card"><legend>Preguntas frecuentes</legend>
<p class="help">Google y los asistentes de IA usan estas respuestas tal cual. Formato: una línea <code>P:</code> con la pregunta, una línea <code>R:</code> con la respuesta, y una línea vacía entre preguntas.</p>
<div class="grid">${field({ k: 'faq', label: 'Preguntas y respuestas', type: 'textarea', rows: 18, wide: true, max: 40000 }, row.faqText)}</div></fieldset>
<div class="bar sticky"><button class="btn">Guardar</button><a class="link" href="${url}" target="_blank" rel="noopener">Ver la página ↗</a></div></form>`;
  return layout(c, { title: pg.title, active: 'seo', body, actions: html`<a class="btn ghost" href="/admin/seo">← SEO e IA</a>` });
}

// ---------------------------------------------------------------- usuarios
export async function users(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db } = c;
  let shown = '';
  const rr = needReauth(c);
  if (rr) return rr;
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (f._action === 'create') {
      const email = String(f.email || '').trim().toLowerCase(), name = String(f.name || '').trim().slice(0, 80), role = f.role === 'ADMIN' ? 'ADMIN' : 'STAFF';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return redirect('/admin/usuarios?err=' + encodeURIComponent('Nombre y correo válidos, por favor.'), 303);
      const temp = randomToken(12);
      try {
        await db.run('INSERT INTO users(email,name,role,pw_hash,created_at) VALUES (?,?,?,?,?)', [email, name, role, await hashPassword(temp, c.env.THF_PEPPER, c.env.PW_ITER), nowIso()]);
      } catch {
        return redirect('/admin/usuarios?err=' + encodeURIComponent('Ya existe un usuario con ese correo.'), 303);
      }
      await audit(db, c, 'crear', 'users', null, { email, role });
      shown = html`<p class="flash ok">Usuario creado. Contraseña temporal (solo se muestra ahora): <code>${temp}</code>. Pídele que la cambie en "Mi cuenta" y active la verificación en dos pasos.</p>`;
    } else if (/^\d+$/.test(f.id || '') && Number(f.id) !== c.user.id) {
      const id = Number(f.id);
      if (f._action === 'toggle') await db.batch([['UPDATE users SET active=1-active WHERE id=?', [id]], ['DELETE FROM sessions WHERE user_id=?', [id]]]);
      if (f._action === 'reset2fa') await db.batch([['UPDATE users SET totp_enabled=0, totp_secret=NULL, recovery_codes=NULL WHERE id=?', [id]], ['DELETE FROM sessions WHERE user_id=?', [id]]]);
      await audit(db, c, f._action, 'users', id);
      return redirect('/admin/usuarios?msg=' + encodeURIComponent('Listo.'), 303);
    }
  }
  const rows = await db.all('SELECT id, email, name, role, active, totp_enabled, last_login_at FROM users ORDER BY id');
  const body = html`${shown}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>2 pasos</th><th>Último acceso</th><th></th></tr></thead><tbody>
${rows.map((u) => html`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role === 'ADMIN' ? 'Administración' : 'Equipo'}</td><td>${fmt.bool(u.totp_enabled)}</td><td>${fmt.date(u.last_login_at)}</td>
<td class="r">${u.id !== c.user.id ? html`<form method="post" class="inline">${csrf(c)}<input type="hidden" name="id" value="${u.id}"><button class="link" name="_action" value="toggle">${u.active ? 'Desactivar' : 'Activar'}</button> · <button class="link" name="_action" value="reset2fa">Reiniciar 2 pasos</button></form>` : html`<a class="link" href="/admin/cuenta">Mi cuenta</a>`}</td></tr>`)}</tbody></table></div>
<form method="post" class="card form">${csrf(c)}<input type="hidden" name="_action" value="create"><h2>Agregar usuario</h2><div class="grid">
<div class="fld"><label>Nombre<input name="name" required></label></div><div class="fld"><label>Correo<input name="email" type="email" required></label></div>
<div class="fld"><label>Rol<select name="role"><option value="STAFF">Equipo (pedidos, piezas, fotos)</option><option value="ADMIN">Administración (todo)</option></select></label></div></div>
<p class="help">El rol Equipo no ve costos, métodos de pago, ajustes, usuarios ni auditoría.</p><div class="bar"><button class="btn">Crear usuario</button></div></form>`;
  return layout(c, { title: 'Usuarios', active: 'users', body });
}

export async function account(c) {
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    err = await changePassword(c, f);
    if (!err) return redirect('/admin/cuenta?msg=' + encodeURIComponent('Contraseña cambiada. Se cerraron tus otras sesiones.'), 303);
  }
  const body = html`${err ? html`<p class="flash bad">${err}</p>` : ''}<form method="post" class="card stack narrow">${csrf(c)}<h2>Cambiar contraseña</h2>
<label>Contraseña actual<input name="current" type="password" required autocomplete="current-password"></label>
<label>Nueva contraseña (12+ caracteres)<input name="password" type="password" minlength="12" required autocomplete="new-password"></label>
<label>Repite la nueva<input name="password2" type="password" minlength="12" required autocomplete="new-password"></label><button class="btn">Cambiar</button></form>`;
  return layout(c, { title: 'Mi cuenta', active: '', body });
}

export async function auditLog(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const rows = await c.db.all('SELECT a.*, u.name uname FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300');
  const body = html`<p class="intro">Registro de quién hizo qué. No se puede editar ni borrar desde el panel.</p><div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Elemento</th><th>Detalle</th><th>IP</th></tr></thead><tbody>
${rows.map((a) => html`<tr><td>${fmt.date(a.at)}</td><td>${a.uname || '—'}</td><td>${a.action}</td><td>${a.entity || ''}${a.entity_id ? ` #${a.entity_id}` : ''}</td><td class="trunc">${a.data || ''}</td><td>${a.ip || ''}</td></tr>`)}</tbody></table></div>`;
  return layout(c, { title: 'Auditoría', active: 'audit', body });
}

// ---------------------------------------------------------------- solicitudes
const KIND = { embajadora: 'Embajadora', emprendedora: 'Aliada', personalizada: 'Joyería personalizada' };
const RSTATUS = { nueva: ['Nueva', 'warn'], en_revision: ['En revisión', 'blue'], aprobada: ['Aprobada', 'ok'], rechazada: ['Rechazada', 'bad'], cerrada: ['Cerrada', 'muted'] };
export async function requests(c, id) {
  const { db } = c;
  if (id) {
    const r = await db.first('SELECT * FROM requests WHERE id=?', [id]);
    if (!r) throw new HttpError(404);
    if (c.req.method === 'POST') {
      const f = await readForm(c.req);
      const s = RSTATUS[f.status] ? f.status : r.status;
      await db.run('UPDATE requests SET status=?, notes=?, updated_at=? WHERE id=?', [s, String(f.notes || '').slice(0, 2000), nowIso(), r.id]);
      await audit(db, c, 'solicitud', 'requests', r.id, { status: s });
      return redirect(`/admin/solicitudes/${r.id}?msg=${encodeURIComponent('Guardado.')}`, 303);
    }
    const d = JSON.parse(r.data || '{}');
    const wa = `https://wa.me/${String(r.phone).replace(/\D/g, '').replace(/^0/, '58')}`;
    const body = html`<div class="cols"><section class="card"><h2>${KIND[r.kind]}</h2><p><b>${r.name}</b>${r.city ? ` · ${r.city}` : ''}<br>${r.phone}</p>
<dl class="dl">${Object.entries(d).map(([k, v]) => html`<dt>${k}</dt><dd>${Array.isArray(v) ? v.map((x, i) => html`${i ? ', ' : ''}${/^https?:|\.com\//.test(x) ? html`<a href="${/^https?:/.test(x) ? x : 'https://' + x}" target="_blank" rel="noopener noreferrer">${x}</a>` : x}`) : v}</dd>`)}</dl>
<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">Escribir por WhatsApp ↗</a>
${r.kind !== 'personalizada' && c.user.role === 'ADMIN' ? html` <a class="btn sm" href="/admin/afiliadas/nueva?solicitud=${r.id}">Aprobar y crear afiliada</a>` : ''}</section>
<form method="post" class="card stack">${csrf(c)}<label>Estado<select name="status">${Object.entries(RSTATUS).map(([k, [n]]) => html`<option value="${k}"${k === r.status ? raw(' selected') : ''}>${n}</option>`)}</select></label>
<label>Notas internas<textarea name="notes" rows="6">${r.notes}</textarea></label><button class="btn">Guardar</button><p class="muted">Recibida ${fmt.date(r.created_at)}</p></form></div>`;
    return layout(c, { title: r.name, active: 'requests', body, actions: html`<a class="btn ghost" href="/admin/solicitudes">← Solicitudes</a>` });
  }
  const k = c.url.searchParams.get('tipo') || '';
  const rows = await db.all(`SELECT * FROM requests ${KIND[k] ? 'WHERE kind=?' : ''} ORDER BY id DESC LIMIT 300`, KIND[k] ? [k] : []);
  const body = html`<p class="intro">Postulaciones a Embajadoras y Aliadas, y pedidos de joyería personalizada enviados desde la web.</p>
<nav class="tabs"><a href="/admin/solicitudes"${!k ? raw(' aria-current="page"') : ''}>Todas</a>${Object.entries(KIND).map(([kk, n]) => html`<a href="?tipo=${kk}"${k === kk ? raw(' aria-current="page"') : ''}>${n}</a>`)}</nav>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Tipo</th><th>Ciudad</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${rows.map((r) => html`<tr><td><a href="/admin/solicitudes/${r.id}">${r.name}</a></td><td>${KIND[r.kind]}</td><td>${r.city || '—'}</td><td>${badge(RSTATUS[r.status][0], RSTATUS[r.status][1])}</td><td>${fmt.date(r.created_at)}</td></tr>`)}</tbody></table></div>` : empty('Todavía no hay solicitudes.')}`;
  return layout(c, { title: 'Solicitudes', active: 'requests', body });
}

export { passwordProblem };

// ---------------------------------------------------------------- envíos por estado
export async function shippingStatesPage(c) {
  const { db } = c;
  const zonesAll = await db.all("SELECT code, name, kind FROM shipping_zones WHERE active=1 AND kind IN ('nacional','internacional') ORDER BY sort");
  const opts = [['isla', 'Zonas de delivery de la isla'], ...zonesAll.map((z) => [z.code, z.name])];
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    const rows = await db.all('SELECT state FROM shipping_states');
    const stmts = rows.map((r, i) => {
      const k = `s${i}`;
      const zone = opts.some(([v]) => v === f[`${k}_zone`]) ? f[`${k}_zone`] : 'nacional';
      return ['UPDATE shipping_states SET zone_code=?, eta=?, note=?, active=? WHERE state=?',
        [zone, String(f[`${k}_eta`] || '').trim().slice(0, 60), String(f[`${k}_note`] || '').trim().replace(/\s+/g, ' ').slice(0, 200), f[`${k}_active`] ? 1 : 0, f[`${k}_state`]]];
    }).filter((x) => rows.some((r) => r.state === x[1][4]));
    await db.batch(stmts);
    await audit(db, c, 'envios_estados', 'shipping_states');
    await afterWrite(c);
    return redirect('/admin/envios/estados?msg=' + encodeURIComponent('Guardado.'), 303);
  }
  const rows = await db.all('SELECT * FROM shipping_states ORDER BY sort, state');
  const body = html`<p class="intro">Lo que ve la clienta al tocar su estado en la página "Envíos a toda Venezuela". El costo sale de la zona elegida; aquí solo cambias el tiempo y una nota si ese estado es distinto.</p>
<form method="post" class="form">${csrf(c)}
<div class="tbl-wrap"><table class="tbl states-tbl"><thead><tr><th>Estado</th><th>Zona de envío</th><th>Tiempo (opcional)</th><th>Nota para la clienta (opcional)</th><th>Visible</th></tr></thead><tbody>
${rows.map((r, i) => html`<tr><th scope="row">${r.state}<input type="hidden" name="s${i}_state" value="${r.state}"></th>
<td><select name="s${i}_zone" aria-label="Zona de ${r.state}">${opts.map(([v, n]) => html`<option value="${v}"${r.zone_code === v ? raw(' selected') : ''}>${n}</option>`)}</select></td>
<td><input name="s${i}_eta" value="${r.eta}" maxlength="60" placeholder="Igual que la zona" aria-label="Tiempo para ${r.state}"></td>
<td><input name="s${i}_note" value="${r.note}" maxlength="200" placeholder="Ej.: retiras en la agencia de tu ciudad" aria-label="Nota para ${r.state}"></td>
<td><input type="checkbox" name="s${i}_active" value="1"${r.active ? raw(' checked') : ''} aria-label="${r.state} visible"></td></tr>`)}
</tbody></table></div>
<div class="bar sticky"><button class="btn">Guardar</button><a class="link" href="/envios-venezuela" target="_blank" rel="noopener">Ver la página ↗</a></div></form>`;
  return layout(c, { title: 'Envíos por estado', active: 'shipping', body, actions: html`<a class="btn ghost" href="/admin/envios">← Zonas de envío</a>` });
}
