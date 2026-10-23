"""Manual de uso de THF (A4, con la línea gráfica de la marca y capturas reales de la tienda de demostración).
Uso: python3 dev/manual/build_manual.py carpeta-de-capturas salida.pdf
Las capturas salen de la tienda de demostración (dev/demo.mjs) con Playwright: shots/p-*.png (tienda), shots/pm-*.png (móvil),
shots/man/*.png (panel, ajustes y portal)."""
import sys, html
from pathlib import Path
from PIL import Image

SHOTS = Path(sys.argv[1]); OUTPDF = Path(sys.argv[2])
W = Path(__file__).resolve().parents[2]
CACHE = Path('/tmp/thf-manual-img'); CACHE.mkdir(exist_ok=True)

def src(name):
    for d in (SHOTS / 'man', SHOTS):
        f = d / f'{name}.png'
        if f.exists(): return f
    raise FileNotFoundError(name)

def jpg(name, top=0, h=None, left=0, w=None, maxw=1500):
    f = src(name)
    out = CACHE / f'{name}-{top}-{h}-{left}-{w}.jpg'
    if not out.exists():
        im = Image.open(f).convert('RGB')
        W0, H0 = im.size
        im = im.crop((left, top, min(W0, left + (w or W0)), min(H0, top + (h or H0))))
        if im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
        im.save(out, 'JPEG', quality=80, optimize=True, progressive=True)
    return out.as_uri()

def seed(name, maxw=1400):
    out = CACHE / f'seed-{name}.jpg'
    if not out.exists():
        im = Image.open(W / f'public/media/seed/{name}.webp').convert('RGB'); im.thumbnail((maxw, maxw)); im.save(out, 'JPEG', quality=78, optimize=True)
    return out.as_uri()

def shot(name, cap='', top=0, h=None, left=None, w=None, cls=''):
    if left is None: left = 240 if name.startswith('a-') and not name.endswith('-vista') else 0
    c = f'<figcaption>{cap}</figcaption>' if cap else ''
    return f'<figure class="shot {cls}"><img src="{jpg(name, top, h, left, w)}" alt="">{c}</figure>'

def phone(name, cap='', top=0, h=1560):
    c = f'<figcaption>{cap}</figcaption>' if cap else ''
    return f'<figure class="phone"><div class="ph"><img src="{jpg(name, top, h, maxw=700)}" alt=""></div>{c}</figure>'

E = html.escape
CSS = r"""
@page{size:210mm 297mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Poppins",sans-serif;font-weight:300;color:#1D1815;font-size:9.2pt;line-height:1.58;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:210mm;height:297mm;padding:16mm 17mm 20mm;position:relative;page-break-after:always;background:#F3EBE1;overflow:hidden}
.pg.white{background:#fff}
.pg.dark{background:#0D0C0B;color:#F3EBE1}
.pg.marino{background:#192543;color:#F3EBE1}
.pg.burdeos{background:#3D1011;color:#F3EBE1}
.pg.oliva{background:#262818;color:#F3EBE1}
.pg:last-child{page-break-after:auto}
h1,h2,h3,h4{font-family:"Lora",serif;font-weight:400;margin:0;line-height:1.1;letter-spacing:-.01em}
h1{font-size:40pt}
h2{font-size:21pt;margin:2mm 0 4mm}
h3{font-size:12.5pt;margin:4.5mm 0 1.6mm}
h4{font-size:10.5pt;margin:3mm 0 1mm;font-weight:500}
p{margin:0 0 2.6mm}
b,strong{font-weight:500}
.k{font-size:6.6pt;letter-spacing:.26em;text-transform:uppercase;color:#735619;font-weight:500;margin:0}
.dark .k,.marino .k,.burdeos .k,.oliva .k{color:#E2C47A}
.script{font-family:"TeX Gyre Chorus",cursive;font-size:1.3em;color:#735619;letter-spacing:0}
.dark .script,.marino .script,.burdeos .script,.oliva .script{color:#E2C47A}
.lede{font-size:10.6pt;line-height:1.55;max-width:150mm}
ul,ol{padding-left:4.6mm;margin:0 0 2.6mm}
li{margin:0 0 1.4mm}
li::marker{color:#B8912F}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm}
.c-wide{display:grid;grid-template-columns:1.35fr 1fr;gap:6mm;align-items:start}
.shot{margin:3mm 0 3.5mm;background:#fff;border:1px solid rgba(29,24,21,.12);box-shadow:0 1.5mm 5mm -2mm rgba(29,24,21,.25)}
.shot img{display:block;width:100%;height:auto}
figcaption{font-size:7.2pt;color:#6E6157;padding:1.8mm 2.4mm;border-top:1px solid rgba(184,145,47,.35);background:#fff}
.shot.flat{box-shadow:none}
.phones{display:flex;gap:8mm;justify-content:center;margin:3mm 0}
.phone{margin:0;width:56mm}
.phone .ph{border:2mm solid #0D0C0B;border-radius:7mm;overflow:hidden;background:#0D0C0B}
.phone img{display:block;width:100%}
.phone figcaption{background:none;border:0;text-align:center}
.box{background:#fff;padding:4mm 5mm;margin:3mm 0;border-left:1.4px solid #B8912F}
.white .box{background:#F3EBE1}
.box p:last-child,.box ul:last-child{margin:0}
.tip{background:#0D0C0B;color:#F3EBE1;padding:4mm 5mm;margin:3mm 0}
.tip b{color:#E2C47A}
.rule{height:1px;background:#B8912F;width:24mm;margin:4mm 0}
.foot{position:absolute;left:17mm;right:17mm;bottom:9mm;font-size:6.4pt;letter-spacing:.22em;text-transform:uppercase;color:#6E6157;display:flex;justify-content:space-between;border-top:1px solid rgba(184,145,47,.45);padding-top:2.6mm}
.dark .foot,.marino .foot,.burdeos .foot,.oliva .foot{color:rgba(243,235,225,.6)}
table.t{width:100%;border-collapse:collapse;font-size:8pt;margin:2.5mm 0 3.5mm}
table.t th,table.t td{text-align:left;padding:1.7mm 2mm;border-bottom:1px solid rgba(184,145,47,.38);vertical-align:top}
table.t th{font-size:6pt;letter-spacing:.18em;text-transform:uppercase;color:#735619;font-weight:500}
table.t td:first-child{white-space:nowrap}
table.t td.wrap{white-space:normal}
.steps{list-style:none;padding:0;margin:3mm 0;counter-reset:s}
.steps li{counter-increment:s;position:relative;padding-left:10mm;margin-bottom:2.8mm}
.steps li::before{content:counter(s,decimal-leading-zero);position:absolute;left:0;top:-.5mm;font-family:"Lora",serif;font-size:12pt;color:#B8912F}
.steps li b{display:block;font-family:"Lora",serif;font-weight:500;font-size:10pt;margin-bottom:.4mm}
.pill{display:inline-block;font-size:6.6pt;letter-spacing:.06em;padding:.6mm 2.2mm;border-radius:3mm;background:#F4EAD0;color:#735619;font-weight:500;white-space:nowrap}
.pill.ok{background:#E3EFE4;color:#2F6B3D}.pill.bad{background:#F6E1E1;color:#9B2C2C}.pill.blue{background:#E2EBF7;color:#1F4E8C}.pill.warn{background:#FBEFD9;color:#8A5A00}
.mono{font-family:"DejaVu Sans Mono",monospace;font-size:.9em}
/* portada */
.cover{padding:0;background:#0D0C0B;color:#F3EBE1}
.cover .img{width:100%;height:150mm;object-fit:cover;display:block}
.cover .t{padding:12mm 17mm 0}
.cover h1{margin:4mm 0 4mm;font-size:44pt}
.cover p.sub{color:rgba(243,235,225,.8);font-size:11pt;max-width:140mm}
.logo{position:absolute;right:17mm;bottom:17mm;display:grid;grid-template-columns:10mm 10mm;font-family:"Lora",serif;font-size:13pt;text-align:center;line-height:10mm}
.logo span{border:.6px solid #E2C47A}
.logo span:nth-child(1),.logo span:nth-child(4){background:#F3EBE1;color:#0D0C0B}
.logo span:nth-child(2),.logo span:nth-child(3){background:#0D0C0B;color:#F3EBE1}
.ver{position:absolute;left:17mm;bottom:16mm;font-size:6.6pt;letter-spacing:.24em;text-transform:uppercase;color:#E2C47A;border:1px solid #E2C47A;padding:1.8mm 3.2mm}
/* separadores */
.part{display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:40mm}
.part .num{font-family:"Lora",serif;font-size:120pt;line-height:1;color:#E2C47A;opacity:.9}
.part h1{font-size:38pt;margin:3mm 0 4mm}
.part p{max-width:130mm;font-size:10.6pt;color:rgba(243,235,225,.82)}
.part .bg{position:absolute;inset:0 0 auto 0;height:120mm;width:100%;object-fit:cover;opacity:.45}
/* índice */
.toc{list-style:none;padding:0;margin:5mm 0 0;columns:2;column-gap:10mm}
.toc li{display:flex;gap:3mm;align-items:baseline;border-bottom:1px solid rgba(184,145,47,.3);padding:1.25mm 0;margin:0;break-inside:avoid}
.toc li b{font-family:"Lora",serif;font-weight:400;font-size:9.6pt;flex:1}
.toc li span{font-size:7.4pt;color:#735619}
.toc li.part-row b{font-weight:500;color:#735619;font-family:"Poppins",sans-serif;font-size:6.8pt;letter-spacing:.2em;text-transform:uppercase}
/* personas */
.who{background:#fff;padding:4mm;border-top:1.4px solid #B8912F}
.who h4{margin-top:0}
.who p{font-size:8.4pt;margin:0}
.flow{display:grid;grid-template-columns:repeat(6,1fr);gap:2mm;margin:4mm 0}
.flow div{background:#0D0C0B;color:#F3EBE1;padding:3mm 2.4mm;font-size:7.4pt;line-height:1.35;position:relative}
.flow div b{display:block;font-family:"Lora",serif;font-weight:400;font-size:10pt;color:#E2C47A;margin-bottom:1mm}
.small{font-size:8pt}.muted{color:#6E6157}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.grid2 .shot{margin:0}
dl.g{display:grid;grid-template-columns:34mm 1fr;gap:1.6mm 4mm;margin:2mm 0;font-size:8.6pt}
dl.g dt{font-family:"Lora",serif;font-weight:500}
dl.g dd{margin:0}
"""

LOGO = '<div class="logo"><span>T</span><span>H</span><span>F</span><span>·</span></div>'
PAGES = []   # (cls, body, foot, toc-title or None, is_part)

