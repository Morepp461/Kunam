from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
migration = MIGRATIONS / "20261116190000_economy_full_settlement_automation.sql"
assert migration.is_file(), "Missing full economy settlement automation migration"
sql = migration.read_text(encoding="utf-8").lower()

# Repayment retry must reuse an overdue installment and preserve idempotency.
for fragment in [
    "private.process_cash_loan_repayments",
    "v_existing_installment.status='paid'",
    "v_existing_installment.due_amount",
    "cash-loan-repayment:",
    "waiting_for_payroll",
    "economy_cash_loan_installments",
]:
    assert fragment in sql, f"Cash Loan retry missing: {fragment}"

# Worker must wait for completed divisions and keep payroll manual.
for fragment in [
    "private.run_economy_settlement_automation",
    "pg_try_advisory_xact_lock",
    "economy_payroll_claims pc",
    "pc.status='pending'",
    "public.finalize_license_division",
    "public.payout_season_prizepool",
    "public.admin_generate_wealth_tax_assessments",
    "public.admin_collect_wealth_tax",
    "caleris-economy-settlement-automation",
    "'*/5 * * * *'",
    "caleris_economy_automation_runs",
    "recent_automation_runs",
]:
    assert fragment in sql, f"Settlement automation missing: {fragment}"

# No payroll processor or sponsorship workflow may be scheduled here.
assert "admin_process_pending_economy_payroll" not in sql
assert "payroll_for_period_round" not in sql
assert "sponsorship" not in sql
assert "sponsor_payout" not in sql

# Existing workflows remain the only authorities for transfers and rewards.
retry_migration = MIGRATIONS / "20261116170000_economy_retry_and_audit_center.sql"
assert retry_migration.is_file()
retry_sql = retry_migration.read_text(encoding="utf-8").lower()
assert "caleris-economy-pending-retry" in retry_sql
transfer_migration = MIGRATIONS / "20261112184457_driver_transfer_workflows.sql"
assert transfer_migration.is_file()
transfer_sql = transfer_migration.read_text(encoding="utf-8").lower()
assert "caleris-driver-transfer-window" in transfer_sql

# Admin audit UI must expose the new worker history and explicitly exclude payroll.
audit_ui = (ROOT / "src" / "AdminEconomyAudit.tsx").read_text(encoding="utf-8")
for fragment in ["recent_automation_runs", "pending_cash_loan_installments", "Payroll dan sponsorship tetap manual"]:
    assert fragment in audit_ui, f"Economy Audit UI missing: {fragment}"

print("Economy automation regression checks passed.")
