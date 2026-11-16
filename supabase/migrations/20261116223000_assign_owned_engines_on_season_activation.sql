-- Automatically seed the season engine assignment from each team's current engine ownership.
begin;

create or replace function private.assign_owned_engines_on_active_season()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='active' then
    if tg_op='INSERT' or old.status is distinct from 'active' then
      insert into public.caleris_team_engines(season_id,team_id,engine_id,assigned_by)
      select new.id,owned.owner_team_id,owned.id,new.created_by
      from (
        select distinct on (e.owner_team_id)
          e.id,e.owner_team_id,e.created_at
        from public.caleris_engines e
        where e.owner_team_id is not null and e.is_active
        order by e.owner_team_id,e.created_at desc,e.id
      ) owned
      on conflict(season_id,team_id) do update
        set engine_id=excluded.engine_id,assigned_at=now(),assigned_by=excluded.assigned_by;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_assign_owned_engines_on_season_activation
  on public.license_seasons;
create trigger caleris_assign_owned_engines_on_season_activation
after insert or update of status on public.license_seasons
for each row execute function private.assign_owned_engines_on_active_season();

revoke all on function private.assign_owned_engines_on_active_season()
  from public,anon,authenticated,service_role;

commit;
