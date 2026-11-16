begin;
create index if not exists caleris_development_season_snapshots_season_idx
  on public.caleris_development_season_snapshots(season_id,asset_type);

-- This function is only an internal trigger target, not a client-callable RPC.
revoke all on function public.seed_team_development_parts()
  from public,anon,authenticated,service_role;
commit;
