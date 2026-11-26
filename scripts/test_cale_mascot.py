from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = (ROOT / "src" / "cale" / "manifest.ts").read_text(encoding="utf-8")
MASCOT = (ROOT / "src" / "CaleMascot.tsx").read_text(encoding="utf-8")
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
    match = re.search(rf'define\("{category}"[^\[]*\[(.*?)\]\)', MANIFEST, flags=re.DOTALL)
    assert match, f"Missing category group: {category}"
    count = len(re.findall(r'\["[a-z0-9_]+",', match.group(1)))
    assert count == expected, f"{category} expected {expected} IDs, got {count}"

assert 'artworkStatus: "wardrobe-master"' in MANIFEST
assert 'case "onboarding":\n      return "formal"' in MANIFEST
assert 'case "warning":\n      return "fia"' in MANIFEST
assert 'case "race":\n      return "racing"' in MANIFEST
assert 'item.id === "reaction_warning" || item.id === "reaction_error"' in MANIFEST

for asset in ("cale-racing.webp", "cale-formal.webp", "cale-fia.webp"):
    assert (ROOT / "public" / "assets" / "cale" / asset).is_file(), f"Missing {asset}"

assert 'data-cale-design=' in MASCOT
assert 'data-cale-outfit=' in MASCOT
assert 'import CaleAssistant from "./CaleAssistant";' in LAYOUT
assert "<CaleAssistant/>" in LAYOUT
assert 'designId="reaction_warning"' in NOTIFICATIONS
assert "isWarningNotification(item)" in NOTIFICATIONS
assert "@keyframes" not in CSS and "animation:" not in CSS

print("Cale mascot checks passed: 57 unique state IDs, 3 wardrobe masters, contextual layout, FIA warning marker.")


TUTORIAL = (ROOT / "src" / "CaleAccountTutorial.tsx").read_text(encoding="utf-8")
TUTORIAL_CSS = (ROOT / "src" / "cale-account-tutorial.css").read_text(encoding="utf-8")
APP = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
assert 'const CaleAccountTutorial = lazy(() => import("./CaleAccountTutorial"));' in APP
assert '<CaleAccountTutorial userId={session.user.id}/>' in APP
assert 'aria-modal="true"' in TUTORIAL
assert 'localStorage.setItem(storageKey, "completed")' in TUTORIAL
assert 'Panduan Cale' in TUTORIAL
assert len(re.findall(r'\{ id: "', TUTORIAL)) == 7
assert ".cale-tutorial-dialog" in TUTORIAL_CSS
print("Cale onboarding tutorial checks passed: 7 account guidance steps, accessible dialog, per-user completion state.")

ASSISTANT = (ROOT / "src" / "CaleAssistant.tsx").read_text(encoding="utf-8")
assert "Tampilan pakaian menyesuaikan konteks" not in ASSISTANT
for guide in ("Ringkasan akun:", "Pencarian & filter:", "Kartu akun:", "Role & Tim:", "Moderasi:"):
    assert guide in (ROOT / "src" / "cale" / "pageGuides.ts").read_text(encoding="utf-8"), f"Missing Manage User guidance: {guide}"
assert "cale-assistant__guide-list" in ASSISTANT
print("Cale Assistant page-purpose guidance checks passed: Manage User purpose, cards, role/team and moderation workflow.")

GUIDE_CSS = (ROOT / "src" / "cale-mascot.css").read_text(encoding="utf-8")
assert ".cale-assistant__guide-list" in GUIDE_CSS


# Page-aware Cale guide and Community Hub RPC ambiguity regression.
GUIDES = (ROOT / "src" / "cale" / "pageGuides.ts").read_text(encoding="utf-8")
for route in (
    '"/community"', '"/admin/users"', '"/admin/license-engine"',
    '"/fia-panel/event-control"', '"/main-event/transfer-market"',
):
    assert route in GUIDES, f"Missing page-specific Cale guide route: {route}"
assert 'development: guide("Development"' in GUIDES, "Missing shared Driver/Team Development page guide"
for fragment in ("purpose:", "sections:", "resolveCalePageGuide", "panelGuides", "adminGuides"):
    assert fragment in GUIDES, f"Page guide resolver missing: {fragment}"
assert "resolveCalePageGuide(pathname)" in ASSISTANT
assert "pageGuide.purpose" in ASSISTANT and "pageGuide.sections.map" in ASSISTANT
assert "Tampilan pakaian menyesuaikan konteks" not in ASSISTANT

COMMUNITY_FIX = next((ROOT / "supabase" / "migrations").glob("*_community_member_id_ambiguity_fix.sql"))
COMMUNITY_SQL = COMMUNITY_FIX.read_text(encoding="utf-8")
for fragment in (
    "function public.caleris_get_community_dashboard()",
    "function public.caleris_generate_yearbook(p_season uuid, p_title text",
    "function public.caleris_cast_community_vote(p_poll_id uuid, p_option_id uuid)",
    "v_member_id",
    "e.member_id = v_member_id",
    "fs.member_id = v_member_id",
    "mb.member_id = v_member_id",
):
    assert fragment in COMMUNITY_SQL, f"Community RPC ambiguity migration missing: {fragment}"
