"""Plantilla de las guías THF (A5). Cada guía es una lista de páginas; cada página es HTML con clases de esta hoja.
Las fotos salen de public/media/seed. Sin números de teléfono ni precios fijos: todo eso vive en la web y el panel."""
from pathlib import Path

W = Path(__file__).resolve().parents[2]
MEDIA = W / "public/media/seed"

CSS = r"""
@page{size:148mm 210mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Poppins","Inter",sans-serif;font-weight:300;color:#1D1815;font-size:9.6pt;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:148mm;height:210mm;padding:17mm 15mm 20mm;position:relative;page-break-after:always;background:#F3EBE1;overflow:hidden}
.pg.white{background:#fff}
.pg.dark{background:#0D0C0B;color:#F3EBE1}
.pg.marino{background:#192543;color:#F3EBE1}
.pg.burdeos{background:#3D1011;color:#F3EBE1}
.pg.rosa{background:#FBEDEF}
.pg:last-child{page-break-after:auto}
h1,h2,h3{font-family:"Lora","DejaVu Serif",serif;font-weight:400;margin:0;line-height:1.08;letter-spacing:-.01em}
h1{font-size:29pt}
h2{font-size:20pt;margin:5mm 0 4.5mm}
h3{font-size:12.5pt;margin:5mm 0 2mm}
p{margin:0 0 3mm}
b,strong{font-weight:500}
.k{font-size:6.6pt;letter-spacing:.26em;text-transform:uppercase;color:#735619;font-weight:500;margin:0}
.dark .k,.marino .k,.burdeos .k{color:#E2C47A}
.script{font-family:"TeX Gyre Chorus",cursive;font-size:1.25em;letter-spacing:0;color:#735619;font-weight:400}
.dark .script,.marino .script,.burdeos .script{color:#E2C47A}
.lede{font-size:11pt;line-height:1.55}
.rule{height:1px;background:#B8912F;width:22mm;margin:4.5mm 0}
ul,ol{padding-left:4.6mm;margin:0 0 3mm}
li{margin:0 0 2.2mm}
li::marker{color:#B8912F}
ol li::marker{font-family:"Lora",serif;font-weight:500}
.box{background:#fff;padding:4.5mm 5.5mm;margin:4mm 0;border-left:1.4px solid #B8912F}
.white .box{background:#F3EBE1}
.dark .box,.marino .box,.burdeos .box{background:rgba(255,255,255,.06);border-color:#E2C47A}
.box p:last-child{margin:0}
.ph{width:100%;height:56mm;object-fit:cover;display:block;margin:4mm 0}
.ph.tall{height:84mm}.ph.short{height:40mm}
.two{display:grid;grid-template-columns:1fr 1fr;gap:4.5mm}
.two .ph{margin:0}
.three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3mm}
.foot{position:absolute;left:15mm;right:15mm;bottom:9mm;font-size:6.4pt;letter-spacing:.22em;text-transform:uppercase;color:#6E6157;display:flex;justify-content:space-between;border-top:1px solid rgba(184,145,47,.45);padding-top:2.6mm}
.dark .foot,.marino .foot,.burdeos .foot{color:rgba(243,235,225,.6)}
/* portada */
.cover{padding:0;background:#0D0C0B;color:#F3EBE1}
.cover .img{width:100%;height:122mm;object-fit:cover;display:block}
.cover .t{padding:9mm 15mm 0}
.cover h1{margin:3.5mm 0 3mm}
.cover p.sub{color:rgba(243,235,225,.78);font-size:10pt;max-width:104mm}
.cover .k{color:#E2C47A}
.logo{position:absolute;right:15mm;bottom:17mm;display:grid;grid-template-columns:8mm 8mm;font-family:"Lora",serif;font-size:11pt;text-align:center;line-height:8mm}
.logo span{border:.6px solid #E2C47A}
.logo span:nth-child(1),.logo span:nth-child(4){background:#F3EBE1;color:#0D0C0B}
.logo span:nth-child(2),.logo span:nth-child(3){background:#0D0C0B;color:#F3EBE1}
.cover .free{position:absolute;left:15mm;bottom:14mm;font-size:6.4pt;letter-spacing:.24em;text-transform:uppercase;color:#E2C47A;border:1px solid #E2C47A;padding:1.6mm 3mm}
.cover.rosa{background:#FBEDEF;color:#3D1011}
.cover.rosa p.sub{color:#3D1011}
.cover.rosa .k,.cover.rosa .free{color:#9A3B57;border-color:#9A3B57}
/* índice */
.toc{list-style:none;padding:0;margin:5mm 0 0;display:grid;grid-template-columns:1fr 1fr;column-gap:6mm}
.toc li{display:flex;gap:3mm;align-items:baseline;border-bottom:1px solid rgba(184,145,47,.35);padding:1.8mm 0;margin:0}
.toc li b{font-family:"Lora",serif;font-weight:400;font-size:10.5pt}
.toc li span{font-size:7pt;letter-spacing:.2em;color:#735619;min-width:8mm}
/* fichas de piedras */
.spec{display:grid;grid-template-columns:24mm 1fr;gap:1.6mm 4mm;margin:3mm 0 4mm;font-size:8.8pt}
.spec dt{font-size:6.4pt;letter-spacing:.2em;text-transform:uppercase;color:#735619;font-weight:500;padding-top:.6mm}
.spec dd{margin:0}
.chip{display:inline-block;width:3.2mm;height:3.2mm;border-radius:50%;vertical-align:-.4mm;margin-right:1.4mm;border:.4px solid rgba(0,0,0,.25)}
/* tablas */
table.t{width:100%;border-collapse:collapse;font-size:8.4pt;margin:3mm 0}
table.t th,table.t td{text-align:left;padding:2mm 2.2mm;border-bottom:1px solid rgba(184,145,47,.4);vertical-align:top}
table.t th{font-size:6.2pt;letter-spacing:.18em;text-transform:uppercase;color:#735619;font-weight:500}
table.t td.fill{height:8mm}
/* pasos */
.steps{list-style:none;padding:0;margin:4mm 0;counter-reset:s}
.steps li{counter-increment:s;position:relative;padding-left:11mm;margin-bottom:4mm}
.steps li::before{content:counter(s,decimal-leading-zero);position:absolute;left:0;top:-.6mm;font-family:"Lora",serif;font-size:13pt;color:#B8912F}
.steps li b{display:block;font-family:"Lora",serif;font-weight:500;font-size:10.5pt;margin-bottom:.6mm}
/* líneas para escribir */
.lines{margin:2mm 0 4mm}
.lines div{border-bottom:1px solid rgba(29,24,21,.35);height:7.5mm}
.lines label{font-size:6.6pt;letter-spacing:.18em;text-transform:uppercase;color:#735619;font-weight:500;display:block;margin-top:2mm}
.check{list-style:none;padding:0}
.check li{padding-left:6.5mm;position:relative}
.check li::before{content:"";position:absolute;left:0;top:1.2mm;width:3mm;height:3mm;border:1px solid #B8912F}
/* cita */
.quote{font-family:"Lora",serif;font-style:italic;font-size:14pt;line-height:1.35;margin:8mm 0}
/* colorear */
.color{padding:13mm 11mm 18mm}
.color h2{font-size:15pt;margin:0 0 1mm;text-align:center}
.color .k{text-align:center}
.color svg{display:block;width:126mm;height:150mm;margin:4mm auto 0}
.color .tip{text-align:center;font-size:8.6pt;margin-top:2mm}
.cert{border:1.4px solid #B8912F;outline:1px solid #B8912F;outline-offset:2mm;height:calc(100% - 6mm);margin-top:2mm;padding:12mm 9mm;text-align:center;display:flex;flex-direction:column;justify-content:center}
.cert h1{font-size:24pt}
.cert .name{border-bottom:1px solid #1D1815;height:12mm;margin:8mm 6mm 2mm}
.center{text-align:center}
.small{font-size:8pt}
.muted{color:#6E6157}
.cta{display:inline-block;margin-top:3mm;padding:2.6mm 5mm;background:linear-gradient(135deg,#8C6A1F,#E9CF85 38%,#B8912F 62%,#F3E2A9 82%,#9A7425);color:#0D0C0B;font-size:6.8pt;letter-spacing:.22em;text-transform:uppercase;font-weight:500}
.compass{width:30mm;height:30mm;margin:0 0 6mm}
"""


