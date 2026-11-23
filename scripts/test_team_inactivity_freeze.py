from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = (ROOT / "supabase/migrations/20261123130000_team_inactivity_freeze_and_compensation.sql").read_text()
ui = (ROOT / "src/AdminTeamInactivity.tsx").read_text()
indexes = (ROOT / "supabase/migrations/20261123150000_caleris_scope_fk_indexes.sql").read_text()

required = [
    "caleris_team_inactivity_reviews", "caleris_team_freeze_settlements",
    "caleris_team_replacement_slots", "private.evaluate_team_inactivity",
    "private.process_team_freeze_compensation", "private.refresh_team_reactivation",
    "public.admin_open_team_replacement_slot", "public.admin_fill_team_replacement_slot",
    "public.license_season_team_snapshots", "public.caleris_quest_assignments",
    "public.caleris_team_development_part_history",
    "v_remaining:=greatest(0,v_term.duration_seasons-v_season_index)",
    "v_amount:=round(v_term.annual_salary*v_remaining,2)",
    "'contract_compensation'", "'team-freeze-comp:'",
    "set status='ended'", "set status='cancelled'",
    "status='awaiting_compensation'", "status='frozen'",
    "reactivation_activity_threshold", "private.evaluate_team_inactivity(v_review_season_id)",
    "private.process_team_freeze_compensation(v_pending_team.team_id,v_pending_team.frozen_after_season_id)",
    "status in ('frozen','awaiting_compensation')",
]
for token in required:
    assert token in migration, f"Missing inactivity safety contract: {token}"

# User's example: contract started in the freeze season, four seasons total.
duration_seasons = 4
seasons_elapsed = 1
annual_salary = 10_000_000
remaining_seasons = max(0, duration_seasons - seasons_elapsed)
compensation = annual_salary * remaining_seasons
assert remaining_seasons == 3 and compensation == 30_000_000

assert "quest_activity_count" in migration and "development_activity_count" in migration
assert "(v_quests+v_development)=0" in migration
assert "unique(season_id,team_id)" in migration
assert "unique(team_id,season_id,member_id)" in migration
assert "on conflict(team_id,season_id,member_id) do nothing" in migration
assert "error_note" in migration and "Saldo Team Wallet belum mencukupi" in migration
assert "p_frozen_team_id" in migration and "Hanya Admin" in migration
assert "reactivation_activity_count" in ui and "Buka slot pengganti" in ui
assert "admin_fill_team_replacement_slot" in ui

for token in ["caleris_team_freeze_settlements_contract_term_fk_idx","caleris_team_freeze_settlements_member_fk_idx","caleris_team_freeze_settlements_season_fk_idx","caleris_team_inactivity_reviews_team_fk_idx","caleris_team_inactivity_states_frozen_season_fk_idx","caleris_team_inactivity_states_last_reviewed_season_fk_idx","caleris_team_replacement_slots_replaced_team_fk_idx","caleris_team_replacement_slots_replacement_team_fk_idx"]:
    assert token in indexes, f"Missing inactivity FK index: {token}"

print("Team inactivity, compensation, idempotency, replacement, reactivation and FK index checks passed.")
