// Variantes visuales de una pieza: un grupo de opciones con muestra de color (círculo o cuadrado), por ejemplo
// "Color de la piedra: Cuarzo rosa, Cuarzo blanco, Amatista". Se editan en Panel → Piezas → (pieza) → Variantes.
// Se guardan como JSON validado (nunca CSS ni HTML: solo nombres cortos y colores #RRGGBB). El servidor valida la elección al cotizar.
import { html } from './html.js';
import * as V from './validate.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
export const MAX_ITEMS = 24;

// Lectura tolerante (lo inválido se descarta): para mostrar y para cotizar
export function readColors(json) {
  let o;
  try { o = typeof json === 'string' ? (json ? JSON.parse(json) : null) : json; } catch { return null; }
  if (!o || !Array.isArray(o.items)) return null;
  const seen = new Set();
  const items = o.items.slice(0, MAX_ITEMS).map((x) => ({ name: String(x?.name || '').trim().slice(0, 30), hex: HEX.test(x?.hex || '') ? x.hex.toUpperCase() : '', on: x?.on !== false }))
    .filter((x) => x.name && x.hex && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()));
  if (!items.length) return null;
  return { label: String(o.label || 'Color').trim().slice(0, 30) || 'Color', shape: o.shape === 'square' ? 'square' : 'circle', items };
}

// Para la tienda: solo las opciones disponibles (las agotadas no salen ni en el HTML ni en el JSON)
export function publicColors(json) {
  const c = readColors(json);
  if (!c) return null;
  const items = c.items.filter((x) => x.on);
  return items.length ? { ...c, items } : null;
}

// Validación estricta del panel: avisa en vez de descartar
export function validateColors(raw0) {
  const s = String(raw0 ?? '').trim();
  if (!s || s === '{}' || s === 'null') return '';
  let o;
  try { o = JSON.parse(s); } catch { throw new V.ValidationError('Variantes: el formato no es válido.'); }
  if (!o || typeof o !== 'object' || !Array.isArray(o.items)) throw new V.ValidationError('Variantes: el formato no es válido.');
  const rows = o.items.filter((x) => String(x?.name || '').trim() || String(x?.hex || '').trim());
  if (!rows.length) return '';
  if (rows.length > MAX_ITEMS) throw new V.ValidationError(`Variantes: máximo ${MAX_ITEMS} opciones.`);
  const seen = new Set();
  for (const x of rows) {
    const name = String(x.name || '').trim();
    if (!name) throw new V.ValidationError('Variantes: cada opción necesita un nombre.');
    if (name.length > 30) throw new V.ValidationError(`Variantes: "${name.slice(0, 30)}…" es muy largo (máximo 30 caracteres).`);
    if (/[<>{}]/.test(name)) throw new V.ValidationError('Variantes: el nombre no puede llevar < > { }.');
    if (!HEX.test(String(x.hex || ''))) throw new V.ValidationError(`Variantes: elige el color de "${name}".`);
    if (seen.has(name.toLowerCase())) throw new V.ValidationError(`Variantes: "${name}" está repetida.`);
    seen.add(name.toLowerCase());
  }
  const label = V.line(o.label || 'Color', 30) || 'Color';
  return JSON.stringify({ label, shape: o.shape === 'square' ? 'square' : 'circle', items: rows.map((x) => ({ name: V.line(x.name, 30), hex: String(x.hex).toUpperCase(), on: x.on !== false && x.on !== 0 && x.on !== '0' })) });
}

// Elección de la clienta → opción disponible (o la primera disponible). null si la pieza no tiene variantes.
export function pickColor(colors, wanted) {
  if (!colors) return null;
  const on = colors.items.filter((x) => x.on);
  if (!on.length) return null;
  return on.find((x) => x.name.toLowerCase() === String(wanted || '').trim().toLowerCase()) || on[0];
}

// Muestras en la tarjeta (solo las disponibles), máximo 6 + "+N"
export function swatchRow(colors, cls = 'sw-row') {
  if (!colors) return '';
  const on = colors.items.filter((x) => x.on);
  if (on.length < 2) return '';
  const shown = on.slice(0, 6);
  return html`<ul class="${cls} ${colors.shape}" aria-label="${colors.label}: ${on.map((x) => x.name).join(', ')}">${shown.map((x) => html`<li title="${x.name}"><span style="--sw:${x.hex}"></span></li>`)}${on.length > shown.length ? html`<li class="more">+${on.length - shown.length}</li>` : ''}</ul>`;
}
