"""Genera los PDF de las guías gratuitas y sus portadas.
Uso: python3 dev/guides/build_guides.py  [slug ...]
Salida: public/files/<slug>.pdf (se copian al almacenamiento privado al instalar o desde el panel),
        public/media/seed/guia-<slug>.webp (portada) y dev/guides/manifest.json (páginas y tamaño)."""
import json, os, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from PIL import Image
from playwright.sync_api import sync_playwright
import template
from content import GUIDES

W = Path(__file__).resolve().parents[2]
OUT = W / "public/files"
COV = W / "public/media/seed"
only = set(sys.argv[1:])
manifest = {}
with sync_playwright() as p:
    exe = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
    b = p.chromium.launch(executable_path=exe)
    pg = b.new_page()
    for slug, g in GUIDES.items():
        if only and slug not in only:
            continue
        html = template.render(g["pages"])
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
            f.write(html)
            tmp = f.name
        pg.goto(Path(tmp).as_uri())
        pg.wait_for_timeout(400)
        pdf = OUT / f"{slug}.pdf"
        pg.pdf(path=str(pdf), width="148mm", height="210mm", print_background=True, prefer_css_page_size=True)
        os.unlink(tmp)
        n = int(subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout.split("Pages:")[1].split()[0])
        with tempfile.TemporaryDirectory() as td:
            subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-r", "110", "-png", str(pdf), f"{td}/c"], check=True)
            png = next(Path(td).glob("c*.png"))
            im = Image.open(png).convert("RGB")
            im.thumbnail((900, 1300))
            im.save(COV / f"guia-{slug}.webp", "WEBP", quality=82)
        manifest[slug] = {"pages": n, "bytes": pdf.stat().st_size, "title": g["title"]}
        print(f"{slug}: {n} páginas, {pdf.stat().st_size // 1024} KB")
    b.close()
mf = Path(__file__).parent / "manifest.json"
old = json.loads(mf.read_text()) if mf.exists() else {}
old.update(manifest)
mf.write_text(json.dumps(old, ensure_ascii=False, indent=1), encoding="utf-8")
