"""Contenido de las guías gratuitas THF. Sin teléfonos, precios ni cantidades fijas: esos datos viven en la web y en el panel."""
from template import COMPASS, LOGO, closing, cover, img, page
import coloring

F_STONES = "THF · Guía de piedras"


COLOR_NAMES = {"Amatista": "Violeta, de lila suave a morado intenso", "Ojo de tigre": "Miel y marrón con reflejos dorados", "Cuarzo rosado": "Rosa pálido translúcido",
               "Jaspe": "Tonos tierra: arena, ocre y terracota", "Perla": "Blanco con brillo nacarado", "Perla barroca": "Blanco y marfil nacarado", "Nácar": "Blanco con reflejos de arcoíris"}


def stone(n, name, photo, color_hex, rows, tradition, care, piece):
    spec = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in rows)
    return page(f"""<p class="k">{n:02d} · Piedras THF</p><h2>{name}</h2>
<img class="ph short" src="{img(photo)}" alt="">
<dl class="spec"><dt>Color</dt><dd><span class="chip" style="background:{color_hex}"></span>{COLOR_NAMES.get(name, '')}</dd>{spec}</dl>
<h3>Lo que cuenta la tradición</h3><p>{tradition}</p>
<div class="box"><p><b>Cuidado:</b> {care}</p></div>
<p class="small muted">En THF la llevas en: {piece}</p>""", foot=F_STONES)


GUIDES = {}

