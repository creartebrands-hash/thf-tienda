// Integraciones: Google Analytics 4, píxeles de Meta y TikTok, webhooks salientes y estado de las conexiones (API).
// Solo ADMIN. Los IDs se validan por formato (nunca se pega código). Los secretos de las API viven en las variables
// de entorno del servidor: aquí solo se ve si están puestos, nunca su valor.
import { html, raw } from '../lib/html.js';
import { nowIso } from '../lib/db.js';
import * as INT from '../lib/integrations.js';
import { audit } from '../lib/security.js';
import * as V from '../lib/validate.js';
import * as WH from '../lib/webhooks.js';
import { HttpError, readForm, redirect } from '../http.js';
import { afterWrite, needReauth } from './common.js';
import { badge, csrf, fmt, layout } from './ui.js';

const KEYS = { ga4: 'integrations.ga4_id', meta: 'integrations.meta_pixel_id', tiktok: 'integrations.tiktok_pixel_id' };
const evName = Object.fromEntries(WH.WEBHOOK_EVENTS);

export async function page(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db } = c;
  const back = (k, m, hash = '') => redirect(`/admin/integraciones?${k}=${encodeURIComponent(m)}${hash}`, 303);
  let shown = null; // secreto recién creado: se muestra una sola vez
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    if (f._action === 'tags') {
      try {
        const vals = Object.fromEntries(Object.keys(KEYS).map((k) => [k, INT.cleanId(k, f[k])]));
        for (const [k, key] of Object.entries(KEYS)) await db.setSetting(key, vals[k], c.user.id, 'Integraciones');
        await db.setSetting('integrations.server_purchases', f.server_purchases === '1', c.user.id, 'Integraciones');
        await audit(db, c, 'integraciones_ids', 'settings', null, vals);
        await afterWrite(c);
        return back('msg', 'Guardado. Las etiquetas se cargan en la tienda desde ahora.', '#medicion');
      } catch (e) {
        if (!(e instanceof V.ValidationError)) throw e;
        return back('err', e.message, '#medicion');
      }
    }
    if (['wh_add', 'wh_regen', 'wh_del'].includes(f._action)) { const r = needReauth(c); if (r) return r; }
    if (f._action === 'wh_add' || f._action === 'wh_save') {
      const name = V.line(f.name, 60), url = WH.safeUrl(f.url), events = WH.validEvents(f.events);
      if (!name) return back('err', 'Ponle un nombre al webhook.', '#webhooks');
      if (!url) return back('err', 'La dirección debe empezar por https:// y ser pública (no se permiten IPs ni direcciones internas).', '#webhooks');
      if (!events.length) return back('err', 'Elige al menos un evento.', '#webhooks');
      const t = nowIso();
      if (f._action === 'wh_add') {
        if ((await db.n('SELECT COUNT(*) n FROM webhooks')) >= 20) return back('err', 'Máximo 20 webhooks.', '#webhooks');
        const secret = WH.newSecret();
        await db.run('INSERT INTO webhooks(name,url,secret,events,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)', [name, url, secret, JSON.stringify(events), t, t]);
        const row = await db.first('SELECT id FROM webhooks ORDER BY id DESC LIMIT 1');
        await audit(db, c, 'webhook_crear', 'webhooks', row.id, { name, host: new URL(url).host, events });
        shown = { id: row.id, name, secret };
      } else {
        const row = await db.first('SELECT * FROM webhooks WHERE id=?', [Number(f.id)]);
        if (!row) return back('err', 'No se encontró.', '#webhooks');
        if (url !== row.url) { const r = needReauth(c); if (r) return r; }
        await db.run('UPDATE webhooks SET name=?, url=?, events=?, active=?, updated_at=? WHERE id=?', [name, url, JSON.stringify(events), f.active === '1' ? 1 : 0, t, row.id]);
        await audit(db, c, 'webhook_editar', 'webhooks', row.id, { name, host: new URL(url).host, events, active: f.active === '1' });
        return back('msg', 'Webhook guardado.', `#wh${row.id}`);
      }
    } else if (f._action === 'wh_regen') {
      const row = await db.first('SELECT * FROM webhooks WHERE id=?', [Number(f.id)]);
      if (!row) return back('err', 'No se encontró.', '#webhooks');
      const secret = WH.newSecret();
      await db.run('UPDATE webhooks SET secret=?, updated_at=? WHERE id=?', [secret, nowIso(), row.id]);
      await audit(db, c, 'webhook_secreto', 'webhooks', row.id, {});
      shown = { id: row.id, name: row.name, secret };
    } else if (f._action === 'wh_del') {
      const row = await db.first('SELECT * FROM webhooks WHERE id=?', [Number(f.id)]);
      if (!row) return back('err', 'No se encontró.', '#webhooks');
      await db.run('DELETE FROM webhooks WHERE id=?', [row.id]);
      await audit(db, c, 'webhook_borrar', 'webhooks', row.id, { name: row.name });
      return back('msg', 'Webhook eliminado.', '#webhooks');
    } else if (f._action === 'wh_test') {
      const row = await db.first('SELECT * FROM webhooks WHERE id=?', [Number(f.id)]);
      if (!row) return back('err', 'No se encontró.', '#webhooks');
      const r = await WH.testDelivery(db, row);
      return back(r.ok ? 'msg' : 'err', r.ok ? `Prueba enviada: respondió ${r.status}.` : `La prueba falló: ${r.error}.`, `#wh${row.id}`);
    } else if (f._action !== 'tags') throw new HttpError(400);
  }

  const S = await db.settings();
  const hooks = await db.all('SELECT * FROM webhooks ORDER BY id');
  const deliveries = await db.all('SELECT d.*, w.name FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id ORDER BY d.id DESC LIMIT 30');
  const conns = INT.connections(c.env, S);
  const evChecks = (sel = []) => html`<div class="wh-ev">${WH.WEBHOOK_EVENTS.map(([k, label]) => html`<label class="chk"><input type="checkbox" name="events" value="${k}"${sel.includes(k) ? raw(' checked') : ''}> ${label}</label>`)}</div>`;
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };

  const body = html`<p class="intro">Conecta la tienda con tus herramientas de medición y con otros sistemas. Todo es opcional y se puede apagar en cualquier momento.</p>
${shown ? html`<section class="card secret-once" role="alert"><h2>Secreto de “${shown.name}”</h2><p>Cópialo ahora y pégalo en el sistema que recibe el webhook. <b>No se vuelve a mostrar.</b> Si lo pierdes, genera uno nuevo.</p>
<p class="secret-box"><code>${shown.secret}</code><button type="button" class="btn sm" data-copy="${shown.secret}">Copiar</button></p></section>` : ''}

<section class="card" id="medicion"><h2>Analítica y píxeles</h2>
<p class="help">Pega solo el ID (no el código). La tienda carga cada etiqueta únicamente si su ID está puesto y abre en la política de seguridad solo los dominios de esa herramienta.
Eventos que se envían: vista de pieza, añadir al pedido, iniciar pedido, pedido creado, contacto por WhatsApp y solicitudes. La <b>compra</b> se envía desde el servidor cuando verificas el pago.</p>
<form method="post" class="stack">${csrf(c)}<input type="hidden" name="_action" value="tags">
<div class="grid">
  <label class="fld">Google Analytics 4 · ID de medición<input name="ga4" value="${S['integrations.ga4_id'] || ''}" placeholder="G-AB12CD34EF" maxlength="20" autocomplete="off" spellcheck="false"><small class="help">Analytics → Administrar → Flujos de datos → Web.</small></label>
  <label class="fld">Píxel de Meta (Facebook e Instagram) · ID<input name="meta" value="${S['integrations.meta_pixel_id'] || ''}" placeholder="123456789012345" inputmode="numeric" maxlength="20" autocomplete="off"><small class="help">Administrador de eventos → Orígenes de datos.</small></label>
  <label class="fld">Píxel de TikTok · ID<input name="tiktok" value="${S['integrations.tiktok_pixel_id'] || ''}" placeholder="C9ABCDEF1234567890" maxlength="25" autocomplete="off" spellcheck="false"><small class="help">TikTok Ads → Herramientas → Eventos.</small></label>
</div>
<label class="chk"><input type="checkbox" name="server_purchases" value="1"${S['integrations.server_purchases'] !== false ? raw(' checked') : ''}> Enviar la compra desde el servidor al verificar el pago (Google y Meta, si sus claves están puestas abajo)</label>
${S['analytics.enabled'] === false ? html`<p class="flash warn">La analítica está apagada en Ajustes: las etiquetas no se cargarán hasta que la enciendas.</p>` : ''}
<div class="bar"><button class="btn">Guardar</button></div></form></section>

<section class="card" id="webhooks"><h2>Webhooks</h2>
<p class="help">Un webhook avisa a otro sistema (Make, n8n, Zapier, Google Sheets, tu contabilidad, la API de WhatsApp Business…) cada vez que pasa algo. Cada aviso va firmado: la cabecera <code>X-THF-Signature</code> es <code>sha256=</code> + HMAC-SHA256 del texto <code>X-THF-Timestamp + "." + cuerpo</code> con el secreto del webhook. Solo se permiten direcciones <b>https</b> públicas.</p>
${hooks.length ? hooks.map((h) => { const ev = (() => { try { return JSON.parse(h.events || '[]'); } catch { return []; } })();
  return html`<details class="wh" id="wh${h.id}"><summary><b>${h.name}</b> ${h.active ? badge('Activo', 'ok') : badge('Pausado')} <span class="muted">${hostOf(h.url)} · ${ev.length} evento(s)</span></summary>
