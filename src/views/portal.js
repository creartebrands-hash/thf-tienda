// Portal de afiliadas (embajadoras y aliadas). La dueña lo ve igual desde el panel con "Ver como ella" (solo lectura).
import { html, raw } from '../lib/html.js';
import { money } from '../lib/pricing.js';
import { STATUS_PUBLIC, csrfField, fmtDate } from './shop.js';

const KIND = { comision: 'Comisión', ganancia: 'Ganancia', reversa: 'Reversa', ajuste: 'Ajuste', pago: 'Pago recibido' };
const shell = (title, kicker, body) => html`<section class="page-head acct-head pt-head" aria-label="${title}"><div class="wrap"><p class="eyebrow">${kicker}</p><h1>${title}</h1></div></section>
<section class="wrap acct portal">${body}</section><div style="height:clamp(40px,8vh,90px)"></div>`;

export function portalLogin({ e, msg }) {
  return shell('Portal de afiliadas', 'Embajadoras y aliadas', html`<div class="acct-card"><h2>Entra a tu portal</h2>${msg ? html`<p class="acct-ok">${msg}</p>` : ''}${e ? html`<p class="acct-err" role="alert">${e}</p>` : ''}
<form method="post" action="/afiliadas/entrar" class="acct-form"><div class="field"><label for="sMail">Correo</label><input id="sMail" name="email" type="email" required autocomplete="username"></div>
<div class="field"><label for="sPw">Contraseña</label><input id="sPw" name="password" type="password" required autocomplete="current-password"></div><button class="btn btn-solid">Entrar <span class="arr"></span></button></form>
<p class="small muted">¿Primera vez? Usa el enlace de acceso que te enviamos por WhatsApp. ¿Lo perdiste? Escríbenos.</p></div>
<div class="acct-card alt"><h2>¿Quieres ser parte?</h2><p>Conoce los programas Embajadoras y Aliadas.</p><p><a class="btn btn-ghost" href="/programas">Ver los programas</a></p></div>`);
}

export function portalSetPassword({ t, e, name }) {
  return shell(`Hola, ${name}`, 'Crea tu contraseña', html`<div class="acct-card">${e ? html`<p class="acct-err" role="alert">${e}</p>` : ''}
<form method="post" class="acct-form"><input type="hidden" name="t" value="${t}"><div class="field"><label for="pp1">Contraseña (10 caracteres o más)</label><input id="pp1" name="password" type="password" minlength="10" required autocomplete="new-password"></div>
<div class="field"><label for="pp2">Repítela</label><input id="pp2" name="password2" type="password" minlength="10" required autocomplete="new-password"></div><button class="btn btn-solid">Guardar y entrar</button></form></div>`);
}

