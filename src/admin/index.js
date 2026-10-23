// Panel de administración: autenticación, CSRF, roles y rutas.
import * as aliadas from './aliadas.js';
import * as integ from './integrations.js';
import { loadSession } from '../lib/security.js';
import { HttpError, json, redirect, sameOrigin } from '../http.js';
import * as auth from './auth.js';
import * as crud from './crud.js';
import { html } from '../lib/html.js';
import * as looks from './looks.js';
import * as media from './media.js';
import * as orders from './orders.js';
import * as products from './products.js';
import * as site from './site.js';
import { csrf } from './ui.js';
import * as payq from './payments.js';
import * as customers from './customers.js';
import * as promos from './promos.js';
import * as costs from './costs.js';
import * as partners from './partners.js';
import * as analytics from './analytics.js';
import * as notifyAdmin from './notify.js';
import * as paymethods from './paymethods.js';
import { audit, safeEqual } from '../lib/security.js';
import { loadBundledFiles } from '../lib/bundled.js';
import { afterWrite } from './common.js';

const STAFF_OK = /^\/admin(\/(pedidos|pagos-recibidos|comprobante|avisos\/\d+|clientas|solicitudes|piezas|colecciones|lugares|looks|categorias|medios|biblioteca|envios|seo|cuenta|salir|reautenticar|api\/(media|upload|digital)).*)?$/;

export async function handle(c) {
  const { req, url, db, env } = c;
  const path = url.pathname.replace(/\/$/, '') || '/admin';
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') throw new HttpError(405);
  if (method === 'POST' && !sameOrigin(req, url)) throw new HttpError(403, 'Origen no permitido.');

  if (path === '/admin/login') return auth.login(c);

  const { user, sess, token } = await loadSession(db, req, env);
  Object.assign(c, { user, sess, token });
  if (!user) return path.startsWith('/admin/api/') ? json({ error: 'Tu sesión venció. Vuelve a entrar.' }, 401) : redirect('/admin/login');

  // CSRF: todo POST del panel lleva el token de la sesión
  if (method === 'POST') {
    const ct = req.headers.get('Content-Type') || '';
    let tok = req.headers.get('X-CSRF');
    if (!tok && (ct.includes('form-urlencoded') || ct.includes('multipart'))) {
      const f = await req.clone().formData();
      tok = f.get('_csrf');
    }
    if (!tok || !safeEqual(String(tok), sess.csrf)) throw new HttpError(403, 'La sesión del formulario venció. Recarga la página.');
  }

  if (path === '/admin/salir') return method === 'POST' ? auth.logout(c) : redirect('/admin');
  if (!sess.mfa_ok) {
    if (path === '/admin/2fa' && user.totp_enabled) return auth.mfa(c);
    if (path === '/admin/2fa/activar' && !user.totp_enabled) return auth.mfaSetup(c);
    return redirect(user.totp_enabled ? '/admin/2fa' : '/admin/2fa/activar');
  }
  if (path.startsWith('/admin/2fa')) return redirect('/admin');
  if (user.role !== 'ADMIN' && !STAFF_OK.test(path)) throw new HttpError(403, 'Tu rol no tiene acceso a esta sección.');

  // API JSON del panel
  if (path === '/admin/api/media' && method === 'GET') return media.apiList(c);
  if (path === '/admin/api/upload' && method === 'POST') return media.apiUpload(c);
  let m = path.match(/^\/admin\/api\/digital\/(\d+)\/file$/);
  if (m && method === 'POST') return media.apiDigitalFile(c, Number(m[1]));

  if (path === '/admin') return site.dashboard(c);
  // Pagos, clientas, temporadas, cupones, costos, afiliadas, analítica y avisos
  if (path === '/admin/pagos-recibidos') return payq.queue(c);
  if ((m = path.match(/^\/admin\/comprobante\/(\d+)$/))) return payq.proof(c, Number(m[1]));
  if ((m = path.match(/^\/admin\/avisos\/(\d+)\/enviado$/)) && method === 'POST') return orders.markSent(c, Number(m[1]));
  if (path === '/admin/avisos') return notifyAdmin.page(c);
  if (path === '/admin/clientas') return customers.list(c);
  if ((m = path.match(/^\/admin\/clientas\/(\d+)$/))) return customers.detail(c, Number(m[1]));
  if (path === '/admin/temporadas') return promos.campaigns(c);
  if ((m = path.match(/^\/admin\/temporadas\/(\d+|nuevo)$/))) return promos.campaignEdit(c, m[1]);
  if (path === '/admin/cupones') return promos.coupons(c);
  if ((m = path.match(/^\/admin\/cupones\/(\d+|nuevo)$/))) return promos.couponEdit(c, m[1]);
  if (path === '/admin/costos') return costs.overview(c);
  if ((m = path.match(/^\/admin\/costos\/(\d+)$/))) return costs.recipe(c, Number(m[1]));
  if ((m = path.match(/^\/admin\/materiales\/(\d+)\/compra$/)) && method === 'POST') return costs.materialPurchase(c, Number(m[1]));
  if ((m = path.match(/^\/admin\/pagos\/(\d+)\/datos$/)) && method === 'POST') return paymethods.saveDetails(c, Number(m[1]));
  if (path === '/admin/socias' || path.startsWith('/admin/socias/')) return redirect('/admin/afiliadas' + path.slice(13) + url.search, 301);
  if (path === '/admin/aliadas-imagenes') return aliadas.page(c);
  if (path === '/admin/integraciones') return integ.page(c);
  if (path === '/admin/afiliadas') return partners.list(c);
  if (path === '/admin/comisiones' || path === '/admin/comisiones.csv') return partners.payable(c);
  if ((m = path.match(/^\/admin\/afiliadas\/(\d+|nueva)$/))) return partners.edit(c, m[1]);
  if ((m = path.match(/^\/admin\/afiliadas\/(\d+)\/vista$/))) return partners.viewAs(c, Number(m[1]));
  if ((m = path.match(/^\/admin\/afiliadas\/(\d+)\/qr\.svg$/))) return partners.qr(c, Number(m[1]));
  if (path === '/admin/analitica') return analytics.dashboard(c);
  if (path === '/admin/utm') return analytics.utm(c);
  if (path === '/admin/ajustes/tasa-bcv' && method === 'POST') return site.fetchRate(c);
  if (path === '/admin/reautenticar') return auth.reauth(c);
  if (path === '/admin/cuenta') return site.account(c);
  if (path === '/admin/ajustes') return site.settings(c);
  if (path === '/admin/ajustes/whatsapp') return site.whatsapp(c);
  if (path === '/admin/ajustes/bs') return site.toggleBs(c);
  if (path === '/admin/seo') return site.seoPage(c);
  if (path === '/admin/envios/estados') return site.shippingStatesPage(c);
  { const m = path.match(/^\/admin\/seo\/([a-z0-9-]+)$/); if (m) return site.seoContent(c, m[1]); }
  if (path === '/admin/usuarios') return site.users(c);
  if (path === '/admin/auditoria') return site.auditLog(c);
  if ((m = path.match(/^\/admin\/solicitudes(?:\/(\d+))?$/))) return site.requests(c, m[1] ? Number(m[1]) : null);
  if (path === '/admin/pedidos') return orders.list(c);
  if ((m = path.match(/^\/admin\/pedidos\/(\d+)$/))) return orders.detail(c, Number(m[1]));
  if (path === '/admin/piezas') return products.list(c);
  if ((m = path.match(/^\/admin\/piezas\/(\d+|nuevo)$/))) return products.edit(c, m[1]);
  if (path === '/admin/looks') return looks.list(c);
  if ((m = path.match(/^\/admin\/looks\/(\d+|nuevo)$/))) return looks.edit(c, m[1]);
  if (path === '/admin/medios') return media.library(c);
  if ((m = path.match(/^\/admin\/medios\/(\d+)$/))) return media.item(c, Number(m[1]));

  if (path === '/admin/biblioteca/incluidas' && method === 'POST') return bundledGuides(c);
  m = path.match(/^\/admin\/([a-z]+)(?:\/(\d+|nuevo))?$/);
  if (m && crud.SPECS[m[1]]) {
    const spec = crud.SPECS[m[1]];
    if (!m[2]) return crud.list(c, spec, m[1]);
    const extra = {};
    if (m[1] === 'biblioteca' && m[2] !== 'nuevo') extra.after = await digitalFileBox(c, Number(m[2]));
    if (m[1] === 'materiales') {
      extra.refs = { supplier_id: (await db.all('SELECT id, name FROM suppliers ORDER BY name')).map((r) => [r.id, r.name]) };
      if (m[2] !== 'nuevo') extra.after = await costs.materialExtra(c, Number(m[2]));
    }
    if (m[1] === 'pagos' && m[2] !== 'nuevo') extra.after = await paymethods.detailsBox(c, Number(m[2]));
    return crud.edit(c, spec, m[1], m[2], extra);
  }
  throw new HttpError(404);
}