# ---------------------------------------------------------------- 1. Guía de piedras
GUIDES["guia-de-piedras"] = dict(
    title="Guía de piedras THF", subtitle="Qué piedra lleva tu joya, de dónde viene y cómo cuidarla",
    description="Una ficha por cada piedra y perla de nuestras colecciones: color, origen, dureza, lo que cuenta la tradición y cómo cuidarla para que dure.\nIncluye una tabla rápida de cuidados para guardar en el teléfono.",
    audience="Para quien quiere conocer su pieza", cover_photo="amatistas", sort=1,
    pages=[
        cover("THF · Guía gratuita", "Guía de <span class='script'>piedras</span>", "Qué piedra lleva tu joya, de dónde viene, qué cuenta la tradición sobre ella y cómo cuidarla para que te acompañe por años.", "amatistas"),
        page(f"""<p class="k">Antes de empezar</p><h2>Cada piedra es única</h2>
<p class="lede">Las piedras naturales y las perlas no salen de un molde: cambian de tono, de vetas y de forma de una pieza a otra. Por eso dos joyas THF del mismo modelo nunca son idénticas.</p>
<div class="rule"></div>
<h3>Cómo leer cada ficha</h3>
<ul><li><b>Origen:</b> los lugares del mundo donde más se encuentra esa piedra.</li>
<li><b>Dureza:</b> la escala de Mohs va del 1 (talco) al 10 (diamante). Mientras más baja, más fácil se raya.</li>
<li><b>Tradición:</b> lo que distintas culturas le han atribuido. Es parte de su historia, no una promesa.</li>
<li><b>Cuidado:</b> lo que sí y lo que no, para que conserve su color y su brillo.</li></ul>
<ol class="toc"><li><span>01</span><b>Amatista</b></li><li><span>02</span><b>Ojo de tigre</b></li><li><span>03</span><b>Cuarzo rosado</b></li><li><span>04</span><b>Jaspe</b></li><li><span>05</span><b>Perla</b></li><li><span>06</span><b>Perla barroca</b></li><li><span>07</span><b>Nácar</b></li></ol>""", foot=F_STONES),
        stone(1, "Amatista", "p-ocaso", "#7B4F9E", [("Familia", "Cuarzo, en su variedad violeta"), ("Origen", "Brasil y Uruguay, principalmente; también Zambia"), ("Dureza", "7 en la escala de Mohs: resistente al uso diario")],
              "Su nombre viene del griego <i>améthystos</i>, “no ebrio”: en la antigua Grecia se creía que protegía de los excesos. Con los siglos se volvió la piedra de la calma y la claridad.",
              "el sol directo y prolongado puede aclarar su violeta. Guárdala a la sombra y lejos de fuentes de calor.", "Ocaso, inspirada en el atardecer de Juangriego."),
        stone(2, "Ojo de tigre", "p-fuego-y-viento", "#A86B24", [("Familia", "Cuarzo con fibras minerales que reflejan la luz"), ("Origen", "Sudáfrica, Australia e India"), ("Dureza", "Entre 6,5 y 7 en la escala de Mohs")],
              "Su brillo sedoso, que se mueve con la luz como el ojo de un felino, la convirtió en amuleto de viajeros y guerreros. Hoy se asocia con la confianza y la determinación.",
              "límpiala con un paño seco. Evita los golpes contra superficies duras: sus fibras pueden marcarse.", "Fuego y Viento, de los cerros de Macanao."),
        stone(3, "Cuarzo rosado", "p-marea-rosa", "#E8B4B8", [("Familia", "Cuarzo, en su variedad rosa"), ("Origen", "Brasil y Madagascar"), ("Dureza", "7 en la escala de Mohs")],
              "Desde hace siglos se le llama la piedra del amor y la ternura: amor por los demás y amor propio. Su rosa pálido es uno de los tonos más buscados en joyería.",
              "es de las piedras que más se aclaran con el sol. No la dejes cerca de una ventana y guárdala en su bolsita.", "Marea Rosa, de las salinas de Pampatar."),
        stone(4, "Jaspe", "p-punta-arenas", "#B98A63", [("Familia", "Calcedonia opaca, una forma de cuarzo con minerales de color"), ("Origen", "Se encuentra en todo el mundo: India, Brasil, Estados Unidos y Australia"), ("Dureza", "Entre 6,5 y 7 en la escala de Mohs")],
              "Fue una de las piedras más usadas en amuletos de la Antigüedad. Por sus tonos de tierra se la considera una piedra de equilibrio y de raíces.",
              "es muy resistente. Basta un paño suave; evita perfumes y cremas directamente sobre las cuentas.", "Punta Arenas, del oeste de la isla."),
        stone(5, "Perla", "perlas", "#F1ECE2", [("Familia", "Gema orgánica: la forma un molusco con capas de nácar"), ("Origen", "Mares y ríos de todo el mundo. Margarita y Cubagua fueron famosas por sus perlas en el siglo XVI"), ("Dureza", "Entre 2,5 y 4,5 en la escala de Mohs: delicada")],
              "Las perlas de las islas de Nueva Esparta llegaron a las cortes de Europa: por ellas se fundó Nueva Cádiz, en Cubagua. En casi todas las culturas simbolizan la pureza y la sabiduría que se forma con el tiempo.",
              "es la más delicada. Póntela de último, después del perfume y la crema, y límpiala solo con un paño seco. No la guardes en bolsas totalmente cerradas por mucho tiempo: necesita respirar.", "Trilogía Caribe, Ecos de Nueva Cádiz y Ecos de Pampatar."),
        stone(6, "Perla barroca", "p-luz-y-fe", "#EEE6D8", [("Familia", "Perla de forma irregular"), ("Origen", "Se forma cuando el nácar crece sin un núcleo redondo"), ("Dureza", "Entre 2,5 y 4,5 en la escala de Mohs")],
              "“Barroco” viene del portugués <i>barroco</i>, perla imperfecta. Lo que antes se consideraba un defecto hoy es su mayor valor: no existen dos iguales.",
              "los mismos de la perla. Su forma irregular tiene más relieve: guárdala separada para que no se raye con otras piezas.", "Luz y Fe, del Valle del Espíritu Santo."),
        stone(7, "Nácar", "conchas", "#E9E2D6", [("Familia", "La capa interior y brillante de las conchas, también llamada madreperla"), ("Origen", "Conchas de mar y de río"), ("Dureza", "Alrededor de 3,5 en la escala de Mohs")],
              "Su brillo de arcoíris, llamado oriente, viene de miles de capas finísimas que descomponen la luz. Se usa en joyería y en arte desde hace miles de años.",
              "evita el agua y el jabón. Un paño seco y suave es suficiente.", "los sets de colores de Candy Girl."),
        page("""<p class="k">Para guardar</p><h2>Cuidados en una tabla</h2>
<table class="t"><thead><tr><th>Piedra</th><th>Dureza</th><th>Sol directo</th><th>Agua</th></tr></thead><tbody>
<tr><td>Amatista</td><td>7</td><td>Evitar</td><td>Solo un paño húmedo</td></tr>
<tr><td>Ojo de tigre</td><td>6,5–7</td><td>Sin problema</td><td>Solo un paño húmedo</td></tr>
<tr><td>Cuarzo rosado</td><td>7</td><td>Evitar</td><td>Solo un paño húmedo</td></tr>
<tr><td>Jaspe</td><td>6,5–7</td><td>Sin problema</td><td>Solo un paño húmedo</td></tr>
<tr><td>Perla</td><td>2,5–4,5</td><td>Evitar</td><td>Nunca</td></tr>
<tr><td>Perla barroca</td><td>2,5–4,5</td><td>Evitar</td><td>Nunca</td></tr>
<tr><td>Nácar</td><td>3,5</td><td>Evitar</td><td>Nunca</td></tr></tbody></table>
<div class="box"><p><b>Para todas:</b> perfume y crema primero, joya después. Quítatela para bañarte, nadar, hacer ejercicio y dormir. Guarda cada pieza por separado.</p></div>
<p class="small muted">La información de “tradición” recoge creencias culturales e históricas. No sustituye ningún consejo médico ni terapéutico.</p>""", foot=F_STONES),
        closing("Encuentra tu <span class='script'>piedra</span>", "<p>Cada colección THF nace de un lugar de Margarita y de la piedra que mejor lo cuenta. Mira el catálogo completo en la web y elige la tuya.</p>"),
    ])

