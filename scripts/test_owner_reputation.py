from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

migration = read("supabase/migrations/20261127150000_owner_reputation_engine.sql")
achievement_migration = read("supabase/migrations/20261127151000_owner_reputation_round_based_achievement.sql")
backfill_migration = read("supabase/migrations/20261127152000_owner_reputation_round_scoring_backfill.sql")
race_source_migration = read("supabase/migrations/20261127153000_owner_reputation_race_result_team_source.sql")
round_trigger_migration = read("supabase/migrations/20261127154000_owner_reputation_round_trigger_snapshot_fallback.sql")
profile = read("src/ProfileModule.tsx")
workflow = read(".github/workflows/ci.yml")

# Owner reputation is a distinct 0-100 record and preserves individual ownership history.
assert "create table if not exists public.caleris_owner_reputation" in migration
assert "create table if not exists public.caleris_team_owner_tenures" in migration
assert "create table if not exists public.caleris_owner_reputation_history" in migration
assert "score between 0 and 100" in migration
assert "financial_health_score_snapshot" in migration
assert "contract_stability_score_snapshot" in migration
assert "caleris_owner_takeover_tenure_sync" in migration
assert "caleris_owner_reputation_appeal_event" in migration
assert "a.status='approved'" in migration
assert "license_round_standings" in achievement_migration
assert "team_id_snapshot" in achievement_migration
assert "caleris_owner_reputation_round_standing_event" in achievement_migration
assert "owner_reputation_round_scoring_backfill" in backfill_migration
assert "caleris_race_result_entries" in race_source_migration
assert "coalesce(rs.team_id_snapshot,re.team_id)" in race_source_migration
assert "caleris_owner_reputation_race_entry_event" in race_source_migration
assert "coalesce(old.team_id_snapshot" in round_trigger_migration
assert "coalesce(new.team_id_snapshot" in round_trigger_migration
assert "caleris_owner_member_tenure_sync" in migration

# Approved six-part weighting, including current owned asset market value.
for key, weight in [
    ("team_achievement", 25),
    ("team_financial_health", 20),
    ("driver_contract_stability", 15),
    ("hq_investment_development", 15),
    ("personal_asset_value", 15),
    ("regulatory_compliance", 10),
]:
    assert f"'{key}',{weight}" in migration
assert "(v_achievement*25 + v_financial*20 + v_contract*15 + v_hq*15 + v_assets*15 + v_compliance*10)/100" in migration
assert "private.caleris_assets_market_value(p_member_id)" in migration
assert "private.caleris_assets_reputation_bonus(p_member_id)" in migration
assert "v_asset_bonus*10" in migration

# Tier boundaries are the approved 0-100 bands.
for fragment in [
    "when v_score>=80 then 'elite'",
    "when v_score>=60 then 'respected'",
    "when v_score>=40 then 'established'",
    "when v_score>=20 then 'developing'",
    "else 'unproven'",
]:
    assert fragment in migration

# Tenure and owner data are not publicly readable; members can read their own profile score.
assert "alter table public.caleris_team_owner_tenures enable row level security" in migration
assert "caleris_owner_reputation_read_self" in migration
assert "member_id=public.caleris_current_member_id()" in migration
assert "grant select on public.caleris_owner_reputation" in migration

# Profile loads and displays the new owner-only reputation without replacing Driver Reputation.
assert 'from("caleris_owner_reputation")' in profile
assert 'info("Owner Reputation"' in profile
assert 'info("Reputasi"' in profile
assert "ownerReputation.metrics.team_achievement" in profile
assert "scripts/test_owner_reputation.py" in workflow

print("Owner Reputation engine regression checks passed.")
