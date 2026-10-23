// Clientas: una persona = una cédula + un teléfono + un correo. No se duplican, así los cupones personales
// y los descuentos de primera compra no se repiten ni se transfieren.
import { nowIso } from './db.js';
import { ValidationError } from './validate.js';

export class CustomerConflict extends ValidationError {}

// Busca por las tres claves. Si coinciden con la misma persona (o no existe), sigue; si apuntan a personas distintas, se detiene.
export async function resolveCustomer(db, data, { sessionCustomer = null } = {}) {
  const t = nowIso();
  if (sessionCustomer) {
    // Con sesión iniciada, se usan sus datos registrados; dirección y ciudad se actualizan si vienen
    if (data.address || data.city || data.state) {
      await db.run('UPDATE customers SET address=?, city=?, state=?, updated_at=? WHERE id=?',
        [data.address || sessionCustomer.address, data.city || sessionCustomer.city, data.state || sessionCustomer.state, t, sessionCustomer.id]);
    }
    return sessionCustomer;
  }
  const byDoc = data.docKey ? await db.first('SELECT * FROM customers WHERE doc_key=?', [data.docKey]) : null;
  const byPhone = await db.first('SELECT * FROM customers WHERE phone_key=?', [data.phoneKey]);
  const byEmail = data.emailKey ? await db.first('SELECT * FROM customers WHERE email_key=?', [data.emailKey]) : null;
  const found = [byDoc, byPhone, byEmail].filter(Boolean);
  const ids = new Set(found.map((r) => r.id));
  if (ids.size > 1) throw new CustomerConflict('Tu cédula, teléfono o correo ya están registrados con datos distintos. Inicia sesión en "Mi cuenta" o escríbenos por WhatsApp para ayudarte.');
  if (ids.size === 1) {
    const c = found[0];
    // Debe coincidir todo lo que envió con lo registrado (evita usar la cédula de otra persona)
    const mismatch = (data.docKey && c.doc_key !== data.docKey) || c.phone_key !== data.phoneKey || (data.emailKey && c.email_key !== data.emailKey);
    if (mismatch) throw new CustomerConflict(c.pw_hash
      ? 'Ya tienes una cuenta con esos datos. Inicia sesión en "Mi cuenta" para comprar con ella.'
      : 'Algunos de tus datos (cédula, teléfono o correo) no coinciden con tus compras anteriores. Escríbelos igual que la última vez o escríbenos por WhatsApp.');
    if (c.status !== 'activa') throw new CustomerConflict('No podemos procesar pedidos con estos datos. Escríbenos por WhatsApp.');
    await db.run('UPDATE customers SET name=?, address=?, city=?, state=?, updated_at=? WHERE id=?', [data.name, data.address || c.address, data.city || c.city, data.state || c.state, t, c.id]);
    return { ...c, name: data.name };
  }
  if (!data.docKey || !data.emailKey) return null; // sin datos suficientes para registrar (modo con datos mínimos)
  try {
    const r = await db.run(`INSERT INTO customers(name,doc_key,phone_key,email_key,phone,email,address,city,state,marketing_ok,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.name, data.docKey, data.phoneKey, data.emailKey, data.phone, data.email, data.address || '', data.city || '', data.state || '', data.marketing ? 1 : 0, t, t]);
    return await db.first('SELECT * FROM customers WHERE id=?', [r.id]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) throw new CustomerConflict('Esos datos se acaban de registrar. Intenta de nuevo en un momento.');
    throw e;
  }
}

// Datos de la clienta que pueden ir al navegador (solo a ella misma)
export const customerSelf = (c) => ({ name: c.name, doc: c.doc_key, phone: c.phone, email: c.email, address: c.address, city: c.city, state: c.state, verified: !!c.email_verified });
