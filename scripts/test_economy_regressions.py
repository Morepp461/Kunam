from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
migration_files = sorted(MIGRATIONS.glob("*_economy_checkin_single_reward_and_period_repayment_barrier.sql"))
assert len(migration_files) == 1, "Expected exactly one economy regression migration"
sql = migration_files[0].read_text(encoding="utf-8").lower()

# Check-in payout regression: only the legacy reward trigger is removed.
assert "drop trigger if exists economy_daily_checkin_reward on public.license_daily_checkins" in sql
assert "drop trigger if exists license_daily_checkin_score" not in sql
assert "private.try_process_cash_loan_repayments" in sql

# Repayment barrier: every division must be mapped, every mapped round closed,
# and every payroll claim settled before the installment processor can run.
assert "count(distinct season_division_id)" in sql
assert "v_mapped_divisions<>v_expected_divisions" in sql
assert "r.status<>'closed'" in sql
assert "pc.status='pending'" in sql
assert "waiting_for_all_divisions" in sql
assert "waiting_for_payroll" in sql
assert "return private.process_cash_loan_repayments(v_period.id,p_actor_id)" in sql

# Existing public entry points are patched defensively, not reimplemented.
assert "pg_get_functiondef('public.process_license_round(uuid)'::regprocedure)" in sql
assert "pg_get_functiondef(" in sql and "public.admin_process_pending_economy_payroll(uuid)" in sql
assert "v_processed_periods:=array_append(v_processed_periods,v_claim.period_id)" in sql
assert "foreach v_period_id in array v_processed_periods loop" in sql

# The canonical workflow remains responsible for the single reward payment,
# while the license scoring insertion remains in its original migration.
checkin_migration = MIGRATIONS / "20261112184437_all_role_race_checkin.sql"
assert checkin_migration.is_file()
checkin_sql = checkin_migration.read_text(encoding="utf-8").lower()
assert "insert into public.license_daily_checkins" in checkin_sql
assert "private.post_economy_transaction" in checkin_sql

print("Economy regression checks passed.")
