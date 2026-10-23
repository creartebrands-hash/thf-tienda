# THF · tienda, panel, pagos y programas

El sitio, la tienda, el panel de administración, la pantalla de pago, las cuentas de clientas, el portal de embajadoras y aliadas y la analítica están en **un solo proyecto**. El mismo código corre en dos plataformas:

| | **A. Vercel + Supabase** (la elegida) | **B. Cloudflare** (alternativa gratis) |
|---|---|---|
| Servidor | Vercel Functions (Node.js) | Cloudflare Workers |
| Base de datos | Supabase PostgreSQL | Cloudflare D1 (SQLite) |
| Fotos, guías, capturas de pago | Supabase Storage (bucket privado) | Workers KV (o R2) |
| Archivos fijos (CSS, JS, fotos iniciales) | Vercel (carpeta `public`) | Workers Static Assets |
| Costo para una tienda que vende | Vercel Pro US$20/mes + Supabase Pro US$25/mes (ver "Costos") | US$0 |

Las dos se instalan igual (`/setup`) y se actualizan solas: al publicar una versión nueva, la base se pone al día en la primera visita.

---

## Qué incluye

- **Tienda**: inicio con la Bitácora, 4 colecciones, catálogo con filtros, ficha de pieza, Compra el look, Caja de joyería, Joyería personalizada, Programas y Guías y ebooks (7 guías gratuitas en PDF con la línea de la marca).
- **Cierre del pedido**, configurable en Ajustes → Cierre del pedido:
  - `whatsapp` (por defecto, igual que siempre): el pedido se guarda con su instantánea de precios y se abre el WhatsApp oficial con el mensaje listo.
  - `mixto`: la clienta elige "Pagar ahora" en la web o "Enviar por WhatsApp".
  - `web`: va directo a la pantalla de pago.
- **Pantalla de pago** (al estilo Cashea / Datalink): la clienta elige el método y ve solo sus datos. Pago Móvil y transferencia muestran el monto exacto en bolívares a la tasa del BCV, con botones para copiar cada dato. "Ya pagué" pide banco, teléfono, referencia, fecha, monto y captura (privada). También Zelle, Binance Pay, PayPal, efectivo y pago en tienda.
- **Pagos por verificar**: todos los comprobantes en una lista, con la captura, para aprobar o rechazar. Bloquea referencias repetidas y capturas ya usadas. La verificación automática con el banco queda lista para conectar (ver "Verificación automática").
- **Avisos**: en cada cambio de estado se prepara el mensaje para la clienta y el botón **Avisar por WhatsApp**. Correo, Telegram (solo para la dueña) y webhook opcionales.
- **Clientas**: una ficha por persona (cédula, teléfono y correo no se repiten), Mi cuenta con pedidos y cupones personales intransferibles.
- **Embajadoras y aliadas** (antes "emprendedoras"): enlace personal `/a/CÓDIGO` con QR, código, tienda `/e/slug` editable por la aliada (título, colores, banner y fotos elegidas entre las que prepara THF) con precios propios dentro del rango, comisiones en % y/o monto, libro de movimientos que no se edita ni se borra, portal de cada afiliada, "Ver como ella" y registro de pagos con CSV para el banco.
- **Integraciones**: Google Analytics 4, píxeles de Meta y TikTok, webhooks firmados y estado de las API (Sitio → Integraciones).
- **Variantes con color** por pieza, visibles en la franja "Añadir" del catálogo.
- **Costos por pieza**: proveedores, materiales con costo por unidad y existencia, receta de cada pieza con la misma foto del catálogo, mano de obra, precio sugerido al detal y al mayor, historial y consumo de materiales.
- **Temporadas y cupones**: Navidad y Black Friday ocultas hasta su fecha, con vista previa privada. Cupones generales, de temporada, personales y de primera compra.
- **Analítica propia**: visitas, de dónde llegan (Instagram, Google, Facebook, Pinterest, WhatsApp, TikTok), orgánico o anuncios, ventas por socia, embudo, piezas más vistas y vendidas, enlaces UTM y periodos con calendario.
- **SEO, IA y GEO**: páginas renderizadas en el servidor, datos estructurados, `sitemap.xml`, `llms.txt`, feed de Google Merchant y SEO local.
- **Seguridad**: verificación en dos pasos obligatoria para el panel, CSRF, límites de intentos, cabeceras estrictas, validadores venezolanos y auditoría. Ver `docs/seguridad.md`.

---

## A. Publicar en Vercel + Supabase