# ---------------------------------------------------------------- 2. Collares en capas
F_LAYER = "THF · Collares en capas"
GUIDES["como-combinar-collares-en-capas"] = dict(
    title="Cómo combinar collares en capas", subtitle="Largos, escotes y texturas para crear tu propio look",
    description="La regla de los tres largos, qué collares van con cada escote, cómo mezclar perlas, cadenas y dijes, y cómo evitar que se enreden.\nCon ejemplos de los looks THF para inspirarte.",
    audience="Para quien quiere llevar más de una pieza", cover_photo="look-trilogia-1", sort=2,
    pages=[
        cover("THF · Guía gratuita", "Collares en <span class='script'>capas</span>", "Largos, escotes y texturas: cómo combinar tus piezas para que se vean pensadas, no amontonadas.", "look-trilogia-1"),
        page("""<p class="k">01 · La base</p><h2>La regla de los tres largos</h2>
<p class="lede">El secreto de unas capas que se ven bien es la distancia: cada collar necesita su propio espacio para lucir.</p>
<ol class="steps"><li><b>El corto · 40 cm</b>Queda en la base del cuello. Ideal para una cadena fina o perlas pequeñas.</li>
<li><b>El medio · 45 cm</b>Cae sobre la clavícula. Es el lugar perfecto para un dije o una piedra protagonista.</li>
<li><b>El largo · 50 cm o más</b>Llega al pecho y da movimiento. Un collar en Y o una medalla funcionan muy bien.</li></ol>
<div class="box"><p>Deja entre 4 y 5 cm de diferencia entre cada collar. Si dos quedan del mismo largo, se pegan y se enredan.</p></div>
<p class="small muted">En la ficha de cada pieza THF puedes elegir el largo antes de pedirla.</p>""", foot=F_LAYER),
        page(f"""<p class="k">02 · Tu escote</p><h2>Qué va con cada cuello</h2>
<table class="t"><thead><tr><th>Escote</th><th>Lo que mejor queda</th></tr></thead><tbody>
<tr><td><b>En V</b></td><td>Capas que sigan la V: un collar en Y o un dije al centro en el largo medio.</td></tr>
<tr><td><b>Redondo</b></td><td>Un corto por encima del escote y un largo por debajo. Evita que choquen con el borde.</td></tr>
<tr><td><b>Cuello alto</b></td><td>Solo collares largos, por encima de la tela: una medalla o una cadena con perlas.</td></tr>
<tr><td><b>Strapless o de hombros caídos</b></td><td>Es el momento de los cortos: dos o tres capas cerca del cuello.</td></tr>
<tr><td><b>Camisa abierta</b></td><td>Dos capas finas que asomen entre los botones: discretas y elegantes.</td></tr></tbody></table>
<img class="ph short" src="{img('modelo-perla')}" alt="">""", foot=F_LAYER),
        page(f"""<p class="k">03 · Texturas</p><h2>Mezcla, pero con un hilo</h2>
<p>Las mejores capas combinan texturas distintas que comparten algo: el tono del metal, una piedra o un color.</p>
<ul><li><b>Una protagonista:</b> elige una sola pieza llamativa (una piedra grande, una medalla) y deja que las demás la acompañen.</li>
<li><b>Fino + textura:</b> una cadena lisa, una de perlas y una con dije. Tres texturas, un mismo dorado.</li>
<li><b>Números impares:</b> tres capas suelen verse más naturales que dos o cuatro.</li>
<li><b>Mismo metal:</b> todas las cadenas THF tienen baño de oro 18k, así que siempre combinan entre sí.</li></ul>
<div class="two"><img class="ph" src="{img('look-marea-1')}" alt="" style="height:52mm"><img class="ph" src="{img('look-pampatar-1')}" alt="" style="height:52mm"></div>""", foot=F_LAYER),
        page(f"""<p class="k">04 · Muñeca</p><h2>Pulseras que hacen juego</h2>
<p>Las capas también se llevan en la muñeca. Repite en la pulsera una piedra o un detalle del collar y el look queda unido de pies a cabeza.</p>
<ul><li>Combina una pulsera con piedra y una o dos cadenas finas.</li><li>Si usas reloj, ponlo en la otra muñeca o deja una sola pulsera a su lado.</li><li>Para eventos, el set completo de collar y pulsera es la opción más segura.</li></ul>
<img class="ph" src="{img('look-vuelo-2')}" alt="">
<div class="box"><p><b>Compra el look:</b> en la web encontrarás combinaciones THF ya pensadas, con descuento al llevar el look completo.</p></div>""", foot=F_LAYER),
        page("""<p class="k">05 · Sin nudos</p><h2>Cómo evitar que se enreden</h2>
<ol class="steps"><li><b>Póntelos de corto a largo</b>Empieza por el más corto y termina con el más largo; para quitarlos, al revés.</li>
<li><b>Dale peso al largo</b>Un dije o una medalla en el collar más largo lo mantiene en su lugar.</li>
<li><b>Guárdalos separados</b>Cerrados y en su bolsita, nunca juntos en un mismo bolsillo.</li>
<li><b>Si se enredan</b>Ponlos sobre una mesa y separa el nudo con dos alfileres, sin tirar.</li></ol>
<div class="box"><p>Un truco de quien lleva capas a diario: une los cierres de dos collares con un pequeño conector y se mueven juntos.</p></div>""", foot=F_LAYER),
        page(f"""<p class="k">06 · Inspiración</p><h2>Tres looks para copiar</h2>
<div class="three"><img class="ph" src="{img('look-fuego-1')}" alt="" style="height:44mm;margin:0"><img class="ph" src="{img('look-verde-1')}" alt="" style="height:44mm;margin:0"><img class="ph" src="{img('look-luzyfe-1')}" alt="" style="height:44mm;margin:0"></div>
<h3>De día</h3><p>Una cadena fina corta y un dije de piedra en el largo medio. Fresco y fácil.</p>
<h3>De oficina</h3><p>Perlas cortas y una medalla larga sobre una blusa de cuello redondo.</p>
<h3>De noche</h3><p>Tres capas con una piedra protagonista y la pulsera del mismo set.</p>""", foot=F_LAYER),
        closing("Arma tu <span class='script'>look</span>", "<p>En la web puedes elegir el largo de cada collar y ver los looks THF completos. Si tienes dudas, escríbenos y te ayudamos a combinar.</p>"),
    ])

