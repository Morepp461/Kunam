begin;
create index if not exists caleris_quest_assignments_period_fk_idx on public.caleris_quest_assignments(period_id) where period_id is not null;
create index if not exists caleris_quest_assignments_quest_fk_idx on public.caleris_quest_assignments(quest_id);
create index if not exists caleris_quest_assignments_season_fk_idx on public.caleris_quest_assignments(season_id) where season_id is not null;
create index if not exists caleris_quest_assignments_team_fk_idx on public.caleris_quest_assignments(team_id) where team_id is not null;
create index if not exists caleris_quest_catalog_difficulty_fk_idx on public.caleris_quest_catalog(difficulty);
create index if not exists caleris_quest_rewards_updated_by_fk_idx on public.caleris_quest_difficulty_rewards(updated_by) where updated_by is not null;
commit;