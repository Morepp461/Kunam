from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = ROOT / "supabase/migrations/20261113042509_driver_loan_full_season_payroll_and_return.sql"
ui = (ROOT / "src/DriverTransferMarket.tsx").read_text(encoding="utf-8")
fia = (ROOT / "src/FIAOperations.tsx").read_text(encoding="utf-8")
contracts = (ROOT / "src/TeamDriverContracts.tsx").read_text(encoding="utf-8")
readme = (ROOT / "README.md").read_text(encoding="utf-8")

assert migration.is_file(), "Driver Loan migration is missing"
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
assert "public.economy_can_read_payroll_claim" in sql
assert "private.can_read_payroll_claim" not in sql
assert "loan_active','loan_returned" in sql

assert "p_loan_salary_share_percent" in ui
assert "Tim peminjam menanggung" in ui
assert "loan_salary_share_percent" in fia
assert "loan_returned" in ui
assert "economy_payroll_claim_splits" in contracts
assert "Driver Loan" in readme
assert "one full configured season" in readme.lower()

print("Driver Loan full-season payroll regression checks passed.")