# ---------------------------------------------------------------- 3. Revender la Caja
F_BOX = "THF · Revender la Caja"
GUIDES["como-revender-la-caja"] = dict(
    title="Cómo revender la Caja de joyería", subtitle="Del precio a la primera venta, paso a paso",
    description="Todo lo que necesitas para convertir tu Caja de joyería THF en tu emprendimiento: cómo calcular precios, fotografiar con el teléfono, publicar, responder y entregar.\nIncluye una hoja para calcular tus precios y textos listos para WhatsApp e Instagram.",
    audience="Para quien compró o piensa comprar la Caja de joyería", cover_photo="caja-abierta", sort=3,
    pages=[
        cover("THF · Guía gratuita", "Revende tu <span class='script'>Caja</span>", "Del precio a la primera venta: cómo convertir tu Caja de joyería THF en tu propio emprendimiento.", "caja-abierta"),
        page(f"""<p class="k">01 · Lo que tienes</p><h2>Tu Caja, tus piezas</h2>
<p class="lede">La Caja de joyería trae 12 collares y 12 pulseras variados, hechos a mano en Margarita, cada uno en su sobre con tarjeta.</p>
<img class="ph short" src="{img('caja-pulseras')}" alt="">
<div class="box"><p><b>Importante:</b> al comprar la Caja, las piezas son tuyas. Tú decides el precio, cobras a tu manera y entregas a tus clientas. Esto es distinto de los Programas THF (Embajadoras y Emprendedoras), donde solo THF cobra.</p></div>
<ul><li>Revisa cada pieza al recibirla y sepáralas por tipo.</li><li>Guarda los sobres y tarjetas: son parte de la presentación.</li></ul>""", foot=F_BOX),
        page("""<p class="k">02 · El precio</p><h2>Calcula tu precio en 3 pasos</h2>
<ol class="steps"><li><b>Tu costo por pieza</b>Divide lo que pagaste por la Caja (con el envío) entre 24.</li>
<li><b>Suma tus gastos</b>Bolsitas, delivery, publicidad o comisiones de pago: reparte un monto por pieza.</li>
<li><b>Elige tu ganancia</b>Multiplica tu costo total por un factor. Un punto de partida común está entre 1,8 y 2,5.</li></ol>
<table class="t"><thead><tr><th>Concepto</th><th>Tu número</th></tr></thead><tbody>
<tr><td>Lo que pagué por la Caja + envío</td><td class="fill"></td></tr><tr><td>÷ 24 = costo por pieza</td><td class="fill"></td></tr>
<tr><td>+ gastos por pieza</td><td class="fill"></td></tr><tr><td>= costo total por pieza</td><td class="fill"></td></tr>
<tr><td>× factor de ganancia</td><td class="fill"></td></tr><tr><td><b>= mi precio de venta</b></td><td class="fill"></td></tr></tbody></table>
<p class="small muted">Consejo: revisa precios de piezas similares en tu zona. Un precio redondo (por ejemplo, terminado en 0 o en 5) se recuerda mejor.</p>""", foot=F_BOX),
        page(f"""<p class="k">03 · Fotos</p><h2>Fotos que venden, con tu teléfono</h2>
<div class="two"><img class="ph" src="{img('caja-collar')}" alt="" style="height:46mm"><img class="ph" src="{img('caja-manos')}" alt="" style="height:46mm"></div>
<ul style="margin-top:4mm"><li><b>Luz de ventana:</b> de día, cerca de una ventana y sin flash. Nunca bajo un bombillo amarillo.</li>
<li><b>Fondo sencillo:</b> una tela de lino, una hoja blanca o una piedra clara. Nada que compita con la joya.</li>
<li><b>Tres fotos por pieza:</b> la pieza sola, un detalle de la piedra y la pieza puesta.</li>
<li><b>Limpia el lente:</b> parece obvio, pero cambia todo.</li>
<li><b>Mismo estilo siempre:</b> así tu catálogo se ve profesional.</li></ul>""", foot=F_BOX),
        page("""<p class="k">04 · Publicar</p><h2>Dónde y cuándo publicar</h2>
<h3>WhatsApp</h3><ul><li>Crea un catálogo en WhatsApp Business con foto, nombre y precio de cada pieza.</li><li>Publica 2 o 3 piezas por día en tus estados, no las 24 de una vez.</li></ul>
<h3>Instagram</h3><ul><li>Una publicación por pieza, con buena foto y el precio en el texto.</li><li>Historias con encuestas: “¿cuál te gusta más, la 1 o la 2?”.</li></ul>
<h3>En persona</h3><ul><li>Lleva puesta una pieza: es tu mejor vitrina.</li><li>Muestra la Caja abierta en reuniones, trabajo o ferias.</li></ul>
<div class="box"><p>Las primeras ventas suelen llegar de tu círculo cercano. Pide a cada clienta una foto usando su pieza y permiso para compartirla.</p></div>""", foot=F_BOX),
        page("""<p class="k">05 · Textos listos</p><h2>Para copiar y pegar</h2>
<div class="box"><p><b>Para publicar</b><br>✨ Nueva pieza hecha a mano en la Isla de Margarita, con cadena con baño de oro 18k y piedra natural. Pieza única: las piedras naturales varían. Precio: ___. Escríbeme para apartarla.</p></div>
<div class="box"><p><b>Cuando preguntan “¿se pone negra?”</b><br>Tiene baño de oro 18k. Con cuidados sencillos dura muchísimo: ponla después del perfume, quítatela para bañarte y guárdala en su bolsita. Te la entrego con su tarjeta.</p></div>
<div class="box"><p><b>Para cerrar la venta</b><br>¡Es tuya! Te la aparto hasta mañana. ¿Prefieres que te la lleve o la retiras? Te paso mis datos de pago.</p></div>""", foot=F_BOX),
        page("""<p class="k">06 · Entregar</p><h2>La entrega es parte de la venta</h2>
<ul class="check"><li>Entrega cada pieza en su sobre con la tarjeta de cuidados.</li><li>Agrega una nota escrita a mano: gracias, con tu nombre.</li><li>Acuerda punto, día y hora de entrega antes de salir.</li><li>Confirma el pago antes de entregar, por el medio que tú elegiste.</li><li>Pide una reseña o una foto a los pocos días.</li></ul>
<h3>Lleva tus cuentas</h3>
<table class="t"><thead><tr><th>Pieza</th><th>Clienta</th><th>Precio</th><th>Pagado</th></tr></thead><tbody>
<tr><td class="fill"></td><td></td><td></td><td></td></tr><tr><td class="fill"></td><td></td><td></td><td></td></tr><tr><td class="fill"></td><td></td><td></td><td></td></tr><tr><td class="fill"></td><td></td><td></td><td></td></tr></tbody></table>""", foot=F_BOX),
        closing("Cuando se te <span class='script'>acabe</span>", "<p>Pide tu próxima Caja en la web de THF. Y si prefieres vender sin comprar mercancía, conoce los Programas Embajadoras y Emprendedoras.</p>"),
    ])

