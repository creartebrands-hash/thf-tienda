"""Dibujos de línea originales para el libro de colorear Candy Girl (golosinas, estrellas y joyas, sin personajes)."""
import math

S = 'fill="none" stroke="#1D1815" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'
T = 'fill="none" stroke="#1D1815" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'


def svg(inner):
    return f'<svg viewBox="0 0 400 476" xmlns="http://www.w3.org/2000/svg">{inner}</svg>'


def spiral(cx, cy, r, turns=3.2, steps=220):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * 2 * math.pi
        rr = r * t
        pts.append(f"{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}")
    return f'<polyline points="{" ".join(pts)}" {S}/>'


def star(cx, cy, r, inner=0.45, rot=-90, attrs=S):
    pts = []
    for i in range(10):
        a = math.radians(rot + i * 36)
        rr = r if i % 2 == 0 else r * inner
        pts.append(f"{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" {attrs}/>'


def heart(cx, cy, s, attrs=S):
    return (f'<path d="M{cx} {cy + s * .9} C{cx - s * 1.4} {cy - s * .1} {cx - s * .8} {cy - s * 1.1} {cx} {cy - s * .45} '
            f'C{cx + s * .8} {cy - s * 1.1} {cx + s * 1.4} {cy - s * .1} {cx} {cy + s * .9}Z" {attrs}/>')


def sparkles(points):
    return "".join(f'<path d="M{x} {y - 8}V{y + 8}M{x - 8} {y}H{x + 8}" {T}/>' for x, y in points)


def lollipop():
    return svg(f"""{spiral(200, 160, 118)}<circle cx="200" cy="160" r="122" {S}/>
<rect x="190" y="282" width="20" height="170" rx="6" {S}/>
<path d="M200 300 C160 270 130 290 140 318 C150 340 185 322 200 300Z" {S}/><path d="M200 300 C240 270 270 290 260 318 C250 340 215 322 200 300Z" {S}/>
<path d="M200 300 C188 330 170 360 160 380M200 300 C212 330 230 360 240 380" {S}/><circle cx="200" cy="300" r="9" {S}/>
{sparkles([(52, 60), (350, 70), (60, 300), (345, 290)])}{heart(330, 420, 18)}{heart(70, 420, 14)}""")


def donut():
    sprinkles = ""
    import random
    rnd = random.Random(7)
    for _ in range(26):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(78, 128)
        x, y = 200 + r * math.cos(a), 220 + r * math.sin(a) * .82
        rot = rnd.uniform(0, 180)
        sprinkles += f'<rect x="{x - 9:.0f}" y="{y - 3:.0f}" width="18" height="6" rx="3" transform="rotate({rot:.0f} {x:.0f} {y:.0f})" {T}/>'
    wave = " ".join(f"{200 + 152 * math.cos(math.radians(a)) + 10 * math.sin(math.radians(a * 7)):.1f},{220 + 128 * math.sin(math.radians(a)) + 10 * math.cos(math.radians(a * 9)):.1f}" for a in range(0, 361, 6))
    return svg(f"""<ellipse cx="200" cy="232" rx="178" ry="152" {S}/><polygon points="{wave}" {S}/>
<ellipse cx="200" cy="222" rx="52" ry="40" {S}/>{sprinkles}
<path d="M40 420 Q200 470 360 420" {S}/>{sparkles([(40, 60), (360, 52)])}{star(70, 438, 14)}{star(330, 440, 16)}""")


def cupcake():
    lines = "".join(f'<path d="M{110 + i * 30} 280 L{128 + i * 24} 440" {T}/>' for i in range(7))
    return svg(f"""<path d="M90 280 L120 440 H280 L310 280Z" {S}/>{lines}
<path d="M80 282 C60 250 90 220 120 230 C110 190 160 170 185 196 C190 150 250 150 252 196 C280 170 330 190 316 232 C346 226 352 268 320 282Z" {S}/>
<path d="M120 230 C150 250 180 244 200 226 M252 196 C250 224 270 240 300 236" {T}/>
<circle cx="214" cy="140" r="22" {S}/><path d="M214 118 C214 96 232 84 248 82" {S}/><path d="M232 92 C246 80 262 86 260 96 C250 100 238 98 232 92Z" {S}/>
{sparkles([(60, 120), (350, 140), (52, 400), (352, 380)])}{heart(330, 70, 16)}""")


def icecream():
    grid = "".join(f'<path d="M{150 + i * 20} 246 L{200 + (i - 2.5) * 6} 440" {T}/>' for i in range(6))
    grid += "".join(f'<path d="M{140 + i * 11} {270 + i * 40} L{260 - i * 11} {270 + i * 40}" {T}/>' for i in range(4))
    return svg(f"""<path d="M136 246 L200 452 L264 246Z" {S}/>{grid}
<path d="M120 250 C96 214 120 176 160 184 C150 140 200 116 230 140 C262 120 300 150 288 190 C320 196 324 240 284 250Z" {S}/>
<path d="M160 250 C160 272 176 272 176 252 M224 250 C224 284 244 284 244 252" {S}/>
<path d="M150 150 C140 110 170 74 210 80 C250 78 272 112 262 146" {S}/>
<circle cx="208" cy="62" r="16" {S}/><path d="M208 46 C206 30 214 20 226 18" {S}/>
{sparkles([(60, 90), (342, 80), (70, 330), (340, 330)])}{star(80, 220, 16)}{star(326, 230, 14)}""")


def stars():
    return svg(f"""{star(200, 210, 140, .46)}{star(200, 210, 72, .46, attrs=T)}
<path d="M300 50 A46 46 0 1 0 344 116 A36 36 0 1 1 300 50Z" {S}/>
{star(70, 70, 26)}{star(80, 380, 30)}{star(330, 400, 22)}{star(60, 240, 16)}{star(352, 250, 18)}
{sparkles([(150, 420), (250, 440), (200, 40), (120, 30)])}""")


def rainbow():
    arcs = "".join(f'<path d="M{40 + i * 22} 330 A{160 - i * 22} {160 - i * 22} 0 0 1 {360 - i * 22} 330" {S}/>' for i in range(6))
    cloud = lambda x, y, s: (f'<path d="M{x - 60 * s} {y} C{x - 80 * s} {y - 30 * s} {x - 40 * s} {y - 50 * s} {x - 20 * s} {y - 34 * s} '
                             f'C{x - 10 * s} {y - 70 * s} {x + 40 * s} {y - 66 * s} {x + 44 * s} {y - 30 * s} C{x + 80 * s} {y - 40 * s} {x + 86 * s} {y} {x + 60 * s} {y}Z" {S}/>')
    drops = "".join(f'<path d="M{x} {y} C{x - 8} {y + 14} {x - 8} {y + 22} {x} {y + 24} C{x + 8} {y + 22} {x + 8} {y + 14} {x} {y}Z" {T}/>' for x, y in [(70, 380), (100, 410), (300, 384), (330, 414), (90, 446), (316, 448)])
    return svg(f"""{arcs}{cloud(80, 352, 1)}{cloud(320, 352, 1)}{drops}{star(200, 90, 20)}{sparkles([(120, 60), (290, 66), (40, 150), (360, 150)])}""")


def strawberry():
    seeds = "".join(f'<path d="M{x} {y} q3 7 0 12" {T}/>' for x, y in [(160, 210), (200, 200), (240, 210), (140, 260), (180, 250), (220, 250), (260, 262), (160, 300), (200, 296), (240, 300), (180, 344), (220, 344), (200, 386)])
    return svg(f"""<path d="M200 430 C120 380 92 300 104 236 C114 180 160 168 200 172 C240 168 286 180 296 236 C308 300 280 380 200 430Z" {S}/>{seeds}
<path d="M200 176 C176 150 140 150 124 170 C150 168 170 174 186 184 C170 196 160 214 160 230 C178 214 190 206 200 200 C210 206 222 214 240 230 C240 214 230 196 214 184 C230 174 250 168 276 170 C260 150 224 150 200 176Z" {S}/>
<path d="M200 176 C198 140 206 112 226 96" {S}/>{heart(70, 90, 22)}{heart(332, 96, 18)}{sparkles([(60, 400), (346, 410), (330, 300), (66, 300)])}""")


def necklace():
    beads = ""
    shapes = ["c", "h", "c", "s", "c", "h", "c", "s", "c", "h", "c"]
    for i, sh in enumerate(shapes):
        t = (i + 1) / (len(shapes) + 1)
        a = math.pi * t
        x, y = 200 - 160 * math.cos(a), 70 + 250 * math.sin(a)
        if sh == "c":
            beads += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="15" {S}/>'
        elif sh == "h":
            beads += heart(round(x), round(y), 17)
        else:
            beads += star(x, y, 20)
    chain = f'<path d="M40 70 C40 250 120 330 200 330 C280 330 360 250 360 70" {T} stroke-dasharray="3 6"/>'
    return svg(f"""{chain}{beads}<path d="M200 330 L200 360" {S}/><circle cx="200" cy="392" r="32" {S}/><circle cx="200" cy="392" r="18" {T}/>{sparkles([(150, 440), (250, 440)])}""")


def bracelet():
    beads = "".join(f'<circle cx="{200 + 140 * math.cos(2 * math.pi * i / 16):.0f}" cy="{230 + 140 * math.sin(2 * math.pi * i / 16):.0f}" r="19" {S}/>' for i in range(16))
    return svg(f"""<circle cx="200" cy="230" r="140" {T} stroke-dasharray="2 6"/>{beads}
<text x="200" y="224" text-anchor="middle" font-family="Lora,serif" font-size="20" fill="#1D1815">Mi pulsera</text>
<text x="200" y="252" text-anchor="middle" font-family="Poppins,sans-serif" font-size="12" fill="#6E6157">patrón: rojo, rojo, azul…</text>
{star(60, 430, 16)}{heart(340, 430, 16)}""")


def gems():
    gem = lambda x, y, s: (f'<path d="M{x - 40 * s} {y - 20 * s} L{x - 22 * s} {y - 40 * s} H{x + 22 * s} L{x + 40 * s} {y - 20 * s} L{x} {y + 40 * s}Z" {S}/>'
                           f'<path d="M{x - 40 * s} {y - 20 * s} H{x + 40 * s} M{x - 22 * s} {y - 40 * s} L{x - 12 * s} {y - 20 * s} L{x} {y + 40 * s} L{x + 12 * s} {y - 20 * s} L{x + 22 * s} {y - 40 * s}" {T}/>')
    pearls = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" {S}/><path d="M{x - r * .4} {y - r * .45} q{r * .25} -{r * .2} {r * .5} -{r * .1}" {T}/>' for x, y, r in [(110, 360, 30), (180, 400, 22), (290, 370, 34)])
    return svg(f"""{gem(200, 140, 2.2)}{gem(90, 250, 1)}{gem(310, 250, 1.1)}{pearls}{sparkles([(60, 60), (340, 60), (200, 270), (60, 440), (340, 450)])}""")


PAGES = [
    ("Lollipop", "Una paleta de remolino", "Colorea cada vuelta de un color distinto.", lollipop),
    ("Donas", "Dona con chispitas", "¿De qué sabor es tu dona? Pinta las chispitas de muchos colores.", donut),
    ("Cupcake", "Cupcake con cereza", "Rayas en el papel y crema de tu color favorito.", cupcake),
    ("Helado", "Helado de dos bolas", "Una bola de fresa, otra de menta… ¡tú decides!", icecream),
    ("Estelar", "Estrellas y luna", "Pinta el cielo de noche y las estrellas doradas.", stars),
    ("Arcoíris", "Arcoíris entre nubes", "Rojo, naranja, amarillo, verde, azul y violeta.", rainbow),
    ("Frutas", "Una fresa dulce", "Rojo para la fresa y verde para sus hojitas.", strawberry),
    ("Gemas", "Piedras preciosas y perlas", "Las gemas brillan: deja un puntito blanco sin pintar.", gems),
    ("Diseña", "Diseña tu collar", "Colorea las cuentas: círculos, corazones y estrellas.", necklace),
    ("Diseña", "Inventa tu pulsera", "Crea un patrón que se repita y pinta cada cuenta.", bracelet),
]
