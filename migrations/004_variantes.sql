-- THF · versión 4: variantes visuales de cada pieza (por ejemplo, el color del cuarzo), con su muestra de color.
-- Dialecto SQLite; dev/build_generated.py la traduce a PostgreSQL.
-- JSON: {"label":"Color de la piedra","shape":"circle"|"square","items":[{"name":"Cuarzo rosa","hex":"#F2C9D0","on":true}]}
-- Los largos o tallas siguen en products.variants. En el pedido se guarda la elección completa ("Cuarzo rosa · 45 cm").
ALTER TABLE products ADD COLUMN colors TEXT NOT NULL DEFAULT '';
