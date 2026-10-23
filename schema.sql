-- THF · esquema de base de datos (SQLite). Dinero siempre en centavos (INTEGER).

CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);

-- ---------- Usuarios y seguridad ----------
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','STAFF')),
  pw_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  recovery_codes TEXT,                -- JSON con hashes
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mfa_ok INTEGER NOT NULL DEFAULT 0,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reauth_at TEXT,
  ip TEXT, ua TEXT
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT, entity_id TEXT,
  data TEXT, ip TEXT
);

-- ---------- Ajustes editables con historial ----------
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,               -- JSON
  updated_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id)
);
CREATE TABLE setting_revisions (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  old_value TEXT, new_value TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  reason TEXT,
  at TEXT NOT NULL
);
CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'BCV',
  bs_per_usd_milli INTEGER NOT NULL,  -- Bs por USD × 1000
  set_at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id)
);

-- ---------- Medios ----------
CREATE TABLE media (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  path TEXT NOT NULL UNIQUE,          -- relativo a MEDIA_DIR
  thumb_path TEXT,
  width INTEGER, height INTEGER, bytes INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- ---------- Catálogo ----------
CREATE TABLE collections (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kicker TEXT NOT NULL DEFAULT '',     -- antetítulo
  tagline TEXT NOT NULL DEFAULT '',    -- acento en script
  intro TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',   -- p. ej. "Niñas de 4 a 10 años"
  theme TEXT NOT NULL DEFAULT 'arena', -- arena | marino | burdeos | oliva | rosa | negro
  hero_media_id INTEGER REFERENCES media(id),
  card_media_id INTEGER REFERENCES media(id),
  group_by_place INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  coming_soon INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '', seo_desc TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
-- Lugares de la Bitácora (cada uno con sus piezas; no se mezclan)
CREATE TABLE places (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                  -- "Juangriego"
  region TEXT NOT NULL DEFAULT '',     -- "Bahía de Juangriego"
  direction TEXT NOT NULL CHECK (direction IN ('O','N','E','S')),
  title TEXT NOT NULL,                 -- título del capítulo
  subtitle TEXT NOT NULL DEFAULT '',   -- acento en script
  story TEXT NOT NULL DEFAULT '',
  lon REAL NOT NULL, lat REAL NOT NULL,
  photo_media_id INTEGER REFERENCES media(id),
  sort INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  direction_note TEXT NOT NULL DEFAULT '', -- p. ej. "sugerido": revisar
  map_pos TEXT NOT NULL DEFAULT 's' CHECK (map_pos IN ('n','s','e','w')) -- dónde va el nombre junto al punto del mapa
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provisional_name INTEGER NOT NULL DEFAULT 0,
  collection_id INTEGER REFERENCES collections(id),
  category_id INTEGER REFERENCES categories(id),
  place_id INTEGER REFERENCES places(id),
  type TEXT NOT NULL DEFAULT '',
  stone TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT 'Cadena con baño de oro 18k',
  detail TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  care TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  offer_cents INTEGER CHECK (offer_cents IS NULL OR offer_cents >= 0),
  wholesale_cents INTEGER CHECK (wholesale_cents IS NULL OR wholesale_cents >= 0),
  cost_cents INTEGER,                  -- PRIVADO: costo emprendedora
  suggested_cents INTEGER, min_cents INTEGER, max_cents INTEGER,
  is_bundle INTEGER NOT NULL DEFAULT 0,
  bundle_pieces INTEGER,
  lead_min_days INTEGER NOT NULL DEFAULT 7,
  lead_max_days INTEGER NOT NULL DEFAULT 10,
  variants TEXT NOT NULL DEFAULT '["40 cm","45 cm","50 cm"]', -- JSON
  sku TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  inset_enabled INTEGER NOT NULL DEFAULT 0, -- cuadro pequeño sobre la tarjeta (opcional)
  inset_title TEXT NOT NULL DEFAULT '',      -- p. ej. "Amatista"
  inset_note TEXT NOT NULL DEFAULT '',       -- p. ej. "Cuarzo violeta · Brasil y Uruguay"
  in_catalog INTEGER NOT NULL DEFAULT 1,   -- 0 = solo dentro de looks
  is_demo_price INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '', seo_desc TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_collection ON products(collection_id);
CREATE INDEX idx_products_place ON products(place_id);
CREATE TABLE product_media (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id),
  role TEXT NOT NULL DEFAULT 'gallery' CHECK (role IN ('main','hover','inset','gallery','model')),
  sort INTEGER NOT NULL DEFAULT 0
);

-- ---------- Compra el look ----------
CREATE TABLE looks (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  collection_id INTEGER REFERENCES collections(id),
  place_id INTEGER REFERENCES places(id),
  media_id INTEGER REFERENCES media(id),         -- foto principal del look
  place_media_id INTEGER REFERENCES media(id),   -- foto del lugar
  discount_bps INTEGER NOT NULL DEFAULT 1000,    -- 10 % sobre el look completo
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE look_items (
  id INTEGER PRIMARY KEY,
  look_id INTEGER NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 20),
  x REAL NOT NULL DEFAULT 50, y REAL NOT NULL DEFAULT 50,  -- punto sobre la foto (%)
  sort INTEGER NOT NULL DEFAULT 0
);

-- ---------- Envíos y pagos ----------
CREATE TABLE shipping_zones (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('isla','retiro','nacional','internacional')),
  fee_cents INTEGER,                   -- NULL = por cotizar
  free_over_cents INTEGER,             -- NULL = nunca gratis
  allows_cod INTEGER NOT NULL DEFAULT 0, -- cobro a destino
  eta TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
-- Envío por estado (página "Envíos a toda Venezuela"): a qué zona pertenece y una nota editable
CREATE TABLE shipping_states (
  state TEXT PRIMARY KEY,              -- "Lara"
  zone_code TEXT NOT NULL DEFAULT 'nacional', -- código de shipping_zones, o 'isla' = todas las zonas de delivery de la isla
  eta TEXT NOT NULL DEFAULT '',        -- vacío = el tiempo de la zona
  note TEXT NOT NULL DEFAULT '',       -- p. ej. "Retiras en la agencia de tu ciudad"
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  adj_bps INTEGER NOT NULL DEFAULT 0,  -- recargo (+) o descuento (−)
  island_only INTEGER NOT NULL DEFAULT 0,
  instructions TEXT NOT NULL DEFAULT '', -- PRIVADO: solo tras crear el pedido
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

-- ---------- Productos digitales (guías, ebooks) ----------
CREATE TABLE digital_products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'PDF',
  pages INTEGER,
  price_cents INTEGER NOT NULL DEFAULT 0,
  cover_media_id INTEGER REFERENCES media(id),
  file_path TEXT,                      -- relativo a PRIVATE_DIR (nunca público)
  file_name TEXT, file_bytes INTEGER, file_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  sort INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '', seo_desc TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- ---------- Pedidos ----------
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  access_hash TEXT NOT NULL,           -- token del cliente para ver su pedido
  idem_key TEXT UNIQUE,                -- evita duplicados por doble clic
  kind TEXT NOT NULL,                  -- detal | mayor | mixto
  status TEXT NOT NULL DEFAULT 'creado',
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL DEFAULT '', customer_notes TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  zone_code TEXT, zone_name TEXT, pay_code TEXT, pay_name TEXT,
  subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL, adj_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL,
  shipping_label TEXT NOT NULL DEFAULT '',
  attribution_code TEXT,
  wa_message TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('product','look','digital')),
  ref_id INTEGER NOT NULL,
  name TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', variant TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL, unit_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL,
  snapshot TEXT NOT NULL               -- JSON: precios, costo y reglas vigentes
);
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at TEXT NOT NULL, user_id INTEGER REFERENCES users(id),
  from_status TEXT, to_status TEXT, note TEXT
);
CREATE TABLE download_grants (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  digital_product_id INTEGER NOT NULL REFERENCES digital_products(id),
  token_hash TEXT NOT NULL UNIQUE,
  nonce TEXT,                          -- el enlace se recalcula con HMAC(THF_PEPPER, nonce) para mostrarlo en el pedido
  expires_at TEXT NOT NULL,
  max_downloads INTEGER NOT NULL DEFAULT 5,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- ---------- SEO de páginas fijas ----------
CREATE TABLE pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_desc TEXT NOT NULL DEFAULT '',
  heading TEXT NOT NULL DEFAULT '',    -- título visible (páginas de contenido)
  intro TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',       -- párrafos; "## " al inicio de línea = subtítulo
  faq TEXT NOT NULL DEFAULT '[]',      -- JSON [[pregunta, respuesta], ...]
  og_media_id INTEGER REFERENCES media(id),
  updated_at TEXT NOT NULL
);

-- Límite de intentos compartido entre instancias
CREATE TABLE rate_events (key TEXT NOT NULL, at REAL NOT NULL);
CREATE INDEX idx_rate_events ON rate_events(key, at);

-- Archivos subidos guardados en D1 (gratis, sin R2): trozos de 1 MB
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE file_chunks (
  path TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (path, seq)
);

-- Solicitudes: postulaciones a los programas y pedidos de joyería personalizada
CREATE TABLE requests (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('embajadora','emprendedora','personalizada')),
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',     -- JSON con el resto de respuestas
  status TEXT NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','en_revision','aprobada','rechazada','cerrada')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_requests_status ON requests(status, created_at);
CREATE INDEX idx_orders_status ON orders(status, created_at);
