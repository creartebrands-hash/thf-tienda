"""Fotos de DEMOSTRACIÓN para las tiendas aliadas (no son fotos reales: la dueña sube las suyas en
Panel → Programas → Imágenes para aliadas). Genera, a partir de las fotos de muestra, dos opciones por pieza
(un "detalle" y una toma "estudio" sobre fondo de color) y tres banners tipo collage, para que la vista previa
muestre tiendas que no repiten las fotos de la tienda principal.  Uso: python3 dev/make_aliada_demo.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SEED = Path(__file__).resolve().parent.parent / 'public' / 'media' / 'seed'
OUT = SEED  # mismas rutas /media/seed/al-*.webp
W, H = 960, 1200
GOLD = (184, 145, 47)

PIECES = {  # slug de la pieza → foto base
    'marea-rosa': 'p-marea-rosa', 'vuelo-coral': 'p-vuelo-coral', 'ocaso': 'p-ocaso', 'luz-y-fe': 'p-luz-y-fe',
    'trilogia-caribe': 'p-trilogia-caribe', 'verde-manglar': 'p-verde-manglar', 'ecos-de-pampatar': 'p-pampatar',
    'marea-rosa-collar-para-combinar': 'look-marea-2', 'vuelo-coral-pulsera-para-combinar': 'look-vuelo-3',
    'luz-y-fe-pulsera-para-combinar': 'look-luzyfe-2',
}
BACKS = [(236, 224, 210), (226, 232, 226), (240, 228, 230), (228, 233, 241)]

def fit(im, w, h):
    return ImageOps.fit(im.convert('RGB'), (w, h), Image.LANCZOS, centering=(0.5, 0.45))

def detail(im):
    w, h = im.size
    z = 1.38
    cw, ch = int(w / z), int(w / z * 5 / 4)
    ch = min(ch, h)
    x, y = (w - cw) // 2, int((h - ch) * 0.42)
    return im.convert('RGB').crop((x, y, x + cw, y + ch)).resize((W, H), Image.LANCZOS)

def studio(im, back):
    bg = Image.new('RGB', (W, H), back)
    # luz suave
    glow = Image.new('L', (W, H), 0); d = ImageDraw.Draw(glow); d.ellipse((-W * .2, -H * .25, W * 1.1, H * .8), fill=90)
    bg = Image.composite(Image.new('RGB', (W, H), (255, 255, 255)), bg, glow.filter(ImageFilter.GaussianBlur(160)))
    m = 92
    ph = fit(im, W - 2 * m, H - 2 * m - 70)
    sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).rectangle((m + 10, m + 24, W - m + 6, H - m - 70 + 28), fill=70)
    bg.paste((60, 45, 35), (0, 0), sh.filter(ImageFilter.GaussianBlur(26)))
    bg.paste(ph, (m, m))
    d = ImageDraw.Draw(bg)
    d.rectangle((m - 14, m - 14, W - m + 13, H - m - 70 + 13), outline=GOLD, width=2)
    d.line((W / 2 - 60, H - 70, W / 2 + 60, H - 70), fill=GOLD, width=2)
    return bg

def banner(name, files):
    BW, BH = 1800, 700
    out = Image.new('RGB', (BW, BH), (243, 235, 225))
    n = len(files); gap = 10; cw = (BW - gap * (n - 1)) // n
    for i, f in enumerate(files):
        out.paste(fit(Image.open(SEED / f'{f}.webp'), cw, BH), (i * (cw + gap), 0))
    out.save(OUT / f'al-banner-{name}.webp', 'WEBP', quality=82)

for i, (slug, base) in enumerate(PIECES.items()):
    im = Image.open(SEED / f'{base}.webp')
    detail(im).save(OUT / f'al-{slug}-1.webp', 'WEBP', quality=82)
    studio(im, BACKS[i % len(BACKS)]).save(OUT / f'al-{slug}-2.webp', 'WEBP', quality=82)
banner('marea', ['salinas-rosa', 'look-marea-1', 'salinas-flamencos'])
banner('atardecer', ['ocaso-juangriego', 'amatistas', 'costa-alisios'])
banner('isla', ['pampatar-fortin', 'manglar', 'punta-arenas-aerea'])
print('listo')
