from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POINTS = (ROOT / "point.md").read_text(encoding="utf-8")
MARKET = (ROOT / "supabase/migrations/20261126063949_driver_market_value_precontract_engine_final.sql").read_text(encoding="utf-8")
LIFECYCLE = (ROOT / "supabase/migrations/20261126064512_driver_market_precontract_lifecycle_fix.sql").read_text(encoding="utf-8")
CONTRACT_SYNC = (ROOT / "supabase/migrations/20261126065318_precontract_season_contract_sync.sql").read_text(encoding="utf-8")
ROSTER = (ROOT / "supabase/migrations/20261126065827_precontract_season_roster_integration.sql").read_text(encoding="utf-8")
ROSTER_SNAPSHOT = (ROOT / "supabase/migrations/20261126070004_precontract_roster_snapshot_refresh.sql").read_text(encoding="utf-8")
LOCKED_CONFIG = (ROOT / "supabase/migrations/20261126072000_lock_driver_market_engine_decisions.sql").read_text(encoding="utf-8")
BASE_VALUE_UPDATE = (ROOT / "supabase/migrations/20261126130000_driver_market_value_base_18m_and_hq_two_active_projects.sql").read_text(encoding="utf-8")
PROFILE = (ROOT / "src/ProfileModule.tsx").read_text(encoding="utf-8")
DIGITAL_ID = (ROOT / "src/PublicMemberId.tsx").read_text(encoding="utf-8")
DRIVER_CARD = (ROOT / "src/DriverExhibition.tsx").read_text(encoding="utf-8")
NOTIFICATIONS = (ROOT / "src/NotificationsCenter.tsx").read_text(encoding="utf-8")
HQ = (ROOT / "src/TeamHQ.tsx").read_text(encoding="utf-8")
LANGUAGE = (ROOT / "src/lib/ui-language.ts").read_text(encoding="utf-8")
LANGUAGE_BRIDGE = (ROOT / "src/UiLanguageBridge.tsx").read_text(encoding="utf-8")
LANGUAGE_MIGRATION = (ROOT / "supabase/migrations/20261126100000_profile_market_language_notification_tombstones.sql").read_text(encoding="utf-8")
PUBLIC_MV_MIGRATION = (ROOT / "supabase/migrations/20261126110000_public_driver_market_value_rpc.sql").read_text(encoding="utf-8")
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
    "base_value_eur", "growth_factor", "initial_license_scores",
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

# Driver Market Value decisions are immutable; Admin only monitors the engine.
for fragment in (
    "weights='{\"license\":10,\"contract\":10,\"performance\":20,\"skill\":20,\"achievement\":10,\"activity\":10,\"reputation\":20}'::jsonb",
    "base_value_eur=10000000",
    "growth_factor=0.25",
    "tier_multipliers='{\"1\":1.00,\"2\":0.85,\"3\":0.70,\"4\":0.60}'::jsonb",
    "tier_order='{\"premio\":1,\"zwei\":2}'::jsonb",
    "initial_license_scores='{\"Bronze\":25,\"Silver\":50,\"Gold\":75,\"Super License\":100}'::jsonb",
    "before insert or update or delete",
    "public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb,jsonb)",
    "drop function if exists public.admin_configure_driver_market",
    "drop function if exists public.admin_get_driver_market_config",
):
    assert fragment in LOCKED_CONFIG, f"Missing locked Market Value decision: {fragment}"
assert 'admin_configure_driver_market' not in ADMIN
assert 'admin_get_driver_market_config' not in ADMIN
assert '<input' not in ADMIN
assert 'fixedConfig' in ADMIN
assert 'baseValue:18000000' in ADMIN
assert 'base_value_eur=18000000' in BASE_VALUE_UPDATE
assert 'caleris_team_hq_one_active_project_per_team' in BASE_VALUE_UPDATE
assert 'caleris_team_hq_one_active_project_per_facility' in BASE_VALUE_UPDATE
assert 'admin_recalculate_driver_market_values' in ADMIN

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
assert "private.prepare_driver_precontracts_for_season" in ROSTER
assert "pc.status in ('signed','activated')" in ROSTER
assert "precontract.destination_team_id" in ROSTER
assert "private.sync_season_roster(v_season.id)" in ROSTER
assert "license_season_roster_snapshots" in ROSTER_SNAPSHOT
assert "license_round_standings" in ROSTER_SNAPSHOT
assert "license_final_standings" in ROSTER_SNAPSHOT

# Relative tier relationship: a driver may exceed the adjacent tier, not two tiers above.
assert "where up.tier_number=mv.tier_number-2" in TIER
assert "min(up.market_value_eur)" in TIER
assert "tier_relation_cap" in TIER
assert "lower(e.key)=lower(v_license_key)" in NORMALIZATION
assert "v_achievement_max:=v_round_count*6" in NORMALIZATION
assert "v_new_achievement text:= $new$select count(*) into v_round_count" in NORMALIZATION
assert "p_weights ?& array['license','contract','performance','skill','achievement','activity','reputation']" in NORMALIZATION

# UI integration and role boundary.
assert 'supabase.rpc("member_get_driver_market_values")' in TRANSFER
assert 'supabase.rpc("member_start_driver_precontract"' in TRANSFER
assert 'supabase.rpc("member_respond_driver_precontract"' in TRANSFER
assert 'member?.role==="Owner"' in TRANSFER
assert 'Market Value</th>' in TRANSFER
assert 'member_start_free_agent_contract_negotiation' in TRANSFER
assert 'canRecruit&&freeAgents.some' in TRANSFER
assert 'getCountries' in TRANSFER
assert 'member_get_driver_market_values' in PROFILE
assert 'market_value_eur' in PROFILE
assert 'market_value_eur' in DIGITAL_ID
assert 'member_get_driver_market_values' in DRIVER_CARD
assert 'driver-card-detail-market-value' in DRIVER_CARD
assert 'member_delete_caleris_notification' in NOTIFICATIONS
assert 'member_delete_caleris_notifications' in NOTIFICATIONS
assert 'from("caleris_notifications").delete()' not in NOTIFICATIONS
assert 'preferred_language' in APP
assert 'UiLanguageBridge' in APP
assert 'isAboutUs' in LANGUAGE_BRIDGE
assert 'translateUiText' in LANGUAGE
assert 'preferred_language' in LANGUAGE_MIGRATION
assert 'member_delete_caleris_notifications' in LANGUAGE_MIGRATION
assert 'caleris_get_public_digital_id' in PUBLIC_MV_MIGRATION
assert 'market_value_eur' in APP
assert 'language-preference-field' in APP
assert '!target.data.team_id' in APP
assert 'upgradeError.details' in HQ
assert 'upgradeError.code' in HQ
assert 'AdminDriverMarketEngine' in APP
assert '/admin/driver-market-engine' in APP
assert '/admin/driver-market-engine' in NAV
assert 'admin_recalculate_driver_market_values' in ADMIN
assert "MV Score" not in ADMIN

print("Driver Market Value and Pre-contract regression checks passed.")
