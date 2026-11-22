from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
CONTROLS = (ROOT / "src" / "caleris-controls.css").read_text(encoding="utf-8")
JOB_SEARCH = (ROOT / "src" / "JobSearch.tsx").read_text(encoding="utf-8")
NAV = (ROOT / "src" / "MainLayout.tsx").read_text(encoding="utf-8")
MAIN_LAYOUT = NAV
NOTIFICATIONS = (ROOT / "src" / "NotificationsCenter.tsx").read_text(encoding="utf-8")
STYLES = (ROOT / "src" / "styles.css").read_text(encoding="utf-8")
CHECKIN = (ROOT / "src" / "MemberRaceCheckIn.tsx").read_text(encoding="utf-8")

# Global CALERIS select treatment must load after the page-level styles.
assert 'import "./caleris-controls.css";' in APP
assert "appearance:none" in CONTROLS
assert "stroke='%23d6b85e'" in CONTROLS
assert "select option" in CONTROLS
assert ".page-heading .page-description" in CONTROLS

# Job Search license filtering is optional and restricted to the official tiers.
assert 'setLicenseOptions((b.data||[]).filter(row=>row.license_label!=="A").map(row=>row.license_label))' in JOB_SEARCH
assert 'supabase.from("caleris_driver_salary_bands").select("license_label,sort_order").order("sort_order")' in JOB_SEARCH
assert 'value={license} onChange={e=>setLicense(e.target.value)}' in JOB_SEARCH
assert '<option value="">Semua lisensi</option>' in JOB_SEARCH
assert "licenseOptions.length<=4? <fieldset" not in JOB_SEARCH
assert "licenseOptions.length<=4?" in JOB_SEARCH
assert 'type="radio" name="minimum-license"' in JOB_SEARCH
assert ".market-license-options>label.is-selected" in CONTROLS
assert 'Minimal lisensi <span className="market-filter-hint">Opsional' in JOB_SEARCH
assert '<label>Minimal lisensi<input' not in JOB_SEARCH

# Navigation is an exclusive accordion, with the active section following route changes.
assert 'useState<string|null>(null)' in NAV
assert 'setExpanded(prev=>prev===title?null:title)' in NAV
assert 'expanded===group.title' in NAV
assert '},[location.pathname]);' in NAV
assert 'expanded.includes(title)' not in NAV

# The Race Check-in intro keeps its existing content; global description frame is shared.
assert 'Semua role dapat melakukan check-in pada jendela waktu race.' in CHECKIN
assert 'border-left:2px solid rgba(214,184,94,.88)' in CONTROLS

# All native select fields must open the shared CALERIS sheet, avoiding OS-native grey popups.
assert "function CalerisSelectOverlay()" in APP
assert "caleris-select-backdrop" in APP
assert 'document.addEventListener("click",openSelect,true)' in APP
assert 'document.addEventListener("pointerdown",openSelect,true)' not in APP
assert 'suppressNativeClick' not in APP
assert 'labelText+=node.textContent||""' in APP
assert 'input value={filter} onChange={event=>setFilter(event.target.value)}' in APP
assert ".caleris-select-sheet" in CONTROLS
assert "touch-action:pan-y" in CONTROLS
assert "min-height:0" in CONTROLS
assert "calerisCometOrbit" in CONTROLS
assert "comet-skeleton" in APP
assert "Background%203.png" in NAV
assert "rgba(91,20,34,.99)" in CONTROLS

# The account menu is consolidated at the sidebar bottom; the duplicate category/header avatar is removed.
assert "sidebar-account-dropdown" in NAV
assert 'to="/profile"' in NAV and 'to="/account/settings"' in NAV
assert "account-avatar-button" not in NAV
assert '"Account":["Account"]' not in NAV
assert '{title:"ACCOUNT",items:' not in NAV

# Header search indexes every registered panel route and global event card.
assert 'import PanelPage,{panelGroups} from "./PanelPages";' in APP
assert 'const routePages=panelGroups.filter' in APP and '.flatMap(group=>group.tabs.map' in APP
assert 'PAGES & CONTENT' in APP

# Page selection cards use opaque red liquid-glass surfaces on both themes.
WORKSPACE = (ROOT / "src" / "workspace.css").read_text(encoding="utf-8")
assert "rgba(111,25,43,.98)" in WORKSPACE
assert "panel-feature-card:before" in WORKSPACE

print("CALERIS custom dropdown, account hub, global search and red page-card regression checks passed.")

EDGE = (ROOT / "supabase" / "functions" / "member-directory" / "index.ts").read_text(encoding="utf-8")
assert 'select("id,role,character_name")' in EDGE
assert 'from("caleris_announcements")' in EDGE
assert 'from("caleris_sponsorship_story_events")' in EDGE
assert 'PAGES & CONTENT' in APP
print("CALERIS custom dropdown, account hub, global search, content indexing and red page-card regression checks passed.")

# Header notification, role-aware Quest links, card-contained comet, and mobile motion regressions.
assert 'NotificationsCenter memberId={memberId} memberRole={panelAccess.member_role}' in MAIN_LAYOUT
assert 'Tandai sudah dibaca' in NOTIFICATIONS
assert 'Hapus semua notifikasi' in NOTIFICATIONS
assert '"/driver-panel/quest"' in NOTIFICATIONS and '"/team-panel/quest"' in NOTIFICATIONS
assert 'path="/quests"' in APP
assert 'panelAccess.member_role==="Principal"' in MAIN_LAYOUT
assert '.scene-image{display:block!important;object-fit:cover!important;object-position:50% 50%!important;animation:cinematicCamera' in STYLES
assert ':where(.workspace-card,.panel-feature-card,.stat-card,.quest-card' in CONTROLS
assert 'position:absolute;inset:0' in CONTROLS[CONTROLS.find('Gold comet outline'):]
