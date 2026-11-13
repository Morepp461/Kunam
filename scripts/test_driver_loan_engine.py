from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = ROOT / "supabase/migrations/20261113042509_driver_loan_full_season_payroll_and_return.sql"
rls_migration = ROOT / "supabase/migrations/20261113043000_driver_loan_payroll_split_rls_denormalization.sql"
ui = (ROOT / "src/DriverTransferMarket.tsx").read_text(encoding="utf-8")
fia = (ROOT / "src/FIAOperations.tsx").read_text(encoding="utf-8")
contracts = (ROOT / "src/TeamDriverContracts.tsx").read_text(encoding="utf-8")
readme = (ROOT / "README.md").read_text(encoding="utf-8")

assert migration.is_file(), "Driver Loan migration is missing"
assert rls_migration.is_file(), "Payroll split RLS migration is missing"
rls_sql = rls_migration.read_text(encoding="utf-8").lower()
sql = migration.read_text(encoding="utf-8").lower()

assert "a.status='accepted'" in sql
assert "starts_on=p_loan_starts_on and ends_on=p_loan_ends_on" in sql
assert "loan_salary_share_percent between 0 and 100" in sql
assert "mod(loan_salary_share_percent,10)=0" in sql
assert "'loan_active'" in sql and "'loan_returned'" in sql
assert "driver-loan-fee:" in sql
assert "loan_starts_on=v_today" in sql
assert "loan_starts_on<v_today" in sql
assert "loan_ends_on<v_today" in sql
assert "set team_id=v_neg.seller_team_id" in sql

assert "v_borrower_amount:=round(v_claim.amount*v_share/100,2)" in sql
assert "v_origin_amount:=v_claim.amount-v_borrower_amount" in sql
assert "loan_negotiation_id" in sql
assert "private.process_economy_payroll_claim" in sql
assert "economy_payroll_claim_splits" in sql
assert "economy_payroll_claim_split_guard" in sql
assert "amount>=0" in sql
assert "try_process_cash_loan_repayments" in sql
assert "economy_payroll_claim_splits" in sql
assert "drop function if exists public.economy_can_read_payroll_claim" in rls_sql
assert "origin_team_id" in rls_sql and "member_id" in rls_sql
assert "owner.team_id in" in rls_sql
assert "loan_active','loan_returned" in sql

assert "p_loan_salary_share_percent" in ui
assert "Tim peminjam menanggung" in ui
assert "loan_salary_share_percent" in fia
assert "loan_returned" in ui
assert "economy_payroll_claim_splits" in contracts
assert "economy_payroll_claims!inner" not in contracts
assert "split.member_id" in contracts
assert "Driver Loan" in readme
assert "one full configured season" in readme.lower()
assert "20261113043000_driver_loan_payroll_split_rls_denormalization.sql" in readme

print("Driver Loan full-season payroll regression checks passed.")
