// Plantillas HTML con escape automático. Todo valor interpolado se escapa, salvo que venga envuelto en raw().
const RAW = Symbol('raw');

export function raw(s) {
  return { [RAW]: true, s: s == null ? '' : String(s) };
}

export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function render(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? render(vals[i]) : ''); });
  return raw(out);
}

export const toString = (h) => (h && h[RAW] ? h.s : String(h ?? ''));

// Texto plano a párrafos seguros
export function paras(text) {
  return raw((text || '').split('\n').map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join(''));
}

// Inserta en un fragmento HTML de confianza (del repositorio) valores escapados: {{clave}} → valor
export function fill(fragment, vals) {
  return raw(fragment.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vals ? render(vals[k]) : '')));
}