const ICON = {
  copy: raw('<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'),
  share: raw('<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 10V2M5 4.8 8 1.8l3 3M3.5 7.5v5.3c0 .7.5 1.2 1.2 1.2h6.6c.7 0 1.2-.5 1.2-1.2V7.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  qr: raw('<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2 2h4.5v4.5H2zM9.5 2H14v4.5H9.5zM2 9.5h4.5V14H2zM9.5 9.5h2v2h-2zM12.5 12.5H14V14h-1.5zM12 9.5h2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'),
  ext: raw('<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'),
};

// Pestañas del portal (arriba, siempre visibles)
const tabs = (p, active, csrf) => html`<nav class="pt-tabs" aria-label="Tu portal"><a href="/afiliadas/panel"${active === 'panel' ? raw(' aria-current="page"') : ''}>Resumen</a>${p.kind === 'emprendedora' ? html`<a href="/afiliadas/tienda"${active === 'tienda' ? raw(' aria-current="page"') : ''}>Mi tienda</a><a href="/afiliadas/precios"${active === 'precios' ? raw(' aria-current="page"') : ''}>Mis piezas</a>` : ''}
<form method="post" action="/afiliadas/salir" class="inline">${csrfField(csrf)}<button class="pt-out">Salir</button></form></nav>`;

export function portalDashboard({ p, S, stats, bal, ledger, orders, link, store, qr, csrf, readonly = false, rule }) {
  const isB = p.kind === 'emprendedora';
  const min = Number(S['programs.payout_min_usd'] || 0) * 100;
  return html`${readonly ? html`<p class="preview-bar">Vista de la dueña · así ve ${p.name} su portal (solo lectura)</p>` : ''}
${shell(`Hola, ${p.name.split(' ')[0]}`, isB ? 'Aliada THF' : 'Embajadora THF', html`
${readonly ? '' : tabs(p, 'panel', csrf)}
<div class="pt-kpis">
  <div><small>Visitas por tu enlace</small><b>${stats.clicks}</b></div><div><small>Pedidos</small><b>${stats.orders}</b></div>
  <div><small>Ventas pagadas</small><b>${money(stats.sales)}</b></div><div><small>${isB ? 'Ganancias' : 'Comisiones'} disponibles</small><b>${money(bal.available)}</b></div>
</div>
<div class="pt-card pt-share"><div class="pt-link"><div>
  <h2>${isB ? 'Tu tienda y tu enlace' : 'Tu enlace personal'}</h2>
  ${store ? html`<p class="pt-url"><span class="mono">${store}</span></p><div class="pt-actions"><a class="pt-btn solid" href="${store}" target="_blank" rel="noopener">${ICON.ext}<span>Ver mi tienda</span></a><button type="button" class="pt-btn" data-copy="${store}" data-copy-ok="Enlace de tu tienda copiado">${ICON.copy}<span>Copiar enlace de la tienda</span></button></div>` : ''}
  <p class="pt-url"><span class="mono">${link}</span></p>
  <div class="pt-actions"><button type="button" class="pt-btn${store ? '' : ' solid'}" data-copy="${link}" data-copy-ok="Enlace copiado">${ICON.copy}<span>Copiar enlace</span></button><button type="button" class="pt-btn" data-share="${link}">${ICON.share}<span>Compartir</span></button>${readonly ? '' : html`<a class="pt-btn" href="/afiliadas/qr.svg" download="qr-${p.code}.svg">${ICON.qr}<span>Descargar QR</span></a>`}</div>
  <p class="small muted">Tu código es <b class="mono">${p.code}</b>. Cada compra que llegue por tu enlace${store ? ' o tu tienda' : ''} queda registrada como tuya durante ${S['programs.attribution_days']} días.</p></div>
  <div class="pt-qr" aria-label="Código QR de tu enlace">${raw(qr)}</div></div>
  <p class="pt-note">Nunca recibes pagos de clientas: todas pagan directo a ${S['brand.name']}.</p>
</div>
<div class="pt-card"><h2>Tu saldo</h2>
  <dl class="pt-bal"><div><dt>Disponible para cobrar</dt><dd>${money(bal.available)}</dd></div><div><dt>En espera (${S['programs.hold_days']} días por cambios o devoluciones)</dt><dd>${money(bal.held)}</dd></div><div><dt>Ya cobrado</dt><dd>${money(bal.paid)}</dd></div></dl>
  <p class="small muted">${isB ? 'Tu ganancia es la diferencia entre tu precio de venta y tu costo de aliada de cada pieza.' : rule.mode === 'pct' ? `Tu comisión es el ${rule.bps / 100} % de cada venta pagada (sin envío).` : rule.mode === 'monto' ? `Tu comisión es ${money(rule.fixed)} por ${rule.per === 'pieza' ? 'pieza' : 'pedido'} pagado.` : `Tu comisión es el ${rule.bps / 100} % más ${money(rule.fixed)} por ${rule.per === 'pieza' ? 'pieza' : 'pedido'}.`} Pagamos desde ${money(min)} disponibles.</p>
  ${ledger.length ? html`<div class="tbl-x"><table class="pt-tbl"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Detalle</th><th>Monto</th></tr></thead><tbody>${ledger.map((l) => html`<tr><td>${fmtDate(l.created_at)}</td><td>${KIND[l.kind]}</td><td>${l.note}${l.ref ? html` · ${l.ref}` : ''}</td><td class="${l.amount_cents < 0 ? 'neg' : ''}">${money(l.amount_cents)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Aún no hay movimientos.</p>`}
</div>
<div class="pt-card"><h2>Pedidos que llegaron por ti</h2>
  ${orders.length ? html`<div class="tbl-x"><table class="pt-tbl"><thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Venta</th><th>${isB ? 'Ganancia' : 'Comisión'}</th></tr></thead><tbody>${orders.map((o) => html`<tr><td class="mono">${o.code}</td><td>${fmtDate(o.created_at)}</td><td>${STATUS_PUBLIC[o.status] || o.status}</td><td>${money(o.subtotal_cents - o.discount_cents)}</td><td>${o.earned != null ? money(o.earned) : html`<small class="muted">al pagarse</small>`}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Cuando alguien compre con tu enlace o tu código, aparecerá aquí.</p>`}
</div>`)}`;
}

// Mi tienda: título, subtítulo, texto, colores y banner. Nada se sube: todo se elige.
export function portalStore({ p, opts, presets, csrf, msg, e, store, brand = 'THF' }) {
  const bg = p.store_bg || presets.defBg, fg = p.store_fg || presets.defFg;
  const cur = opts.banners.find((b) => b.id === p.store_banner_id);
  const sw = (name, list, val) => html`<div class="pt-swatches" role="radiogroup">${list.map(([hex, label]) => html`<label class="pt-sw" title="${label}"><input type="radio" name="${name}_p" value="${hex}"${hex.toUpperCase() === val.toUpperCase() ? raw(' checked') : ''} data-sw="${name}"><span style="background:${hex}"></span><em>${label}</em></label>`)}
  <label class="pt-sw pt-pick" title="Otro color"><input type="color" name="${name}" value="${val}" data-color="${name}" aria-label="Elegir otro color"><em>Otro</em></label></div>`;
  return shell('Mi tienda', 'Tienda de aliada', html`${tabs(p, 'tienda', csrf)}
${msg ? html`<p class="acct-ok">${msg}</p>` : ''}${e ? html`<p class="acct-err" role="alert">${e}</p>` : ''}
<form method="post" class="pt-store" data-store-editor>${csrfField(csrf)}
<div class="pt-card"><h2>Nombre de tu tienda</h2>
  <div class="grid2"><div class="field"><label for="stT">Título</label><input id="stT" name="title" maxlength="60" value="${p.store_title || ''}" placeholder="Tienda ${p.name.split(' ')[0]}" data-prev="title"></div>
  <div class="field"><label for="stS">Subtítulo</label><input id="stS" name="subtitle" maxlength="80" value="${p.store_subtitle || ''}" placeholder="joyería hecha en Margarita" data-prev="subtitle"></div></div>
  <div class="field"><label for="stB">Un texto corto sobre ti (opcional)</label><textarea id="stB" name="bio" maxlength="280" rows="2" placeholder="Te asesoro por WhatsApp y THF te la envía.">${p.store_bio || ''}</textarea></div>
</div>
<div class="pt-card"><h2>Colores</h2>
  <p class="small muted">Elige el fondo y el color de las letras. Si no se leen bien juntos, te avisamos.</p>
  <h3>Fondo</h3>${sw('bg', presets.bg, bg)}
  <h3>Texto</h3>${sw('fg', presets.fg, fg)}
  <div class="pt-preview" data-preview style="--pv-bg:${bg};--pv-fg:${fg}"><i class="pt-pv-ban" data-prev-banner style="${cur ? `background-image:url('${cur.url}')` : ''}"${cur ? '' : raw(' hidden')}></i><small>Así se ve</small><b data-prev-title>${p.store_title || `Tienda ${p.name.split(' ')[0]}`}</b><span data-prev-subtitle>${p.store_subtitle || 'joyería hecha en Margarita'}</span></div>
</div>
<div class="pt-card"><h2>Banner principal <small>(opcional)</small></h2>
  <p class="small muted">Las fotos las prepara ${brand} para las tiendas aliadas. Elige una o déjala sin banner.</p>
  <div class="pt-banners" role="radiogroup">
    <label class="pt-ban none"><input type="radio" name="banner" value="none"${p.store_banner_id ? '' : raw(' checked')}><span>Sin banner</span></label>
    ${opts.banners.map((b) => html`<label class="pt-ban"><input type="radio" name="banner" value="${b.id}"${b.id === p.store_banner_id ? raw(' checked') : ''}><img src="${b.url}" alt="${b.title}" loading="lazy"><em>${b.title}</em></label>`)}
  </div>
  ${opts.banners.length ? '' : html`<p class="muted small">Todavía no hay banners disponibles.</p>`}
</div>
<div class="pt-save"><button class="pt-btn solid lg">Guardar mi tienda</button>${store ? html`<a class="pt-btn" href="${store}" target="_blank" rel="noopener">${ICON.ext}<span>Ver mi tienda</span></a>` : ''}</div>
</form>`);
}

// Mis piezas: qué piezas muestra, a qué precio y con cuál de las fotos que preparó THF.
// Las piezas que aún no tienen fotos para aliadas van aparte, en una lista corta (no se pueden mostrar todavía).
export function portalPrices({ p, rows, csrf, msg, e }) {
  const ready = rows.filter((r) => r.options.length), soon = rows.filter((r) => !r.options.length);
  const on = ready.filter((r) => r.visible).length;
  return shell('Mis piezas', 'Tienda de aliada', html`${tabs(p, 'precios', csrf)}
${msg ? html`<p class="acct-ok">${msg}</p>` : ''}${e ? html`<p class="acct-err">${e}</p>` : ''}
<p class="small muted pt-intro">Activa las piezas que quieres mostrar, ponles tu precio dentro del rango y elige su foto. Tu ganancia es tu precio menos tu costo. <b>${on} de ${ready.length}</b> piezas disponibles están en tu tienda.</p>
<form method="post" class="pt-pieces">${csrfField(csrf)}
${ready.map((r) => html`<article class="pt-piece">
  <div class="pt-ph"><div class="pt-opts" role="radiogroup" aria-label="Foto de ${r.name}">${r.options.map((o, i) => html`<label class="pt-opt"><input type="radio" name="a_${r.id}" value="${o.id}"${o.id === r.asset || (!r.asset && i === 0) ? raw(' checked') : ''}><img src="${o.url}" alt="Opción ${i + 1} de ${r.name}" loading="lazy"></label>`)}</div></div>
  <div class="pt-pinfo"><h3>${r.name}</h3><p class="small muted">Tu costo ${r.cost != null ? money(r.cost) : '—'} · rango ${money(r.min)} – ${money(r.max)}</p>
  <div class="pt-prow"><label class="pt-price"><span>Tu precio</span><input name="p_${r.id}" inputmode="decimal" value="${(r.price / 100).toFixed(2)}" aria-label="Precio de ${r.name}" data-min="${r.min}" data-max="${r.max}" data-cost="${r.cost ?? ''}"></label>
  <p class="pt-gain"><span>Ganas</span><b data-gain>${r.cost != null ? money(r.price - r.cost) : '—'}</b></p>
  <label class="pt-toggle"><input type="checkbox" name="v_${r.id}" value="1"${r.visible ? raw(' checked') : ''}><span>Mostrar</span></label></div></div>
</article>`)}
${ready.length ? '' : html`<p class="muted">THF todavía está preparando las fotos de las piezas para las tiendas aliadas.</p>`}
<div class="pt-save sticky"><button class="pt-btn solid lg">Guardar mis piezas</button></div>
</form>
${soon.length ? html`<details class="pt-card pt-soonlist"><summary><h2>Próximamente <small>(${soon.length})</small></h2><span class="small muted">Piezas que THF está preparando para las tiendas aliadas</span></summary>
<ul>${soon.map((r) => html`<li><b>${r.name}</b><small class="muted">rango ${money(r.min)} – ${money(r.max)}</small></li>`)}</ul></details>` : ''}`);
}
