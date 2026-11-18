from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

race = read("src/RaceControl.tsx")
ocr = read("src/RaceOCR.tsx")
schedule = read("src/RaceScheduleDashboard.tsx")
season = read("src/AdminLicenseEngine.tsx")
migration = read("supabase/migrations/20261118230000_caleris_race_payroll_atomic_automation.sql")

assert 'type FinishStatus="finished"|"dnf"|"dns"|"dsq"' in race
assert 'value="dns"' in race and 'value="dsq"' in race
assert 'status:"finished"|"dnf"|"dns"|"dsq"' in ocr
assert 'status:/\\bDSQ\\b/i.test(line)' in ocr
assert 'status:/\\bDNS\\b/i.test(line)' in ocr

assert 'getRaceState' in schedule
assert '"in_progress"' in schedule and '"awaiting_result"' in schedule
assert '"result_confirmed"' in schedule and '"completed"' in schedule
assert 'divisionKeys=["premio"]' in schedule
assert 'SCHEDULED DURATION ENDS IN' in schedule

assert 'fia_create_caleris_season_atomic' in season
assert 'fia_set_season_round_schedules' not in season

assert 'public.fia_create_caleris_season_atomic' in migration
assert 'private.process_race_lifecycle' in migration
assert 'private.retry_pending_economy_payroll' in migration
assert "public.admin_process_pending_economy_payroll(v_actor_id)" in migration
assert "'caleris-race-lifecycle'" in migration
assert "'caleris-payroll-pending-retry'" in migration

print("Race classification, division countdown, atomic season setup, and payroll automation checks passed.")