Necesitas una computadora con [Node.js 22](https://nodejs.org), una cuenta de [GitHub](https://github.com), una de [Vercel](https://vercel.com) y una de [Supabase](https://supabase.com).

### 1. Supabase (base de datos y archivos)

1. **New project**. Región **East US (N. Virginia)**, la más cercana a Venezuela con Vercel. Guarda la contraseña de la base en tu gestor de contraseñas.
2. **Project Settings → Database → Connection string → Transaction pooler** (puerto 6543). Copia esa dirección y cambia `[YOUR-PASSWORD]` por la contraseña. Esa es tu `DATABASE_URL`.
3. Opcional, recomendado: en la misma página descarga el **certificado SSL** y pega su contenido en `DATABASE_CA` (así la conexión, además de cifrada, verifica el servidor).
4. **Project Settings → API**: copia **Project URL** (`SUPABASE_URL`) y la clave **service_role** (`SUPABASE_SERVICE_ROLE_KEY`). Esta clave es secreta: solo va en Vercel, nunca en el navegador.
5. No hace falta crear tablas ni el bucket: `/setup` lo hace solo. Si prefieres revisarlas antes, el esquema completo está en `supabase/schema.sql`. Trae RLS activado en todas las tablas y sin acceso para `anon` ni `authenticated`, porque la tienda no usa la clave pública de Supabase.

### 2. Vercel (servidor)

1. Sube la carpeta `worker` a un repositorio **privado** de GitHub.
2. En Vercel: **Add New → Project → Import** ese repositorio. Framework: **Other**. No cambies los comandos (los define `vercel.json`).
3. **Settings → Environment Variables** (Production y Preview). Guía en `.env.example`:

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | Sí | Dirección del *transaction pooler* de Supabase |
| `DATABASE_CA` | Recomendada | Certificado de Supabase |
| `SUPABASE_URL` | Sí | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Clave de servicio (secreta) |
| `SUPABASE_BUCKET` | No | Nombre del bucket privado (por defecto `thf`) |
| `THF_PEPPER` | Sí | 32 o más caracteres al azar. **No la cambies nunca**: si cambia, nadie puede entrar. |
| `SETUP_TOKEN` | Sí | 16 o más caracteres; se usa una sola vez en `/setup` |
| `SITE_URL` | Sí, con dominio | `https://tudominio.com` sin barra final |
| `TURNSTILE_SITEKEY` / `TURNSTILE_SECRET` | No | Captcha gratis de Cloudflare |
| `RESEND_API_KEY` | No | Avisos por correo (Resend) |
| `TELEGRAM_BOT_TOKEN` | No | Avisos a la dueña por Telegram |
| `NOTIFY_WEBHOOK_SECRET` | No | Firma de los avisos enviados a un webhook |
| `VERIFY_API_URL` / `VERIFY_API_KEY` | No | Verificación automática de pagos (servicio contratado) |
| `GA4_API_SECRET` | No | Compras enviadas a Google Analytics 4 desde el servidor (el ID va en Sitio → Integraciones) |
| `META_CAPI_TOKEN` | No | Compras enviadas a Meta (Conversions API) desde el servidor (el ID del píxel va en Sitio → Integraciones) |

4. **Deploy**. Te da una dirección `https://thf-xxxx.vercel.app`.
5. Región de la función: queda en Washington (`iad1`), junto a Supabase en N. Virginia.

### 3. Primera instalación

Abre `https://TU-DIRECCION/setup`, escribe el `SETUP_TOKEN`, tu nombre, correo y una contraseña de 12 o más caracteres. Se crean las tablas, el bucket privado, las colecciones, piezas, guías y ajustes. Luego entra a `/admin`: te pide activar la **verificación en dos pasos** (Google Authenticator, Microsoft Authenticator, 1Password o Authy) y te muestra **8 códigos de recuperación**. Guárdalos.

### 4. Dominio en Vercel

**Settings → Domains → Add** `tudominio.com` y `www.tudominio.com`. Vercel te dice qué registros DNS poner donde compraste el dominio (o cambia los nameservers a los de Vercel). Revisa que sigan los registros **MX** si usan correo con ese dominio. Luego pon `SITE_URL` y vuelve a publicar.

---

## B. Publicar en Cloudflare (gratis)

Con [Node.js 22](https://nodejs.org) y una cuenta gratis de [Cloudflare](https://dash.cloudflare.com/sign-up):

```bash
npm install
npx wrangler login
npx wrangler d1 create thf-db              # pega el id en wrangler.toml
npx wrangler kv namespace create FILES     # pega el id en wrangler.toml
npx wrangler secret put THF_PEPPER         # 32+ caracteres, no la cambies nunca
npx wrangler secret put SETUP_TOKEN        # 16+ caracteres, para /setup
npx wrangler deploy
```

Las variables opcionales de la tabla de arriba (Resend, Telegram, webhook, verificación, Turnstile) se cargan igual, con `npx wrangler secret put NOMBRE`. Luego abre `/setup` como en A.3.

**Dominio en Cloudflare**: agrega el dominio (plan Free), cambia los nameservers donde lo compraste, y en Workers → `thf` → **Dominios y rutas** agrega `tudominio.com`. Pon `SITE_URL` en `wrangler.toml` y vuelve a publicar.

---

## Lo primero que hay que cargar en el panel

En **Inicio** del panel aparece la lista de pendientes. Lo esencial:

1. **Ajustes → Cambiar WhatsApp oficial** (hoy es de ejemplo; pide confirmar tu identidad).
2. **Métodos de pago → cada método → Datos que ve la clienta al pagar** (banco, teléfono, cédula o RIF, titular, correo de Zelle, Pay ID de Binance…). Pide confirmar tu identidad.
3. **Ajustes → Pagos y tasa del BCV**: automática (se actualiza sola desde la fuente pública del BCV) o manual.
4. **Piezas**: precios reales, nombres definitivos y fotos. Cada ficha trae un prompt para crear con IA la segunda foto que falte.
5. **Costos → Materiales y Proveedores**: lo que pagas por cada paquete; la receta de cada pieza calcula el costo y el precio sugerido.
6. **Envíos**: zonas, tarifas y tiempos reales.
7. **Ajustes → Programas**: comisión (en % y/o monto), días de espera, mínimo para pagar y si los pedidos al mayor dan comisión.

## Cómo activar cada cosa cuando la marca crezca

| Quieres… | Dónde | Qué necesitas |
|---|---|---|
| Que la clienta pague en la web además de WhatsApp | Ajustes → Cierre del pedido → modo `mixto` o `web` | Datos de los métodos cargados y tasa vigente |
| Avisos por correo | Sitio → Avisos → Correo automático | Cuenta de [Resend](https://resend.com) (gratis hasta 3.000 correos al mes) y `RESEND_API_KEY` |
| Que te llegue un Telegram por pedido | Sitio → Avisos → Telegram | Un bot de Telegram y `TELEGRAM_BOT_TOKEN` |
| WhatsApp automático (sin tocar el botón) | Sitio → Avisos → Webhook | API oficial de WhatsApp Business (por un proveedor, de pago por mensaje) o n8n/Make, y `NOTIFY_WEBHOOK_SECRET` |
| Verificación automática de Pago Móvil | Ajustes → Pagos y tasa del BCV → Verificación automática | Contratar el servicio con el banco (ver abajo) y `VERIFY_API_URL` / `VERIFY_API_KEY` |
| Captcha en formularios | — | `TURNSTILE_SITEKEY` y `TURNSTILE_SECRET` |
| Google Analytics 4, píxel de Meta o de TikTok | Sitio → Integraciones | Solo el ID de cada uno (no el código). Para compras desde el servidor: `GA4_API_SECRET` y `META_CAPI_TOKEN` |
| Enviar pedidos y pagos a Make, n8n, Zapier o Google Sheets | Sitio → Integraciones → Webhooks | La dirección `https` del escenario; copiar el secreto que se muestra una vez y verificar la firma `X-THF-Signature` |
| Tiendas de aliadas con fotos propias | Programas → Imágenes para aliadas | Fotos distintas a las de la tienda principal (1800 × 700 px para banners) |
| Variantes con color (p. ej. el color del cuarzo) | Catálogo → Piezas → (pieza) → Variantes | Nombre y color de cada opción |

### Verificación automática

La tienda llama a `VERIFY_API_URL` con los datos del pago reportado (referencia, banco, teléfono, monto en Bs y fecha), firmados con `VERIFY_API_KEY` (cabecera `X-THF-Signature`, HMAC-SHA256). Si no hay respuesta clara, el pago queda para revisión manual: nunca se aprueba por un error de conexión. Si el servicio responde que el pago existe y el monto coincide, el pago se aprueba solo; si no, queda para revisión manual. Opciones en Venezuela:

- **Banesco**, servicio de "Confirmación de Transacción" o API de Pago Móvil para empresas: requiere cuenta jurídica y contrato.
- Agregadores como **Pabilo** o **verificapago**: plan mensual y conexión a tu cuenta.

Cualquiera de ellos se conecta con un adaptador pequeño que traduzca su respuesta al formato de `src/lib/verify.js`.

---

## Costos (aprox., octubre 2026; revisa las páginas de precios)

| Servicio | Gratis | Cuándo pagar |
|---|---|---|
| Vercel | Plan Hobby: **no permite uso comercial** | Pro, US$20 al mes, desde que la tienda venda |
| Supabase | 500 MB de base, 1 GB de archivos; **se pausa tras 1 semana sin visitas** | Pro, US$25 al mes: sin pausas, copias diarias |
| Cloudflare (opción B) | Todo lo que usa la tienda | Nunca, salvo mucho tráfico |
| Resend | 3.000 correos al mes | Si envías más |
| Dominio | — | El que ya tienen |

---

## Copias de seguridad

**Supabase**: el plan Pro guarda copias diarias de 7 días. En el plan gratis, haz una copia semanal desde tu computadora:

```bash
pg_dump "postgresql://postgres.xxxx:CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:5432/postgres" -Fc -f respaldo-$(date +%F).dump
```

Usa el puerto **5432** (conexión de sesión) para `pg_dump`. Los archivos del bucket se descargan desde Storage en el panel de Supabase.

**Cloudflare**:

```bash
npx wrangler d1 export thf-db --remote --output respaldo-$(date +%F).sql
```

D1 guarda además 7 días de historial ("Time Travel").

---

## Muy importante para la IA: no bloquear a los asistentes

Cloudflare (y algunos proveedores) pueden **bloquear por defecto a los bots de IA**. En Cloudflare → Seguridad → Bots, desactiva "Block AI bots". En el panel de THF, **SEO, IA y GEO → Permitir que los asistentes de IA lean la tienda** debe estar activo. Registra el sitio en Google Search Console y Bing Webmaster Tools y envía `https://tudominio.com/sitemap.xml`.

## SEO local

La tienda trae lo técnico para posicionarse en la isla, la región y el país (páginas **Joyería en Margarita**, **Envíos a toda Venezuela** y **Preguntas frecuentes**, datos de negocio local y envíos por zona en cada pieza). Lo que más pesa fuera de la web: el **Perfil de Empresa de Google** (categoría Joyería, zona de servicio Nueva Esparta y Venezuela), el mismo nombre y WhatsApp en todas partes, y reseñas en Google después de cada entrega.

---

## Trabajar en la computadora

```bash
npm run dev          # tienda local en http://localhost:8787 (SQLite y archivos en memoria, sin internet)
npm test             # 33 pruebas de reglas de negocio y seguridad (SQLite)
npm run test:pg      # las mismas pruebas en PostgreSQL (necesita un Postgres local; ver dev/server.mjs)
npm run build:data   # regenera esquemas y datos iniciales (Python 3 con Pillow)
npm run build:guides # regenera los PDF de las guías gratuitas
```

La clave de `/setup` en local es `dev-setup-token-123456`.

**Tienda de demostración y vista previa estática** (para mostrar sin publicar):

```bash
node dev/demo.mjs                                   # crea dev/.data/demo.sqlite con pedidos, afiliadas, clientas y visitas de ejemplo
THF_SQLITE=dev/.data/demo.sqlite THF_KVDIR=dev/.data/demo-kv node dev/server.mjs 8792
python3 dev/export_preview.py http://localhost:8792 salida/ estado-del-panel.json salida-de-demo.txt
python3 dev/preview_tour.py salida/                 # índice "recorrido.html" con miniaturas
```

Usuarios de la demo: panel `ana@thf.test` / `una-clave-muy-larga-1`; afiliadas `valentina@afiliadas.test`, `carla@afiliadas.test`, `luisa@afiliadas.test` / `clave-demo-socia-1`; clienta `maria.perez@correo.test` / `MariaDemo-2026`.

---

## Con qué está hecho y para qué sirve cada pieza

| Pieza | Qué es | Para qué la usamos |
|---|---|---|
| **JavaScript (módulos ES)** sin framework | El lenguaje de toda la tienda, en el servidor y en el navegador | Un solo código que corre en Vercel y en Cloudflare, sin dependencias que actualizar. Las páginas se arman en el servidor (rápidas y legibles para Google y las IA). |
| **Vercel Functions** (Node.js 22) | Servidor que ejecuta la tienda | Atiende cada visita, calcula precios, crea pedidos y sirve el panel. `api/index.js` conecta la tienda con Supabase. |
| **Supabase PostgreSQL** | Base de datos | Piezas, pedidos, clientas, afiliadas, libro de comisiones, costos, ajustes con historial y analítica. Con RLS activado como segunda barrera. |
| **Supabase Storage** (bucket privado) | Archivos | Fotos y videos que subes, guías en PDF y capturas de pago. Las capturas y los PDF solo salen con permiso o con enlace que vence. |
| **`pg`** (paquete de Node) | Conector a PostgreSQL | Conexión cifrada y con reintentos al *pooler* de Supabase. |
| **`@vercel/functions`** | Utilidad de Vercel | Deja terminar tareas en segundo plano (actualizar la tasa, enviar avisos) sin demorar a la clienta. |
| **Cloudflare Workers, D1 y KV** | Plataforma alternativa | La misma tienda gratis, si algún día conviene volver. |
| **Adaptador D1 ↔ PostgreSQL** (`src/lib/pg.js`) | Traductor propio | El código escribe una sola vez las consultas y funciona en las dos bases. |
| **Migraciones** (`migrations/`, `src/lib/migrate.js`) | Cambios de la base por versión | Al publicar una versión nueva, la base se actualiza sola y sin perder datos. |
| **Web Crypto** (incluido en Node y Workers) | Criptografía | Contraseñas (PBKDF2 + pimienta), sesiones, códigos de 2 pasos (TOTP), enlaces firmados (HMAC) y huellas de capturas (SHA-256). |
| **DolarAPI** (fuente pública del BCV) | Tasa oficial | Convertir USD a Bs al pagar; se puede pasar a manual. |
| **Resend** (opcional) | Envío de correos | Avisos por correo a la clienta y a la dueña. |
| **Telegram Bot API** (opcional) | Mensajes | Aviso a la dueña de pedidos y pagos nuevos. |
| **Webhook firmado** (opcional) | Puente | Conectar la API de WhatsApp Business, n8n o Make cuando haya presupuesto. |
| **Webhooks salientes** (opcional) | Avisos a otros sistemas | 8 eventos (pedido, pagos, estados, clientas, solicitudes, pagos a afiliadas) firmados con HMAC-SHA256, solo a direcciones `https` públicas. |
| **Google Analytics 4, píxel de Meta y de TikTok** (opcional) | Medición de anuncios | Se cargan solo si pones su ID; la compra se reporta desde el servidor al verificar el pago. |
| **Cloudflare Turnstile** (opcional) | Captcha | Frenar bots en formularios sin molestar a las personas. |
| **CSS propio** con los tokens de la marca | Diseño | La línea gráfica aprobada (tablero, oro, Cormorant Garamond, Pinyon Script y Jost). |
| **SVG propios** | Gráficos | Mapa de la Bitácora, brújula, gráficos de analítica y códigos QR (generados en el servidor). |
| **Python + Pillow + Chromium** | Generadores | Las guías y el manual en PDF (HTML con la línea gráfica impreso por Chromium), las imágenes optimizadas (WebP) y los datos iniciales. |
| **`node --test`** | Pruebas automáticas | 37 pruebas que corren en SQLite y en PostgreSQL. |
| **Playwright + Chromium** | Navegador automático | Recorrer la tienda como una clienta, revisar en móvil y escritorio, y sacar las capturas del manual. |

## Estructura

```
api/index.js          entrada para Vercel (conecta Supabase)
vercel.json           rutas, cabeceras y región de Vercel
wrangler.toml         configuración de Cloudflare
supabase/schema.sql   esquema de referencia para Supabase (generado)
migrations/           cambios de la base por versión
src/index.js          enrutador y cabeceras de seguridad
src/public.js         páginas públicas, SEO y descargas
src/shop.js           pantalla del pedido, Mi cuenta, temporadas, tiendas de aliadas
src/portal.js         portal de embajadoras y aliadas (/afiliadas)
src/api.js            cotización, pedidos, pagos, analítica, solicitudes
src/admin/            panel de administración
src/lib/              base de datos, precios, pagos, tasa, afiliadas, costos, avisos, seguridad, validadores
src/views/            plantillas HTML (con escape automático)
public/               CSS, JS, marca, fotos iniciales y guías en PDF
tests/                pruebas (npm test / npm run test:pg)
dev/                  servidor local, demostración, vista previa, guías y generadores
```
