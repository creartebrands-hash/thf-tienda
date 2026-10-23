-- THF · versión 3: tienda editable de las aliadas (sin subir archivos) e integraciones (webhooks salientes).
-- Dialecto SQLite; dev/build_generated.py la traduce a PostgreSQL.

-- ---------- Tienda de la aliada: título, subtítulo, colores y banner elegido ----------
ALTER TABLE partners ADD COLUMN store_subtitle TEXT NOT NULL DEFAULT '';
ALTER TABLE partners ADD COLUMN store_bg TEXT NOT NULL DEFAULT '';           -- #RRGGBB o vacío (el de la marca)
ALTER TABLE partners ADD COLUMN store_fg TEXT NOT NULL DEFAULT '';           -- #RRGGBB o vacío
ALTER TABLE partners ADD COLUMN store_banner_id INTEGER;                     -- aliada_assets.id (kind = banner) o vacío

-- Foto elegida por la aliada para cada pieza (entre las opciones que define THF)
ALTER TABLE partner_prices ADD COLUMN asset_id INTEGER;                      -- aliada_assets.id (kind = pieza)

-- ---------- Imágenes para aliadas: THF decide cuáles hay; ellas solo eligen ----------
CREATE TABLE aliada_assets (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('banner','pieza')),
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,             -- solo para kind = pieza
  media_id INTEGER NOT NULL REFERENCES media(id),
  title TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_aliada_assets_kind ON aliada_assets(kind, product_id);

-- ---------- Webhooks salientes (Make, n8n, Zapier, Google Sheets, contabilidad…) ----------
CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,                                                      -- firma HMAC-SHA256 de cada envío
  events TEXT NOT NULL DEFAULT '[]',                                         -- JSON: lista de eventos
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE webhook_deliveries (
  id INTEGER PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  at TEXT NOT NULL
);
CREATE INDEX idx_webhook_deliveries ON webhook_deliveries(webhook_id, id);
