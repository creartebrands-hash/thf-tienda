/* Panel THF: subida de fotos (convertidas a WebP en el navegador), selector de fotos, editor de puntos de looks y QR de 2FA. */
(function () {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSRF = ($('meta[name=csrf]') || {}).content || ($('input[name=_csrf]') || {}).value || '';

/* ---------- menú móvil, confirmaciones, cambios sin guardar ---------- */
const sb = $('#sideBtn'); if (sb) sb.onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); };
document.addEventListener('click', (e) => { const s = $('#side'); if (s && s.classList.contains('open') && !e.target.closest('#side')) s.classList.remove('open'); });
$$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
let dirty = false;
$$('form[data-dirty]').forEach((f) => { f.addEventListener('input', () => (dirty = true)); f.addEventListener('submit', () => (dirty = false)); });
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- dirección web automática a partir del nombre ---------- */
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
$$('input[data-slug]').forEach((sl) => {
  const form = sl.form; const src = form && (form.elements.name || form.elements.title);
  if (!src || sl.value) return;
  let touched = false; sl.addEventListener('input', () => (touched = true));
  src.addEventListener('input', () => { if (!touched) sl.value = slugify(src.value); });
});

/* ---------- contador de caracteres para SEO ---------- */
$$('[data-counter]').forEach((el) => { const out = $('[data-count]', el.closest('label')); const max = +el.dataset.counter; const u = () => { out.textContent = el.value.length; out.classList.toggle('over', el.value.length > max); }; el.addEventListener('input', u); u(); });

/* ---------- copiar ---------- */
$$('[data-copy-prev]').forEach((b) => b.addEventListener('click', () => { const t = b.previousElementSibling.textContent; const was = b.textContent; navigator.clipboard && navigator.clipboard.writeText(t).then(() => { b.textContent = 'Copiado ✓'; setTimeout(() => (b.textContent = was), 1600); }); }));
// Copiar un texto cualquiera (enlaces UTM, enlaces de socias, cupones)
document.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (!b) return; e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(() => { const was = b.textContent; b.textContent = 'Copiado ✓'; setTimeout(() => (b.textContent = was), 1400); }); });
// Avisos por WhatsApp: el enlace abre el chat y aquí se marca como enviado
const csrfTok = (document.querySelector('meta[name=csrf]') || {}).content || '';
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-mark-sent]'); if (!a) return; fetch(`/admin/avisos/${a.dataset.markSent}/enviado`, { method: 'POST', headers: { 'X-CSRF': csrfTok }, credentials: 'same-origin' }).then(() => { a.classList.add('done'); }).catch(() => {}); });
// Pedido: campos extra según el estado elegido (empresa y guía al enviar, punto de retiro)
// Analítica: al elegir un periodo de la lista se actualiza; "Personalizado…" abre las fechas con calendario
$$('[data-range]').forEach((f) => { const sel = $('[data-range-sel]', f), box = $('.rg-dates', f);
  sel.addEventListener('change', () => { if (sel.value === 'personalizado') { box.removeAttribute('data-hide'); const d = $('input[name=desde]', box); d.focus(); try { d.showPicker(); } catch {} } else { box.setAttribute('data-hide', ''); f.submit(); } });
  f.addEventListener('submit', () => { if (sel.value !== 'personalizado') $$('input[type=date]', f).forEach((i) => (i.disabled = true)); }); });
$$('[data-status-form]').forEach((f) => { const sel = $('[data-status-to]', f); const upd = () => $$('[data-when]', f).forEach((d) => (d.hidden = d.dataset.when !== sel.value)); sel.addEventListener('change', upd); upd(); });
// Selector de color sincronizado con el campo de texto
$$('[data-color-for]').forEach((c) => { const t = document.getElementById(c.dataset.colorFor); c.addEventListener('input', () => { t.value = c.value; t.dispatchEvent(new Event('input', { bubbles: true })); }); t.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; }); });
// Generador de enlaces UTM: vista previa en vivo
$$('[data-utm]').forEach((f) => { const out = $('[data-utm-out]', f); const upd = () => { const v = (n) => (($(`[name=${n}]`, f) || {}).value || '').trim(); const qs = new URLSearchParams(); ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((k) => v(k) && qs.set(k, v(k).toLowerCase().replace(/\s+/g, '-'))); out.textContent = location.origin + (v('dest') || '/') + (qs.toString() ? '?' + qs : ''); }; f.addEventListener('input', upd); upd(); });

