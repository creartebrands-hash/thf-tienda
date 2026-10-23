// Vista previa estática: simula /api/quote y /api/orders en el navegador con las mismas reglas del servidor.
(function () {
  const P = window.__THF_PREVIEW, real = window.fetch.bind(window);
  const pct = (c, b) => Math.floor((Math.abs(c) * Math.abs(b) + 5000) / 10000) * (c < 0 !== b < 0 ? -1 : 1);
  const money = (c) => '$' + Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(c % 100).padStart(2, '0');
  function quote(b) {
    const lines = b.lines || [];
    if (!lines.length) throw new Error('Tu pedido está vacío.');
    let loose = 0;
    for (const l of lines) { const p = P.prods[l.id]; if ((l.kind || 'product') === 'product' && p && !p.bundle) loose += l.qty; }
    const mayor = loose >= P.min; let physical = false;
    const out = lines.map((l) => {
      if ((l.kind || 'product') === 'product') {
        const p = P.prods[l.id]; if (!p) throw new Error('Una pieza de tu pedido ya no está disponible.'); physical = true;
        const unit = p.bundle ? p.unit : mayor && p.wh != null ? Math.min(p.wh, p.unit) : p.unit;
        return { kind: 'product', id: l.id, name: p.name, sku: p.sku, variant: l.variant || '', qty: l.qty, unit, total: unit * l.qty, priceKind: p.bundle ? 'caja' : mayor && p.wh != null ? 'mayor' : 'detal' };
      }
      if (l.kind === 'look') { const k = P.looks[l.id]; if (!k) throw new Error('Ese look ya no está disponible.'); physical = true;
        return { kind: 'look', id: l.id, slug: k.slug, name: k.name, sku: 'LOOK-' + l.id, variant: 'Look completo', qty: l.qty, unit: k.price, total: k.price * l.qty, priceKind: 'look' }; }
      const d = P.dig[l.id]; if (!d) throw new Error('Esa guía ya no está disponible.');
      return { kind: 'digital', id: l.id, name: d.name, sku: 'DIG-' + l.id, variant: d.fmt, qty: 1, unit: d.price, total: d.price, priceKind: 'digital' };
    });
    const subtotal = out.reduce((a, l) => a + l.total, 0);
    const zone = P.zones.find((z) => z.code === b.zone) || P.zones[0];
    let shipping = 0, shippingLabel = '', freeLeft = null;
    if (!physical) shippingLabel = 'Entrega digital';
    else if (zone.fee == null) shippingLabel = zone.cod ? 'A cobrar en destino' : 'Por cotizar por WhatsApp';
    else if (zone.fee === 0) shippingLabel = 'Sin costo';
    else if (zone.free != null && !mayor && subtotal >= zone.free) shippingLabel = 'Gratis';
    else { shipping = zone.fee; shippingLabel = money(shipping); if (zone.free != null && !mayor) freeLeft = zone.free - subtotal; }
    const pay = P.pays.find((m) => m.code === b.pay) || P.pays[0];
    if (pay.island && physical && !['isla', 'retiro'].includes(zone.kind)) throw new Error(pay.name + ' solo está disponible para entregas en la isla.');
    let discount = 0, coupon = null, discountLabel = '';
    if (b.coupon) {
      const cp = (P.coupons || []).find((x) => x.code === String(b.coupon).toUpperCase());
      if (!cp) coupon = { ok: false, error: 'Ese cupón no existe o ya venció.' };
      else if (mayor && cp.retail) coupon = { ok: false, error: 'Este cupón no aplica a pedidos al mayor.' };
      else {
        coupon = { ok: true, code: cp.code, description: cp.description }; discountLabel = 'Cupón ' + cp.code;
        if (cp.kind === 'pct') discount = pct(subtotal, cp.value);
        else if (cp.kind === 'monto') discount = Math.min(subtotal, cp.value);
        else if (cp.kind === 'envio') { discount = shipping; }
      }
    }
    const adj = pct(subtotal - discount + shipping, pay.adj);
    return { lines: out, subtotal, shipping, shippingLabel, discount, discountLabel, coupon, ref: null, adj, total: subtotal - discount + shipping + adj, mayor, loosePieces: loose, wholesaleMin: P.min,
      missingForWholesale: loose ? Math.max(0, P.min - loose) : 0, freeLeft, physical, zone: { code: zone.code, name: zone.name, kind: zone.kind, eta: zone.eta },
      pay: { code: pay.code, name: pay.name, adjBps: pay.adj }, kind: mayor ? 'mayor' : 'detal' };
  }
  const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const bad = (e) => new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, init) => {
    const u = String(url);
    try {
      const b = init && typeof init.body === 'string' ? JSON.parse(init.body) : {};
      if (/\/api\/quote$/.test(u)) return ok(quote(b));
      if (/\/api\/orders$/.test(u)) {
        const q = quote(b), c = b.customer || {}, code = 'THF-' + new Date().getFullYear() + '-DEMO' + String(Date.now()).slice(-2);
        const msg = ['*Pedido ' + code + '* (vista previa)', 'Tipo: ' + (q.mayor ? 'Al mayor' : 'Detal'), '', ...q.lines.map((l) => '• ' + l.name + ' (' + l.sku + ') × ' + l.qty + ' = ' + money(l.total)), '',
          'Subtotal: ' + money(q.subtotal), 'Envío (' + q.zone.name + '): ' + q.shippingLabel, '*Total: ' + money(q.total) + ' USD*', '', 'Elaboración: ' + P.lead, 'Cliente: ' + (c.name || ''), 'Teléfono: ' + (c.phone || '')].join('\n');
        const payUrl = P.mode !== 'whatsapp' ? new URL('pedido-ejemplo.html', location.href).pathname : '';
        return ok({ code, message: msg, wa: 'https://wa.me/' + P.wa + '?text=' + encodeURIComponent(msg), status: payUrl, mode: P.mode, total: q.total,
          payNote: 'Vista previa: en la tienda publicada el pedido queda guardado en el panel y se envía al WhatsApp oficial.' });
      }
      if (/\/api\/requests$/.test(u)) return ok({ ok: true, wa: null });
      { const m = u.match(/\/api\/digital\/([a-z0-9-]+)\/free$/); if (m) return ok({ url: 'files/' + ((P.files || {})[m[1]] || 'guia-cuidado-thf.pdf'), hours: P.freeHours || 48 }); }
      if (/\/api\/me$/.test(u)) return ok({});
      if (/\/api\/t$/.test(u)) return new Response(null, { status: 204 });
      if (/\/api\/orders\/[^/]+\/metodo$/.test(u)) return ok({ ok: true });
      if (/\/api\/orders\/[^/]+\/pago$/.test(u)) { setTimeout(() => { location.href = 'pedido-ejemplo-verificando.html'; }, 550); return ok({ ok: true }); }
    } catch (e) { return bad(e); }
    return real(url, init);
  };

  // Formularios de cuenta y portal: en la vista previa llevan a la pantalla de ejemplo; el resto avisa que es una demostración
  const FORMS = { '/cuenta/entrar': 'cuenta-pedidos.html', '/cuenta/registro': 'cuenta-pedidos.html', '/cuenta/recuperar': 'cuenta-entrar.html', '/afiliadas/entrar': 'afiliadas-panel-embajadora.html',
    '/cuenta/salir': 'index.html', '/afiliadas/salir': 'afiliadas-entrar.html' };
  const say = (t) => { const el = document.getElementById('toast'); if (el) { el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2800); } else alert(t); };
  document.addEventListener('submit', (e) => {
    const f = e.target; if (!(f instanceof HTMLFormElement) || (f.getAttribute('method') || '').toLowerCase() !== 'post') return;
    const a = f.getAttribute('action') || location.pathname;
    e.preventDefault();
    const key = Object.keys(FORMS).find((k) => a.endsWith(k) || a.endsWith(k.slice(1).replace(/\//g, '-') + '.html'));
    if (key) location.href = FORMS[key]; else say('Vista previa: en la tienda publicada este formulario guarda los datos.');
  }, true);
  // Botón discreto para recorrer todas las pantallas (solo en la vista previa)
  document.addEventListener('DOMContentLoaded', () => {
    const a = document.createElement('a'); a.href = 'recorrido.html'; a.className = 'pv-tour'; a.textContent = 'Recorrido de la vista previa';
    a.setAttribute('style', 'position:fixed;left:16px;bottom:16px;z-index:60;font:500 11px/1 Jost,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:10px 14px;border-radius:999px;background:rgba(13,12,11,.82);color:#E2C47A;text-decoration:none;backdrop-filter:blur(6px)');
    document.body.appendChild(a);
  });
})();
