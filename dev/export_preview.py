"""Exporta una vista previa estática del sitio (para revisar y mostrar sin publicar).
Uso (con el servidor de demostración corriendo, ver dev/demo.mjs):
  THF_SQLITE=dev/.data/demo.sqlite THF_KVDIR=dev/.data/demo-kv node dev/server.mjs 8792
  python3 dev/export_preview.py http://localhost:8792 salida/ [estado-playwright-del-panel.json] [salida-de-demo.txt]
Incluye la tienda completa, el flujo de compra y pago (simulado en el navegador), Mi cuenta, el portal de afiliadas,
las temporadas en vista previa y capturas navegables del panel. En la versión publicada todo esto funciona de verdad."""
import json, re, shutil, sqlite3, sys, urllib.request, urllib.parse, http.cookiejar
from pathlib import Path
B = sys.argv[1].rstrip('/'); OUT = Path(sys.argv[2]); W = Path(__file__).resolve().parent.parent
STATE = sys.argv[3] if len(sys.argv) > 3 else None
DEMO_OUT = sys.argv[4] if len(sys.argv) > 4 else None
DBFILE = W / 'dev/.data/demo.sqlite' if (W / 'dev/.data/demo.sqlite').exists() else W / 'dev/.data/thf.sqlite'
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)

def opener():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
PUB = opener()
def get(p, op=PUB, headers=None):
    req = urllib.request.Request(B + p, headers=headers or {})
    return op.open(req).read().decode('utf-8')
def getb(p, headers=None):
    return urllib.request.urlopen(urllib.request.Request(B + p, headers=headers or {})).read()
def login(path, email, pw):
    op = opener()
    data = urllib.parse.urlencode({'email': email, 'password': pw}).encode()
    op.open(urllib.request.Request(B + path, data=data, headers={'Origin': B, 'Content-Type': 'application/x-www-form-urlencoded'}))
    return op

