from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
MOTION_PATH = ROOT / "cinematic-motion.js"
ASSETS_DIR = ROOT / "assets"
BACKGROUND_PATH = ASSETS_DIR / "Background 2.png"
LOGO_PATH = ASSETS_DIR / "Add a heading_20260907_003952_0000.png"


class LandingPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = set()
        self.primary_actions = 0
        self.theme_controls = set()
        self.header_logo = False
        self.background_image = False
        self.dust_canvas = False
        self.motion_script = False
        self.scene_layers = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.add(tag)
        classes = attrs.get("class", "").split()
        if tag == "a" and "action" in classes:
            self.primary_actions += 1
        if tag == "button" and attrs.get("id") in {"lightMode", "darkMode"}:
            self.theme_controls.add(attrs["id"])
        if tag == "img" and attrs.get("src") == "/assets/Add%20a%20heading_20260907_003952_0000.png":
            self.header_logo = True
        if tag == "img" and attrs.get("src") == "/assets/Background%202.png":
            self.background_image = True
        if tag == "canvas" and "dust-canvas" in classes:
            self.dust_canvas = True
        if tag == "script" and attrs.get("src") == "/cinematic-motion.js":
            self.motion_script = True
        for layer in ("scene-light", "scene-reflection", "scene-flare"):
            if layer in classes:
                self.scene_layers.add(layer)


def main():
    for path in (HTML_PATH, MOTION_PATH, BACKGROUND_PATH, LOGO_PATH):
        assert path.is_file() and path.stat().st_size > 0, f"File/aset tidak ada atau kosong: {path}"

    html = HTML_PATH.read_text(encoding="utf-8")
    motion = MOTION_PATH.read_text(encoding="utf-8")
    page = LandingPageParser()
    page.feed(html)
    page.close()

    assert {"header", "main", "footer"}.issubset(page.tags), "Struktur halaman tidak lengkap"
    assert page.primary_actions == 3, f"Harus tepat 3 tombol utama, ditemukan {page.primary_actions}"
    assert page.theme_controls == {"lightMode", "darkMode"}, "Kontrol tema tidak lengkap"
    assert page.header_logo, "Logo Caleris Masters harus tampil di header"
    assert page.background_image, "Background 2.png belum dipasang"
    assert page.dust_canvas and page.motion_script, "Canvas dust atau script cinematic belum dimuat"
    assert page.scene_layers == {"scene-light", "scene-reflection", "scene-flare"}, "Lapisan spotlight/refleksi/lens flare belum lengkap"
    assert "cinematicCamera" in html and "12s" in html and "scale(1.17)" in html, "Dolly-in 8-10% / loop 12 detik belum tersedia"
    assert "spotlightSweep" in html and "reflectionShift" in html and "lensFlare" in html, "Animasi spotlight/refleksi/lens flare belum tersedia"
    assert "LOOP_MS = 12000" in motion and "requestAnimationFrame(draw)" in motion, "Dust particles 12 detik belum aktif"
    assert "PARTICLE_COUNT = 76" in motion and "alpha: 0.2" in motion and "shadowBlur = p.streak ? 9 : 5" in motion, "Dust particles harus terlihat jelas dan bervariasi"
    assert "prefers-reduced-motion" in motion, "Preferensi reduced motion harus dihormati"
    assert "localStorage" in html, "Preferensi tema tidak tersimpan"
    assert ".scene{position:absolute;inset:0;z-index:0" in html, "Scene tidak boleh tersembunyi di belakang background site"
    assert ".dust-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:6" in html, "Dust canvas harus berada di atas overlay scene"
    assert "--bg:#e9e4d9" in html and "--header:rgba(241,237,226,.94)" in html, "Mode terang harus memakai palet background/header terang"
    assert "body.light .action{background:rgba(245,241,231,.92);color:#22201b" in html, "Tombol mode terang harus memiliki kontras terang"
    assert "theme===\'light\'?\'#eee9dd\':\'#08090b\'" in html, "Warna browser theme-color harus mengikuti tema"
    assert "@media(max-width:560px)" in html, "Layout mobile belum tersedia"
    assert "smoke" not in html.lower() and "smoke" not in motion.lower(), "Efek asap harus dihapus"

    print("QA statis berhasil: logo header, background utuh, dolly-in 8-10%, pan, dust, spotlight sweep, refleksi, lens flare, tema, dan layout responsif.")


if __name__ == "__main__":
    main()
