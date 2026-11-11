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


def main():
    for path in (HTML_PATH, SCENE_PATH, LOGO_PATH, VREEO_PATH):
        assert path.is_file() and path.stat().st_size > 0, f"Aset/file tidak ada atau kosong: {path}"

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
    assert 'from "https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js"' in scene
    assert "\\nbox(" not in scene, "Ditemukan escape newline mentah yang membuat JavaScript gagal diparse"
    assert "new THREE.WebGLRenderer" in scene and "renderer.render(scene,camera)" in scene
    assert "VREEO" in scene and "CALERIS" in scene and "APEX" in scene
    assert "vreeoMark.src" in scene, "Logo Vreeo asli belum dimuat ke tekstur sponsor"
    assert "makeDriver" in scene and "driverA" in scene and "driverB" in scene
    assert "driverA.position.y" in scene and "driverB.position.y" in scene
    assert "lightDots.forEach" in scene and "trackGroup.rotation.y" in scene
    assert "prefers-reduced-motion" in html and "prefers-reduced-motion" in scene
    assert "localStorage" in html
    assert "body.light h1 span{color:#50545b}" in html
    assert "@media(max-width:560px)" in html
    assert "camera.lookAt(-.35,1.15,0)" in scene, "Framing kamera ponsel belum diterapkan"

    print("QA statis berhasil: logo header, 3 tombol, tema, WebGL 3D, 2 driver, sponsor, animasi, dan layout responsif.")


if __name__ == "__main__":
    main()
