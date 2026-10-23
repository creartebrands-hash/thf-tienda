-- THF · versión 2: pagos venezolanos, clientas, cupones, temporadas, notificaciones, costos, analítica y programas.
-- Se aplica sola sobre una base v1 (y en instalaciones nuevas, después de schema.sql). Dialecto SQLite;
-- dev/build_generated.py la traduce a PostgreSQL para Supabase. Dinero en centavos (INTEGER).

-- ---------- Páginas: orden fijo (sin depender de rowid) ----------
ALTER TABLE pages ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;

-- ---------- Métodos de pago con datos estructurados ----------
ALTER TABLE payment_methods ADD COLUMN kind TEXT NOT NULL DEFAULT 'otro';          -- pago_movil | transferencia | zelle | binance | paypal | efectivo | tienda | otro
ALTER TABLE payment_methods ADD COLUMN details TEXT NOT NULL DEFAULT '{}';         -- JSON: banco, teléfono, documento, titular, correo, cuenta… (solo en la pantalla de pago de cada pedido)
ALTER TABLE payment_methods ADD COLUMN description TEXT NOT NULL DEFAULT '';       -- texto público corto
ALTER TABLE payment_methods ADD COLUMN proof TEXT NOT NULL DEFAULT 'ref';          -- none | ref | ref_capture
ALTER TABLE payment_methods ADD COLUMN verifier TEXT NOT NULL DEFAULT 'manual';    -- manual | banesco | pabilo | webhook
ALTER TABLE payment_methods ADD COLUMN pickup_only INTEGER NOT NULL DEFAULT 0;     -- solo para retiro en tienda

-- ---------- Puntos de retiro (zonas tipo "retiro") ----------
ALTER TABLE shipping_zones ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE shipping_zones ADD COLUMN hours TEXT NOT NULL DEFAULT '';
ALTER TABLE shipping_zones ADD COLUMN maps_url TEXT NOT NULL DEFAULT '';

-- ---------- Clientas ----------
-- Una persona = una cédula, un teléfono y un correo (sin duplicados): así un cupón personal no se repite ni se transfiere.
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  doc_key TEXT NOT NULL UNIQUE,        -- "V12345678" (tipo + dígitos)
  phone_key TEXT NOT NULL UNIQUE,      -- "584141234567"
  email_key TEXT NOT NULL UNIQUE,      -- minúsculas
  phone TEXT NOT NULL, email TEXT NOT NULL,
  pw_hash TEXT,                        -- NULL = compró sin crear cuenta
  email_verified INTEGER NOT NULL DEFAULT 0,
  address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '',
  marketing_ok INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','bloqueada')),
  notes TEXT NOT NULL DEFAULT '',      -- interno
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT
);
CREATE TABLE customer_sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL, last_seen TEXT NOT NULL, expires_at TEXT NOT NULL,
  ip TEXT, ua TEXT
);
CREATE TABLE customer_tokens (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('reset','verify')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);

