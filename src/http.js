// Utilidades HTTP compartidas por el sitio público, la API y el panel.
import { toString } from './lib/html.js';

export class HttpError extends Error {
  constructor(status, msg = '') {
    super(msg);
    this.status = status;
  }
}

export const htmlRes = (body, status = 200, headers = {}) =>
  new Response(typeof body === 'string' ? body : toString(body), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export const text = (body, type = 'text/plain; charset=utf-8', headers = {}) => new Response(body, { headers: { 'Content-Type': type, ...headers } });

export const redirect = (to, status = 302, headers = {}) => new Response(null, { status, headers: { Location: to, 'Cache-Control': 'no-store', ...headers } });

// Lee JSON con límite de tamaño (evita cuerpos enormes)
export async function readJson(req, max = 64 * 1024) {
  const ct = req.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Formato inválido.');
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > max) throw new HttpError(413, 'Solicitud demasiado grande.');
  const raw = await req.text();
  if (raw.length > max) throw new HttpError(413, 'Solicitud demasiado grande.');
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error();
    return d;
  } catch {
    throw new HttpError(400, 'Formato inválido.');
  }
}

export async function readForm(req, max = 256 * 1024) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > max) throw new HttpError(413, 'Formulario demasiado grande.');
  const ct = req.headers.get('Content-Type') || '';
  if (!ct.includes('application/x-www-form-urlencoded') && !ct.includes('multipart/form-data')) throw new HttpError(415, 'Formato inválido.');
  const fd = await req.formData();
  const o = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== 'string') continue;
    if (k in o) o[k] = [].concat(o[k], v);
    else o[k] = v;
  }
  return o;
}

// Peticiones que cambian datos: deben venir del mismo origen (defensa CSRF adicional)
export function sameOrigin(req, url) {
  const o = req.headers.get('Origin');
  if (o) return o === url.origin;
  const r = req.headers.get('Referer');
  if (r) {
    try { return new URL(r).origin === url.origin; } catch { return false; }
  }
  return req.headers.get('Sec-Fetch-Site') === 'same-origin';
}

export const clean = (s, n) => String(s ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').replace(/\r\n?/g, '\n').trim().slice(0, n);
export const cleanLine = (s, n) => clean(s, n).replace(/\s+/g, ' ');