/* ---------- convertir fotos a WebP en el navegador (sin datos de ubicación) ---------- */
const MAXPX = 2000;
async function toWebp(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la foto. Si es HEIC, ábrela en el teléfono y compártela como JPG.')); i.src = URL.createObjectURL(file); });
  }
  const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, MAXPX / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.86));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
  return { blob, w, h };
}
function send(url, body, headers, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('POST', url); x.setRequestHeader('X-CSRF', CSRF);
    Object.entries(headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} x.status < 300 ? res(j) : rej(new Error(j.error || 'Error al subir (' + x.status + ')')); };
    x.onerror = () => rej(new Error('Sin conexión. Intenta de nuevo.'));
    x.send(body);
  });
}
const altFromName = (n) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b(img|dsc|photo|whatsapp image)\b.*$/i, '').trim().slice(0, 120);
async function uploadOne(file, list) {
  const row = document.createElement('div'); row.className = 'up-item';
  row.innerHTML = `<img alt=""><div><div>${esc(file.name)}</div><div class="bar-p"><i></i></div></div><span class="st">Preparando…</span>`;
  list.appendChild(row);
  const st = $('.st', row), bar = $('.bar-p i', row);
  try {
    let body, headers = {}, kind;
    if (file.type.startsWith('video/') || /\.mp4$/i.test(file.name)) {
      if (!/mp4/i.test(file.type) && !/\.mp4$/i.test(file.name)) throw new Error('Solo videos MP4.');
      kind = 'video'; body = file;
    } else {
      kind = 'image';
      const r = await toWebp(file); body = r.blob; headers = { 'X-Width': r.w, 'X-Height': r.h };
      $('img', row).src = URL.createObjectURL(r.blob);
    }
    headers['X-Alt'] = encodeURIComponent(altFromName(file.name));
    st.textContent = 'Subiendo…';
    const j = await send('/admin/api/upload?kind=' + kind, body, headers, (p) => (bar.style.width = Math.round(p * 100) + '%'));
    bar.style.width = '100%'; row.classList.add('ok'); st.textContent = 'Listo ✓';
    return j;
  } catch (e) { row.classList.add('bad'); st.textContent = e.message; return null; }
}
function wireDrop(box, input, onFiles) {
  ['dragenter', 'dragover'].forEach((t) => box.addEventListener(t, (e) => { e.preventDefault(); box.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => box.addEventListener(t, (e) => { e.preventDefault(); box.classList.remove('over'); }));
  box.addEventListener('drop', (e) => onFiles([...e.dataTransfer.files]));
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
}
$$('[data-uploader]').forEach((box) => {
  const input = $('input[type=file]', box), list = $('.up-list', box);
  wireDrop(box, input, async (files) => { let ok = 0; for (const f of files) if (await uploadOne(f, list)) ok++; if (ok) setTimeout(() => location.reload(), 700); });
});
$$('[data-digital-upload]').forEach((box) => {
  const input = $('input[type=file]', box), list = $('.up-list', box), id = box.dataset.digitalUpload;
  wireDrop(box, input, async (files) => {
    const f = files[0]; if (!f) return;
    const row = document.createElement('div'); row.className = 'up-item'; row.innerHTML = `<span>📄</span><div>${esc(f.name)}<div class="bar-p"><i></i></div></div><span class="st">Subiendo…</span>`; list.appendChild(row);
    try { await send(`/admin/api/digital/${id}/file`, f, { 'X-Filename': encodeURIComponent(f.name) }, (p) => ($('.bar-p i', row).style.width = Math.round(p * 100) + '%')); row.classList.add('ok'); $('.st', row).textContent = 'Listo ✓'; setTimeout(() => location.reload(), 700); }
    catch (e) { row.classList.add('bad'); $('.st', row).textContent = e.message; }
  });
});

/* ---------- selector de fotos (elegir de la biblioteca o subir) ---------- */
const picker = $('#picker');
function openPicker(onPick, kind = 'image') {
  if (!picker) return;
  picker.innerHTML = `<div class="picker-card" role="dialog" aria-label="Elegir foto"><div class="picker-head"><h2>Elegir ${kind === 'video' ? 'video' : 'foto'}</h2><button class="btn ghost sm" data-x>Cerrar</button></div>
    <div class="picker-tools"><input type="search" placeholder="Buscar por descripción" data-q><label class="btn sm">Subir nueva<input type="file" accept="image/*,video/mp4" hidden data-up multiple></label></div>
    <div class="picker-grid" data-grid></div><div class="picker-foot"><button class="btn ghost sm" data-more hidden>Cargar más</button></div><div class="up-list" style="padding:0 16px 12px"></div></div>`;
  picker.hidden = false; document.body.style.overflow = 'hidden';
  const grid = $('[data-grid]', picker), more = $('[data-more]', picker);
  let off = 0, q = '';
  const close = () => { picker.hidden = true; picker.innerHTML = ''; document.body.style.overflow = ''; };
  const load = async (reset) => {
    if (reset) { off = 0; grid.innerHTML = ''; }
    const r = await fetch(`/admin/api/media?kind=${kind}&q=${encodeURIComponent(q)}&off=${off}`, { credentials: 'same-origin' });
    const j = await r.json();
    grid.insertAdjacentHTML('beforeend', j.items.map((m) => `<button type="button" data-id="${m.id}" data-url="${esc(m.url)}" title="${esc(m.alt)}">${m.kind === 'video' ? `<video src="${esc(m.url)}" muted preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`}</button>`).join(''));
    off += j.items.length; more.hidden = !j.more;
  };
  grid.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) { onPick({ id: b.dataset.id, url: b.dataset.url }); close(); } });
  $('[data-x]', picker).onclick = close;
  picker.onclick = (e) => { if (e.target === picker) close(); };
  let t; $('[data-q]', picker).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value; load(true); }, 250); });
  more.onclick = () => load(false);
  $('[data-up]', picker).addEventListener('change', async (e) => {
    const files = [...e.target.files]; let last = null;
    for (const f of files) { const r = await uploadOne(f, $('.up-list', picker)); if (r) last = r; }
    if (last && files.length === 1) { onPick({ id: String(last.id), url: last.url }); close(); } else load(true);
  });
  load(true);
}
$$('[data-mpick]').forEach((box) => {
  const input = $('input[type=hidden]', box), prev = $('.mprev', box), un = $('[data-unpick]', box);
  $('[data-pick]', box).onclick = () => openPicker((m) => { input.value = m.id; prev.innerHTML = `<img src="${esc(m.url)}" alt="">`; un.hidden = false; dirty = true; });
  un.onclick = () => { input.value = ''; prev.innerHTML = '<em>Sin foto</em>'; un.hidden = true; dirty = true; };
});
$$('[data-pick-add]').forEach((b) => b.addEventListener('click', () => { const f = b.form; openPicker((m) => { f.elements.media_id.value = m.id; dirty = false; f.submit(); }); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picker && !picker.hidden) { picker.hidden = true; picker.innerHTML = ''; document.body.style.overflow = ''; } });