# ---------------------------------------------------------------- 4. Virgen del Valle
F_VV = "THF · La Virgen del Valle"
GUIDES["pequena-guia-de-la-virgen-del-valle"] = dict(
    title="Pequeña guía de la Virgen del Valle", subtitle="Historia, tradición y visita a la patrona de Margarita",
    description="La historia de la Virgen del Valle desde Cubagua hasta el Valle del Espíritu Santo, la leyenda de la perla, su fiesta del 8 de septiembre y consejos para visitar la basílica.\nTambién el significado de los símbolos de nuestra Línea religiosa.",
    audience="Para devotas, visitantes y amantes de Margarita", cover_photo="valle-espiritu-santo", sort=4,
    pages=[
        cover("THF · Guía gratuita", "La Virgen <span class='script'>del Valle</span>", "Historia, tradición y visita a la patrona de Margarita y del oriente venezolano.", "valle-espiritu-santo", tone=""),
        page(f"""<p class="k">01 · Cubagua</p><h2>Una imagen que llegó por mar</h2>
<p class="lede">A comienzos del siglo XVI, los españoles llevaron una imagen de la Virgen María a Nueva Cádiz, en la pequeña isla de Cubagua, entonces el gran centro de la pesca de perlas del Caribe.</p>
<img class="ph short" src="{img('cubagua-ruinas')}" alt="">
<p>Hacia 1541 y 1542, un fuerte huracán destruyó Nueva Cádiz. La imagen fue trasladada a la vecina Isla de Margarita, a un valle tranquilo cerca de la costa sur. Desde entonces se la llama la Virgen del Valle.</p>""", foot=F_VV),
        page(f"""<p class="k">02 · El valle</p><h2>El Valle del Espíritu Santo</h2>
<p>El pueblo de El Valle del Espíritu Santo, en el municipio García, muy cerca de Porlamar, creció alrededor de su santuario. La iglesia original cambió muchas veces a lo largo de los siglos.</p>
<p>El templo que hoy conocemos, de estilo neogótico, con sus torres y su fachada clara, es uno de los símbolos de la isla. En 1995 el papa Juan Pablo II lo declaró <b>basílica menor</b>.</p>
<div class="box"><p>El 8 de septiembre de 1911 la imagen recibió la <b>coronación canónica</b>, un reconocimiento especial de la Iglesia a la devoción de su pueblo.</p></div>
<img class="ph short" src="{img('rel-portada')}" alt="">""", foot=F_VV),
        page("""<p class="k">03 · La leyenda</p><h2>La perla de la Virgen</h2>
<p class="lede">Es la historia más querida de Margarita, y une a la Virgen con el mar y las perlas.</p>
<p>Cuenta la tradición que un pescador de perlas fue herido en la pierna por una raya. La herida era grave y no sanaba. Desesperado, le pidió a la Virgen del Valle que lo curara y le prometió la primera perla que encontrara.</p>
<p>El pescador sanó. Al volver al mar, abrió una ostra y encontró una perla con una forma sorprendente: la de una pierna, con la marca de la herida.</p>
<p class="quote">Cumplió su promesa y la llevó al santuario.</p>
<p>Esa perla se conserva y se puede ver en el Museo Diocesano de El Valle, junto a otras ofrendas que los fieles han dejado durante siglos.</p>""", foot=F_VV),
        page("""<p class="k">04 · La fiesta</p><h2>8 de septiembre</h2>
<p>El día de la Virgen del Valle es una de las celebraciones más grandes del oriente venezolano. Miles de personas llegan a la isla desde Sucre, Anzoátegui, Monagas, Caracas y otros estados.</p>
<ul><li><b>Las promesas:</b> muchas personas caminan hasta la basílica para agradecer un favor.</li>
<li><b>La procesión:</b> la imagen recorre el pueblo acompañada por la multitud.</li>
<li><b>El mar:</b> los pescadores y marinos le tienen una devoción especial; en el oriente también se la celebra en el agua.</li>
<li><b>La feria:</b> dulces, artesanía y música alrededor del templo.</li></ul>
<div class="box"><p>Es patrona de la Isla de Margarita y del oriente venezolano, y muchos la llaman con cariño “la Vallita”.</p></div>""", foot=F_VV),
        page(f"""<p class="k">05 · Visitar</p><h2>Consejos para tu visita</h2>
<ol class="steps"><li><b>Ve temprano</b>En la mañana hay menos gente y más calma, sobre todo en temporada alta.</li>
<li><b>Viste con respeto</b>Hombros cubiertos y ropa cómoda para caminar.</li>
<li><b>No te pierdas el museo</b>Allí están la perla de la leyenda y las ofrendas de los fieles.</li>
<li><b>Recorre el pueblo</b>Dulcerías, artesanía y la plaza frente a la basílica.</li>
<li><b>En septiembre, planifica</b>Durante la fiesta las vías se llenan: sal con tiempo.</li></ol>
<p class="small muted">Los horarios de misas y del museo pueden cambiar; consúltalos con la parroquia antes de ir.</p>""", foot=F_VV),
        page(f"""<p class="k">06 · Los símbolos</p><h2>Lo que llevas en tu joya</h2>
<p>Nuestra Línea religiosa nace del cariño de la isla por su Virgen. Cada símbolo tiene un significado:</p>
<table class="t"><tbody>
<tr><td><b>Cruz</b></td><td>La fe y el amor que se entrega.</td></tr>
<tr><td><b>Medalla</b></td><td>Protección y compañía; llevar cerca a quien veneras.</td></tr>
<tr><td><b>Rosario</b></td><td>La oración que se repite con calma.</td></tr>
<tr><td><b>Escapulario</b></td><td>Un compromiso de devoción que se lleva sobre el corazón.</td></tr>
<tr><td><b>Paloma</b></td><td>El Espíritu Santo, que da nombre al valle, y la paz.</td></tr>
<tr><td><b>Perla</b></td><td>La promesa del pescador y la historia de Margarita.</td></tr></tbody></table>
<img class="ph short" src="{img('rel-cruz')}" alt="">""", foot=F_VV),
        closing("Fe para llevar <span class='script'>cerca</span>", "<p>Conoce la Línea religiosa THF en la web: medallas, cruces y perlas hechas a mano en Margarita, con cadenas con baño de oro 18k.</p>", tone="marino"),
    ])

