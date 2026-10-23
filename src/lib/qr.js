// Código QR en SVG generado en el servidor (sin dependencias). Mismo codificador que usa el panel para la verificación en dos pasos.
// Modo byte, corrección de errores nivel L, versiones 1 a 10 (hasta ~270 caracteres): suficiente para enlaces.
export function qrSvg(text) {
  const data = new TextEncoder().encode(text);
  const TAB = [null, [10, [16]], [16, [28]], [26, [44]], [18, [32, 32]], [24, [43, 43]], [16, [27, 27, 27, 27]], [18, [31, 31, 31, 31]], [22, [38, 38, 39, 39]], [22, [36, 36, 36, 37, 37]], [26, [43, 43, 43, 43, 44]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  let ver = 1;
  for (; ver <= 10; ver++) { const cap = TAB[ver][1].reduce((a, b) => a + b, 0); if (4 + (ver < 10 ? 8 : 16) + data.length * 8 <= cap * 8) break; }
  if (ver > 10) throw new Error('texto muy largo');
  const [ecLen, blocks] = TAB[ver]; const cap = blocks.reduce((a, b) => a + b, 0);
  const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(data.length, ver < 10 ? 8 : 16); data.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0xec; cw.length < cap; p ^= 0xec ^ 0x11) cw.push(p);
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
  const div = (() => { const r = new Array(ecLen).fill(0); r[ecLen - 1] = 1; let root = 1; for (let i = 0; i < ecLen; i++) { for (let j = 0; j < ecLen; j++) { r[j] = mul(r[j], root); if (j + 1 < ecLen) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; })();
  const rem = (d) => { const r = new Array(ecLen).fill(0); for (const b of d) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => (r[i] ^= mul(c, f))); } return r; };
  const bl = []; let o = 0; for (const n of blocks) { const d = cw.slice(o, o + n); o += n; bl.push({ d, e: rem(d) }); }
  const out = []; const maxD = Math.max(...blocks);
  for (let i = 0; i < maxD; i++) bl.forEach((b) => i < b.d.length && out.push(b.d[i]));
  for (let i = 0; i < ecLen; i++) bl.forEach((b) => out.push(b.e[i]));
  const size = ver * 4 + 17; const M = [...Array(size)].map(() => new Array(size).fill(false)); const F = [...Array(size)].map(() => new Array(size).fill(false));
  const set = (x, y, v) => { M[y][x] = v; F[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(xx, yy, d !== 2 && d !== 4); } } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = ALIGN[ver], last = al.length - 1;
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) { if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
  const fmt = (mask) => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412; const g = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true); };
  fmt(0);
  if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = (ver << 12) | r; for (let i = 0; i < 18; i++) { const v = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, v); set(c, a, v); } }
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v; if (!F[y][x] && k < out.length * 8) { M[y][x] = ((out[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; } } }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && (x + y) % 2 === 0) M[y][x] = !M[y][x];
  let p = ''; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (M[y][x]) p += `M${x + 4},${y + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${p}" fill="#000"/></svg>`;
}