/* ---------- puntos sobre la foto del look ---------- */
$$('[data-hotspots]').forEach((form) => {
  const photo = $('.hs-photo', form); if (!photo) return;
  let sel = null;
  const pick = (id) => { sel = id; $$('.hs', form).forEach((h) => h.classList.toggle('sel', h.dataset.hs === id)); $$('[data-hs-item]', form).forEach((li) => li.classList.toggle('sel', li.dataset.hsItem === id)); };
  $$('[data-hs-item]', form).forEach((li) => $('.hs-sel', li).addEventListener('click', () => pick(li.dataset.hsItem)));
  const setPos = (id, e) => {
    const r = photo.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)), y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    const h = $(`.hs[data-hs="${id}"]`, form); h.style.left = x + '%'; h.style.top = y + '%';
    form.elements['x_' + id].value = x.toFixed(1); form.elements['y_' + id].value = y.toFixed(1); dirty = true;
  };
  photo.addEventListener('click', (e) => { if (e.target.closest('.hs')) return; if (!sel) { const f = $('[data-hs-item]', form); if (f) pick(f.dataset.hsItem); } if (sel) setPos(sel, e); });
  $$('.hs', form).forEach((h) => {
    h.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(h.dataset.hs); h.setPointerCapture(e.pointerId); const mv = (ev) => setPos(h.dataset.hs, ev); const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); }; h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); });
  });
  const f = $('[data-hs-item]', form); if (f) pick(f.dataset.hsItem);
  form.addEventListener('submit', () => (dirty = false));
});

