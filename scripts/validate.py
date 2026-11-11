from html.parser import HTMLParser
from pathlib import Path

html = Path("index.html").read_text(encoding="utf-8")

class PageCheck(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.actions = 0
        self.logo = False
        self.theme_buttons = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append(tag)
        if tag == "a" and "action" in attrs.get("class", "").split():
            self.actions += 1
        if tag == "img" and attrs.get("alt") == "Caleris Masters":
            self.logo = True
        if tag == "button" and attrs.get("id") in {"lightMode", "darkMode"}:
            self.theme_buttons += 1

page = PageCheck()
page.feed(html)
assert all(tag in page.tags for tag in ("header", "main", "footer")), "Missing page landmark"
assert page.actions == 3, f"Expected 3 primary actions, found {page.actions}"
assert page.logo, "Original logo image reference is missing"
assert page.theme_buttons == 2, "Both theme controls must exist"
assert "prefers-reduced-motion" in html, "Reduced-motion support is missing"
assert "localStorage" in html, "Theme preference persistence is missing"
print("Landing page structure checks passed.")
