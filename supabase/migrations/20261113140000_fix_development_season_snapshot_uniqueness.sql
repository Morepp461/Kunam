alter table public.caleris_development_season_snapshots drop constraint if exists caleris_development_season_sn_season_id_asset_type_member_i_key;
alter table public.caleris_development_season_snapshots add constraint caleris_development_season_snapshots_owner_shape check (
 (member_id is not null and team_id is null) or (member_id is null and team_id is not null)
);
drop function if exists public.admin_snapshot_development_season(uuid);