# ---------------------------------------------------------------- 5. Libro para colorear Candy Girl
F_CG = "THF · Candy Girl"
cg_pages = [cover("THF · Candy Girl · Para colorear", "Colorea tus <span class='script'>dulces</span>", "Un libro para imprimir y pintar: golosinas, estrellas, gemas y joyas para diseñar. Para niñas de 4 a 10 años.", "cg-deco-donas", tone="rosa"),
            page("""<p class="k">Para las mamás y papás</p><h2>Antes de empezar</h2>
<p class="lede">Imprime las páginas en hojas blancas, tamaño carta o A4. Funcionan con creyones, colores y marcadores.</p>
<ul><li>Hay dibujos sencillos para las más pequeñas y páginas de diseño para las más grandes.</li><li>En las dos últimas páginas pueden inventar su propio collar y su pulsera.</li>
<li>Al terminar, ¡firmen juntos el certificado de diseñadora!</li></ul>
<div class="box"><p><b>Seguridad:</b> las joyas de Candy Girl tienen piezas pequeñas. Úsalas con supervisión de un adulto, guárdalas fuera del alcance de menores de 3 años y quítalas para dormir, bañarse o nadar.</p></div>""", "rosa", foot=F_CG)]
for kicker, title, tip, fn in coloring.PAGES:
    cg_pages.append(page(f'<p class="k">{kicker}</p><h2>{title}</h2>{fn()}<p class="tip">{tip}</p>', "white color", foot=F_CG))
cg_pages.append(page("""<div class="cert"><p class="k">Candy Girl · THF</p><h1>Certificado de <span class="script">diseñadora</span></h1>
<p style="margin-top:6mm">Este certificado reconoce a</p><div class="name"></div><p class="small muted">nombre de la diseñadora</p>
<p style="margin-top:6mm">por pintar con mucha imaginación todas las páginas de este libro.</p>
<div class="two" style="margin-top:12mm"><div><div class="name" style="margin:0 0 2mm"></div><p class="small muted">fecha</p></div><div><div class="name" style="margin:0 0 2mm"></div><p class="small muted">firma de mamá o papá</p></div></div></div>""", "white", foot=F_CG))
cg_pages.append(closing("Dulces para <span class='script'>llevar</span>", "<p>Los sets Candy Girl son collares y pulseras de colores hechos a mano en Margarita, pensados para niñas de 4 a 10 años. Míralos todos en la web de THF.</p>", tone="burdeos"))
GUIDES["libro-para-colorear-candy-girl"] = dict(
    title="Libro para colorear Candy Girl", subtitle="Golosinas, estrellas y joyas para pintar y diseñar",
    description="Diez dibujos para imprimir y colorear: paletas, donas, cupcakes, helados, estrellas, arcoíris, fresas y gemas, más dos páginas para diseñar su propio collar y su pulsera.\nIncluye un certificado de diseñadora para firmar en familia.",
    audience="Para niñas de 4 a 10 años (con un adulto)", cover_photo="cg-deco-donas", sort=5, pages=cg_pages)

