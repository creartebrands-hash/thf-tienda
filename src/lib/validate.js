// Validadores y normalizadores de datos venezolanos. Todo lo que entra del navegador pasa por aquí antes de tocar la base.
import { clean, cleanLine } from '../http.js';

export class ValidationError extends Error {}
const fail = (m) => { throw new ValidationError(m); };

// Cédula o RIF: V, E, J, P (pasaporte) o G (gobierno) + dígitos. Clave única: "V12345678"
export function docKey(type, number) {
  const t = String(type || 'V').toUpperCase().trim();
  const n = String(number || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!['V', 'E', 'J', 'P', 'G'].includes(t)) fail('Elige el tipo de documento.');
  if (n.length < 5 || n.length > 10) fail('Revisa tu número de cédula o RIF.');
  return `${t}${n}`;
}
export const docText = (key) => (key ? `${key[0]}-${key.slice(1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '');

// Teléfono: venezolano (0414…, 414…, +58 414…) → 58 + 10 dígitos. Internacional: + y 8 a 15 dígitos.
export function phoneKey(raw) {
  const s = String(raw || '').trim();
  let d = s.replace(/\D/g, '');
  if (s.startsWith('+') && !d.startsWith('58')) {
    if (d.length < 8 || d.length > 15) fail('Revisa tu número de teléfono.');
    return d;
  }
  if (d.startsWith('0058')) d = d.slice(2);
  if (d.startsWith('58') && d.length === 12) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  if (!/^(2\d{9}|4(12|14|16|24|26|22)\d{7})$/.test(d)) fail('Escribe un teléfono venezolano válido, por ejemplo 0414 123 4567.');
  return `58${d}`;
}
export const phoneText = (key) => (key && key.startsWith('58') && key.length === 12 ? `0${key.slice(2, 5)} ${key.slice(5, 8)} ${key.slice(8)}` : key ? `+${key}` : '');

export function emailKey(raw, { required = true } = {}) {
  const e = cleanLine(raw, 120).toLowerCase();
  if (!e) { if (required) fail('Escribe tu correo electrónico.'); return ''; }
  if (!/^[^\s@<>"']{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e)) fail('Revisa tu correo electrónico.');
  return e;
}

export function personName(raw) {
  const n = cleanLine(raw, 80);
  if (n.length < 3 || !/\p{L}/u.test(n) || /[<>{}$\\]/.test(n)) fail('Escribe tu nombre y apellido.');
  return n;
}

export const text = (raw, max) => clean(raw, max).replace(/[<>]/g, '');
export const line = (raw, max) => cleanLine(raw, max).replace(/[<>]/g, '');

// Referencia bancaria o código de confirmación: letras y números
export function reference(raw, { min = 4, max = 30 } = {}) {
  const r = String(raw || '').replace(/[\s.\-#]/g, '').toUpperCase();
  if (r.length < min || r.length > max || !/^[A-Z0-9]+$/.test(r)) fail(`La referencia debe tener entre ${min} y ${max} letras o números.`);
  return r;
}

export function isoDay(raw, { maxPastDays = 45 } = {}) {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('Elige la fecha del pago.');
  const t = Date.parse(s + 'T12:00:00Z');
  const now = Date.now();
  if (!Number.isFinite(t) || t > now + 36 * 3600e3 || t < now - maxPastDays * 86400e3) fail('Revisa la fecha del pago.');
  return s;
}

// Monto escrito por la persona ("1.234,56" o "1234.56") → centavos
export function amountCents(raw) {
  let s = String(raw || '').replace(/[^\d.,]/g, '');
  if (!s) fail('Escribe el monto que pagaste.');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) fail('Revisa el monto.');
  const [e, d = ''] = s.split('.');
  return Number(e) * 100 + Number((d + '00').slice(0, 2));
}

// Bancos de Venezuela (código SUDEBAN): para elegir el banco de origen del Pago Móvil
export const BANKS = [
  ['0102', 'Banco de Venezuela'], ['0104', 'Venezolano de Crédito'], ['0105', 'Mercantil'], ['0108', 'Provincial (BBVA)'], ['0114', 'Bancaribe'],
  ['0115', 'Exterior'], ['0128', 'Banco Caroní'], ['0134', 'Banesco'], ['0137', 'Sofitasa'], ['0138', 'Banco Plaza'], ['0146', 'Bangente'],
  ['0151', 'BFC Banco Fondo Común'], ['0156', '100% Banco'], ['0157', 'DelSur'], ['0163', 'Banco del Tesoro'], ['0166', 'Banco Agrícola de Venezuela'],
  ['0168', 'Bancrecer'], ['0169', 'R4 Banco Microfinanciero'], ['0171', 'Banco Activo'], ['0172', 'Bancamiga'], ['0173', 'Banco Internacional de Desarrollo'],
  ['0174', 'Banplus'], ['0175', 'Banco Digital de los Trabajadores'], ['0177', 'Banfanb'], ['0178', 'N58 Banco Digital'], ['0191', 'Banco Nacional de Crédito (BNC)'],
];
export const bankName = (code) => BANKS.find(([c]) => c === code)?.[1] || '';
export function bankCode(raw) {
  const c = String(raw || '');
  if (!BANKS.some(([k]) => k === c)) fail('Elige el banco desde el que pagaste.');
  return c;
}

export const STATES = ['Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico',
  'La Guaira', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Yaracuy', 'Zulia'];
export function state(raw, { required = false } = {}) {
  const s = cleanLine(raw, 40);
  if (!s) { if (required) fail('Elige tu estado.'); return ''; }
  if (!STATES.includes(s)) fail('Elige tu estado de la lista.');
  return s;
}

export function password(raw) {
  const p = String(raw || '');
  if (p.length < 10) fail('La contraseña debe tener al menos 10 caracteres.');
  if (p.length > 200) fail('La contraseña es demasiado larga.');
  if (new Set(p).size < 5 || /^(\d+|[a-z]+)$/i.test(p) && p.length < 14) fail('Esa contraseña es muy fácil de adivinar. Mezcla letras y números.');
  return p;
}

export const couponCode = (raw) => String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 24);