-- ---------- Programas: embajadoras y emprendedoras ----------
CREATE TABLE partners (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('embajadora','emprendedora')),
  request_id INTEGER REFERENCES requests(id),
  name TEXT NOT NULL,
  email_key TEXT NOT NULL UNIQUE, phone_key TEXT NOT NULL UNIQUE, doc_key TEXT UNIQUE,
  email TEXT NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL UNIQUE,           -- código para compartir: ANA10
  slug TEXT UNIQUE,                    -- tienda /e/slug (emprendedoras)
  store_title TEXT NOT NULL DEFAULT '', store_bio TEXT NOT NULL DEFAULT '', avatar_media_id INTEGER REFERENCES media(id),
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','pausada','baja')),
  commission_mode TEXT NOT NULL DEFAULT 'global' CHECK (commission_mode IN ('global','pct','monto','pct_monto')),
  commission_bps INTEGER, commission_fixed_cents INTEGER,
  fixed_per TEXT NOT NULL DEFAULT 'pedido' CHECK (fixed_per IN ('pedido','pieza')),
  client_discount_bps INTEGER,         -- NULL = el valor global
  payout_info TEXT NOT NULL DEFAULT '', -- privado: cómo se le paga
  pw_hash TEXT, failed_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
  access_token_hash TEXT, access_expires TEXT, -- enlace de un solo uso para crear su contraseña
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT
);
CREATE TABLE partner_sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL, last_seen TEXT NOT NULL, expires_at TEXT NOT NULL,
  ip TEXT, ua TEXT
);
-- Precio que cada emprendedora elige para su tienda, dentro del rango mínimo–máximo de la pieza
CREATE TABLE partner_prices (
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  visible INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (partner_id, product_id)
);
-- Libro de movimientos inmutable: comisiones, ganancias, reversas, ajustes y pagos
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  order_id INTEGER REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('comision','ganancia','reversa','ajuste','pago')),
  amount_cents INTEGER NOT NULL,
  rule TEXT NOT NULL DEFAULT '{}',     -- JSON: regla vigente al generarse
  note TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',        -- referencia del pago a la socia
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_ledger_order ON ledger_entries(order_id, partner_id, kind) WHERE order_id IS NOT NULL AND kind IN ('comision','ganancia','reversa');
CREATE INDEX idx_ledger_partner ON ledger_entries(partner_id, created_at);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'ledger inmutable'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'ledger inmutable'); END;

-- ---------- Temporadas, ofertas y cupones ----------
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'temporada' CHECK (kind IN ('temporada','oferta','lanzamiento')),
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,   -- ISO UTC; fuera de fechas no se ve
  active INTEGER NOT NULL DEFAULT 0,                -- interruptor manual: apagada aunque esté en fecha
  discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 9000),
  scope TEXT NOT NULL DEFAULT 'todo' CHECK (scope IN ('todo','coleccion','piezas','ninguno')),
  collection_id INTEGER REFERENCES collections(id),
  product_ids TEXT NOT NULL DEFAULT '[]',           -- JSON con ids de piezas
  banner_title TEXT NOT NULL DEFAULT '', banner_text TEXT NOT NULL DEFAULT '', banner_cta TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'burdeos', media_id INTEGER REFERENCES media(id),
  page_intro TEXT NOT NULL DEFAULT '',
  show_countdown INTEGER NOT NULL DEFAULT 1,
  coupon_code TEXT NOT NULL DEFAULT '',             -- cupón que se muestra en el banner (opcional)
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- en mayúsculas
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('pct','monto','envio')),
  value INTEGER NOT NULL DEFAULT 0,    -- pct: puntos básicos · monto: centavos
  min_subtotal_cents INTEGER, max_discount_cents INTEGER,
  starts_at TEXT, ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  max_uses INTEGER,                    -- NULL = sin límite total
  per_customer INTEGER NOT NULL DEFAULT 1 CHECK (per_customer BETWEEN 1 AND 100),
  customer_id INTEGER REFERENCES customers(id), -- cupón personal: solo esa clienta, con su sesión iniciada
  first_order_only INTEGER NOT NULL DEFAULT 0,
  campaign_id INTEGER REFERENCES campaigns(id),
  collection_id INTEGER REFERENCES collections(id),
  retail_only INTEGER NOT NULL DEFAULT 1,  -- no aplica a pedidos al mayor
  uses INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- Cada uso ocupa un "puesto" numerado: el índice único impide pasarse del límite aunque dos pedidos lleguen a la vez
CREATE TABLE coupon_redemptions (
  id INTEGER PRIMARY KEY,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  slot INTEGER NOT NULL, global_slot INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (coupon_id, customer_id, slot),
  UNIQUE (coupon_id, global_slot)
);

