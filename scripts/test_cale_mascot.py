from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = (ROOT / "src" / "cale" / "manifest.ts").read_text(encoding="utf-8")
MASCOT = (ROOT / "src" / "CaleMascot.tsx").read_text(encoding="utf-8")
ASSISTANT = (ROOT / "src" / "CaleAssistant.tsx").read_text(encoding="utf-8")
LAYOUT = (ROOT / "src" / "MainLayout.tsx").read_text(encoding="utf-8")
NOTIFICATIONS = (ROOT / "src" / "NotificationsCenter.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "src" / "cale-mascot.css").read_text(encoding="utf-8")

ids = re.findall(r'^\s*\["([a-z0-9_]+)",', MANIFEST, flags=re.MULTILINE)
assert len(ids) == 57, f"Expected 57 Cale design IDs, got {len(ids)}"
assert len(set(ids)) == 57, "Cale design IDs must be unique"

expected_groups = {
    "idle": 7,
    "welcome": 5,
    "tutorial": 12,
    "reactions": 10,
    "interactions": 8,
    "motorsport": 8,
    "navigation": 7,
}
for category, expected in expected_groups.items():
    count = len(re.findall(rf'define\("{category}"', MANIFEST))
    assert count == 1, f"Category {category} should have one definition group"
assert 'artworkStatus: "wardrobe-master"' in MANIFEST

# Context-based wardrobe: onboarding/formal, warning/FIA, motorsport/racing.
assert 'case "onboarding":\n      return "formal"' in MANIFEST
assert 'case "warning":\n      return "fia"' in MANIFEST
assert 'case "race":\n      return "racing"' in MANIFEST
assert 'item.id === "reaction_warning" || item.id === "reaction_error"' in MANIFEST

# Transparent WebP master assets are part of the application bundle.
for asset in ("cale-racing.webp", "cale-formal.webp", "cale-fia.webp"):
    assert (ROOT / "public" / "assets" / "cale" / asset).is_file(), f"Missing {asset}"

# Reusable component and global contextual integration.
assert 'data-cale-design=' in MASCOT
assert 'data-cale-outfit=' in MASCOT
assert 'import CaleAssistant from "./CaleAssistant";' in LAYOUT
assert '{session&&<CaleAssistant/>}' in LAYOUT
assert 'designId="reaction_warning"' in NOTIFICATIONS
assert "isWarningNotification(item)" in NOTIFICATIONS
assert "prefers-reduced-motion" not in CSS  # static artwork: no motion runtime or animation loop

print("Cale mascot checks passed: 57 unique state IDs, 3 wardrobe masters, contextual layout, FIA warning marker.")