assert "declare member_id uuid" not in COMMUNITY_SQL
print("Page-aware Cale guidance and Community Hub SQL ambiguity regression checks passed.")

for fragment in (
    "grant select (team_id, livery_data)",
    "grant select (sponsor_id, target_team_id, target_kind, status)",
    "to service_role",
):
    assert fragment in COMMUNITY_SQL, f"Member Directory least-privilege grant missing: {fragment}"

SEASON_SNAPSHOT_FIX = next((ROOT / "supabase" / "migrations").glob("*_community_season_snapshot_uuid_aggregate_fix_v2.sql"))
SEASON_SNAPSHOT_SQL = SEASON_SNAPSHOT_FIX.read_text(encoding="utf-8")
assert "function public.caleris_get_season_community_data(p_season uuid)" in SEASON_SNAPSHOT_SQL
assert "array_agg(rs.team_id_snapshot order by r.round_number desc)" in SEASON_SNAPSHOT_SQL
assert "select d.id as season_division_id" in SEASON_SNAPSHOT_SQL
assert "max(rs.team_id_snapshot)" not in SEASON_SNAPSHOT_SQL
print("Community season snapshot UUID aggregation regression checks passed.")

# Verify every concrete Driver, Team and FIA panel route has a page-specific guide.
APP_ROUTES = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
for route in (
    "/driver-panel/daily-checkin", "/driver-panel/quest",
    "/team-panel/quest", "/fia-panel/license-engine",
    "/team-panel/driver-contracts", "/team-panel/driver-registration", "/fia-panel/appeal-room", "/team-panel/budget-guard",
    "/team-panel/contract-renewals", "/team-panel/roadmap-suggestions",
    "/team-panel/custom-livery", "/team-panel/development",
    "/team-panel/sponsorship", "/driver-panel/development",
    "/driver-panel/training", "/team-panel/affiliate-team",
    "/team-panel/engine-market", "/fia-panel/appeal-room",
):
    assert f'path="{route}"' in APP_ROUTES, f"Expected route missing from App: {route}"
    slug = route.split("/")[2]
    assert f'"{slug}": guide(' in GUIDES or f'{slug}: guide(' in GUIDES or f'"{slug}": guides[' in GUIDES, f"Missing Cale page guide for route: {route}"
assert '"/auth/callback": guide("Authentication Callback"' in GUIDES
print("Cale page-guide route coverage passed for all concrete Driver, Team and FIA panel routes.")


# Cale is mounted by the shared layout for authenticated and public routes.
assert "<CaleAssistant/>" in LAYOUT, "Cale Assistant must be globally mounted by MainLayout"
assert "{session&&<CaleAssistant/>}" not in LAYOUT, "Cale must not disappear on public/new pages"
assert '"/shop": guide("Shop"' in GUIDES, "Shop must use general marketplace guidance"
assert "Marketplace CALERIS MASTERS" in GUIDES
print("Global Cale mounting and general Shop guidance checks passed.")

# Page-specific official CALE artwork mapping.
AVATAR_MAP = (ROOT / "src" / "cale" / "avatarMap.ts").read_text(encoding="utf-8")
for asset in re.findall(r'"([a-z0-9_-]+\\.webp)"', AVATAR_MAP):
    assert (ROOT / "public" / "assets" / "cale" / asset).is_file(), f"Missing mapped Cale avatar: {asset}"
for route in (
    '"/about-us"', '"/dashboard"', '"/community"', '"/race-checkin"',
    '"/fia-panel/event-control"', '"/admin/users"',
):
    assert route in AVATAR_MAP, f"Missing page-specific Cale avatar route: {route}"
for fragment in (
    'group === "driver-panel"', 'group === "team-panel"',
    'group === "fia-panel"', 'group === "main-event"',
    'resolveCalePageAvatar(pathname)',
):
    assert fragment in AVATAR_MAP + ASSISTANT, f"Missing page avatar resolver behavior: {fragment}"
assert "avatarSrc?: string" in MASCOT
assert ASSISTANT.count("avatarSrc={avatarSrc}") == 2, "Trigger and expanded panel must use the same page avatar"
print("Page-specific official Cale avatar mapping checks passed: all mapped assets exist and both assistant views use the active page pose.")

# Keep the expanded assistant character at the established large scale,
# with a smaller but still prominent responsive size on narrow screens.
assert 'size="var(--cale-assistant-avatar-size, 180px)"' in ASSISTANT
assert ".cale-assistant__character{\n  --cale-assistant-avatar-size: 180px;" in GUIDE_CSS
assert "@media(max-width:560px)" in GUIDE_CSS
assert "--cale-assistant-avatar-size: 130px;" in GUIDE_CSS
print("Cale Assistant avatar sizing checks passed: 180px desktop and 130px mobile.")