# ---------------------------------------------------------------- 6. Joyería personalizada
F_CUSTOM = "THF · Joyería personalizada"
GUIDES["como-pedir-joyeria-personalizada"] = dict(
    title="Cómo pedir joyería personalizada", subtitle="De tu idea a la pieza terminada, sin sorpresas",
    description="El proceso completo para pedir una pieza a medida a THF, para personas y para marcas: qué información enviar, cómo se aprueba el diseño, cuándo se paga la muestra y cómo se calcula el tiempo.\nIncluye una hoja para preparar tu pedido.",
    audience="Para personas y marcas", cover_photo="rel-cierre", sort=6,
    pages=[
        cover("THF · Guía gratuita", "Tu joya, <span class='script'>a medida</span>", "De tu idea a la pieza terminada: cómo pedir joyería personalizada a THF, paso a paso y sin sorpresas.", "rel-cierre"),
        page("""<p class="k">01 · Qué hacemos</p><h2>Joyería pensada para ti</h2>
<p class="lede">Diseñamos y elaboramos a mano piezas únicas para personas y para marcas, con la misma calidad de nuestras colecciones.</p>
<h3>Para personas</h3><ul><li>Iniciales, nombres y fechas especiales.</li><li>Piezas para bodas, quince años, graduaciones y bautizos.</li><li>Sets iguales para damas de honor, madrinas o un grupo de amigas.</li></ul>
<h3>Para marcas</h3><ul><li>Dijes con tu logo o tu símbolo.</li><li>Piezas para eventos, lanzamientos y regalos a clientes.</li><li>Colaboraciones con colecciones de edición limitada.</li></ul>""", foot=F_CUSTOM),
        page("""<p class="k">02 · El proceso</p><h2>Seis pasos</h2>
<ol class="steps"><li><b>Nos cuentas tu idea</b>Por el formulario de la web o por el WhatsApp oficial.</li>
<li><b>Te enviamos una propuesta</b>Con el diseño, los materiales, el precio y el tiempo estimado.</li>
<li><b>Apruebas el diseño</b>Ajustamos lo que necesites antes de empezar.</li>
<li><b>Muestra física (si la necesitas)</b>Se paga, porque se elabora con material real.</li>
<li><b>Elaboración</b>Hacemos tus piezas a mano en nuestro taller de Margarita.</li>
<li><b>Entrega</b>En la isla o con envío a toda Venezuela.</li></ol>
<div class="box"><p>La elaboración empieza solo cuando apruebas el diseño. Nada se hace sin tu visto bueno.</p></div>""", foot=F_CUSTOM),
        page("""<p class="k">03 · Lo que necesitamos</p><h2>Prepara tu pedido</h2>
<p>Mientras más clara tu idea, más rápida y precisa la propuesta. Completa esta hoja antes de escribirnos:</p>
<div class="lines"><label>¿Para quién o para qué ocasión?</label><div></div><label>Tipo de piezas (collar, pulsera, set…)</label><div></div>
<label>Cantidad</label><div></div><label>Colores, piedras o materiales que te gustan</label><div></div><div></div>
<label>Fecha en la que las necesitas</label><div></div><label>Presupuesto aproximado por pieza</label><div></div></div>
<ul class="check"><li>Tengo fotos de referencia o un boceto.</li><li>Si es para una marca: tengo el logo en buena calidad.</li></ul>""", foot=F_CUSTOM),
        page("""<p class="k">04 · Tiempos</p><h2>Planifica con tiempo</h2>
<p>Cada pieza personalizada se hace a mano y bajo pedido. El tiempo depende de la cantidad y de los materiales, y te lo confirmamos en la propuesta.</p>
<table class="t"><thead><tr><th>Si es…</th><th>Escríbenos con</th></tr></thead><tbody>
<tr><td>Una o pocas piezas</td><td>Al menos 2 a 3 semanas antes</td></tr>
<tr><td>Una boda o evento</td><td>Al menos 1 a 2 meses antes</td></tr>
<tr><td>Un pedido para una marca</td><td>Al menos 6 a 8 semanas antes</td></tr>
<tr><td>Navidad y fin de año</td><td>Lo antes posible: es la temporada más alta</td></tr></tbody></table>
<div class="box"><p>Los materiales especiales (piedras, dijes con logo) a veces se importan: pedirlos con tiempo evita apuros.</p></div>""", foot=F_CUSTOM),
        page("""<p class="k">05 · Preguntas</p><h2>Lo que más nos preguntan</h2>
<h3>¿Las muestras tienen costo?</h3><p>Sí. Toda muestra física se paga porque se elabora con material real. Si apruebas el pedido, te explicamos cómo se considera en el total.</p>
<h3>¿Pueden diseñar por mí?</h3><p>Sí. Puedes traer tu diseño o pedirnos una propuesta a partir de tu idea.</p>
<h3>¿Hay un mínimo de piezas?</h3><p>Depende del diseño. Te lo indicamos en la propuesta.</p>
<h3>¿Cómo pago?</h3><p>Siempre a THF, con los métodos de pago de la web. Nunca pagues a otra persona.</p>
<h3>¿Hacen envíos?</h3><p>Sí, en Margarita y a toda Venezuela.</p>""", foot=F_CUSTOM),
        closing("Cuéntanos tu <span class='script'>idea</span>", "<p>Entra a la sección Joyería personalizada de la web y completa el formulario. Te respondemos por el WhatsApp oficial con tu propuesta.</p>"),
    ])