def page(body, cls='', foot='', toc=None):
    PAGES.append((cls, body, foot, toc, False))

def part(n, title, text, photo, tone='dark'):
    PAGES.append((f'{tone} part', f'<img class="bg" src="{seed(photo)}" alt=""><p class="num">{n}</p><p class="k">Parte {n}</p><h1>{title}</h1><p>{text}</p>', '', title, True))

# ============================================================== PORTADA
cover = f'''<section class="pg cover"><img class="img" src="{seed('ocaso-juangriego')}" alt=""><div class="t"><p class="k">Manual de uso · versión 2 · octubre 2026</p>
<h1>Manual de la tienda <span class="script">THF</span></h1>
<p class="sub">Cómo funciona todo: la tienda, el pedido y el pago, las cuentas de las clientas, las embajadoras y aliadas, los costos, la analítica y el panel de administración. Con capturas de cada pantalla.</p></div>
<span class="ver">Para la dueña y el equipo</span>{LOGO}</section>'''

# ============================================================== INTRODUCCIÓN
page(f'''<p class="k">Antes de empezar</p><h2>Cómo funciona THF <span class="script">en una página</span></h2>
<p class="lede">La tienda tiene cuatro tipos de personas. Cada una ve una parte distinta y todas trabajan sobre los mismos pedidos.</p>
<div class="cols" style="margin-top:4mm">
<div class="who"><h4>La clienta</h4><p>Recorre la tienda, arma su pedido y lo cierra por WhatsApp o paga en la web. Puede crear su cuenta para ver sus pedidos y sus cupones personales.</p></div>
<div class="who"><h4>La dueña y el equipo</h4><p>Usan el panel (<span class="mono">/admin</span>): pedidos, pagos, piezas, costos, afiliadas, temporadas, analítica y ajustes. El equipo ve menos que la dueña.</p></div>
<div class="who"><h4>La embajadora</h4><p>Comparte su enlace personal o su código. Cada venta que llega por ella le suma una comisión. Ve sus números en su portal.</p></div>
<div class="who"><h4>La aliada</h4><p>Tiene su propia tienda dentro de THF (<span class="mono">/e/su-nombre</span>) con sus precios. Gana la diferencia entre su precio y el costo de aliada.</p></div>
</div>
<h3>El camino de un pedido</h3>
<div class="flow"><div><b>Pedido</b>La clienta lo crea; el precio lo calcula la tienda.</div><div><b>Pago</b>Por WhatsApp o en la web, siempre a THF.</div><div><b>Verificación</b>Revisas en tu banco y lo apruebas.</div><div><b>Preparación</b>Se hace a mano en el taller.</div><div><b>Envío o retiro</b>Con empresa y guía, o listo para retirar.</div><div><b>Entregado</b>La comisión de la afiliada queda lista para pagar.</div></div>
<p>En cada paso la tienda prepara el aviso para la clienta y tú lo envías con un botón por WhatsApp.</p>
<h3>Las reglas que nunca cambian</h3>
<ul><li><b>Solo THF cobra.</b> Ninguna embajadora ni aliada recibe pagos de clientas.</li>
<li><b>Un solo WhatsApp oficial</b>, que solo se cambia desde Ajustes y confirmando tu identidad.</li>
<li><b>El precio lo calcula la tienda</b>, nunca el navegador de la clienta. Cada pedido guarda sus precios del momento.</li>
<li><b>El dólar manda.</b> Los bolívares se calculan con la tasa del BCV vigente; sin tasa, no se muestran.</li>
<li><b>El libro de comisiones no se edita ni se borra.</b> Los errores se corrigen con un ajuste nuevo.</li>
<li><b>Todo número se cambia desde el panel</b>: comisiones, días, montos, duración de descargas, tasa.</li></ul>''', foot='Introducción', toc='Cómo funciona THF')

page('''<p class="k">Antes de empezar</p><h2>Palabras que <span class="script">verás</span> en el panel</h2>
<dl class="g">
<dt>Referida por</dt><dd>La embajadora o aliada que trajo la venta (por su enlace, su código o su tienda). En la documentación técnica se llama <b>atribución</b>. Cada pedido tiene como máximo una, y nadie se puede referir a sí misma.</dd>
<dt>Enlace personal</dt><dd><span class="mono">tudominio.com/a/CÓDIGO</span>. Quien entra por ahí queda "referida por" esa afiliada durante los días que digas en Ajustes (30 al empezar).</dd>
<dt>Comisión / ganancia</dt><dd>Lo que gana una embajadora (porcentaje y/o monto por venta) o una aliada (su precio menos el costo de aliada).</dd>
<dt>Libro de movimientos</dt><dd>La lista de todo lo que se le acredita, revierte, ajusta o paga a cada afiliada. Es la base de su saldo y no se puede editar.</dd>
<dt>Días de espera</dt><dd>Tiempo desde el pago del pedido hasta que su comisión se puede pagar (para cubrir cambios o devoluciones). 7 al empezar.</dd>
<dt>Modo de cierre</dt><dd>Cómo termina el pedido: <b>WhatsApp</b> (como siempre), <b>mixto</b> (pagar en la web o WhatsApp) o <b>web</b> (pago en la web).</dd>
<dt>Tasa del BCV</dt><dd>Bolívares por dólar del Banco Central. Puede ser automática o la escribes tú. Cada pedido respeta su tasa unas horas (12 al empezar).</dd>
<dt>"Ya pagué"</dt><dd>El botón con el que la clienta reporta su pago: banco, teléfono, referencia, monto, fecha y captura.</dd>
<dt>Verificar un pago</dt><dd>Confirmar en tu banco que el dinero llegó y aprobarlo en el panel. Se puede automatizar contratando el servicio del banco.</dd>
<dt>Temporada</dt><dd>Navidad, Black Friday u otra: una franja arriba de la tienda, su página y, si quieres, un descuento. Oculta hasta su fecha.</dd>
<dt>Cupón personal</dt><dd>Un cupón que solo funciona con la cuenta de una clienta. No se puede pasar a otra persona.</dd>
<dt>Receta de una pieza</dt><dd>Los materiales y cantidades que lleva una pieza. Con eso la tienda calcula su costo y un precio sugerido.</dd>
<dt>UTM</dt><dd>Etiquetas que se agregan a un enlace (red, tipo de contenido, campaña) para saber qué publicación trajo visitas y ventas.</dd>
<dt>Orgánico / anuncios</dt><dd>Orgánico: llegaron sin pagar publicidad (Instagram, Google, WhatsApp). Anuncios: por una campaña pagada.</dd>
<dt>Confirmar tu identidad</dt><dd>Algunas acciones delicadas (cambiar el WhatsApp, la tasa, los datos de cobro, pagar a una afiliada, usuarios) piden otra vez tu contraseña y el código de 2 pasos.</dd>
<dt>Auditoría</dt><dd>El registro de quién hizo qué y cuándo en el panel.</dd>
</dl>''', foot='Introducción', toc='Palabras que verás')

