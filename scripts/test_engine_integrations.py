from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def source(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8").lower()

race = source("supabase/migrations/20261116161000_automated_race_settlement_authority_and_tax.sql")
settlement = source("supabase/migrations/20261116190000_economy_full_settlement_automation.sql")
brand = source("supabase/migrations/20261117330000_brand_ecosystem_full_automation.sql")
quest = source("supabase/migrations/20261117101347_quest_engine_wallet_rewards.sql")
transfer = source("supabase/migrations/20261112184457_driver_transfer_workflows.sql")
development = source("supabase/migrations/20261113110000_fixed_development_point_upgrade_cost.sql")
payroll = source("supabase/migrations/20261118115643_caleris_race_payroll_atomic_automation.sql")
notifications = source("supabase/migrations/20261118120232_caleris_notification_center.sql")

checks = {
    "Race Control -> round processing": (race, "process_license_round"),
    "Race Control -> prizepool": (race, "payout_season_prizepool"),
    "Race Control -> wealth tax": (race, "admin_generate_wealth_tax_assessments"),
    "Economy settlement -> cash loan": (settlement, "process_cash_loan_repayments"),
    "Economy settlement -> prizepool": (settlement, "payout_season_prizepool"),
    "Brand ecosystem -> scheduled automation": (brand, "auto_generate_team_sponsorship_offers"),
    "Quest -> Economy ledger": (quest, "economy_transactions"),
    "Driver transfer -> Economy ledger": (transfer, "economy_transactions"),
    "Development -> Development ledger": (development, "caleris_development_ledger"),
    "Payroll retry -> existing claim processor": (payroll, "admin_process_pending_economy_payroll"),
    "Notifications -> quest/development/contracts/payroll/race": (notifications, "notify_quest_assignment"),
}
for label, (content, fragment) in checks.items():
    assert fragment in content, f"Missing engine integration: {label}"

for fragment in ["notify_driver_development", "notify_contract_offer", "notify_driver_move_status", "notify_payroll_paid", "notify_race_result"]:
    assert fragment in notifications, f"Missing notification event: {fragment}"

print(f"{len(checks)} engine integration contracts and 6 notification event hooks passed.")
