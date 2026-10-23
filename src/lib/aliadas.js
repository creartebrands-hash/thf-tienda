// Tienda de cada aliada (/e/slug): edición básica sin subir archivos. THF decide qué imágenes y banners hay
// (Panel → Programas → Imágenes para aliadas); la aliada solo elige título, subtítulo, colores, un banner y una foto por pieza.
// Así su tienda no repite las fotos de la tienda principal y nada de lo que ella cambie puede romper el sitio.
import { mediaUrl } from './repo.js';
import * as V from './validate.js';

// Categorías del menú de la tienda, en este orden (solo se muestran las que tienen piezas en su tienda)
export const BASIC_CATS = ['collares', 'zarcillos', 'pulseras', 'sets', 'anillos'];

// Colores sugeridos (la aliada también puede elegir cualquiera con el selector)
export const BG_PRESETS = [['#F3EBE1', 'Arena'], ['#FFFFFF', 'Blanco'], ['#E7D6C3', 'Beige'], ['#FBEDEF', 'Rosa suave'], ['#EAF0EA', 'Salvia'], ['#E8EEF6', 'Cielo'], ['#192543', 'Marino'], ['#3D1011', 'Burdeos'], ['#0D0C0B', 'Negro']];
export const FG_PRESETS = [['#1D1815', 'Tinta'], ['#0D0C0B', 'Negro'], ['#192543', 'Marino'], ['#3D1011', 'Burdeos'], ['#735619', 'Oro oscuro'], ['#FFFFFF', 'Blanco'], ['#F3EBE1', 'Arena'], ['#E2C47A', 'Oro claro']];
export const DEFAULT_BG = '#F3EBE1';
export const DEFAULT_FG = '#1D1815';

const HEX = /^#[0-9a-fA-F]{6}$/;
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export const isDark = (hex) => lum(hex) < 0.18;

export function hexOrEmpty(v, label) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!HEX.test(s)) throw new V.ValidationError(`${label}: elige un color de la lista o del selector.`);
  return s.toUpperCase();
}

// Valida lo que la aliada guarda en "Mi tienda". Nunca acepta CSS, HTML ni archivos: solo texto corto, dos colores y un id permitido.
export async function validateStore(db, f) {
  const title = V.line(f.title, 60);
  const subtitle = V.line(f.subtitle, 80);
  const bio = V.text(f.bio, 280);
  const bg = hexOrEmpty(f.bg, 'Color de fondo');
  const fg = hexOrEmpty(f.fg, 'Color del texto');
  if (contrast(bg || DEFAULT_BG, fg || DEFAULT_FG) < 4.5)
    throw new V.ValidationError('Con esos colores el texto no se lee bien. Elige un fondo más claro o un texto más oscuro (o al revés).');
  let banner = null;
  if (f.banner && f.banner !== 'none') {
    const id = Number(f.banner);
    const ok = Number.isInteger(id) && (await db.first("SELECT id FROM aliada_assets WHERE id=? AND kind='banner' AND active=1", [id]));
    if (!ok) throw new V.ValidationError('Ese banner ya no está disponible. Elige otro.');
    banner = id;
  }
  return { title, subtitle, bio, bg, fg, banner };
}

// Opciones disponibles: banners y fotos por pieza (con su URL)
export async function assetOptions(db) {
  const rows = await db.all(`SELECT a.id, a.kind, a.product_id, a.title, m.path, m.alt FROM aliada_assets a JOIN media m ON m.id=a.media_id
    WHERE a.active=1 ORDER BY a.kind, a.product_id, a.sort, a.id`);
  const banners = [], byProduct = new Map();
  for (const r of rows) {
    const o = { id: r.id, url: mediaUrl(r.path), title: r.title || r.alt || '' };
    if (r.kind === 'banner') banners.push(o);
    else { if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, []); byProduct.get(r.product_id).push(o); }
  }
  return { banners, byProduct };
}

// La foto de una pieza en la tienda de la aliada: la que eligió (si sigue disponible) o la primera opción de THF
export function pieceImage(opts, productId, chosenId) {
  const list = opts.byProduct.get(productId) || [];
  return list.find((o) => o.id === chosenId) || list[0] || null;
}

// Estilo de su tienda: solo variables con colores validados
export function storeCss(p) {
  const bg = HEX.test(p.store_bg || '') ? p.store_bg : DEFAULT_BG;
  const fg = HEX.test(p.store_fg || '') ? p.store_fg : DEFAULT_FG;
  const dark = isDark(bg);
  return `:root{--st-bg:${bg};--st-fg:${fg};--st-line:${dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)'};--st-card:${dark ? 'rgba(255,255,255,.06)' : '#ffffff'}}`;
}
