"""Crea recorrido.html en la vista previa exportada: un índice de todas las pantallas (tienda, compra, cuenta, afiliadas y panel)
con una miniatura de cada una. Uso: python3 dev/preview_tour.py carpeta-de-la-vista-previa"""
import html, json, os, subprocess, sys, time
from pathlib import Path
OUT = Path(sys.argv[1]).resolve()
TOUR = [
  ('La tienda', 'Lo que ve cualquier persona que entra a la web.', [
    ('index.html', 'Inicio', 'Portada, la Bitácora de los 10 lugares y las colecciones.'),
    ('catalogo.html', 'Catálogo', 'Todas las piezas con filtros por colección, tipo y precio.'),
    ('pieza-ocaso.html', 'Ficha de una pieza', 'Fotos, historia, variantes con color, largo de cadena, precio detal y al mayor.'),
    ('pieza-marea-rosa.html', 'Variantes con color', 'Muestras del color del cuarzo: en la tarjeta al pasar el cursor y para elegir en la ficha.'),
    ('compra-el-look.html', 'Compra el look', 'Looks completos con descuento o piezas sueltas.'),
    ('caja-de-joyeria.html', 'Caja de joyería', '24 piezas en una caja, precio único.'),
    ('joyeria-personalizada.html', 'Joyería personalizada', 'Pedido a medida para marcas y personas.'),
    ('guias.html', 'Guías y ebooks', 'Biblioteca de guías gratuitas y de pago.'),
    ('guias-guia-de-piedras.html', 'Una guía gratis', 'Descarga con enlace que vence (la duración se edita en el panel).'),
    ('envios-venezuela.html', 'Envíos a toda Venezuela', 'Costo y tiempo por estado.'),
  ]),
  ('Comprar y pagar', 'Del carrito al pago verificado. En la vista previa el pago se simula.', [
    ('pedido-ejemplo.html', 'Pantalla de pago', 'Elige el método y ve solo sus datos: monto en Bs a la tasa BCV, copiar datos y "Ya pagué".'),
    ('pedido-ejemplo-verificando.html', 'Verificando el pago', 'Después de enviar el comprobante.'),
    ('pedido-ejemplo-enviado.html', 'En camino', 'Con la empresa de envío y el número de guía.'),
    ('pedido-ejemplo-entregado.html', 'Entregado', 'Pedido completo con su historial.'),
  ]),
  ('Mi cuenta (clientas)', 'Una cuenta por persona: cédula, teléfono y correo no se repiten.', [
    ('cuenta-entrar.html', 'Entrar', 'Correo y contraseña. Bloqueo tras varios intentos.'),
    ('cuenta-registro.html', 'Crear cuenta', 'Datos obligatorios para procesar y avisar el pedido.'),
    ('cuenta-pedidos.html', 'Mis pedidos', 'Historial de pedidos de la clienta.'),
    ('cuenta-cupones.html', 'Mis cupones', 'Cupones personales, intransferibles.'),
    ('cuenta-datos.html', 'Mis datos', 'Dirección, novedades y contraseña.'),
  ]),
  ('Temporadas', 'Ocultas hasta encenderlas o hasta su fecha. Se revisan con un enlace privado.', [
    ('temporada-navidad.html', 'Navidad', 'Vista previa privada de la temporada.'),
    ('temporada-black-friday.html', 'Black Friday', 'Vista previa privada, con 20 % de descuento.'),
  ]),
  ('Embajadoras y aliadas', 'Cada afiliada tiene su enlace personal medible; la aliada, además, su tienda editable.', [
    ('programas.html', 'Programas', 'Cómo funcionan y postulación.'),
    ('afiliadas-entrar.html', 'Portal de afiliadas', 'Entrada al portal.'),
    ('afiliadas-panel-embajadora.html', 'Panel de una embajadora', 'Su enlace y QR, visitas, pedidos y comisiones.'),
    ('afiliadas-panel-aliada.html', 'Panel de una aliada', 'Su tienda, ganancias y saldo.'),
    ('afiliadas-mi-tienda.html', 'Mi tienda (aliada)', 'Título, subtítulo, colores de fondo y texto, y banner elegido entre los de THF.'),
    ('afiliadas-precios.html', 'Mis piezas (aliada)', 'Precio dentro del rango y la foto de cada pieza, entre las que prepara THF.'),
    ('e-luna.html', 'Tienda de una aliada', 'Tienda Luna (/e/luna): sus colores, su banner y su menú de categorías. Cobra solo THF.'),
  ]),
  ('Panel · Tienda', 'El día a día: pedidos, pagos y clientas.', [
    ('panel-inicio.html', 'Inicio del panel', 'Resumen y pendientes.'),
    ('panel-pedidos.html', 'Pedidos', 'Listado con origen y estado.'),
    ('panel-pedido-11.html', 'Pedido con pago por verificar', 'Captura, datos del pago, verificar o rechazar, avisar por WhatsApp.'),
    ('panel-pedido-2.html', 'Pedido entregado', 'Historial, avisos enviados, referida por.'),
    ('panel-pagos-por-verificar.html', 'Pagos por verificar', 'Todos los "Ya pagué" en una sola lista.'),
    ('panel-clientas.html', 'Clientas', 'Una ficha por persona, sin duplicados.'),
    ('panel-clienta-7.html', 'Ficha de una clienta', 'Pedidos, cupón personal, bloqueo.'),
    ('panel-solicitudes.html', 'Solicitudes', 'Postulaciones y pedidos personalizados.'),
  ]),
  ('Panel · Catálogo y costos', 'Piezas, fotos y estructura de costos.', [
    ('panel-piezas.html', 'Piezas', 'Catálogo con estados.'),
    ('panel-pieza-1.html', 'Editar una pieza', 'Fotos, textos, variantes con color, precios y SEO.'),
    ('panel-colecciones.html', 'Colecciones', ''), ('panel-lugares.html', 'Bitácora · lugares', ''), ('panel-looks.html', 'Compra el look', ''),
    ('panel-medios.html', 'Fotos y videos', ''),
    ('panel-costos.html', 'Costos por pieza', 'Con la misma foto del catálogo.'),
    ('panel-costos-4.html', 'Receta de una pieza', 'Materiales, mano de obra, precio sugerido.'),
    ('panel-materiales.html', 'Materiales', 'Costo por unidad y existencia.'),
    ('panel-proveedores.html', 'Proveedores', ''),
  ]),
  ('Panel · Ventas y programas', 'Temporadas, cupones, envíos, cobros y afiliadas.', [
    ('panel-temporadas.html', 'Temporadas y ofertas', ''), ('panel-temporada-2.html', 'Editar Navidad', ''),
    ('panel-cupones.html', 'Cupones', ''), ('panel-cupon-1.html', 'Editar un cupón', ''),
    ('panel-envios.html', 'Envíos', ''), ('panel-metodos-de-pago.html', 'Métodos de pago', ''),
    ('panel-afiliadas.html', 'Afiliadas', ''), ('panel-afiliada-1.html', 'Embajadora (Valentina)', 'Pagos, ajustes y libro de movimientos.'),
    ('panel-afiliada-1-vista.html', 'Ver como ella', 'Su panel tal como lo ve, para liberar pagos.'),
    ('panel-afiliada-3.html', 'Aliada (Luisa)', ''), ('panel-afiliada-3-vista.html', 'Ver como ella (aliada)', ''),
    ('panel-imagenes-aliadas.html', 'Imágenes para aliadas', 'Banners y fotos por pieza que pueden elegir las aliadas (nunca las de la tienda principal).'),
    ('panel-comisiones.html', 'Comisiones por pagar', 'Saldo disponible, en espera y pagado; CSV para el banco.'),
  ]),
  ('Panel · Analítica y sitio', 'Medición, contenido, ajustes y seguridad.', [
    ('panel-analitica.html', 'Analítica', 'Periodos y fechas personalizadas, canales, orgánico vs anuncios.'),
    ('panel-utm.html', 'Enlaces UTM', ''),
    ('panel-integraciones.html', 'Integraciones', 'Google Analytics 4, píxeles de Meta y TikTok, webhooks firmados y estado de las API.'),
    ('panel-biblioteca.html', 'Guías y ebooks', ''), ('panel-guia-6.html', 'Editar una guía', ''),
    ('panel-ajustes.html', 'Ajustes', 'Todo lo editable de la tienda.'),
    ('panel-avisos.html', 'Avisos', 'Canales y textos de las notificaciones.'),
    ('panel-seo.html', 'SEO, IA y GEO', 'Buscadores y asistentes de IA.'),
    ('panel-usuarios.html', 'Usuarios', 'Quién entra al panel y con qué permisos.'),
    ('panel-auditoria.html', 'Auditoría', 'Registro de quién hizo qué.'),
  ]),
]
# Miniaturas con el navegador (servidor local temporal)
port = 8899
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(OUT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
(OUT / 'img-tour').mkdir(exist_ok=True)
try:
    from playwright.sync_api import sync_playwright
    from PIL import Image
    exe = '/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe)
        pg = b.new_page(viewport={'width': 1440, 'height': 900})
        pg.route('**/fonts.g*/**', lambda r: r.abort())
        for _, _, items in TOUR:
            for f, _, _ in items:
                if not (OUT / f).exists(): print('falta', f); continue
                pg.goto(f'http://localhost:{port}/{f}'); pg.wait_for_timeout(700)
                pg.evaluate("document.querySelectorAll('.pv-tour,#splash').forEach(e=>e.remove())"); pg.wait_for_timeout(250)
                tmp = OUT / 'img-tour' / 'tmp.png'
                pg.screenshot(path=str(tmp))
                Image.open(tmp).convert('RGB').resize((480, 300), Image.LANCZOS).save(OUT / 'img-tour' / (f[:-5] + '.webp'), quality=78)
                tmp.unlink()
        b.close()
finally:
    srv.terminate()

e = html.escape
cards = []
for title, intro, items in TOUR:
    li = ''.join(f'<a class="tc" href="{f}"><img src="img-tour/{f[:-5]}.webp" alt="" loading="lazy" width="480" height="300"><b>{e(t)}</b>{f"<span>{e(d)}</span>" if d else ""}</a>'
                 for f, t, d in items if (OUT / f).exists())
    cards.append(f'<section><h2>{e(title)}</h2><p class="lead">{e(intro)}</p><div class="grid">{li}</div></section>')
page = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recorrido THF</title><meta name="robots" content="noindex"><link rel="icon" href="brand/favicon.svg">
<style>
:root{{--negro:#0D0C0B;--tinta:#1D1815;--gris:#6E6157;--arena:#F3EBE1;--beige:#E7D6C3;--blanco:#fff;--oro:#B8912F;--oro-t:#735619;--oro-c:#E2C47A}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--arena:#141210;--blanco:#1E1B18;--tinta:#F3EBE1;--gris:#B9AC9F;--beige:#2A2520}}}}
:root[data-theme="dark"]{{--arena:#141210;--blanco:#1E1B18;--tinta:#F3EBE1;--gris:#B9AC9F;--beige:#2A2520}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--arena);color:var(--tinta);font:300 16px/1.6 Jost,"Avenir Next",system-ui,sans-serif}}
header{{background:var(--negro);color:var(--arena);padding:56px 16px 48px}}
.wrap{{max-width:1180px;margin:0 auto;padding:0 16px}}
.eyebrow{{font-size:.7rem;letter-spacing:.28em;text-transform:uppercase;color:var(--oro-c)}}
h1{{font:400 clamp(2.4rem,6vw,4.2rem)/1.05 "Cormorant Garamond",Georgia,serif;margin:.3em 0}}
header p{{max-width:640px;color:rgba(243,235,225,.75)}}
header a{{color:var(--oro-c)}}
section{{padding:40px 0 8px}}h2{{font:400 2rem/1.1 "Cormorant Garamond",Georgia,serif;margin:0 0 4px;border-top:1px solid var(--oro);padding-top:18px}}
.lead{{color:var(--gris);margin:0 0 18px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}}
.tc{{display:grid;gap:6px;text-decoration:none;color:inherit;background:var(--blanco);border-radius:14px;padding:10px 10px 14px;border:1px solid rgba(29,24,21,.07);transition:transform .2s,box-shadow .2s}}
.tc:hover{{transform:translateY(-2px);box-shadow:0 14px 30px -18px rgba(0,0,0,.4)}}
.tc img{{width:100%;height:auto;border-radius:8px;background:var(--beige)}}.tc b{{font-weight:500}}.tc span{{font-size:.86rem;color:var(--gris)}}
footer{{padding:40px 16px 60px;color:var(--gris);font-size:.86rem}}
</style></head><body>
<header><div class="wrap"><p class="eyebrow">THF Accesorios · vista previa</p><h1>Recorrido de la tienda</h1>
<p>Todas las pantallas de la tienda, de la compra, de las cuentas, del portal de afiliadas y del panel, con datos de demostración. Nada de lo que hagas aquí se guarda: en la versión publicada todo funciona de verdad.</p>
<p><a href="index.html">Ir a la tienda →</a></p></div></header>
<main class="wrap">{''.join(cards)}</main>
<footer class="wrap">Datos de demostración: pedidos, clientas, afiliadas y visitas inventados para mostrar cómo funciona cada pantalla.</footer>
</body></html>'''
(OUT / 'recorrido.html').write_text(page, encoding='utf-8')
print('recorrido.html listo')