-- ---------- Pedidos: clienta, tasa, cupón, programa, origen y envío ----------
ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id);
ALTER TABLE orders ADD COLUMN customer_doc TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN customer_city TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN customer_state TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN close_mode TEXT NOT NULL DEFAULT 'whatsapp';   -- whatsapp | web
ALTER TABLE orders ADD COLUMN rate_milli INTEGER;                            -- Bs por USD × 1000 usada para el monto en Bs
ALTER TABLE orders ADD COLUMN rate_at TEXT;
ALTER TABLE orders ADD COLUMN rate_source TEXT;
ALTER TABLE orders ADD COLUMN total_bs_cents INTEGER;
ALTER TABLE orders ADD COLUMN coupon_id INTEGER REFERENCES coupons(id);
ALTER TABLE orders ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN campaign_id INTEGER REFERENCES campaigns(id);
ALTER TABLE orders ADD COLUMN partner_id INTEGER REFERENCES partners(id);
ALTER TABLE orders ADD COLUMN attribution_source TEXT;                     -- codigo | enlace | tienda
ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'directo';     -- instagram | google | facebook | pinterest | whatsapp | tiktok | email | otro | directo
ALTER TABLE orders ADD COLUMN traffic TEXT NOT NULL DEFAULT 'directo';     -- organico | pago | referido | directo
ALTER TABLE orders ADD COLUMN utm_source TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN utm_medium TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN utm_campaign TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN utm_content TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN ref_host TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN landing TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN vid TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN carrier TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN tracking_code TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN paid_at TEXT;
ALTER TABLE orders ADD COLUMN prod_cost_cents INTEGER;
ALTER TABLE orders ADD COLUMN access_nonce TEXT;                          -- el enlace de seguimiento se recalcula con HMAC (para incluirlo en los avisos)                      -- costo de producción total (instantánea, interno)
CREATE INDEX idx_orders_customer ON orders(customer_id, created_at);
CREATE INDEX idx_orders_partner ON orders(partner_id, created_at);
CREATE INDEX idx_orders_created ON orders(created_at);

-- ---------- Pagos reportados por la clienta ("Ya pagué") ----------
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  method_code TEXT NOT NULL, method_kind TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD','Bs')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0), -- en la moneda del pago
  usd_cents INTEGER NOT NULL,                              -- equivalente en USD con la tasa del pedido
  rate_milli INTEGER,
  reference TEXT NOT NULL DEFAULT '',
  ref_key TEXT,                                            -- método|banco|referencia normalizada: un comprobante no sirve dos veces
  payer_bank TEXT NOT NULL DEFAULT '', payer_phone TEXT NOT NULL DEFAULT '', payer_doc TEXT NOT NULL DEFAULT '',
  payer_name TEXT NOT NULL DEFAULT '', payer_email TEXT NOT NULL DEFAULT '',
  paid_on TEXT NOT NULL DEFAULT '',                        -- fecha que declara la clienta (aaaa-mm-dd)
  proof_path TEXT, proof_sha256 TEXT,                      -- captura (privada)
  status TEXT NOT NULL DEFAULT 'reportado' CHECK (status IN ('reportado','verificado','rechazado')),
  verifier TEXT NOT NULL DEFAULT 'manual',
  verifier_result TEXT NOT NULL DEFAULT '',
  reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT,
  reject_reason TEXT NOT NULL DEFAULT '',
  ip TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_payments_ref ON payments(ref_key) WHERE ref_key IS NOT NULL AND status <> 'rechazado';
CREATE INDEX idx_payments_status ON payments(status, created_at);
CREATE INDEX idx_payments_order ON payments(order_id);

-- ---------- Notificaciones (bandeja de salida) ----------
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  event TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('duena','clienta','socia')),
  channel TEXT NOT NULL CHECK (channel IN ('email','telegram','webhook','whatsapp')),
  recipient TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','enviada','fallida','omitida')),
  error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, sent_at TEXT
);
CREATE INDEX idx_notifications_order ON notifications(order_id);
CREATE INDEX idx_notifications_status ON notifications(status, created_at);

