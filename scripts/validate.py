from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
SMOKE_PATH = ROOT / "smoke-motion.js"
ASSETS_DIR = ROOT / "assets"
BACKGROUND_PATH = ASSETS_DIR / "Background.png"
LOGO_PATH = ASSETS_DIR / "Add a heading_20260907_003952_0000.png"


class LandingPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = set()
        self.primary_actions = 0
        self.theme_controls = set()
        self.header_logo = False
        self.background_image = False
        self.smoke_photo_motion = False
        self.smoke_canvas = False
        self.smoke_script = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.add(tag)
        if tag == "a" and "action" in attrs.get("class", "").split():
            self.primary_actions += 1
        if tag == "button" and attrs.get("id") in {"lightMode", "darkMode"}:
            self.theme_controls.add(attrs["id"])
        if tag == "img" and attrs.get("src") == "/assets/Add%20a%20heading_20260907_003952_0000.png":
            self.header_logo = True
        if tag == "img" and attrs.get("src") == "/assets/Background.png":
            self.background_image = True
        if tag == "img" and "smoke-photo-motion" in attrs.get("class", "").split():
            self.smoke_photo_motion = True
        if tag == "canvas" and "smoke-canvas" in attrs.get("class", "").split():
            self.smoke_canvas = True
        if tag == "script" and attrs.get("src") == "/smoke-motion.js":
            self.smoke_script = True


def main():
    for path in (HTML_PATH, SMOKE_PATH, BACKGROUND_PATH, LOGO_PATH):
        assert path.is_file() and path.stat().st_size > 0, f"File/aset tidak ada atau kosong: {path}"

    html = HTML_PATH.read_text(encoding="utf-8")
    smoke = SMOKE_PATH.read_text(encoding="utf-8")
    page = LandingPageParser()
    page.feed(html)
    page.close()

    assert {"header", "main", "footer"}.issubset(page.tags), "Struktur halaman tidak lengkap"
    assert page.primary_actions == 3, f"Harus tepat 3 tombol utama, ditemukan {page.primary_actions}"
    assert page.theme_controls == {"lightMode", "darkMode"}, "Kontrol tema tidak lengkap"
    assert page.header_logo, "Logo Caleris Masters harus tampil di header"
    assert page.background_image, "Background.png belum dipasang"
    assert page.smoke_canvas and page.smoke_script and page.smoke_photo_motion, "Lapisan foto asap, canvas, atau script motion belum dimuat"
    assert "hero-scene.js" not in html and "car-stage" not in html, "Scene 3D lama masih dipanggil"
    assert "requestAnimationFrame(draw)" in smoke, "Animasi asap tidak berjalan"
    assert "createRadialGradient" in smoke, "Tekstur asap volumetrik tidak dibuat"
    assert "feTurbulence" in html and "feDisplacementMap" in html, "Asap asli dari foto belum diberi displacement motion"
    assert "smoke-photo-motion" in html and "mask-image" in html, "Lapisan gerak asap foto atau mask tidak ditemukan"
    assert "prefers-reduced-motion" in smoke, "Preferensi reduced motion harus dihormati"
    assert "localStorage" in html, "Preferensi tema tidak tersimpan"
    assert "@media(max-width:560px)" in html, "Layout mobile belum tersedia"

    print("QA statis berhasil: Background.png, logo, 3 tombol, tema, animasi asap foto SVG, canvas atmosferik, dan layout responsif.")


if __name__ == "__main__":
    main()
