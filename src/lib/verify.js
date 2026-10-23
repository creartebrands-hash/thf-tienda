// Verificación automática de pagos (opcional, apagada al empezar). Funciona igual que Cashea o Datalink: al tocar "Ya pagué",
// la tienda pregunta a un servicio conectado al banco si llegó un pago con esa referencia, ese monto y esa fecha.
// Proveedores posibles: la API "Confirmación de Transacción" de Banesco (cuenta jurídica), Pabilo, verificapago u otro.
// Cada uno entrega su documentación al contratarlo; este conector usa un formato neutro y firmado:
//   POST VERIFY_API_URL  (Authorization: Bearer VERIFY_API_KEY, X-THF-Signature: sha256=HMAC(VERIFY_API_KEY, cuerpo))
//   { method, currency, amount, reference, payer_bank, payer_phone, payer_doc, date, order }
//   ← { "verified": true|false, "detail": "…" }
// Si el proveedor usa otro formato, se adapta en mapRequest/mapResponse (pocas líneas) o con un puente (n8n, Make, una función).
// Sin respuesta clara, el pago queda "por verificar" para revisión manual: nunca se aprueba un pago por error de conexión.

export function verifierConfigured(env, S) {
  return !!(S['payments.auto_verify'] && env.VERIFY_API_URL && env.VERIFY_API_KEY && /^https:\/\//.test(env.VERIFY_API_URL));
}

const mapRequest = (p, o) => ({
  method: p.method_kind, currency: p.currency, amount: (p.amount_cents / 100).toFixed(2), reference: p.reference, payer_bank: p.payer_bank,
  payer_phone: p.payer_phone, payer_doc: p.payer_doc, date: p.paid_on, order: o.code,
});
const mapResponse = (j) => ({ verified: j?.verified === true, detail: String(j?.detail || j?.message || '').slice(0, 300) });

export async function autoVerify(env, S, payment, order) {
  if (!verifierConfigured(env, S)) return { status: 'manual' };
  const body = JSON.stringify(mapRequest(payment, order));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.VERIFY_API_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(env.VERIFY_API_URL, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.VERIFY_API_KEY}`, 'X-THF-Signature': `sha256=${sig}` }, body });
    if (!r.ok) return { status: 'error', detail: `El verificador respondió ${r.status}` };
    const m = mapResponse(await r.json());
    return { status: m.verified ? 'verified' : 'not_found', detail: m.detail };
  } catch (e) {
    return { status: 'error', detail: e?.name === 'AbortError' ? 'El verificador tardó demasiado' : 'No se pudo consultar el verificador' };
  } finally {
    clearTimeout(timer);
  }
}