_CACHE = Path("/tmp/thf-guide-img")


def img(name, max_px=1100):
    """Copia reducida en JPEG para que el PDF pese poco (las fotos semilla son grandes)."""
    from PIL import Image
    _CACHE.mkdir(exist_ok=True)
    out = _CACHE / f"{name}-{max_px}.jpg"
    if not out.exists():
        im = Image.open(MEDIA / f"{name}.webp").convert("RGB")
        im.thumbnail((max_px, max_px))
        im.save(out, "JPEG", quality=74, optimize=True, progressive=True)
    return out.as_uri()


LOGO = '<div class="logo"><span>T</span><span>H</span><span>F</span><span>·</span></div>'

COMPASS = """<svg class="compass" viewBox="0 0 100 100" fill="none" stroke="#B8912F" stroke-width=".8"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="38"/>
<path d="M50 4 56 44 96 50 56 56 50 96 44 56 4 50 44 44Z"/><path d="M50 18 53 47 82 50 53 53 50 82 47 53 18 50 47 47Z" stroke-width=".5"/></svg>"""


def cover(kicker, title, sub, photo, tone=""):
    return f"""<section class="pg cover {tone}"><img class="img" src="{img(photo)}" alt=""><div class="t"><p class="k">{kicker}</p><h1>{title}</h1><p class="sub">{sub}</p></div>
<span class="free">Guía gratuita</span>{LOGO}</section>"""


def page(body, cls="", foot="THF · Isla de Margarita"):
    return {"cls": cls, "body": body, "foot": foot}


def closing(title, text, tone="dark"):
    return page(f"""{COMPASS.replace('#B8912F', '#E2C47A')}<p class="k">THF · Hecho a mano en Margarita</p><h2>{title}</h2>{text}
<div class="rule" style="background:#E2C47A"></div>
<p class="small">Pide por el WhatsApp oficial de THF que aparece en la web y en nuestro Instagram <b>@thfjoyeria</b>. Solo THF cobra tus pedidos: nunca pagues a otra persona.</p>
{LOGO}""", tone, foot="THF · Accesorios")


def render(pages_):
    out, n = [], 0
    for p in pages_:
        n += 1
        if isinstance(p, str):
            out.append(p)
            continue
        out.append(f'<section class="pg {p["cls"]}">{p["body"]}<div class="foot"><span>{p["foot"]}</span><span>{n}</span></div></section>')
    return f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>THF</title><style>{CSS}</style></head><body>{"".join(out)}</body></html>'
