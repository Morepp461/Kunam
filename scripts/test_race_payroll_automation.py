from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

race = read("src/RaceControl.tsx")
ocr = read("src/RaceOCR.tsx")
schedule = read("src/RaceScheduleDashboard.tsx")
season = read("src/AdminLicenseEngine.tsx")
migration = read("supabase/migrations/20261118115643_caleris_race_payroll_atomic_automation.sql")
notifications = read("src/NotificationsCenter.tsx")
notification_migration = read("supabase/migrations/20261118120232_caleris_notification_center.sql")
health_ui = read("src/AdminEconomyAudit.tsx")
health_migration = read("supabase/migrations/20261118120320_caleris_system_health_reconciliation.sql")

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

assert "caleris_notifications" in notifications and "postgres_changes" in notifications
assert "NotificationsCenter memberId=" in read("src/App.tsx")
for fragment in ["notify_quest_assignment", "notify_driver_development", "notify_contract_offer", "notify_driver_move_status", "notify_payroll_paid", "notify_race_result", "idempotency_key"]:
    assert fragment in notification_migration, f"Notification trigger missing: {fragment}"
for fragment in ["SYSTEM HEALTH & FINANCIAL RECONCILIATION", "wallet_mismatches", "cron_failures_24h"]:
    assert fragment in health_ui, f"System health UI missing: {fragment}"
for fragment in ["caleris_wallet_reconciliation_baselines", "run_system_health_reconciliation", "admin_get_system_health_snapshot", "caleris-system-health-reconciliation"]:
    assert fragment in health_migration, f"System health migration missing: {fragment}"

print("Race, payroll, notifications, and system health automation checks passed.")
