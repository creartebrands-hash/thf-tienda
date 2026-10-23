// Vista previa estática del panel: las pantallas son reales (capturadas de la tienda con datos de demostración),
// pero aquí no se guarda nada. Los formularios y botones avisan que es una demostración.
(function () {
  const say = (t) => {
    let el = document.getElementById('pvToast');
    if (!el) {
      el = document.createElement('div'); el.id = 'pvToast';
      el.setAttribute('style', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:999;background:#0D0C0B;color:#F3EBE1;padding:12px 18px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:90vw;text-align:center;transition:opacity .3s;opacity:0');
      document.body.appendChild(el);
    }
    el.textContent = t; el.style.opacity = '1'; clearTimeout(say._t); say._t = setTimeout(() => (el.style.opacity = '0'), 2600);
  };
  const real = window.fetch.bind(window);
  window.fetch = (url, init) => (/\/admin\//.test(String(url)) ? Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })) : real(url, init));
  document.addEventListener('submit', (e) => { e.preventDefault(); say('Vista previa: en el panel real este botón guarda el cambio (y queda en Auditoría).'); }, true);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href="#pv"]');
    if (a) { e.preventDefault(); say('Esta pantalla no está incluida en la vista previa. En el panel real se abre normalmente.'); }
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.setAttribute('style', 'position:sticky;top:0;z-index:70;display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 14px;background:#F4EAD0;color:#735619;font:13px/1.3 system-ui,sans-serif;border-bottom:1px solid rgba(115,86,25,.25)');
    bar.innerHTML = '<span><b>Vista previa del panel</b> · datos de demostración, nada se guarda</span><a href="recorrido.html" style="color:#0D0C0B">Recorrido completo</a><a href="index.html" style="color:#0D0C0B">Ver la tienda</a>';
    const main = document.querySelector('.main') || document.body;
    main.prepend(bar);
  });
})();