# ---------------------------------------------------------------- 7. Regalos corporativos
F_CORP = "THF · Regalos corporativos"
GUIDES["regalos-corporativos"] = dict(
    title="Regalos corporativos con joyería", subtitle="Un regalo que tu equipo y tus clientes sí van a usar",
    description="Por qué la joyería es un gran regalo corporativo, para qué ocasiones, qué opciones ofrece THF (sets, cajas y piezas con tu logo), cómo planificar los tiempos y cómo preparar el pedido.\nIncluye un calendario de planificación y una hoja de pedido.",
    audience="Para empresas, marcas y emprendedores", cover_photo="caja-cerrada", sort=7,
    pages=[
        cover("THF · Guía gratuita", "Regalos <span class='script'>corporativos</span>", "Un regalo que tu equipo y tus clientes sí van a usar: joyería hecha a mano en Margarita para tu empresa.", "caja-cerrada"),
        page(f"""<p class="k">01 · Por qué joyería</p><h2>Un regalo que se queda</h2>
<p class="lede">Una agenda se olvida y una taza se rompe. Una joya bonita se usa, se muestra y se recuerda, y cada vez que se usa, recuerda a quien la regaló.</p>
<ul><li><b>Hecha a mano en Venezuela:</b> un regalo con historia y con valor local.</li><li><b>Presentación lista:</b> cada pieza en su sobre, con tarjeta.</li><li><b>Personalizable:</b> colores, piedras, tarjetas con tu marca y dijes con tu logo.</li></ul>
<img class="ph short" src="{img('caja-tarjeta')}" alt="">""", foot=F_CORP),
        page("""<p class="k">02 · Ocasiones</p><h2>Cuándo regalar</h2>
<table class="t"><tbody>
<tr><td><b>Fin de año y Navidad</b></td><td>Para el equipo y para los clientes que te acompañaron.</td></tr>
<tr><td><b>Día Internacional de la Mujer</b></td><td>Un detalle para cada colaboradora el 8 de marzo.</td></tr>
<tr><td><b>Día de las Madres</b></td><td>Para las mamás de tu equipo o tu base de clientas.</td></tr>
<tr><td><b>Aniversarios</b></td><td>De la empresa o de cada colaborador.</td></tr>
<tr><td><b>Eventos y lanzamientos</b></td><td>Kits para invitadas, prensa o influencers.</td></tr>
<tr><td><b>Clientes VIP</b></td><td>Fidelización con un detalle que no esperan.</td></tr></tbody></table>""", foot=F_CORP),
        page(f"""<p class="k">03 · Opciones</p><h2>Qué puedes regalar</h2>
<h3>Sets de nuestras colecciones</h3><p>Collar y pulsera de Alisios de Margarita, Venezuela sigue latiendo o la Línea religiosa.</p>
<h3>La Caja de joyería</h3><p>24 piezas variadas: ideal para sorteos, premios o para repartir en un evento.</p>
<h3>Piezas personalizadas</h3><p>Con los colores de tu marca, un dije con tu logo o una tarjeta impresa con tu mensaje.</p>
<div class="box"><p>A partir de la cantidad mínima indicada en la web aplica el precio al mayor. Para pedidos grandes preparamos una propuesta a la medida.</p></div>
<img class="ph short" src="{img('look-venezuela-1')}" alt="">""", foot=F_CORP),
        page("""<p class="k">04 · Planificación</p><h2>Calendario sugerido</h2>
<ol class="steps"><li><b>8 semanas antes</b>Define presupuesto, cantidad y tipo de regalo. Pídenos una propuesta.</li>
<li><b>6 semanas antes</b>Aprueba diseño y muestra. Envía logo y textos de la tarjeta.</li>
<li><b>5 semanas antes</b>Confirma el pedido y el pago a THF.</li>
<li><b>Elaboración</b>Hacemos las piezas a mano y te mantenemos al tanto.</li>
<li><b>1 semana antes</b>Entrega en Margarita o envío a tu ciudad.</li></ol>
<div class="box"><p>Para diciembre, escríbenos en septiembre u octubre: es la temporada con más pedidos.</p></div>""", foot=F_CORP),
        page("""<p class="k">05 · Tu pedido</p><h2>Hoja de pedido</h2>
<div class="lines"><label>Empresa y persona de contacto</label><div></div><label>Ocasión y fecha de entrega</label><div></div>
<label>Cantidad de regalos</label><div></div><label>Presupuesto por regalo</label><div></div><label>Tipo (sets, Caja, personalizado)</label><div></div>
<label>Mensaje para la tarjeta</label><div></div><div></div><label>Ciudad y dirección de entrega</label><div></div></div>
<ul class="check"><li>Necesito factura.</li><li>Necesito entregas en varias ciudades.</li><li>Quiero una muestra antes del pedido final (tiene costo).</li></ul>""", foot=F_CORP),
        closing("Hablemos de tu <span class='script'>regalo</span>", "<p>Escríbenos por el formulario de Joyería personalizada en la web o por el WhatsApp oficial. Te enviamos una propuesta con opciones, precios y tiempos.</p>"),
    ])
