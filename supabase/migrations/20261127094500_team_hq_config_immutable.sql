-- Team HQ facility definitions and effects are permanent application rules, not Admin-editable settings.
drop policy if exists "Admin manages Team HQ configs"
  on public.caleris_team_hq_facility_configs;

revoke insert, update, delete, truncate, references, trigger
  on table public.caleris_team_hq_facility_configs
  from anon, authenticated;

grant select
  on table public.caleris_team_hq_facility_configs
  to authenticated;