-- ---------- Estructura de costos por pieza (interno) ----------
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  shipping_bps INTEGER NOT NULL DEFAULT 0,   -- recargo por envío o importación sobre el costo
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE materials (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'otro',
  sku TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'unidad',       -- unidad | cm | metro | gramo | par | paquete
  pack_qty REAL NOT NULL DEFAULT 1 CHECK (pack_qty > 0),
  pack_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (pack_cost_cents >= 0),
  unit_cost_mc INTEGER NOT NULL DEFAULT 0,   -- costo por unidad en diezmilésimas de USD (incluye recargo del proveedor)
  stock_qty REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0,
  photo_media_id INTEGER REFERENCES media(id),
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_materials_supplier ON materials(supplier_id);
-- Movimientos de inventario de materiales (no se editan: se corrigen con un ajuste)
CREATE TABLE material_moves (
  id INTEGER PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id),
  qty REAL NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('compra','consumo','ajuste')),
  order_id INTEGER REFERENCES orders(id),
  unit_cost_mc INTEGER,
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_material_moves ON material_moves(material_id, created_at);
CREATE TRIGGER material_moves_no_update BEFORE UPDATE ON material_moves BEGIN SELECT RAISE(ABORT, 'movimientos inmutables'); END;
CREATE TRIGGER material_moves_no_delete BEFORE DELETE ON material_moves BEGIN SELECT RAISE(ABORT, 'movimientos inmutables'); END;
-- Receta de cada pieza: qué materiales lleva y cuánto
CREATE TABLE product_bom (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id),
  qty REAL NOT NULL CHECK (qty > 0),
  note TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_bom_product ON product_bom(product_id);
ALTER TABLE products ADD COLUMN labor_cents INTEGER;          -- mano de obra por pieza
ALTER TABLE products ADD COLUMN extra_cost_cents INTEGER;     -- otros costos (empaque, tarjeta…)
ALTER TABLE products ADD COLUMN markup_bps INTEGER;           -- factor de precio propio (NULL = el global)
ALTER TABLE products ADD COLUMN prod_cost_cents INTEGER;      -- costo de producción calculado (interno)
ALTER TABLE products ADD COLUMN cost_updated_at TEXT;
-- Historial de costo y precio de cada pieza (para anclar el precio de cada momento)
CREATE TABLE product_cost_history (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  prod_cost_cents INTEGER NOT NULL, price_cents INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',   -- JSON con los materiales y sus costos
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cost_history ON product_cost_history(product_id, created_at);

-- ---------- Analítica propia (sin cookies de terceros) ----------
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, day TEXT NOT NULL,           -- día en hora de Caracas (aaaa-mm-dd)
  vid TEXT NOT NULL DEFAULT '', sid TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,                            -- page | view_item | add_to_cart | begin_checkout | order | paid | wa_click | search | signup
  path TEXT NOT NULL DEFAULT '',
  product_id INTEGER, order_id INTEGER, value_cents INTEGER,
  channel TEXT NOT NULL DEFAULT 'directo', traffic TEXT NOT NULL DEFAULT 'directo',
  utm_source TEXT NOT NULL DEFAULT '', utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '', utm_content TEXT NOT NULL DEFAULT '',
  ref_host TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '',
  partner_id INTEGER
);
CREATE INDEX idx_events_day ON events(day, type);
CREATE INDEX idx_events_sid ON events(sid, id);
-- Enlaces con UTM para redes y contenido (con redirección corta /r/código que cuenta clics)
CREATE TABLE utm_links (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  dest TEXT NOT NULL,                            -- ruta interna: /catalogo, /pieza/ocaso…
  utm_source TEXT NOT NULL, utm_medium TEXT NOT NULL, utm_campaign TEXT NOT NULL, utm_content TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
