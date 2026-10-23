// THF en Vercel (Node.js) + Supabase (PostgreSQL y Storage). Es el MISMO código de la tienda que corre en Cloudflare:
// aquí solo se conectan la base de datos (pg con el pooler de Supabase) y el almacenamiento (Supabase Storage).
// Todas las claves vienen de las variables de entorno de Vercel; ninguna está en el código.
import pg from 'pg';
import { waitUntil } from '@vercel/functions';
import worker from '../src/index.js';
import { makePgD1 } from '../src/lib/pg.js';

// Números de PostgreSQL como números de JavaScript (conteos, sumas y montos en centavos)
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const ssl = process.env.DATABASE_CA
  ? { ca: process.env.DATABASE_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true } // certificado de Supabase: conexión verificada
  : { rejectUnauthorized: false }; // cifrada; carga DATABASE_CA para verificar además el certificado
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX || 3), idleTimeoutMillis: 10000, ssl, statement_timeout: 15000 });

const driver = {
  query: (text, params) => pool.query(text, params),
  async transaction(fn) {
    const cl = await pool.connect();
    try {
      await cl.query('BEGIN');
      const r = await fn((t, p) => cl.query(t, p));
      await cl.query('COMMIT');
      return r;
    } catch (e) {
      await cl.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cl.release();
    }
  },
};

const KEYS = ['SITE_URL', 'THF_PEPPER', 'SETUP_TOKEN', 'PW_ITER', 'ADMIN_IDLE_MIN', 'ADMIN_ABS_HOURS', 'ASSET_VERSION', 'TURNSTILE_SITEKEY', 'TURNSTILE_SECRET',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BUCKET', 'RESEND_API_KEY', 'TELEGRAM_BOT_TOKEN', 'NOTIFY_WEBHOOK_SECRET', 'VERIFY_API_URL', 'VERIFY_API_KEY',
  'GA4_API_SECRET', 'META_CAPI_TOKEN'];
const env = { DB: makePgD1(driver), PLATFORM: 'vercel', ...Object.fromEntries(KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };

export default {
  fetch(request) {
    return worker.fetch(request, env, { waitUntil });
  },
};
