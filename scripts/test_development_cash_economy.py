from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = ROOT / "supabase/migrations/20261116232000_cash_based_development_economy.sql"
assert migration.is_file(), "Missing cash-based Development migration"
sql = migration.read_text(encoding="utf-8").lower()
for fragment in [
    "cash_eur_per_point",
    "cash_price_positive",
    "cash_is_configured",
    "development_upgrade",
    "private.post_economy_transaction",
    "account_kind='development_shop'",
    "member_purchase_development_tokens(numeric)",
    "admin_set_development_shop_price(numeric,boolean)",
    "seed_default_development_race_rewards",
    "values(new.id,3,3,0,0,true)",
    "driver_win_ddp=3,team_win_tdp=3",
    "source_type in ('race_win','pole_position')",
    "cash_eur_spent",
    "payment_method",
]:
    assert fragment in sql, f"Cash Development migration missing: {fragment}"

driver_rates = {
    "race_pace": "1000000",
    "qualifying_pace": "850000",
    "experience": "600000",
    "aggression": "450000",
    "defensive_strength": "600000",
    "overtake_skill": "600000",
    "mistake_rate": "450000",
    "tyre_management": "750000",
}
team_rates = {
    "race_pace": "2500000",
    "qualifying_pace": "2000000",
    "engine_power": "3000000",
    "aero_power": "2800000",
    "low_speed_corners": "1500000",
    "high_speed_corners": "1800000",
    "traction": "1500000",
    "mechanical_grip": "1500000",
    "team_tyre_management": "1200000",
    "strategy_quality": "1200000",
    "team_morale": "800000",
    "reliability": "2000000",
    "car_tyre_wear": "1200000",
    "pit_stop_efficiency": "1000000",
    "drs_efficiency": "1500000",
    "ers_efficiency": "2000000",
}
for key, value in driver_rates.items():
    assert f"when '{key}' then {value}" in sql, f"Missing Driver price for {key}"
for key, value in team_rates.items():
    assert f"when '{key}' then {value}" in sql, f"Missing Team price for {key}"
assert sum(map(int, driver_rates.values())) * 50 == 265_000_000
assert sum(map(int, team_rates.values())) * 50 == 1_375_000_000

ui = (ROOT / "src/DevelopmentTokens.tsx").read_text(encoding="utf-8")
for fragment in [
    'useState<"cash"|"token">',
    'cash_eur_per_point',
    'paymentMethod}',
    "Race Reward Token",
    "Wallet Cash",
    "tidak memiliki harga tunai",
]:
    assert fragment in ui, f"Development UI missing: {fragment}"

shop = (ROOT / "src/ShopPage.tsx").read_text(encoding="utf-8")
assert "member_purchase_development_tokens" not in shop
assert "tidak dapat dibeli" in shop.lower()

pricing = (ROOT / "src/AdminPricingCenter.tsx").read_text(encoding="utf-8")
for fragment in [
    "cash_eur_per_point",
    "Simpan harga Development Mobil",
    "Simpan harga Development Driver",
    "Development Race Rewards",
    "driver_win_ddp",
    "team_win_tdp",
]:
    assert fragment in pricing, f"Admin price configuration missing: {fragment}"

edge = (ROOT / "supabase/functions/economy-workflows/index.ts").read_text(encoding="utf-8")
assert "p_payment_method:paymentMethod" in edge
assert "member_upgrade_development_attribute" in edge

workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
assert "scripts/test_development_cash_economy.py" in workflow
print("Development cash economy regression checks passed.")
