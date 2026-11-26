from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "assets/Background 3.webp": 400_000,
    "assets/VREEO.ID.webp": 200_000,
}
REFERENCES = {
    "index.html": ["/assets/Background%203.webp"],
    "src/styles.css": ["/assets/Background%203.webp"],
    "src/MainLayout.tsx": [
        "/assets/Background%203.webp",
        "/assets/VREEO.ID.webp",
    ],
    "src/AboutUs.tsx": ["/assets/VREEO.ID.webp"],
}

for relative, maximum in EXPECTED.items():
    asset = ROOT / relative
    assert asset.is_file(), f"Missing optimized asset: {relative}"
    assert 0 < asset.stat().st_size <= maximum, (
        f"Unexpected asset size for {relative}: {asset.stat().st_size} bytes"
    )

for relative, expected in REFERENCES.items():
    source = (ROOT / relative).read_text(encoding="utf-8")
    for reference in expected:
        assert reference in source, f"Missing {reference} in {relative}"

for relative in ("index.html", "src/styles.css", "src/MainLayout.tsx", "src/AboutUs.tsx"):
    source = (ROOT / relative).read_text(encoding="utf-8")
    assert "Background%203.png" not in source, f"Legacy background reference in {relative}"
    assert "Untitled%20design_20261103_142659_0000.png" not in source, (
        f"Legacy VREEO logo reference in {relative}"
    )

assert not (ROOT / "assets/Background 3.png").exists(), "Legacy background PNG still bundled"
assert not (ROOT / "assets/Untitled design_20261103_142659_0000.png").exists(), (
    "Legacy VREEO logo PNG still bundled"
)

print("PageSpeed WebP asset regression checks passed.")
