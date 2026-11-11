from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
ASSETS_DIR = ROOT / "assets"
LOGO_PATH = ASSETS_DIR / "Add a heading_20260907_003952_0000.png"


class LandingPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = set()
        self.primary_actions = 0
        self.theme_controls = set()
        self.logo_reference_found = False
        self.model_reference_found = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.add(tag)

        if tag == "a" and "action" in attrs.get("class", "").split():
            self.primary_actions += 1

        if tag == "button" and attrs.get("id") in {"lightMode", "darkMode"}:
            self.theme_controls.add(attrs["id"])

        if tag == "img" and attrs.get("src") == "/assets/Add%20a%20heading_20260907_003952_0000.png":
            self.logo_reference_found = True

        if tag == "model-viewer" and attrs.get("src") == "https://cdn.3dassets.dev/assets/15179/v1/model.glb":
            self.model_reference_found = True


def main():
    assert HTML_PATH.is_file(), "index.html tidak ditemukan"
    assert ASSETS_DIR.is_dir(), "Folder assets/ tidak ditemukan"
    assert LOGO_PATH.is_file(), "Logo Caleris Masters belum ditemukan di folder assets/"

    html = HTML_PATH.read_text(encoding="utf-8")
    page = LandingPageParser()
    page.feed(html)
    page.close()

    assert {"header", "main", "footer"}.issubset(page.tags), (
        "Halaman wajib memiliki header, main, dan footer"
    )
    assert page.primary_actions == 3, (
        f"Landing page harus memiliki tepat 3 tombol utama, ditemukan {page.primary_actions}"
    )
    assert page.theme_controls == {"lightMode", "darkMode"}, (
        "Tombol mode terang dan gelap wajib tersedia"
    )
    assert page.logo_reference_found, "Logo resmi Caleris Masters belum dipasang pada header"
    assert page.model_reference_found, "Model mobil formula 3D belum dipasang"
    assert "prefers-reduced-motion" in html, "Dukungan reduced-motion tidak ditemukan"
    assert "localStorage" in html, "Preferensi tema belum disimpan"

    print("QA landing page berhasil: struktur, aset logo, model 3D, tiga aksi, tema, dan aksesibilitas.")


if __name__ == "__main__":
    main()