/* ---------- Código QR (para la app de autenticación) ---------- */
function qrSvg(text) {
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
window.__thfQr = qrSvg;
$$('[data-qr]').forEach((el) => { try { el.innerHTML = qrSvg(el.dataset.qr); } catch (e) { el.hidden = true; } });
})();

// Copiar prompts de fotos con IA
document.querySelectorAll('[data-copy-text]').forEach((b) => b.addEventListener('click', () => {
  const t = b.previousElementSibling;
  const done = () => { b.textContent = 'Copiado ✓'; setTimeout(() => (b.textContent = 'Copiar prompt'), 1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(done, () => { t.select(); });
  else { t.select(); document.execCommand && document.execCommand('copy'); done(); }
}));

// Variantes con color (Piezas → Variantes): filas editables que se guardan como JSON validado por el servidor
document.querySelectorAll('[data-cv]').forEach((box) => {
  const $ = (s, el = box) => el.querySelector(s), $$ = (s, el = box) => [...el.querySelectorAll(s)];
  const json = $('[data-cv-json]'), rows = $('[data-cv-rows]'), tpl = $('[data-cv-tpl]'), prev = $('[data-cv-prev]');
  json.hidden = true;
  const sync = () => {
    const items = $$('[data-cv-row]', rows).map((r) => ({ name: $('[data-cv-name]', r).value.trim(), hex: $('[data-cv-hex]', r).value.toUpperCase(), on: $('[data-cv-on]', r).checked })).filter((x) => x.name);
    json.value = items.length ? JSON.stringify({ label: $('[data-cv-label]').value.trim() || 'Color', shape: $('[data-cv-shape]').value, items }) : '';
    prev.className = 'cv-prev ' + $('[data-cv-shape]').value;
    prev.replaceChildren(...items.filter((x) => x.on).map((x) => { const s = document.createElement('span'); s.style.background = x.hex; s.title = x.name; return s; }));
    json.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const add = (name = '', hex = '#D9C7B8') => { const r = tpl.content.firstElementChild.cloneNode(true); $('[data-cv-name]', r).value = name; $('[data-cv-hex]', r).value = hex.toLowerCase(); rows.appendChild(r); sync(); if (!name) $('[data-cv-name]', r).focus(); };
  box.addEventListener('input', (e) => { if (e.target !== json) sync(); });
  box.addEventListener('change', (e) => { if (e.target !== json) sync(); });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-cv-add]')) { e.preventDefault(); add(); }
    const q = e.target.closest('[data-cv-quick]'); if (q) { e.preventDefault(); if (!$$('[data-cv-name]', rows).some((i) => i.value.trim().toLowerCase() === q.dataset.cvQuick.toLowerCase())) add(q.dataset.cvQuick, q.dataset.hex); }
    const d = e.target.closest('[data-cv-del]'); if (d) { e.preventDefault(); d.closest('[data-cv-row]').remove(); sync(); }
  });
  sync();
});
