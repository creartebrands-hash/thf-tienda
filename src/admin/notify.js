// Avisos: textos de cada aviso (editables) y canales. Al empezar todo es manual por WhatsApp desde cada pedido;
// el correo, Telegram (opcional) y el webhook (para la API oficial de WhatsApp u otro sistema) se encienden cuando se contraten.
import { html, raw } from '../lib/html.js';
import { SEED } from '../lib/seed-data.js';
import { audit } from '../lib/security.js';
import { HttpError, readForm, redirect } from '../http.js';
import { afterWrite } from './common.js';
import { badge, csrf, field, fmt, layout, parseField, FormError } from './ui.js';

const TOKENS = '{marca} {nombre} {pedido} {total} {total_bs} {enlace} {metodo} {referencia} {monto} {motivo} {empresa_envio} {guia} {retiro} {retiro_direccion} {retiro_horario} {enlace_panel}';

export async function page(c) {
  if (c.user.role !== 'ADMIN') throw new HttpError(403);
  const { db, env } = c;
  const S = await db.settings();
  const tpl = S['notify.templates'] || {};
  const META = SEED.NOTIFY_TEMPLATES;
  let err = '';
  if (c.req.method === 'POST') {
    const f = await readForm(c.req);
    try {
      const next = {};
      for (const k of Object.keys(META)) {
        const subject = String(f[`s_${k}`] ?? tpl[k]?.subject ?? '').trim().slice(0, 140);
        const body = String(f[`b_${k}`] ?? tpl[k]?.body ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 1200);
        if (!body) throw new FormError(`El aviso "${META[k].label}" no puede quedar vacío.`);
        next[k] = { subject, body };
      }
      const fields = [
        { k: 'notify.email_enabled', type: 'bool' }, { k: 'notify.from_name', max: 60 }, { k: 'notify.from_email', type: 'email', label: 'Correo remitente' }, { k: 'notify.owner_email', type: 'email', label: 'Correo de la dueña' },
        { k: 'notify.telegram_enabled', type: 'bool' }, { k: 'notify.telegram_chat_id', max: 40 }, { k: 'notify.webhook_enabled', type: 'bool' }, { k: 'notify.webhook_url', type: 'url', label: 'Webhook' },
      ];
      const changes = [];
      for (const fl of fields) { const v = parseField({ label: fl.label || fl.k, ...fl }, f[fl.k]); if (JSON.stringify(v ?? '') !== JSON.stringify(S[fl.k] ?? '')) changes.push([fl.k, fl.type === 'bool' ? !!v : v]); }
      if (JSON.stringify(next) !== JSON.stringify(tpl)) changes.push(['notify.templates', next]);
      for (const [k, v] of changes) await db.setSetting(k, v, c.user.id, 'Avisos');
      if (changes.length) { await audit(db, c, 'avisos', 'settings', null, { keys: changes.map((x) => x[0]) }); await afterWrite(c); }
      return redirect('/admin/avisos?msg=' + encodeURIComponent(changes.length ? 'Guardado.' : 'Sin cambios.'), 303);
    } catch (e) {
      if (e instanceof FormError) err = e.message;
      else throw e;
    }
  }
  const log = await db.all('SELECT n.*, o.code FROM notifications n LEFT JOIN orders o ON o.id=n.order_id ORDER BY n.id DESC LIMIT 40');
  const ok = (cond, yes, no) => (cond ? badge(yes, 'ok') : badge(no, 'muted'));
  const body = html`${err ? html`<p class="flash bad">${err}</p>` : ''}
<p class="intro">Cada cambio de estado de un pedido prepara un aviso para la clienta. <b>Hoy los avisos se envían a mano</b>: en el pedido aparece el botón "Avisar por WhatsApp" con el mensaje ya escrito. Cuando quieras automatizar, activa aquí el correo (Resend tiene plan gratis), Telegram para ti (opcional) o un webhook para conectar la API oficial de WhatsApp Business u otro sistema.</p>
<form method="post" class="form" data-dirty>${csrf(c)}
<fieldset class="card"><legend>Canales</legend>
<div class="chan"><h3>WhatsApp manual ${badge('Siempre activo', 'ok')}</h3><p class="help">Desde el número del teléfono de la tienda. Gratis.</p></div>
<div class="chan"><h3>Correo automático ${ok(env.RESEND_API_KEY, 'Clave cargada', 'Falta la clave RESEND_API_KEY')}</h3><div class="grid">
${field({ k: 'notify.email_enabled', label: 'Enviar avisos por correo', type: 'bool', wide: true }, S['notify.email_enabled'])}
${field({ k: 'notify.from_name', label: 'Nombre del remitente', max: 60 }, S['notify.from_name'])}${field({ k: 'notify.from_email', label: 'Correo remitente (de tu dominio verificado en Resend)', type: 'email' }, S['notify.from_email'])}
${field({ k: 'notify.owner_email', label: 'Tu correo (avisos de pedidos y pagos nuevos)', type: 'email' }, S['notify.owner_email'])}</div></div>
<div class="chan"><h3>Telegram para la dueña (opcional) ${ok(env.TELEGRAM_BOT_TOKEN, 'Clave cargada', 'Sin configurar')}</h3><div class="grid">
${field({ k: 'notify.telegram_enabled', label: 'Avisarme por Telegram de pedidos y pagos nuevos', type: 'bool', wide: true }, S['notify.telegram_enabled'])}${field({ k: 'notify.telegram_chat_id', label: 'ID del chat', max: 40 }, S['notify.telegram_chat_id'])}</div></div>
<div class="chan"><h3>Webhook (WhatsApp Business API, n8n, Make…) ${ok(env.NOTIFY_WEBHOOK_SECRET, 'Clave cargada', 'Sin configurar')}</h3><div class="grid">
${field({ k: 'notify.webhook_enabled', label: 'Enviar cada aviso a un webhook firmado', type: 'bool', wide: true }, S['notify.webhook_enabled'])}${field({ k: 'notify.webhook_url', label: 'Dirección del webhook (https)', type: 'url', wide: true }, S['notify.webhook_url'])}</div>
<p class="help">Cada envío lleva la firma X-THF-Signature (HMAC-SHA256 con NOTIFY_WEBHOOK_SECRET) para que el receptor verifique que viene de la tienda.</p></div></fieldset>
<fieldset class="card"><legend>Textos de los avisos</legend><p class="help">Puedes usar: <code>${TOKENS}</code></p>
${Object.entries(META).map(([k, m]) => html`<div class="tplrow"><h3>${m.label} <small class="muted">${m.aud === 'duena' ? 'para ti' : 'para la clienta'}</small></h3>
<label>Asunto (correo)<input name="s_${k}" value="${tpl[k]?.subject || ''}" maxlength="140"></label><label>Mensaje<textarea name="b_${k}" rows="3" maxlength="1200">${tpl[k]?.body || ''}</textarea></label></div>`)}</fieldset>
<div class="bar sticky"><button class="btn">Guardar</button></div></form>
<section class="card"><h2>Últimos avisos</h2>${log.length ? html`<div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Fecha</th><th>Pedido</th><th>Aviso</th><th>Canal</th><th>Estado</th></tr></thead><tbody>${log.map((n) => html`<tr><td>${fmt.date(n.created_at)}</td><td>${n.code ? html`<a href="/admin/pedidos/${n.order_id}#avisos">${n.code}</a>` : '—'}</td><td>${META[n.event]?.label || n.event}</td><td>${n.channel}</td><td>${n.status}${n.error ? ` · ${n.error}` : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Sin avisos todavía.</p>`}</section>`;
  return layout(c, { title: 'Avisos', active: 'notify', body });
}

export { raw };