# ---------------------------------------------------------------- 1. tienda pública (mapa del sitio + enlaces)
sm = get('/sitemap.xml')
paths = [re.sub(r'^https?://[^/]+', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', sm)]
def fname(p):
    p = p.split('#')[0].split('?')[0]
    if p in ('', '/'): return 'index.html'
    return p.strip('/').replace('/', '-') + '.html'
raw = {}
queue = list(paths)
while queue:
    p = queue.pop(0)
    if p in raw: continue
    raw[p] = get(p)
    for m in re.findall(r'["\'](/(?:pieza|coleccion|guias)/[a-z0-9-]+)["\'#]', raw[p]):
        if m not in raw and m not in queue: queue.append(m)
known = {p: fname(p) for p in raw}
exact = {}  # URL exacta (con su consulta) -> archivo

def add(url, name, html):
    raw[url] = html; known[url.split('?')[0]] = known.get(url.split('?')[0], name) if '?' in url else name; exact[url] = name

# ---------------------------------------------------------------- 2. pantallas extra: cuenta, afiliadas, temporadas, pago
for u, n in [('/cuenta/entrar', 'cuenta-entrar.html'), ('/cuenta/registro', 'cuenta-registro.html'), ('/cuenta/recuperar', 'cuenta-recuperar.html'), ('/afiliadas/entrar', 'afiliadas-entrar.html'), ('/e/luna', 'e-luna.html')]:
    try: add(u, n, get(u))
    except Exception as e: print('sin', u, e)
tokens = {}
if DEMO_OUT and Path(DEMO_OUT).exists():
    for code, link in re.findall(r'(THF-\d{4}-\d{6}) · .*? · (/pedido/\S+)', Path(DEMO_OUT).read_text()):
        tokens[code] = link
ORDER_PAGES = {'THF-2026-000015': 'pedido-ejemplo.html', 'THF-2026-000011': 'pedido-ejemplo-verificando.html', 'THF-2026-000008': 'pedido-ejemplo-enviado.html', 'THF-2026-000007': 'pedido-ejemplo-entregado.html'}
for code, n in ORDER_PAGES.items():
    if code in tokens: add(tokens[code], n, get(tokens[code]))
cust = login('/cuenta/entrar', 'maria.perez@correo.test', 'MariaDemo-2026')
for u, n in [('/cuenta/pedidos', 'cuenta-pedidos.html'), ('/cuenta/cupones', 'cuenta-cupones.html'), ('/cuenta/datos', 'cuenta-datos.html')]:
    add(u, n, get(u, cust))
known['/cuenta'] = 'cuenta-pedidos.html'
for email, n in [('valentina@afiliadas.test', 'afiliadas-panel-embajadora.html'), ('luisa@afiliadas.test', 'afiliadas-panel-aliada.html')]:
    op = login('/afiliadas/entrar', email, 'clave-demo-afiliada-1')
    h = get('/afiliadas/panel', op)
    qr = 'qr-' + email.split('@')[0] + '.svg'
    (OUT / qr).write_bytes(op.open(B + '/afiliadas/qr.svg').read())
    raw['__' + n] = h.replace('"/afiliadas/qr.svg"', f'"{qr}"'); exact['__' + n] = n
    if 'luisa' in email:
        raw['/afiliadas/precios'] = get('/afiliadas/precios', op); known['/afiliadas/precios'] = 'afiliadas-precios.html'
        raw['/afiliadas/tienda'] = get('/afiliadas/tienda', op); known['/afiliadas/tienda'] = 'afiliadas-mi-tienda.html'
known['/afiliadas/panel'] = 'afiliadas-panel-embajadora.html'; known['/afiliadas'] = 'afiliadas-entrar.html'

# ---------------------------------------------------------------- 3. panel (capturas navegables con la sesión de demostración)
ADMIN = [('/admin', 'inicio'), ('/admin/pedidos', 'pedidos'), ('/admin/pedidos/11', 'pedido-11'), ('/admin/pedidos/2', 'pedido-2'), ('/admin/pedidos/8', 'pedido-8'), ('/admin/pedidos/15', 'pedido-15'),
  ('/admin/pagos-recibidos', 'pagos-por-verificar'), ('/admin/pagos-recibidos?ver=revisados', 'pagos-revisados'), ('/admin/clientas', 'clientas'), ('/admin/clientas/7', 'clienta-7'), ('/admin/solicitudes', 'solicitudes'),
  ('/admin/piezas', 'piezas'), ('/admin/piezas/1', 'pieza-1'), ('/admin/colecciones', 'colecciones'), ('/admin/lugares', 'lugares'), ('/admin/looks', 'looks'), ('/admin/categorias', 'categorias'), ('/admin/medios', 'medios'),
  ('/admin/costos', 'costos'), ('/admin/costos/4', 'costos-4'), ('/admin/materiales', 'materiales'), ('/admin/materiales/1', 'material-1'), ('/admin/proveedores', 'proveedores'),
  ('/admin/temporadas', 'temporadas'), ('/admin/temporadas/1', 'temporada-1'), ('/admin/temporadas/2', 'temporada-2'), ('/admin/cupones', 'cupones'), ('/admin/cupones/1', 'cupon-1'), ('/admin/cupones/3', 'cupon-3'),
  ('/admin/envios', 'envios'), ('/admin/pagos', 'metodos-de-pago'),
  ('/admin/afiliadas', 'afiliadas'), ('/admin/afiliadas/1', 'afiliada-1'), ('/admin/afiliadas/2', 'afiliada-2'), ('/admin/afiliadas/3', 'afiliada-3'), ('/admin/afiliadas/1/vista', 'afiliada-1-vista'), ('/admin/afiliadas/3/vista', 'afiliada-3-vista'), ('/admin/aliadas-imagenes', 'imagenes-aliadas'), ('/admin/comisiones', 'comisiones'),
  ('/admin/analitica', 'analitica'), ('/admin/analitica?rango=7', 'analitica-7'), ('/admin/utm', 'utm'), ('/admin/biblioteca', 'biblioteca'), ('/admin/biblioteca/6', 'guia-6'),
  ('/admin/ajustes', 'ajustes'), ('/admin/avisos', 'avisos'), ('/admin/seo', 'seo'), ('/admin/integraciones', 'integraciones'), ('/admin/usuarios', 'usuarios'), ('/admin/auditoria', 'auditoria'), ('/admin/cuenta', 'mi-cuenta')]
admin_pages = {}
if STATE:
    st = json.load(open(STATE))
    ck = '; '.join(f"{c['name']}={c['value']}" for c in st['cookies'] if 'localhost' in c['domain'])
    H = {'Cookie': ck}
    for u, n in ADMIN:
        try:
            h = get(u, headers=H)
            if '/admin/login' in h[:3000] and 'name="password"' in h: print('sesión del panel vencida'); break
            if 'Confirma tu identidad' in h: print('pide reautenticar:', u); continue
            admin_pages[u] = 'panel-' + n + '.html'
            raw[u] = h
        except Exception as e:
            print('panel sin', u, e)
    for u, n in admin_pages.items():
        exact[u] = n
        if '?' not in u: known[u] = n
    # campañas en vista previa (enlace privado del panel)
    for slug in ('navidad', 'black-friday'):
        m = re.search(r'/temporada/' + slug + r'\?vista=([0-9a-f]+)', ''.join(raw.get(u, '') for u in ('/admin/temporadas/1', '/admin/temporadas/2')))
        if m:
            u = f'/temporada/{slug}?vista={m.group(1)}'
            add(u, f'temporada-{slug}.html', get(u))

# ---------------------------------------------------------------- 4. reescritura de enlaces para que todo funcione sin servidor
def rew(t, admin=False):
    t = t.replace(B, '')
    for u in sorted(exact, key=len, reverse=True):
        if u.startswith('__'): continue
        for v in (u, u.replace('&', '&amp;')):
            t = t.replace(f'"{v}"', f'"{exact[u]}"').replace(f"'{v}'", f"'{exact[u]}'")
    def link(m):
        q, p, h = m.group(1), m.group(2), m.group(3) or ''
        if p in known: return f'{q}{known[p]}{h}'
        if p == '/': return f'{q}index.html{h}'
        return m.group(0)
    t = re.sub(r'(["\'(=])(/(?:[a-z0-9-]+(?:/[a-z0-9-]+){0,2})?)(#[\w-]*)?(?=["\')\s])', link, t)
    # pedidos: los de ejemplo tienen su pantalla; el resto avisa
    t = re.sub(r'"/(?:cuenta/)?pedidos?/(THF-\d{4}-\d{6})[^"]*"', lambda m: f'"{ORDER_PAGES.get(m.group(1), "#pv")}"', t)
    for a, b2 in (('/robots.txt', 'robots.txt'), ('/llms-full.txt', 'llms-full.txt'), ('/feeds/google-merchant.xml', '#pv'), ('/ir/whatsapp', 'https://wa.me/580000000000'), ('/afiliadas/qr.svg', 'qr-valentina.svg')):
        t = t.replace(f'"{a}"', f'"{b2}"')
    t = t.replace('"/ir/whatsapp?', '"https://wa.me/580000000000?')
    # lo que queda del panel sin pantalla de ejemplo
    t = re.sub(r'href="/admin[^"]*"', 'href="#pv"', t)
    t = re.sub(r'(src|href)="/admin/comprobante/(\d+)"', r'\1="media/comprobante-\2.png"', t)
    for d in ('media/', 'css/', 'js/', 'brand/', 'files/', 'assets/'):
        t = re.sub(r'(["\'(=])/' + d, r'\1' + d, t)
    return t

# comprobantes privados de los pagos de demostración (solo existen en la demo)
if STATE:
    for pid in set(re.findall(r'/admin/comprobante/(\d+)', ''.join(raw[u] for u in admin_pages))):
        try:
            (OUT / 'media').mkdir(exist_ok=True)
            (OUT / f'media/comprobante-{pid}.png').write_bytes(getb(f'/admin/comprobante/{pid}', H))
        except Exception as e: print('sin comprobante', pid, e)
    # fotos subidas que use el panel
    for m in set(re.findall(r'/media/u/[\w./-]+', ''.join(raw.values()))):
        try:
            f = OUT / m.lstrip('/'); f.parent.mkdir(parents=True, exist_ok=True); f.write_bytes(getb(m))
        except Exception as e: print('sin foto', m, e)

for p, html in raw.items():
    name = exact.get(p) or known.get(p) or fname(p)
    isadm = 'assets/admin/admin.js' in html
    html = rew(html, isadm).replace('href="/ir/whatsapp"', 'href="https://wa.me/580000000000"').replace('href="/llms.txt"', 'href="llms.txt"').replace('href="/sitemap.xml"', 'href="sitemap.xml"')
    if isadm:
        html = html.replace('<script src="assets/admin/admin.js', '<script src="js/preview-admin.js"></script>\n<script src="assets/admin/admin.js')
    else:
        html = html.replace('<script src="js/thf.js', '<script src="js/preview.js" defer></script>\n<script src="js/thf.js')
    (OUT / name).write_text(html, encoding='utf-8')
for t in ('llms.txt', 'llms-full.txt', 'robots.txt'):
    (OUT / t).write_text(get('/' + t), encoding='utf-8')
(OUT / 'sitemap.xml').write_text(sm, encoding='utf-8')
for d in ('css', 'js', 'brand', 'files', 'media/seed', 'assets'):
    shutil.copytree(W / 'public' / d, OUT / d, dirs_exist_ok=True)
js = (OUT / 'js/thf.js').read_text(encoding='utf-8')
(OUT / 'js/thf.js').write_text(rew(js).replace("'/ir/whatsapp?text='", "'https://wa.me/580000000000?text='"), encoding='utf-8')
shutil.copy(W / 'dev/preview-admin.js', OUT / 'js/preview-admin.js')

# ---------------------------------------------------------------- 5. datos para el simulador de carrito y pago (sin costos)
db = sqlite3.connect(DBFILE); db.row_factory = sqlite3.Row
S = {r['key']: json.loads(r['value']) for r in db.execute('SELECT key, value FROM settings')}
prods = {r['id']: dict(name=r['name'], sku=r['sku'], unit=r['offer_cents'] if r['offer_cents'] is not None else r['price_cents'], wh=r['wholesale_cents'], bundle=r['is_bundle'])
         for r in db.execute("SELECT * FROM products WHERE status='published'")}
looks = {}
for l in db.execute('SELECT * FROM looks WHERE active=1'):
    items = db.execute('SELECT product_id, qty FROM look_items WHERE look_id=?', (l['id'],)).fetchall()
    full = sum(prods[i['product_id']]['unit'] * i['qty'] for i in items if i['product_id'] in prods)
    disc = (full * l['discount_bps'] + 5000) // 10000
    looks[l['id']] = dict(name='Look ' + l['name'], slug=l['slug'], price=full - disc)
zones = [dict(code=z['code'], name=z['name'], kind=z['kind'], fee=z['fee_cents'], free=z['free_over_cents'], cod=z['allows_cod'], eta=z['eta']) for z in db.execute('SELECT * FROM shipping_zones WHERE active=1 ORDER BY sort')]
pays = [dict(code=m['code'], name=m['name'], adj=m['adj_bps'], island=m['island_only']) for m in db.execute('SELECT * FROM payment_methods WHERE active=1 ORDER BY sort')]
dig = {d['id']: dict(name=d['title'], price=d['price_cents'], fmt=d['format']) for d in db.execute("SELECT * FROM digital_products WHERE status='published'")}
files = {d['slug']: d['file_name'] for d in db.execute("SELECT slug, file_name FROM digital_products WHERE file_name IS NOT NULL") if (W / 'public/files' / d['file_name']).exists()}
coupons = [dict(code=c['code'], kind=c['kind'], value=c['value'], description=c['description'], retail=c['retail_only']) for c in db.execute("SELECT * FROM coupons WHERE active=1 AND customer_id IS NULL")]
data = dict(prods=prods, looks=looks, zones=zones, pays=pays, dig=dig, files=files, coupons=coupons, min=S['orders.wholesale_min_pieces'], lead=S['orders.lead_time_text'], wa=S['contact.whatsapp'],
            mode=S.get('checkout.mode', 'whatsapp'), freeHours=S.get('downloads.free_hours', 48))
shim = (W / 'dev/preview-shim.js').read_text(encoding='utf-8')
(OUT / 'js/preview.js').write_text('window.__THF_PREVIEW=' + json.dumps(data, ensure_ascii=False) + ';\n' + shim, encoding='utf-8')
json.dump({'public': sorted(set(known.values())), 'admin': admin_pages, 'extra': exact}, open(OUT / '_pages.json', 'w'), ensure_ascii=False, indent=1)
print(len(raw), 'páginas →', OUT, '· panel:', len(admin_pages))
