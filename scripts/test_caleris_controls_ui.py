from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
CONTROLS = (ROOT / "src" / "caleris-controls.css").read_text(encoding="utf-8")
JOB_SEARCH = (ROOT / "src" / "JobSearch.tsx").read_text(encoding="utf-8")
NAV = (ROOT / "src" / "MainLayout.tsx").read_text(encoding="utf-8")
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

print("CALERIS dropdown, Job Search license filter, readability and navigation regression checks passed.")