<form method="post" class="stack">${csrf(c)}<input type="hidden" name="_action" value="wh_save"><input type="hidden" name="id" value="${h.id}">
<div class="grid"><label class="fld">Nombre<input name="name" value="${h.name}" maxlength="60" required></label><label class="fld">Dirección (https)<input name="url" type="url" value="${h.url}" maxlength="500" required></label></div>
${evChecks(ev)}
<label class="chk"><input type="checkbox" name="active" value="1"${h.active ? raw(' checked') : ''}> Activo</label>
<div class="bar"><button class="btn">Guardar</button></div></form>
<div class="bar">
<form method="post" class="inline">${csrf(c)}<input type="hidden" name="_action" value="wh_test"><input type="hidden" name="id" value="${h.id}"><button class="btn sm ghost">Enviar prueba</button></form>
<form method="post" class="inline">${csrf(c)}<input type="hidden" name="_action" value="wh_regen"><input type="hidden" name="id" value="${h.id}"><button class="btn sm ghost">Generar secreto nuevo</button></form>
<form method="post" class="inline" data-confirm="¿Eliminar este webhook?">${csrf(c)}<input type="hidden" name="_action" value="wh_del"><input type="hidden" name="id" value="${h.id}"><button class="btn sm bad">Eliminar</button></form>
<small class="help">Secreto: ${h.secret.slice(0, 10)}••••••••</small></div></details>`; }) : html`<p class="muted">Todavía no hay webhooks.</p>`}
<details class="wh add"${hooks.length ? '' : raw(' open')}><summary><b>+ Agregar webhook</b></summary>
<form method="post" class="stack">${csrf(c)}<input type="hidden" name="_action" value="wh_add">
<div class="grid"><label class="fld">Nombre<input name="name" maxlength="60" placeholder="Ej. Google Sheets de pedidos" required></label><label class="fld">Dirección (https)<input name="url" type="url" maxlength="500" placeholder="https://hook.make.com/…" required></label></div>
${evChecks(['pedido_creado', 'pago_verificado'])}
<div class="bar"><button class="btn">Crear webhook</button><small class="help">Al crearlo verás su secreto una sola vez.</small></div></form></details>
${deliveries.length ? html`<h3>Últimos envíos</h3><div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Fecha</th><th>Webhook</th><th>Evento</th><th>Resultado</th></tr></thead><tbody>
${deliveries.map((d) => html`<tr><td>${fmt.date(d.at)}</td><td>${d.name}</td><td>${evName[d.event] || d.event}</td><td>${d.ok ? badge(`OK ${d.status}`, 'ok') : badge(d.error || `Error ${d.status || ''}`, 'bad')}</td></tr>`)}</tbody></table></div>` : ''}
</section>

<section class="card" id="api"><h2>Conexiones (API)</h2>
<p class="help">Las claves de las API se guardan como variables de entorno del servidor (Vercel → Settings → Environment Variables, o <code>wrangler secret put</code>), nunca en el panel ni en el código. Aquí solo ves si están puestas.</p>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Servicio</th><th>Para qué</th><th>Estado</th><th>Variable</th></tr></thead><tbody>
${conns.map((x) => html`<tr><td><b>${x.name}</b></td><td class="muted">${x.detail}</td><td>${x.ok ? badge('Conectado', 'ok') : badge('Sin conectar')}</td><td>${x.ok ? "" : html`<code class="small">${x.need}</code>`}</td></tr>`)}</tbody></table></div>
<p class="help">Para recibir compras en Google Analytics desde el servidor: Analytics → Flujos de datos → <i>Secretos de la API de Measurement Protocol</i> → crea uno y guárdalo como <code>GA4_API_SECRET</code>. Para Meta: Administrador de eventos → Configuración → <i>API de conversiones</i> → genera el token y guárdalo como <code>META_CAPI_TOKEN</code>.</p>
</section>`;
  return layout(c, { title: 'Integraciones', active: 'integrations', body });
}

