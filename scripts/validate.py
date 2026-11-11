from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
SCENE_PATH = ROOT / "hero-scene.js"
ASSETS_DIR = ROOT / "assets"
LOGO_PATH = ASSETS_DIR / "Add a heading_20260907_003952_0000.png"
VREEO_PATH = ASSETS_DIR / "Untitled design_20261103_142659_0000.png"


class LandingPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = set()
        self.primary_actions = 0
        self.theme_controls = set()
        self.header_logo = False
        self.footer_logo = False
        self.scene_module = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.add(tag)
        if tag == "a" and "action" in attrs.get("class", "").split():
            self.primary_actions += 1
        if tag == "button" and attrs.get("id") in {"lightMode", "darkMode"}:
            self.theme_controls.add(attrs["id"])
        if tag == "img" and attrs.get("src") == "/assets/Add%20a%20heading_20260907_003952_0000.png":
            self.header_logo = True
        if tag == "script" and attrs.get("src") == "/hero-scene.js":
            self.scene_module = True

    def handle_endtag(self, tag):
        if tag == "footer":
            self.tags.add("footer")


def main():
    assert HTML_PATH.is_file(), "index.html tidak ditemukan"
    assert SCENE_PATH.is_file(), "hero-scene.js tidak ditemukan"
    assert ASSETS_DIR.is_dir(), "Folder assets/ tidak ditemukan"
    assert LOGO_PATH.is_file(), "Logo Caleris Masters tidak ditemukan"
    assert VREEO_PATH.is_file(), "Logo Vreeo tidak ditemukan"

    html = HTML_PATH.read_text(encoding="utf-8")
    scene = SCENE_PATH.read_text(encoding="utf-8")
    page = LandingPageParser()
    page.feed(html)
    page.close()

    assert {"header", "main", "footer"}.issubset(page.tags), "Struktur halaman tidak lengkap"
    assert page.primary_actions == 3, f"Harus tepat 3 tombol utama, ditemukan {page.primary_actions}"
    assert page.theme_controls == {"lightMode", "darkMode"}, "Kontrol tema tidak lengkap"
    assert page.header_logo, "Logo Caleris Masters harus tampil di header"
    assert "footer-brand" not in html, "Logo Caleris Masters tidak boleh ditempatkan di footer"
    assert page.scene_module, "Scene Three.js belum dimuat"
    assert "three.module.js" in scene, "Three.js belum diimpor"
    assert "VREEO" in scene and "CALERIS" in scene, "Brand sponsor pada livery belum ada"
    assert "makeDriver" in scene and "driverA" in scene and "driverB" in scene, "Dua pembalap 3D belum dibuat"
    assert "prefers-reduced-motion" in html and "prefers-reduced-motion" in scene, "Reduced motion belum didukung"
    assert "localStorage" in html, "Preferensi tema belum disimpan"
    assert "body.light h1 span{color:#50545b}" in html, "Kontras teks mode terang belum diperbaiki"
    assert "@media(max-width:560px)" in html, "Layout ponsel belum tersedia"

    print("QA landing page berhasil: logo header, tiga tombol, tema, scene 3D, dua pembalap, livery sponsor, dan responsivitas.")


if __name__ == "__main__":
    main()