async function digitalFileBox(c, id) {
  const d = await c.db.first('SELECT id, file_name, file_bytes, file_sha256, price_cents FROM digital_products WHERE id=?', [id]);
  const S = await c.db.settings();
  if (!d) return '';
  const sells = await c.db.n("SELECT COUNT(*) n FROM order_lines WHERE kind='digital' AND ref_id=?", [id]);
  const dls = await c.db.n('SELECT COALESCE(SUM(downloads),0) n FROM download_grants WHERE digital_product_id=?', [id]);
  return html`<section class="card"><h2>Archivo</h2>
${d.file_name ? html`<p>Actual: <b>${d.file_name}</b> · ${Math.round((d.file_bytes || 0) / 1024)} KB <small class="muted">SHA-256 ${String(d.file_sha256 || '').slice(0, 12)}…</small></p>` : html`<p class="flash warn">Todavía no hay archivo: la guía se muestra como "muy pronto".</p>`}
<div class="uploader" data-digital-upload="${d.id}">${csrf(c)}<input type="file" id="digFile" accept=".pdf,.epub,.zip,application/pdf,application/epub+zip,application/zip" hidden>
<label for="digFile" class="drop"><b>${d.file_name ? 'Reemplazar archivo' : 'Subir archivo'}</b><span>PDF, EPUB o ZIP</span></label><div class="up-list"></div></div>
<p class="help">${d.price_cents ? `Vendida en ${sells} pedido(s). El enlace dura ${S['downloads.paid_days']} día(s) y permite ${S['downloads.paid_max']} descarga(s).` : `Gratis: cada persona recibe un enlace que dura ${S['downloads.free_hours']} hora(s) y permite ${S['downloads.free_max']} descarga(s).`} Descargas totales: ${dls}. <a href="/admin/ajustes#descargas">Cambiar duración</a></p></section>`;
}

async function bundledGuides(c) {
  const n = await loadBundledFiles(c);
  await audit(c.db, c, 'guias_incluidas', 'digital_products', null, { n });
  await afterWrite(c);
  return redirect('/admin/biblioteca?msg=' + encodeURIComponent(n ? `${n} guía(s) cargada(s).` : 'Las guías incluidas ya estaban cargadas.'), 303);
}
