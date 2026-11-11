from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
ASSETS_DIR = ROOT / "assets"


class PageCheck(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.actions = 0
        self.logo_reference = False
        self.theme_buttons = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append(tag)

        if tag == "a" and "action" in attrs.get("class", "").split():
            self.actions += 1

        if tag == "img" and attrs.get("src") == "/assets/caleris-logo.png":
            self.logo_reference = True

        if tag == "button" and attrs.get("id") in {"lightMode", "darkMode"}:
            self.theme_buttons += 1


def main():
    assert HTML_PATH.is_file(), "index.html tidak ditemukan"
    assert ASSETS_DIR.is_dir(), "Folder assets/ tidak ditemukan"

    html = HTML_PATH.read_text(encoding="utf-8")
    page = PageCheck()
    page.feed(html)
    page.close()

    assert all(tag in page.tags for tag in ("header", "main", "footer")), (
        "Struktur halaman wajib memiliki header, main, dan footer"
    )
    assert page.actions == 3, f"Seharusnya ada 3 aksi utama, ditemukan {page.actions}"
    assert page.logo_reference, "Referensi logo /assets/caleris-logo.png tidak ditemukan"
    assert page.theme_buttons == 2, "Kontrol tema terang dan gelap wajib tersedia"
    assert "prefers-reduced-motion" in html, "Dukungan reduced-motion tidak ditemukan"
    assert "localStorage" in html, "Penyimpanan preferensi tema tidak ditemukan"

    print("Pemeriksaan landing page berhasil.")


if __name__ == "__main__":
    main()
