from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POINTS = (ROOT / "point.md").read_text(encoding="utf-8")
MARKET = (ROOT / "supabase/migrations/20261126063949_driver_market_value_precontract_engine_final.sql").read_text(encoding="utf-8")
LIFECYCLE = (ROOT / "supabase/migrations/20261126064512_driver_market_precontract_lifecycle_fix.sql").read_text(encoding="utf-8")
CONTRACT_SYNC = (ROOT / "supabase/migrations/20261126065318_precontract_season_contract_sync.sql").read_text(encoding="utf-8")
TIER = (ROOT / "supabase/migrations/20261126064645_driver_market_tier_relation.sql").read_text(encoding="utf-8")
NORMALIZATION = (ROOT / "supabase/migrations/20261126065153_driver_market_scoring_normalization.sql").read_text(encoding="utf-8")
TRANSFER = (ROOT / "src/DriverTransferMarket.tsx").read_text(encoding="utf-8")
ADMIN = (ROOT / "src/AdminDriverMarketEngine.tsx").read_text(encoding="utf-8")
APP = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
NAV = (ROOT / "src/MainLayout.tsx").read_text(encoding="utf-8")

# Approved product values are recorded in the source-of-truth decision log.
for fragment in ('Tier 1 | 1,00', 'Tier 2 | 0,85', 'Tier 3 | 0,70', 'Tier 4 | 0,60',
                 'Bronze | 25', 'Silver | 50', 'Gold | 75', 'Super License | 100'):
    assert fragment in POINTS, f"Missing approved Market Value decision: {fragment}"

# Scoring formula and data sources.
for fragment in (
    "Base Value Tier 1", "Growth Factor", "initial_license_scores",
    "public.caleris_driver_attributes", "public.caleris_driver_reputation",
    "public.license_round_standings", "public.license_daily_checkins",
    "rr.driver_of_day_member_id=d.id", "e.finishing_position when 1 then 5 when 2 then 3 when 3 then 1",
    "private.recalculate_driver_market_values(null,'initial_seed')",
):
    assert fragment in MARKET, f"Missing Market Value engine source or formula: {fragment}"

# Member-facing read intentionally exposes only the current value, never score breakdown/history.
member_read = MARKET.split("create or replace function public.member_get_driver_market_values()", 1)[1].split("create or replace function", 1)[0]
assert "returns table(member_id uuid, market_value_eur numeric)" in member_read
assert "breakdown" not in member_read.lower()
assert "revoke all on public.caleris_driver_market_config,public.caleris_driver_market_values,public.caleris_driver_market_value_history" in MARKET

# Admin configuration and backend authorization.
for fragment in (
    "public.admin_configure_driver_market", "public.site_admins",
    "v_total<>100", "Tier 1 harus menggunakan multiplier 1,00",
    "p_tier_order", "p_initial_license_scores",
):
    assert fragment in MARKET, f"Missing Admin config/security validation: {fragment}"

# Pre-contract is separate from existing permanent transfer and loan workflows.
for fragment in (
    "public.caleris_driver_precontract_negotiations",
    "public.caleris_driver_precontract_offers",
    "v_actor.role<>'Owner'",
    "v_today < v_season.starts_on + ceil",
    "public.caleris_driver_salary_bands",
    "status in ('offered','negotiating')",
    "set status='signed'",
    "set status='cancelled'",
    "Kontrak driver '||coalesce(v_driver.character_name,'Driver')||' segera berakhir, dia sedang bernegosiasi dengan tim lain saat ini, segera ajukan kontrak baru atau biarkan dia pergi secara gratis'",
):
    assert fragment in MARKET, f"Missing Pre-contract requirement: {fragment}"
assert "private.process_driver_precontracts()" in MARKET
assert "first_season_id,team_id,member_id,annual_salary,duration_seasons" in LIFECYCLE
assert "ct.ends_on=pc.contract_ends_on" in LIFECYCLE
assert "update public.members set team_id=n.destination_team_id" in LIFECYCLE
assert "n.duration_seasons::text||' Season'" in LIFECYCLE
assert "public.economy_driver_contracts" in CONTRACT_SYNC
assert "on conflict(season_id,member_id) do update set" in CONTRACT_SYNC

# Relative tier relationship: a driver may exceed the adjacent tier, not two tiers above.
assert "where up.tier_number=mv.tier_number-2" in TIER
assert "min(up.market_value_eur)" in TIER
assert "tier_relation_cap" in TIER
assert "lower(e.key)=lower(v_license_key)" in NORMALIZATION
assert "v_achievement_max:=v_round_count*6" in NORMALIZATION
assert "and exists(select 1 from public.caleris_race_results" not in NORMALIZATION
assert "p_weights ?& array['license','contract','performance','skill','achievement','activity','reputation']" in NORMALIZATION

# UI integration and role boundary.
assert 'supabase.rpc("member_get_driver_market_values")' in TRANSFER
assert 'supabase.rpc("member_start_driver_precontract"' in TRANSFER
assert 'supabase.rpc("member_respond_driver_precontract"' in TRANSFER
assert 'member?.role==="Owner"' in TRANSFER
assert 'Market Value</th>' in TRANSFER
assert 'AdminDriverMarketEngine' in APP
assert '/admin/driver-market-engine' in APP
assert '/admin/driver-market-engine' in NAV
assert 'admin_configure_driver_market' in ADMIN
assert 'admin_recalculate_driver_market_values' in ADMIN
assert "MV Score" not in ADMIN

print("Driver Market Value and Pre-contract regression checks passed.")