# ============================================================== PARTE 1 · TIENDA
part(1, 'La tienda, vista por la clienta', 'Lo que ve una persona desde que entra hasta que recibe su pedido. Así puedes acompañarla por WhatsApp sabiendo exactamente qué tiene en pantalla.', 'salinas-rosa', 'marino')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>Recorrer y <span class="script">elegir</span></h2>
{shot('p-01-inicio', 'Inicio: la portada, la Bitácora de los 10 lugares y las colecciones. Este diseño es el aprobado y no cambió.', h=900)}
<div class="cols"><div>{shot('p-02-catalogo', 'Catálogo con filtros por colección, tipo, piedra y precio.', h=900)}</div><div>{shot('p-03-pieza', 'Ficha de la pieza: fotos, historia, largo de cadena, precio al detal y al mayor.', h=900)}</div></div>
<p>Las piezas, sus fotos, textos y precios se editan en <b>Panel → Catálogo → Piezas</b>. Si hay una temporada encendida, la pieza muestra su precio de temporada y una etiqueta.</p>''', foot='Parte 1 · La tienda', toc='Recorrer y elegir')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>Variantes, Bitácora <span class="script">y compra rápida</span></h2>
<div class="cols"><div>{shot('p-22-card-variantes', 'En el catálogo, al pasar el cursor sube la franja "Añadir" con los colores disponibles: se elige uno y se añade.')}</div><div>{shot('p-23-ficha-variantes', 'En la ficha se elige el color con las muestras y el largo de cadena.', h=1000)}</div></div>
<ul><li>Las <b>variantes con color</b> se crean en Panel → Piezas → (pieza) → Variantes. Solo se muestran las disponibles y el pedido guarda la elección ("Cuarzo rosa · 45 cm").</li>
<li>En tabletas y teléfonos la <b>Bitácora</b> ya no se corta: se ve el mapa entero y debajo (o al lado, en tableta horizontal) un lugar a la vez, con flechas y puntos.</li>
<li>Junto al botón de compra la clienta ve por qué confiar: hecha a mano y en cuántos días, envíos a toda Venezuela y que solo se paga a THF.</li></ul>''', foot='Parte 1 · La tienda', toc='Variantes y compra rápida')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>En el <span class="script">teléfono</span></h2>
<div class="phones">{phone('pm-bitacora', 'Bitácora: mapa completo y lugares que se deslizan; la ruta y el color siguen al lugar', h=1688)}{phone('pm-barra-compra', 'Barra fija "Añadir al pedido" al bajar por la ficha', h=1688)}</div>
<p>La Bitácora se ve igual de clara en el teléfono y en la tableta que en el escritorio: el mapa entero y un lugar a la vez, con sus piezas y precios. En la ficha, el botón de compra siempre queda a mano.</p>''', foot='Parte 1 · La tienda', toc='En el teléfono')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>El carrito y <span class="script">sus datos</span></h2>
<div class="cols"><div>{shot('p-04-carrito', 'El carrito muestra el envío, el precio al mayor desde 6 piezas, el cupón y el total.', h=900)}</div><div>{shot('p-05-datos', 'Los datos de la clienta: nombre, WhatsApp, cédula, correo, estado, ciudad y dirección.', h=900)}</div></div>
<h3>Lo que pasa al tocar "Crear pedido"</h3>
<ol class="steps"><li><b>La tienda recalcula todo</b>Precios, descuentos, cupón, envío y recargo del método se calculan de nuevo en el servidor.</li>
<li><b>Busca o crea la ficha de la clienta</b>Por su cédula, teléfono y correo. Si alguno no coincide con sus compras anteriores, le pide escribirlos igual o escribir por WhatsApp. Así nadie usa dos veces un cupón de primera compra.</li>
<li><b>Revisa si viene de una afiliada</b>Por su enlace, su código o su tienda. Solo una por pedido.</li>
<li><b>Guarda el pedido</b>Con un código <span class="mono">THF-2026-000123</span> y la fotografía de los precios de ese momento.</li></ol>
<div class="box"><p><b>Datos obligatorios</b>: se cambian en Ajustes → Cierre del pedido (pedir cédula, pedir correo y el texto que acepta la clienta).</p></div>''', foot='Parte 1 · La tienda', toc='El carrito y sus datos')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>Cómo se cierra <span class="script">el pedido</span></h2>
{shot('p-06-pedido-creado', 'Modo mixto: la clienta elige "Pagar ahora" o "Enviar por WhatsApp".', h=900)}
<table class="t"><thead><tr><th>Modo</th><th>Qué ve la clienta</th><th>Cuándo usarlo</th></tr></thead><tbody>
<tr><td><b>WhatsApp</b> (al empezar)</td><td class="wrap">Se abre el WhatsApp oficial con el pedido escrito: código, piezas, envío, total y quién la refirió. El pago se coordina por chat, como siempre.</td><td class="wrap">Mientras la marca arranca.</td></tr>
<tr><td><b>Mixto</b></td><td class="wrap">Puede pagar ahora en la pantalla de su pedido o seguir por WhatsApp.</td><td class="wrap">Cuando tengas cargados los datos de pago y quieras probar.</td></tr>
<tr><td><b>Web</b></td><td class="wrap">Va directo a la pantalla de pago. El WhatsApp sigue disponible para dudas.</td><td class="wrap">Cuando el volumen crezca.</td></tr></tbody></table>
<p>Se cambia en <b>Ajustes → Cierre del pedido → Cómo se cierra el pedido</b>. Los pedidos ya creados no cambian.</p>''', foot='Parte 1 · La tienda', toc='Cómo se cierra el pedido')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>La pantalla <span class="script">de pago</span></h2>
{shot('p-07-pago', 'Pago Móvil elegido: monto exacto en bolívares con la tasa del BCV, y cada dato con su botón para copiar.', h=1330)}
<div class="cols"><div><h4>Lo que ve</h4><ul><li>El avance del pedido (recibido, pago, preparación, envío o retiro, entregado).</li><li>Los métodos como opciones para tocar. Al elegir uno se ven solo sus datos y su monto, y el total del resumen se actualiza con su recargo.</li><li>"Copiar monto", un botón por dato y "Copiar todos los datos".</li></ul></div>
<div><h4>De dónde sale</h4><ul><li>Datos de cada método: Panel → Ventas → Métodos de pago.</li><li>Tasa: Ajustes → Pagos y tasa del BCV.</li><li>El enlace de esta pantalla es privado y solo lo tiene la clienta (y tú, en el pedido).</li></ul></div></div>''', foot='Parte 1 · La tienda', toc='La pantalla de pago')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>Cambiar de método <span class="script">y pagar</span></h2>
<div class="phones">{phone('pm-07-pago', 'Pago Móvil en el teléfono', top=820, h=1500)}{phone('pm-08-pago-zelle', 'Zelle: otro monto, otros datos', top=820, h=1500)}{phone('pm-09-ya-pague', '"Ya pagué": datos y captura', top=2350, h=1500)}</div>
<h3>Lo que hace "Ya pagué"</h3>
<ol class="steps"><li><b>La clienta escribe su pago</b>Banco desde el que pagó, teléfono, referencia, fecha y monto (ya viene escrito). La captura se reduce en su teléfono y se guarda en privado.</li>
<li><b>La tienda revisa</b>Que la referencia no se haya usado antes y que la misma captura no esté en otro pago.</li>
<li><b>El pedido pasa a "Pago por verificar"</b>Te llega a Panel → Pagos por verificar. La clienta ve "Estamos verificando tu pago".</li></ol>
<p>Para cambiar de método después de reportar un pago, la clienta te escribe por WhatsApp: ya no puede hacerlo sola.</p>''', foot='Parte 1 · La tienda', toc='Cambiar de método y pagar')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>Seguir <span class="script">el pedido</span></h2>
<div class="c-wide"><div>{shot('x-pedido-ejemplo-enviado', 'Pedido en camino: empresa de envío y número de guía para copiar.', h=1000)}</div>
<div class="phones" style="margin:0">{phone('pm-10-verificando', 'Verificando el pago', top=0, h=1560)}</div></div>
<h3>Avisos que recibe la clienta</h3>
<table class="t"><thead><tr><th>Cuándo</th><th>Aviso</th></tr></thead><tbody>
<tr><td>Crea el pedido</td><td class="wrap">Recibimos tu pedido (con el enlace para seguirlo).</td></tr>
<tr><td>Reporta su pago</td><td class="wrap">Estamos verificando tu pago.</td></tr>
<tr><td>Apruebas el pago</td><td class="wrap">Pago confirmado.</td></tr>
<tr><td>No llegó el pago</td><td class="wrap">No pudimos confirmar tu pago (con el motivo que escribas).</td></tr>
<tr><td>En preparación</td><td class="wrap">Tu pedido está en el taller.</td></tr>
<tr><td>Enviado</td><td class="wrap">Va en camino, con empresa y guía.</td></tr>
<tr><td>Listo para retirar</td><td class="wrap">Dirección, horario y mapa del punto de retiro.</td></tr>
<tr><td>Entregado</td><td class="wrap">Gracias por tu compra.</td></tr></tbody></table>
<p>Hoy los envías tú con el botón <b>Avisar por WhatsApp</b> del pedido (ver Parte 2). Los textos se editan en Panel → Sitio → Avisos.</p>''', foot='Parte 1 · La tienda', toc='Seguir el pedido')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>Mi cuenta <span class="script">de clienta</span></h2>
<div class="cols"><div>{shot('p-11-cuenta-entrar', 'Entrar con correo y contraseña.', h=760)}</div><div>{shot('p-12-mis-pedidos', 'Mis pedidos: cada pedido con su estado.', h=760)}</div></div>
<div class="cols"><div>{shot('p-13-cupones', 'Mis cupones: solo los suyos.', h=760)}</div><div>{shot('p-14-datos', 'Mis datos: dirección, novedades y contraseña.', h=760)}</div></div>
<ul><li><b>Una cuenta por persona.</b> La cédula, el teléfono y el correo no se repiten. Si una clienta compró antes como invitada, al crear su cuenta con los mismos datos recupera sus pedidos.</li>
<li><b>Cambiar cédula, teléfono o correo</b> se pide por WhatsApp, para proteger sus cupones.</li>
<li><b>Seguridad</b>: tras 6 intentos fallidos la cuenta se bloquea 15 minutos. Los mensajes no revelan si un correo existe.</li></ul>''', foot='Parte 1 · La tienda', toc='Mi cuenta de clienta')

page(f'''<p class="k">Parte 1 · La tienda</p><h2>Guías gratis <span class="script">y temporadas</span></h2>
<div class="cols"><div>{shot('p-23-guia', 'Guía gratis: se descarga con un enlace que vence.', h=900)}</div><div>{shot('x-temporada-navidad', 'Vista previa privada de la temporada de Navidad.', h=900)}</div></div>
<h3>Guías incluidas</h3>
<p>Guía de piedras, Cómo combinar collares en capas, Cómo revender la Caja de joyería, Pequeña guía de la Virgen del Valle, Libro para colorear Candy Girl, Cómo pedir joyería personalizada, Regalos corporativos y la Guía de cuidado. Todas con la línea de la marca.</p>
<div class="box"><p><b>Duración de la descarga</b>: ya no son 2 horas fijas. En Ajustes → Descargas de guías y ebooks eliges las horas y las descargas de las guías gratis (48 h y 5 al empezar) y los días y descargas de los ebooks pagados. La página de cada guía muestra el tiempo que hayas puesto.</p></div>
<h3>Temporadas</h3>
<p>Navidad y Black Friday ya están creadas y <b>ocultas</b>. Cuando llega su fecha (o cuando la enciendes) aparecen una franja arriba de la tienda, su página con las piezas y, si lo configuras, el descuento. Antes de encenderla la revisas con su enlace privado de vista previa.</p>''', foot='Parte 1 · La tienda', toc='Guías gratis y temporadas')

# ============================================================== PARTE 2 · PANEL
part(2, 'El panel de administración', 'Todo lo que haces como dueña: pedidos, pagos, clientas, piezas, costos, temporadas, afiliadas, analítica y ajustes.', 'pampatar-fortin', 'dark')

page(f'''<p class="k">Parte 2 · Panel</p><h2>Entrar <span class="script">con seguridad</span></h2>
<div class="cols"><div>{shot('login', 'Entrada al panel: tudominio.com/admin', top=230, h=440, left=470, w=500)}</div><div>{shot('reautenticar', 'Confirmar tu identidad antes de una acción delicada.', top=150, h=600, left=470, w=500)}</div></div>
<ol class="steps"><li><b>Correo y contraseña</b>12 caracteres o más. Tras 5 intentos fallidos el usuario se bloquea 15 minutos.</li>
<li><b>Código de 2 pasos</b>La primera vez escaneas un código QR con Google Authenticator, Microsoft Authenticator, 1Password o Authy. Te da 8 códigos de recuperación: guárdalos fuera del teléfono.</li>
<li><b>La sesión vence</b>Tras 60 minutos sin uso o 12 horas en total. Tú lo cambias con las variables del servidor.</li></ol>
<div class="tip"><p><b>Piden confirmar tu identidad</b>: cambiar el WhatsApp oficial o la tasa, ver o cambiar los datos de cobro de los métodos de pago, registrar un pago a una afiliada y la página de Usuarios.</p></div>''', foot='Parte 2 · Panel', toc='Entrar con seguridad')

page(f'''<p class="k">Parte 2 · Panel</p><h2>Inicio <span class="script">del panel</span></h2>
{shot('a-inicio', 'Inicio: cifras de los últimos 30 días, pendientes, últimos pedidos y atajos.', h=640)}
<div class="cols"><div><h4>Las cifras</h4><ul><li><b>Pedidos abiertos</b>: los que aún no están entregados ni cancelados.</li><li><b>Pedidos y pagado</b> de los últimos 30 días.</li><li><b>Pagos por verificar</b> y <b>solicitudes nuevas</b>.</li></ul></div>
<div><h4>Pendientes (se van solos al resolverlos)</h4><ul><li>Pagos por verificar, tasa vencida, métodos sin datos.</li><li>Materiales por debajo del mínimo.</li><li>Afiliadas con comisiones listas para pagar.</li><li>Una temporada que empieza pronto y está apagada.</li><li>WhatsApp de ejemplo, precios de ejemplo, fotos faltantes.</li></ul></div></div>''', foot='Parte 2 · Panel', toc='Inicio del panel')

page(f'''<p class="k">Parte 2 · Panel</p><h2>El menú <span class="script">de la izquierda</span></h2>
<div class="c-wide"><div>
<table class="t"><thead><tr><th>Grupo</th><th>Páginas</th></tr></thead><tbody>
<tr><td>Tienda</td><td class="wrap">Inicio · Pedidos · Pagos por verificar · Clientas · Solicitudes</td></tr>
<tr><td>Catálogo</td><td class="wrap">Piezas · Colecciones · Bitácora · Compra el look · Categorías · Fotos y videos</td></tr>
<tr><td>Costos</td><td class="wrap">Costos por pieza · Materiales · Proveedores</td></tr>
<tr><td>Ventas</td><td class="wrap">Temporadas y ofertas · Cupones · Envíos · Métodos de pago</td></tr>
<tr><td>Programas</td><td class="wrap">Embajadoras y aliadas · Comisiones por pagar</td></tr>
<tr><td>Analítica</td><td class="wrap">Resumen · Enlaces UTM</td></tr>
<tr><td>Biblioteca</td><td class="wrap">Guías y ebooks</td></tr>
<tr><td>Sitio</td><td class="wrap">Editor de la tienda · Avisos · SEO, IA y GEO · Ajustes · Usuarios · Auditoría</td></tr></tbody></table>
<p>Cada grupo se abre y se cierra tocando su nombre. Siempre queda abierto el grupo de la página donde estás.</p>
<p>Abajo están tu nombre, <b>Salir</b> y <b>Ver la tienda</b>.</p></div>
<div>{shot('a-inicio', 'Barra lateral con los grupos.', left=0, w=240, h=900, cls='flat')}</div></div>
<div class="box"><p><b>El rol Equipo</b> ve Tienda, Catálogo, Envíos, Guías, SEO y su cuenta. No ve costos, afiliadas, analítica, temporadas, cupones, métodos de pago, ajustes, usuarios ni auditoría.</p></div>''', foot='Parte 2 · Panel', toc='El menú de la izquierda')

page(f'''<p class="k">Parte 2 · Panel · Tienda</p><h2>Pedidos</h2>
{shot('a-pedidos', 'Lista de pedidos: código, fotos y nombre de las piezas, clienta (y afiliada si la refirió), tipo, origen, total, estado y fecha.', h=680)}
<ul><li><b>Buscar</b> por código, nombre, teléfono o cédula. <b>Filtrar</b> por estado (Todos, Abiertos, Por pagar, Pago por verificar, En preparación…).</li>
<li><b>Origen</b>: de dónde llegó la clienta (Instagram, Google, WhatsApp, Facebook, Pinterest, Embajadoras y aliadas, Directo).</li>
<li>El nombre de la afiliada aparece pequeño junto a la clienta (por ejemplo, VALENTINA o LUNA).</li></ul>''', foot='Parte 2 · Panel', toc='Pedidos')

page(f'''<p class="k">Parte 2 · Panel · Tienda</p><h2>Un pedido <span class="script">por dentro</span></h2>
{shot('a-pedido-entregado', 'Izquierda: piezas, avisos, historial y mensaje. Derecha: estado, clienta, pago y enlace de seguimiento.', h=1120)}
<div class="cols"><div><ul><li><b>Piezas</b> con precio unitario, total y costo de aliada, y el total en bolívares con su tasa.</li><li><b>Costo de producción y margen</b> (solo la dueña).</li><li><b>Avisos a la clienta</b> con su estado y el botón para enviarlos o reenviarlos.</li></ul></div>
<div><ul><li><b>Cliente</b>: datos, ficha, "Referida por" y por dónde llegó.</li><li><b>Pago</b>: los datos que ve la clienta del método elegido.</li><li><b>Enlace de seguimiento</b>: cópialo para la clienta o crea uno nuevo si alguien más lo tiene.</li><li><b>Historial</b> con notas internas.</li></ul></div></div>''', foot='Parte 2 · Panel', toc='Un pedido por dentro')

page(f'''<p class="k">Parte 2 · Panel · Tienda</p><h2>Cambiar el estado <span class="script">y avisar</span></h2>
<div class="cols3"><div>{shot('estado-form', 'Cambiar estado: solo los pasos posibles.')}</div><div>{shot('estado-envio', '"Enviado" pide empresa y guía.')}</div><div>{shot('aviso-card', 'Al guardar: el mensaje y el botón para enviarlo por WhatsApp.')}</div></div>
<table class="t"><thead><tr><th>Estado</th><th>Qué significa</th><th>Qué pasa al guardarlo</th></tr></thead><tbody>
<tr><td><span class="pill warn">Por pagar</span></td><td class="wrap">Pedido creado.</td><td class="wrap">—</td></tr>
<tr><td><span class="pill">Pago por verificar</span></td><td class="wrap">La clienta tocó "Ya pagué".</td><td class="wrap">Llega a Pagos por verificar.</td></tr>
<tr><td><span class="pill ok">Pagado</span></td><td class="wrap">Confirmaste el dinero.</td><td class="wrap">Acredita la comisión de la afiliada, activa las descargas, aviso "Pago confirmado".</td></tr>
<tr><td><span class="pill">En preparación</span></td><td class="wrap">En el taller.</td><td class="wrap">Descuenta los materiales de la receta. Aviso "Tu pedido está en el taller".</td></tr>
<tr><td><span class="pill blue">Enviado</span></td><td class="wrap">Salió con una empresa.</td><td class="wrap">Guarda empresa y guía. Aviso "Va en camino".</td></tr>
<tr><td><span class="pill ok">Listo para retirar</span></td><td class="wrap">En el punto de retiro.</td><td class="wrap">Aviso con dirección, horario y mapa.</td></tr>
<tr><td><span class="pill ok">Entregado</span></td><td class="wrap">Lo recibió.</td><td class="wrap">Aviso de agradecimiento.</td></tr>
<tr><td><span class="pill bad">Cancelado / Reembolsado</span></td><td class="wrap">No sigue.</td><td class="wrap">Revierte la comisión en el libro.</td></tr></tbody></table>''', foot='Parte 2 · Panel', toc='Cambiar el estado y avisar')

page(f'''<p class="k">Parte 2 · Panel · Tienda</p><h2>Pagos <span class="script">por verificar</span></h2>
{shot('a-pagos', 'Cada "Ya pagué" con su monto, referencia, banco, teléfono y captura.', h=880)}
<ol class="steps"><li><b>Abre tu banco</b>Busca el pago por referencia, monto y fecha.</li>
<li><b>Si llegó: "Verificar pago"</b>Con la casilla marcada el pedido pasa a Pagado, se acredita la comisión y se prepara el aviso "Pago confirmado".</li>
<li><b>Si no llegó: "No llegó"</b>Escribe el motivo (lo verá la clienta). El pedido vuelve a "Por pagar" y ella puede reportar otra vez.</li></ol>
<div class="box"><p>Si la referencia ya se usó o la captura está repetida, el pago lo indica en "Verificador". La pestaña <b>Revisados</b> guarda todos los pagos aprobados y rechazados, con quién los revisó.</p></div>''', foot='Parte 2 · Panel', toc='Pagos por verificar')

page(f'''<p class="k">Parte 2 · Panel · Tienda</p><h2>Clientas <span class="script">y solicitudes</span></h2>
<div class="cols"><div>{shot('a-clientas', 'Clientas: una fila por persona, con compras pagadas.', h=900)}</div><div>{shot('a-clienta', 'Ficha: pedidos, cupones personales y acciones.', h=1000)}</div></div>
<ul><li><b>Crear enlace para su contraseña</b>: para clientas que olvidaron la contraseña o compraron sin cuenta. Se envía por WhatsApp.</li>
<li><b>Bloquear cuenta</b> y <b>notas internas</b>.</li>
<li><b>Crear cupón personal</b>: solo ella lo puede usar, con su sesión iniciada, una vez.</li></ul>
{shot('a-solicitudes', 'Solicitudes: postulaciones a Embajadoras y Emprendedoras (nombre público del programa) y pedidos de joyería personalizada.', h=420)}
<p>Para aprobar una postulación usa <b>Aprobar y crear afiliada</b>: se crea su ficha con su código y su enlace, y le envías el acceso por WhatsApp.</p>''', foot='Parte 2 · Panel', toc='Clientas y solicitudes')

page(f'''<p class="k">Parte 2 · Panel · Catálogo</p><h2>Piezas</h2>
<div class="cols"><div>{shot('a-piezas', 'Piezas con estado, colección, SKU y precio.', h=900)}</div><div>{shot('a-pieza', 'Editar una pieza: fotos y datos.', h=1100)}</div></div>
<h3>Cada pieza tiene</h3>
<ul><li><b>Fotos</b>: principal, "al pasar el cursor", cuadro pequeño opcional con la nota de la piedra y galería. Cada ficha trae el texto (prompt) para crear con IA la foto que falte.</li>
<li><b>Precios</b>: detal, oferta, al mayor, costo de aliada (privado), sugerido, mínimo y máximo para aliadas.</li>
<li><b>Datos</b>: colección, lugar de la Bitácora, categoría, piedra, material, largos de cadena, tiempo de elaboración, SKU.</li>
<li><b>Estado</b>: borrador, publicada o archivada; marca "Precio de ejemplo" y "Nombre provisional" hasta confirmar.</li>
<li><b>SEO</b>: título y descripción para Google (si los dejas vacíos se generan solos).</li></ul>
<p>La tarjeta <b>Costo de producción</b> lleva a su receta (Parte 2 · Costos).</p>''', foot='Parte 2 · Panel', toc='Piezas')

page(f'''<p class="k">Parte 2 · Panel · Catálogo</p><h2>Colecciones, Bitácora, looks <span class="script">y fotos</span></h2>
<div class="grid2">{shot('a-colecciones', 'Colecciones: nombre, tono, piezas y visibilidad.', h=520)}{shot('a-lugares', 'Bitácora: los 10 lugares en orden de la ruta.', h=520)}
{shot('a-looks', 'Compra el look: piezas que combinan, con descuento.', h=700)}{shot('a-medios', 'Fotos y videos: se convierten a WebP antes de subir.', h=700)}</div>
<ul style="margin-top:3mm"><li><b>Colecciones</b>: texto, historia, foto y tono. Se pueden ocultar o marcar "muy pronto".</li>
<li><b>Bitácora</b>: cada lugar con punto cardinal, coordenadas, foto e historia. Las piezas se asignan a un lugar.</li>
<li><b>Compra el look</b>: la foto con puntos sobre cada pieza y el descuento del look completo.</li>
<li><b>Categorías</b>: collares, pulseras, sets, cajas.</li>
<li><b>Fotos y videos</b>: arrastra o elige archivos (JPG, PNG, WebP, HEIC del iPhone o MP4). Se quitan los datos de ubicación del teléfono.</li></ul>''', foot='Parte 2 · Panel', toc='Colecciones, Bitácora y fotos')

page(f'''<p class="k">Parte 2 · Panel · Catálogo</p><h2>Variantes <span class="script">con color</span></h2>
{shot('variantes', 'Variantes de una pieza: nombre del grupo, forma (círculos o cuadrados), cada opción con su color y si está disponible.', left=0)}
<ol class="steps"><li><b>Abre la pieza</b>Panel → Catálogo → Piezas → la pieza → sección Variantes.</li>
<li><b>Agrega las opciones</b>Con "+ Agregar opción" o con los botones rápidos (Cuarzo rosa, Amatista, Ónix…). Elige el tono con el cuadro de color.</li>
<li><b>Marca las disponibles</b>Las que no estén marcadas no se ven en la tienda y no se pueden pedir.</li>
<li><b>Guarda</b>Las muestras aparecen en la tarjeta del catálogo y en la ficha.</li></ol>
<div class="box"><p>Los <b>largos o tallas</b> siguen en su campo ("40 cm, 45 cm, 50 cm"). El pedido guarda las dos cosas y el servidor revisa que la opción exista.</p></div>''', foot='Parte 2 · Panel', toc='Variantes con color')

page(f'''<p class="k">Parte 2 · Panel · Costos</p><h2>Costo <span class="script">por pieza</span></h2>
{shot('a-costos', 'Costos por pieza: la misma foto del catálogo, costo, precio y margen.', h=520)}
{shot('a-receta', 'Receta de Trilogía Caribe: materiales, mano de obra, precio sugerido al detal y al mayor.', h=780)}
<p>El costo se recalcula solo cuando cambias el precio de un material, su proveedor o la receta. <b>Usar precio sugerido</b> lo copia a la pieza; el historial guarda cada cambio. Todo esto es interno: no sale en la tienda ni lo ve el Equipo.</p>''', foot='Parte 2 · Panel', toc='Costo por pieza')

page(f'''<p class="k">Parte 2 · Panel · Costos</p><h2>Materiales <span class="script">y proveedores</span></h2>
<div class="cols"><div>{shot('a-materiales', 'Materiales con su costo por unidad, existencia y las piezas que lo usan.', h=700)}</div><div>{shot('a-proveedores', 'Proveedores con su país y recargo.', h=700)}</div></div>
{shot('a-material', 'Un material: precio del paquete, unidades, existencia, compras y movimientos.', h=820)}
<ul><li><b>Costo por unidad</b> = precio del paquete ÷ unidades, más el recargo del proveedor (envío o importación).</li>
<li><b>Registrar una compra</b> suma a la existencia y, si escribes el total pagado, actualiza el costo.</li>
<li>Al pasar un pedido a <b>En preparación</b> se descuentan los materiales de su receta. Los movimientos no se pueden borrar.</li></ul>''', foot='Parte 2 · Panel', toc='Materiales y proveedores')

page(f'''<p class="k">Parte 2 · Panel · Ventas</p><h2>Temporadas <span class="script">y ofertas</span></h2>
{shot('a-temporadas', 'Black Friday y Navidad, apagadas y ocultas.', h=330)}
{shot('a-temporada', 'Editar una temporada: fechas, descuento, colección, franja, foto, cupón y cuenta regresiva.', h=900)}
<ul><li><b>Encendida</b> + fechas: se ve solo entre esas fechas (hora de Venezuela). Apagada no se ve nunca.</li>
<li><b>Descuento</b> en % sobre las piezas (o solo una colección). Si la pieza ya tiene una oferta menor, se cobra la menor.</li>
<li><b>Vista previa</b>: enlace privado para revisarla antes, aunque esté apagada.</li></ul>''', foot='Parte 2 · Panel', toc='Temporadas y ofertas')

page(f'''<p class="k">Parte 2 · Panel · Ventas</p><h2>Cupones</h2>
{shot('a-cupones', 'Cupones: personales y generales, usos y vencimiento.', h=360)}
{shot('a-cupon', 'Un cupón con todas sus reglas y quién lo usó.', h=680)}
<table class="t"><thead><tr><th>Regla</th><th>Para qué</th></tr></thead><tbody>
<tr><td>Tipo</td><td class="wrap">Porcentaje, monto fijo o envío gratis.</td></tr>
<tr><td>Compra mínima / descuento máximo</td><td class="wrap">Limitar el cupón.</td></tr>
<tr><td>Válido desde / hasta</td><td class="wrap">Fechas.</td></tr>
<tr><td>Usos totales / por clienta</td><td class="wrap">Cuántas veces en total y por persona.</td></tr>
<tr><td>Cupón personal de</td><td class="wrap">Solo esa clienta, con su sesión iniciada.</td></tr>
<tr><td>Solo primera compra / no aplica al mayor</td><td class="wrap">Bienvenida y protección de precios.</td></tr>
<tr><td>Solo durante la temporada / colección</td><td class="wrap">Atarlo a Black Friday o a una colección.</td></tr></tbody></table>''', foot='Parte 2 · Panel', toc='Cupones')

page(f'''<p class="k">Parte 2 · Panel · Ventas</p><h2>Envíos y <span class="script">métodos de pago</span></h2>
{shot('a-envios', 'Zonas de envío con costo, envío gratis desde, tiempo y si se cobra en destino.', h=420)}
{shot('a-metodo', 'Pago Móvil: nombre, moneda, recargo, qué pide al pagar y los datos que ve la clienta.', h=770)}
<ul><li><b>Moneda</b>: Bolívares (con la tasa del BCV) o USD. <b>Recargo o descuento</b> en % (ej. PayPal +5 %).</li>
<li><b>Qué pide al pagar</b>: referencia, referencia con captura obligatoria, o nada (efectivo o pago en tienda).</li>
<li><b>Solo isla</b> y <b>solo con retiro</b> ocultan el método si no aplica.</li>
<li><b>Datos que ve la clienta</b>: banco, teléfono, cédula o RIF, titular, cuenta, correo, Pay ID o usuario. Solo salen en la pantalla de pago de cada pedido.</li></ul>''', foot='Parte 2 · Panel', toc='Envíos y métodos de pago')

page(f'''<p class="k">Parte 2 · Panel · Programas</p><h2>Embajadoras <span class="script">y aliadas</span></h2>
{shot('a-afiliadas', 'Afiliadas con su tipo, código, ventas pagadas, saldo y estado.', h=360)}
{shot('a-afiliada', 'Ficha de Valentina: cifras, enlace y QR, acceso a su portal, saldo, pagos, ajustes y libro.', h=800)}
<ul><li><b>Enlace y código</b>: copia su enlace o descarga su QR para que lo imprima o lo comparta.</li>
<li><b>Acceso a su portal</b>: "Crear enlace de acceso" genera un enlace de un solo uso (72 h) para que cree su contraseña; se envía por WhatsApp.</li>
<li><b>Comisión propia</b> (si no usa la general): porcentaje, monto o ambos, por pedido o por pieza, y descuento para quien use su código.</li></ul>''', foot='Parte 2 · Panel', toc='Embajadoras y aliadas')

page(f'''<p class="k">Parte 2 · Panel · Programas</p><h2>Ver como ella <span class="script">y pagarle</span></h2>
<div class="cols"><div>{shot('a-afiliada-vista', '"Ver como ella": el portal de la embajadora en solo lectura.', h=1500)}</div><div>{shot('a-aliada-vista', 'El portal de la aliada, con su tienda y ganancias.', h=1500)}</div></div>
<ol class="steps"><li><b>Revisa su panel</b>Desde su ficha toca "Ver como ella". Ves exactamente su saldo disponible, en espera y cobrado. Queda en Auditoría.</li>
<li><b>Págale por fuera</b>Pago Móvil, transferencia o Zelle a la cuenta de la afiliada.</li>
<li><b>Registra el pago</b>En su ficha → "Registrar pago a la afiliada": monto, referencia y nota. Pide confirmar tu identidad. Se descuenta de su saldo y ella lo ve en su portal.</li></ol>''', foot='Parte 2 · Panel', toc='Ver como ella y pagarle')

page(f'''<p class="k">Parte 2 · Panel · Programas</p><h2>Comisiones <span class="script">por pagar</span></h2>
{shot('a-comisiones', 'Saldo disponible, en espera y pagado de cada afiliada, con botón para pagar y CSV para el banco.', h=400)}
<h3>Cómo se mueve el saldo de una afiliada</h3>
<table class="t"><thead><tr><th>Movimiento</th><th>Cuándo</th><th>Monto</th></tr></thead><tbody>
<tr><td>Comisión</td><td class="wrap">Pedido de una embajadora marcado como pagado.</td><td class="wrap">% y/o monto de la regla vigente. Los pedidos al mayor no generan comisión salvo que lo actives.</td></tr>
<tr><td>Ganancia</td><td class="wrap">Pedido en la tienda de una aliada marcado como pagado.</td><td class="wrap">Su precio menos el costo de aliada, por pieza.</td></tr>
<tr><td>Reversa</td><td class="wrap">Pedido cancelado, devuelto o reembolsado.</td><td class="wrap">Lo mismo, en negativo.</td></tr>
<tr><td>Ajuste</td><td class="wrap">Lo agregas tú con un motivo.</td><td class="wrap">Positivo o negativo.</td></tr>
<tr><td>Pago</td><td class="wrap">Registras que le pagaste.</td><td class="wrap">Negativo; baja su saldo.</td></tr></tbody></table>
<p><b>Disponible</b> = lo que ya pasó los días de espera. <b>En espera</b> = lo reciente. Se paga cuando lo disponible llega al mínimo (US$300 al empezar). El CSV trae el monto en dólares y en bolívares a la última tasa.</p>''', foot='Parte 2 · Panel', toc='Comisiones por pagar')

page(f'''<p class="k">Parte 2 · Panel · Programas</p><h2>Imágenes <span class="script">para aliadas</span></h2>
{shot('a-imagenes-aliadas', 'Banners y fotos por pieza que pueden usar las tiendas aliadas. A la izquierda, atenuada, la foto de la tienda principal (no se usa).', h=1300)}
<ul><li>Las tiendas aliadas <b>no usan las fotos de la tienda principal</b>. Aquí preparas una o varias fotos por pieza y la aliada elige una.</li>
<li>Una pieza sin fotos para aliadas no se puede mostrar en sus tiendas; arriba se avisa cuántas faltan.</li>
<li>Los <b>banners</b> (1800 × 700 px) son opcionales: ella elige uno o ninguno.</li>
<li>Si quitas una foto que alguien usaba, su tienda pasa sola a la primera opción disponible.</li></ul>''', foot='Parte 2 · Panel', toc='Imágenes para aliadas')

page(f'''<p class="k">Parte 2 · Panel · Analítica</p><h2>Analítica</h2>
{shot('rango', 'Periodo: elige de la lista o "Personalizado…" para abrir el calendario.')}
{shot('a-analitica', 'Personas, visitas, páginas, pedidos, ventas pagadas, conversión y visitas por día con los días que hubo pedidos.', h=900)}
<p>La analítica es propia de la tienda: no usa cookies de terceros, no guarda la IP ni datos personales de las visitas y no cuenta a los robots.</p>''', foot='Parte 2 · Panel', toc='Analítica')

page(f'''<p class="k">Parte 2 · Panel · Analítica</p><h2>De dónde llegan <span class="script">y qué compran</span></h2>
{shot('a-analitica', '¿De dónde llegan?, orgánico o anuncios, y el embudo de compra.', top=1100, h=950)}
<table class="t"><thead><tr><th>Tipo</th><th>Qué cuenta</th></tr></thead><tbody>
<tr><td>Orgánico</td><td class="wrap">Llegaron sin publicidad pagada: Instagram, Google, WhatsApp, Pinterest, TikTok.</td></tr>
<tr><td>Anuncios</td><td class="wrap">Enlaces con utm_medium de pago (cpc, paid_afiliadal, ads) o que vienen de Google Ads o Meta Ads.</td></tr>
<tr><td>Programas</td><td class="wrap">Llegaron por el enlace, el código o la tienda de una afiliada.</td></tr>
<tr><td>Directo</td><td class="wrap">Escribieron la dirección o no se sabe el origen.</td></tr></tbody></table>
<p>Más abajo: piezas más vistas, más añadidas y más vendidas, ventas por afiliada, primera página de cada visita, rutas más comunes, campañas con UTM y dispositivos.</p>''', foot='Parte 2 · Panel', toc='De dónde llegan')

page(f'''<p class="k">Parte 2 · Panel · Analítica</p><h2>Enlaces <span class="script">UTM</span></h2>
{shot('a-utm', 'Crear un enlace por publicación y ver sus clics, pedidos y ventas.', h=900)}
<ol class="steps"><li><b>Ponle un nombre</b>Por ejemplo "Reel Ocaso 21 oct".</li>
<li><b>Elige destino, red y tipo de contenido</b>Inicio o una pieza; Instagram, Facebook, TikTok, WhatsApp…; biografía, publicación, historias, reels, estado de WhatsApp, grupo, correo, QR impreso, colaboración o anuncio pagado.</li>
<li><b>Escribe la campaña</b>Por ejemplo navidad-2026. Si es pagado, elige "Anuncio en redes (pago)" o "Anuncio en Google (pago)": así la analítica lo cuenta como anuncio.</li>
<li><b>Copia el enlace corto</b><span class="mono">tudominio.com/r/código</span>. Úsalo en la biografía, la historia o el anuncio.</li></ol>''', foot='Parte 2 · Panel', toc='Enlaces UTM')

page(f'''<p class="k">Parte 2 · Panel · Biblioteca</p><h2>Guías <span class="script">y ebooks</span></h2>
{shot('a-biblioteca', 'Guías: precio (gratis o pagada), estado y archivo.', h=420)}
{shot('a-guia', 'Editar una guía: textos, portada, formato, páginas, precio, estado y archivo.', h=860)}
<ul><li>El archivo (PDF, EPUB o ZIP) <b>nunca es público</b>: se entrega con un enlace personal que vence.</li>
<li><b>Cargar las guías incluidas</b> copia al almacenamiento privado las 7 guías gratuitas que trae la tienda.</li>
<li>Si una guía publicada no tiene archivo, se muestra como "Muy pronto".</li></ul>''', foot='Parte 2 · Panel', toc='Guías y ebooks')

page(f'''<p class="k">Parte 2 · Panel · Sitio</p><h2>Editor de la tienda <span class="script">y avisos</span></h2>
{shot('ajustes-tienda', 'Editor de la tienda: barra de aviso, su enlace y los colores de la marca.')}
<p>Los colores cambian los tonos de toda la tienda sin tocar el diseño. Déjalos vacíos para usar los de la marca.</p>
{shot('a-avisos', 'Avisos: canales (WhatsApp manual siempre activo, correo, Telegram, webhook) y los textos de cada aviso.', h=760)}
<p>En los textos puedes usar {E('{nombre}, {pedido}, {total}, {total_bs}, {metodo}, {enlace}, {empresa_envio}, {guia}, {retiro}')} y otros que aparecen arriba de los textos.</p>''', foot='Parte 2 · Panel', toc='Editor de la tienda y avisos')

page(f'''<p class="k">Parte 2 · Panel · Sitio</p><h2>SEO, IA <span class="script">y GEO</span></h2>
{shot('a-seo', 'Lo que la tienda hace sola, lo que conviene mejorar, verificación de Google y Bing y páginas fijas.', h=1250)}
<ul><li><b>SEO</b>: que Google encuentre la tienda (títulos, descripciones, mapa del sitio, datos de producto).</li>
<li><b>IA</b>: que ChatGPT, Claude, Perplexity y Gemini puedan leerla y recomendarla (<span class="mono">llms.txt</span>).</li>
<li><b>GEO</b>: posicionamiento local (isla, región y país) y en respuestas de asistentes de IA.</li></ul>''', foot='Parte 2 · Panel', toc='SEO, IA y GEO')

page(f'''<p class="k">Parte 2 · Panel · Sitio</p><h2>Integraciones <span class="script">y webhooks</span></h2>
{shot('a-integraciones', 'Analítica y píxeles, webhooks y estado de las conexiones (API).', h=1250)}
<ul><li><b>Google Analytics 4, píxel de Meta y de TikTok</b>: pega solo el ID. La tienda carga cada etiqueta únicamente si su ID está puesto. La compra se envía desde el servidor cuando verificas el pago (con <span class="mono">GA4_API_SECRET</span> y <span class="mono">META_CAPI_TOKEN</span>).</li>
<li><b>Webhooks</b>: avisan a Make, n8n, Zapier o Google Sheets de pedidos, pagos, estados, clientas nuevas, solicitudes y pagos a afiliadas. Cada uno tiene su secreto (se ve una sola vez) y una prueba.</li>
<li><b>Conexiones</b>: muestra qué servicios están conectados sin revelar ninguna clave.</li></ul>''', foot='Parte 2 · Panel', toc='Integraciones')

page(f'''<p class="k">Parte 2 · Panel · Sitio</p><h2>Ajustes <span class="script">(1)</span></h2>
<div class="cols"><div>{shot('ajustes-marca', 'Marca')}{shot('ajustes-pedidos', 'Pedidos')}</div><div>{shot('ajustes-contacto', 'Contacto')}{shot('ajustes-descargas', 'Descargas de guías y ebooks')}</div></div>
<ul><li><b>Marca</b>: nombre, descriptor (Accesorios o Joyería), frase y "quiénes somos".</li>
<li><b>Contacto</b>: el WhatsApp se cambia con su botón (pide confirmar tu identidad y queda registrado).</li>
<li><b>Pedidos</b>: piezas para precio al mayor (6), tiempo de elaboración y horas para expirar un pedido sin confirmar.</li>
<li><b>Descargas</b>: horas y descargas de guías gratis; días y descargas de ebooks pagados.</li></ul>
<p>Cada cambio de ajustes queda en su historial con quién lo hizo.</p>''', foot='Parte 2 · Panel', toc='Ajustes')

page(f'''<p class="k">Parte 2 · Panel · Sitio</p><h2>Ajustes <span class="script">(2)</span></h2>
{shot('ajustes-cierre', 'Cierre del pedido y datos de la clienta.')}
{shot('ajustes-pagos', 'Pagos y tasa del BCV.')}
<ul><li><b>Tasa automática</b>: se actualiza sola desde la publicación oficial del BCV. Si salta más de 25 % de una vez, no se acepta y te avisa. <b>Manual</b>: la escribes tú ("Cambiar tasa").</li>
<li><b>Horas que vale una tasa</b>: pasado ese tiempo sin actualizar, los montos en bolívares no se muestran.</li>
<li><b>Horas que se respeta la tasa de un pedido</b>: la clienta paga con la tasa del día de su pedido durante ese tiempo.</li>
<li><b>Verificación automática</b>: solo funciona si contratas el servicio (ver Parte 4).</li></ul>''', foot='Parte 2 · Panel', toc='Ajustes: cierre y pagos')

page(f'''<p class="k">Parte 2 · Panel · Sitio</p><h2>Ajustes <span class="script">(3)</span></h2>
{shot('ajustes-programas', 'Programas: comisión general en porcentaje y/o monto, mayoristas, descuento con código, días y mínimo.')}
{shot('ajustes-costos', 'Costos (interno): factores de precio, mano de obra y redondeo.')}
<div class="cols"><div>{shot('ajustes-analitica', 'Analítica')}</div><div>{shot('ajustes-chat', 'Chat de WhatsApp', h=420)}</div></div>''', foot='Parte 2 · Panel', toc='Ajustes: programas y costos')

page(f'''<p class="k">Parte 2 · Panel · Sitio</p><h2>Usuarios, auditoría <span class="script">y tu cuenta</span></h2>
{shot('a-usuarios', 'Usuarios: quién entra al panel, con qué rol y si tiene los 2 pasos activos.', h=420)}
<table class="t"><thead><tr><th>Rol</th><th>Puede</th></tr></thead><tbody>
<tr><td>Administración</td><td class="wrap">Todo, incluidos costos, afiliadas y sus pagos, analítica, temporadas, cupones, métodos de pago, ajustes, usuarios y auditoría.</td></tr>
<tr><td>Equipo</td><td class="wrap">Pedidos, pagos por verificar, clientas, solicitudes, catálogo, fotos, envíos, guías y SEO. Ideal para quien atiende pedidos o carga piezas.</td></tr></tbody></table>
<p><b>Agregar usuario</b>: nombre, correo y rol. El panel te muestra una contraseña temporal una sola vez; se la pasas, ella la cambia en Mi cuenta y activa sus 2 pasos al entrar. Puedes <b>desactivar</b> un usuario (se cierran sus sesiones, su historial queda) o <b>reiniciar sus 2 pasos</b> si cambió de teléfono.</p>
{shot('a-auditoria', 'Auditoría: fecha, usuario, acción, elemento, detalle e IP de cada cambio. No se puede editar ni borrar.', h=380)}
<p><b>Mi cuenta</b> (abajo en el menú, tu nombre): cambiar tu contraseña.</p>''', foot='Parte 2 · Panel', toc='Usuarios, auditoría y tu cuenta')

# ============================================================== PARTE 3 · PORTAL
part(3, 'El portal de las afiliadas', 'Lo que ven las embajadoras y aliadas en su teléfono: su enlace, sus ventas y su saldo.', 'flamenco-vuelo', 'burdeos')

page(f'''<p class="k">Parte 3 · Portal</p><h2>Entrar <span class="script">al portal</span></h2>
{shot('p-16-portal-entrar', 'tudominio.com/afiliadas: correo y contraseña.', h=760)}
<ol class="steps"><li><b>Apruebas a la afiliada</b>En Solicitudes → Aprobar y crear afiliada, o en Embajadoras y aliadas → Nueva afiliada.</li>
<li><b>Le envías su acceso</b>En su ficha → "Crear enlace de acceso" → Enviar por WhatsApp. Vence en 72 horas y sirve una sola vez.</li>
<li><b>Ella crea su contraseña</b>10 caracteres o más, y entra a su portal.</li></ol>
<div class="box"><p>Si pierde el acceso, crea un enlace nuevo: el anterior deja de funcionar. Tras varios intentos fallidos su cuenta se bloquea 15 minutos.</p></div>''', foot='Parte 3 · Portal', toc='Entrar al portal')

page(f'''<p class="k">Parte 3 · Portal</p><h2>El panel de <span class="script">la embajadora</span></h2>
<div class="c-wide"><div>{shot('p-17-portal-embajadora', 'Visitas por su enlace, pedidos, ventas pagadas y comisión disponible; su enlace con QR; su saldo y movimientos.', h=1700)}</div>
<div class="phones" style="margin:0">{phone('xm-afiliadas-panel-embajadora', 'En el teléfono', top=500, h=1560)}</div></div>
<ul><li><b>Tu enlace personal</b>: copiar enlace, compartir y descargar QR. Cada compra que llegue por él queda registrada como suya durante 30 días.</li>
<li><b>Tu saldo</b>: disponible para cobrar, en espera (7 días por cambios o devoluciones) y ya cobrado, con cada movimiento.</li>
<li>Recordatorio fijo: nunca recibe pagos de clientas; todas pagan a THF.</li></ul>''', foot='Parte 3 · Portal', toc='Panel de la embajadora')

page(f'''<p class="k">Parte 3 · Portal</p><h2>La aliada <span class="script">y su tienda</span></h2>
<div class="cols"><div>{shot('p-18-portal-aliada', 'Su panel: visitas, pedidos, ventas y ganancias; enlace y tienda.', h=1300)}</div><div>{shot('p-19-precios', 'Mis piezas: precio dentro del rango, foto elegida y si se muestra.', h=1300)}</div></div>
<ul><li>En <b>Mis piezas</b> ve su costo, el rango permitido y cuánto gana; elige la foto de cada pieza entre las que preparó THF y si la muestra. Si escribe un precio fuera del rango, la tienda lo ajusta.</li>
<li>Su tienda vive en <span class="mono">tudominio.com/e/su-nombre</span>. Las clientas pagan a THF y THF envía.</li></ul>''', foot='Parte 3 · Portal', toc='La aliada y su tienda')

page(f'''<p class="k">Parte 3 · Portal</p><h2>Mi tienda: <span class="script">edición básica</span></h2>
{shot('p-21-mi-tienda', 'Título, subtítulo, un texto corto, colores de fondo y de texto con vista previa, y el banner.', h=1500)}
<ul><li>Cambia <b>título, subtítulo y un texto corto</b>; elige el <b>color de fondo y de las letras</b> con muestras o con el selector. Si no se leen bien juntos, la tienda le avisa y no guarda.</li>
<li>El <b>banner</b> es opcional y sale de los que prepara THF. Ella no sube archivos.</li>
<li>El menú de su tienda muestra solo las categorías que tiene: collares, zarcillos, pulseras, sets o conjuntos y anillos.</li></ul>''', foot='Parte 3 · Portal', toc='Mi tienda')

page(f'''<p class="k">Parte 3 · Portal</p><h2>Tienda Luna, <span class="script">un ejemplo</span></h2>
{shot('p-20-tienda-luna', 'Tienda Luna: sus colores, su banner, su menú de categorías y sus precios, con fotos para aliadas. El costo nunca aparece.', h=1300)}
<p>Las compras en su tienda quedan "referidas por" ella como <b>tienda</b>. Al marcarse pagadas se acredita su ganancia en su libro de movimientos.</p>''', foot='Parte 3 · Portal', toc='Tienda de una aliada')

# ============================================================== PARTE 4 · PROCESOS
part(4, 'Procesos paso a paso', 'Las tareas de todos los días y las que harás cuando la marca crezca, en orden.', 'manglar', 'oliva')

page('''<p class="k">Parte 4 · Procesos</p><h2>Todos <span class="script">los días</span></h2>
<h3>Atender un pedido por WhatsApp (modo de inicio)</h3>
<ol class="steps"><li><b>Te llega el mensaje</b>Con el código THF-…, las piezas, el envío, el total y "Referida por".</li>
<li><b>Abre el pedido en el panel</b>Busca el código en Pedidos. Confirma que es el mismo total.</li>
<li><b>Envía tus datos de pago</b>Desde el pedido, "Copiar datos de pago", o pásale el enlace de seguimiento para que pague en la web.</li>
<li><b>Cuando pague</b>Si reportó con "Ya pagué", verifica en Pagos por verificar. Si te mandó la captura por chat, cambia el estado a Pagado y anota la referencia.</li>
<li><b>Avísale</b>Toca "Enviar por WhatsApp" en el aviso que aparece.</li></ol>
<h3>Verificar un Pago Móvil</h3>
<ol class="steps"><li><b>Abre Pagos por verificar</b>Mira monto en Bs, referencia, banco, teléfono y la captura.</li>
<li><b>Búscalo en tu banco</b>Misma referencia, mismo monto, misma fecha.</li>
<li><b>Verificar pago o No llegó</b>Con el motivo si no llegó. Envía el aviso.</li></ol>
<h3>Preparar y entregar</h3>
<ol class="steps"><li><b>En preparación</b>Al empezar la pieza. Se descuentan los materiales.</li>
<li><b>Enviado o listo para retirar</b>Con empresa y guía, o con el punto de retiro.</li>
<li><b>Entregado</b>Cuando lo recibe. Pide una reseña en Google.</li></ol>''', foot='Parte 4 · Procesos', toc='Todos los días')

page('''<p class="k">Parte 4 · Procesos</p><h2>Afiliadas, temporadas <span class="script">y cupones</span></h2>
<h3>Sumar una embajadora</h3>
<ol class="steps"><li><b>Revisa su postulación</b>En Solicitudes: redes y por qué quiere unirse.</li><li><b>Aprobar y crear afiliada</b>Revisa su código (será su enlace).</li><li><b>Envíale su acceso</b>Crear enlace de acceso → Enviar por WhatsApp.</li><li><b>Dale su enlace y QR</b>Desde su ficha.</li></ol>
<h3>Pagar comisiones (cada quincena)</h3>
<ol class="steps"><li><b>Comisiones por pagar</b>Mira lo disponible de cada afiliada. Descarga el CSV si pagas varias por el banco.</li><li><b>Ver como ella</b>Si quieres revisar sus pedidos antes.</li><li><b>Paga por fuera y registra el pago</b>Con la referencia. Su saldo baja y ella lo ve.</li></ol>
<h3>Lanzar Black Friday</h3>
<ol class="steps"><li><b>Temporadas → Black Friday</b>Revisa fechas, descuento (20 %), franja, foto y cupón.</li><li><b>Vista previa</b>Revisa la página con el enlace privado.</li><li><b>Encendida</b>Se verá sola entre sus fechas. Crea un enlace UTM para tus publicaciones.</li></ol>
<h3>Regalar un cupón personal a una clienta</h3>
<ol class="steps"><li><b>Clientas → su ficha</b>Crear cupón personal.</li><li><b>Ponle descuento y vencimiento</b>Un uso.</li><li><b>Avísale</b>Lo ve en Mi cuenta → Mis cupones; solo funciona con su sesión.</li></ol>''', foot='Parte 4 · Procesos', toc='Afiliadas, temporadas y cupones')

page('''<p class="k">Parte 4 · Procesos</p><h2>Costos, medición <span class="script">y ajustes</span></h2>
<h3>Calcular el costo de una pieza nueva</h3>
<ol class="steps"><li><b>Materiales</b>Crea los que falten: proveedor, precio del paquete y unidades.</li><li><b>Costos → la pieza</b>Agrega cada material con su cantidad, la mano de obra y otros costos.</li><li><b>Precio sugerido</b>Úsalo al detal y al mayor, o ajústalo a mano.</li></ol>
<h3>Medir una publicación</h3>
<ol class="steps"><li><b>Enlaces UTM → Nuevo enlace</b>Nombre, destino, red, tipo y campaña.</li><li><b>Usa el enlace corto</b>En la bio, la historia o el anuncio.</li><li><b>Mira el resultado</b>En Enlaces UTM (clics, pedidos, ventas) y en Analítica → Campañas.</li></ol>
<h3>Cambiar el WhatsApp oficial o la tasa</h3>
<ol class="steps"><li><b>Ajustes</b>"Cambiar WhatsApp oficial" o "Cambiar tasa".</li><li><b>Confirma tu identidad</b>Contraseña y código de 2 pasos.</li><li><b>Listo</b>Queda en el historial y en Auditoría.</li></ol>
<h3>Cambiar comisiones</h3>
<p>Ajustes → Programas (para todas) o la ficha de una afiliada (solo ella). Los pedidos ya pagados conservan la comisión de su momento.</p>''', foot='Parte 4 · Procesos', toc='Costos, medición y ajustes')

page('''<p class="k">Parte 4 · Procesos</p><h2>Cuando la marca <span class="script">crezca</span></h2>
<p class="lede">Todo empieza manual y gratis. Cada cosa se activa cuando tenga sentido pagarla.</p>
<table class="t"><thead><tr><th>Quieres</th><th>Qué haces</th><th>Qué necesitas</th></tr></thead><tbody>
<tr><td>Cobrar en la web</td><td class="wrap">Ajustes → Cierre del pedido → mixto o web.</td><td class="wrap">Datos de cada método y tasa vigente.</td></tr>
<tr><td>Verificar Pago Móvil solo</td><td class="wrap">Ajustes → Pagos → Verificación automática.</td><td class="wrap">Contratar el servicio: Banesco "Confirmación de Transacción" (cuenta jurídica), Pabilo o verificapago. Se conecta con dos claves.</td></tr>
<tr><td>Avisos por correo</td><td class="wrap">Sitio → Avisos → Correo automático.</td><td class="wrap">Cuenta de Resend (gratis hasta 3.000 correos al mes) y tu dominio verificado.</td></tr>
<tr><td>Avisos por Telegram (solo a ti)</td><td class="wrap">Sitio → Avisos → Telegram.</td><td class="wrap">Un bot de Telegram y el ID del chat.</td></tr>
<tr><td>WhatsApp automático</td><td class="wrap">Sitio → Avisos → Webhook.</td><td class="wrap">API oficial de WhatsApp Business por un proveedor (pago por mensaje) o n8n o Make.</td></tr>
<tr><td>Captcha en formularios</td><td class="wrap">Variables del servidor.</td><td class="wrap">Cloudflare Turnstile (gratis).</td></tr>
<tr><td>Uso comercial en Vercel</td><td class="wrap">Plan Pro.</td><td class="wrap">US$20 al mes.</td></tr>
<tr><td>Base sin pausas y con copias diarias</td><td class="wrap">Supabase Pro.</td><td class="wrap">US$25 al mes. En el plan gratis la base se pausa tras 1 semana sin visitas.</td></tr></tbody></table>
<div class="tip"><p><b>Precios aproximados a octubre de 2026.</b> Revisa siempre la página de precios de cada servicio antes de contratar.</p></div>''', foot='Parte 4 · Procesos', toc='Cuando la marca crezca')

# ============================================================== PARTE 5 · SEGURIDAD Y TECNOLOGÍA
part(5, 'Seguridad y tecnología', 'Cómo se protege la tienda, cómo hacer copias y con qué está construida.', 'cubagua-ruinas', 'dark')

page('''<p class="k">Parte 5 · Seguridad</p><h2>Cómo se protege <span class="script">la tienda</span></h2>
<div class="cols"><div>
<h4>Para la dueña y el equipo</h4><ul><li>Verificación en 2 pasos obligatoria y códigos de recuperación.</li><li>Contraseñas guardadas con PBKDF2 y una clave secreta fuera de la base.</li><li>Confirmar identidad en acciones delicadas.</li><li>Bloqueo tras intentos fallidos y sesiones que vencen.</li><li>Auditoría de cada cambio.</li><li>El rol Equipo no ve dinero interno ni ajustes.</li></ul>
<h4>Para las clientas</h4><ul><li>Una cuenta por persona; cupones intransferibles.</li><li>Enlace del pedido privado y renovable.</li><li>Capturas de pago privadas, solo para el equipo.</li><li>Sin cookies de terceros; la analítica no guarda la IP.</li></ul></div>
<div><h4>Contra fraude y ataques</h4><ul><li>El precio lo calcula el servidor; la clienta no puede cambiarlo.</li><li>Referencias de pago únicas y capturas repetidas detectadas.</li><li>Validadores venezolanos: cédula y RIF, teléfonos, bancos, estados, montos y fechas.</li><li>Límites de intentos en pedidos, pagos, cuentas, portal y descargas.</li><li>Protección CSRF, origen verificado y cabeceras estrictas (CSP, HSTS, sin marcos).</li><li>Archivos revisados por su contenido, no por su nombre.</li><li>Costo de aliada nunca público (con prueba automática).</li><li>Libro de comisiones y movimientos de materiales que no se pueden borrar.</li><li>En Supabase: RLS en todas las tablas y archivos en un bucket privado.</li></ul></div></div>
<div class="tip"><p><b>Antes de lanzar</b>: una revisión externa de seguridad (pentest) sobre la versión publicada, y guardar los 8 códigos de recuperación y la clave <span class="mono">THF_PEPPER</span> en un gestor de contraseñas.</p></div>
<h3>Copias de seguridad</h3>
<p>Supabase Pro guarda copias diarias de 7 días. En el plan gratis, haz una copia semanal con el comando del README. Cloudflare guarda 7 días de historial y permite exportar la base.</p>''', foot='Parte 5 · Seguridad', toc='Cómo se protege la tienda')

page('''<p class="k">Parte 5 · Tecnología</p><h2>Con qué <span class="script">está hecha</span></h2>
<table class="t"><thead><tr><th>Pieza</th><th>Para qué la usamos</th></tr></thead><tbody>
<tr><td>JavaScript sin framework</td><td class="wrap">Un solo código para la tienda, el panel y el portal. Las páginas se arman en el servidor: cargan rápido y Google y las IA las leen completas.</td></tr>
<tr><td>Vercel Functions</td><td class="wrap">El servidor donde corre la tienda: calcula precios, crea pedidos, recibe pagos reportados y sirve el panel.</td></tr>
<tr><td>Supabase PostgreSQL</td><td class="wrap">La base de datos: piezas, pedidos, clientas, afiliadas, comisiones, costos, ajustes y analítica.</td></tr>
<tr><td>Supabase Storage</td><td class="wrap">Fotos, guías en PDF y capturas de pago, en un espacio privado.</td></tr>
<tr><td>Cloudflare (alternativa)</td><td class="wrap">La misma tienda gratis en Workers, D1 y KV, sin reescribir nada.</td></tr>
<tr><td>Traductor de base de datos</td><td class="wrap">Pieza propia que permite usar las dos bases con el mismo código.</td></tr>
<tr><td>Migraciones automáticas</td><td class="wrap">Al publicar una versión nueva, la base se actualiza sola sin perder datos.</td></tr>
<tr><td>Criptografía web</td><td class="wrap">Contraseñas, sesiones, códigos de 2 pasos, enlaces firmados y huellas de capturas.</td></tr>
<tr><td>DolarAPI (BCV)</td><td class="wrap">La tasa oficial del BCV para calcular bolívares.</td></tr>
<tr><td>Resend, Telegram, webhook</td><td class="wrap">Avisos automáticos opcionales, apagados al empezar.</td></tr>
<tr><td>Turnstile</td><td class="wrap">Captcha opcional contra bots.</td></tr>
<tr><td>CSS y SVG propios</td><td class="wrap">La línea gráfica aprobada, el mapa de la Bitácora, los gráficos y los códigos QR.</td></tr>
<tr><td>Python, Pillow y Chromium</td><td class="wrap">Las guías y este manual en PDF, las fotos optimizadas y los datos iniciales.</td></tr>
<tr><td>Pruebas automáticas</td><td class="wrap">33 pruebas que revisan reglas de negocio y seguridad en las dos bases antes de publicar.</td></tr>
<tr><td>Playwright</td><td class="wrap">Recorre la tienda como una clienta en teléfono y computadora, y tomó estas capturas.</td></tr></tbody></table>
<p class="small muted">Detalle técnico completo en <span class="mono">worker/README.md</span>; decisiones en <span class="mono">docs/decisiones.md</span>; seguridad en <span class="mono">docs/seguridad.md</span>; todo lo pedido y su estado en <span class="mono">docs/requisitos.md</span>.</p>''', foot='Parte 5 · Tecnología', toc='Con qué está hecha')

page(f'''<p class="k">Para mostrar</p><h2>La vista previa <span class="script">sin publicar</span></h2>
{shot('x-recorrido', 'Recorrido de la vista previa: todas las pantallas con datos de demostración.', h=900)}
<p>La vista previa publicada como artefacto "THF Accesorios" permite recorrer la tienda, crear un pedido, ver la pantalla de pago, cambiar de método, tocar "Ya pagué", entrar a Mi cuenta y al portal de afiliadas, y navegar el panel. Nada se guarda. El botón <b>Recorrido de la vista previa</b> (abajo a la izquierda) abre el índice de pantallas.</p>
<div class="box"><p><b>Datos de demostración</b>: pedidos, clientas, afiliadas, visitas y la captura de pago son inventados para mostrar cómo funciona cada pantalla.</p></div>''', foot='Anexo', toc='La vista previa')

back = f'''<section class="pg dark" style="display:flex;flex-direction:column;justify-content:center;align-items:flex-start">
<p class="k">THF · Hecho a mano en Margarita</p><h1 style="font-size:34pt;margin:4mm 0">Nacida en una isla llena de historia, <span class="script">luz y elegancia</span></h1>
<div class="rule" style="background:#E2C47A"></div><p style="max-width:120mm;color:rgba(243,235,225,.8)">Este manual se actualiza con cada versión de la tienda. Si algo en pantalla no coincide, la tienda manda: cuéntanos y lo corregimos.</p>{LOGO}</section>'''

# ============================================================== ARMADO
def build():
    # numeración: portada = 1, índice = 2
    rows, n = [], 2
    for cls, body, foot, toc, is_part in PAGES:
        n += 1
        if toc: rows.append((toc, n, is_part))
    toc_html = ''.join(f'<li class="{"part-row" if p else ""}"><b>{E(t)}</b><span>{num}</span></li>' for t, num, p in rows)
    out = [cover, f'<section class="pg white"><p class="k">Contenido</p><h2>Índice</h2><ul class="toc">{toc_html}</ul><div class="foot"><span>Manual THF</span><span>2</span></div></section>']
    n = 2
    for cls, body, foot, toc, is_part in PAGES:
        n += 1
        f = f'<div class="foot"><span>Manual THF{" · " + foot if foot else ""}</span><span>{n}</span></div>' if not is_part else ''
        out.append(f'<section class="pg {cls}">{body}{f}</section>')
    out.append(back)
    return f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manual THF</title><style>{CSS}</style></head><body>{"".join(out)}</body></html>', n + 1

doc, total = build()
tmp = CACHE / 'manual.html'; tmp.write_text(doc, encoding='utf-8')
from playwright.sync_api import sync_playwright
import os
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
    pg = b.new_page(); pg.goto(tmp.as_uri()); pg.wait_for_timeout(1500)
    OUTPDF.parent.mkdir(parents=True, exist_ok=True)
    pg.pdf(path=str(OUTPDF), width='210mm', height='297mm', print_background=True, prefer_css_page_size=True)
    b.close()
print('manual:', OUTPDF, total, 'páginas')
