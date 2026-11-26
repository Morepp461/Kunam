begin;

create or replace function public.caleris_admin_save_milestone(
  p_code text,
  p_scope text,
  p_title text,
  p_description text,
  p_metric_key text,
  p_target numeric,
  p_xp_reward integer default 0,
  p_badge_code text default null,
  p_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_milestone_id uuid;
  v_fixed_reward integer;
begin
  if (select auth.uid()) is null
     or not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then
    raise exception 'not_authorized';
  end if;

  if p_code is null or p_code !~ '^[a-z0-9_]{3,80}$'
    or p_scope is null or p_scope not in('driver','team')
    or p_metric_key is null or nullif(btrim(p_title),'') is null
    or p_target is null or p_target<=0 or p_target>1000000000000 then
    raise exception 'invalid_milestone_definition';
  end if;

  if p_scope='driver' and p_metric_key not in(
    'xp_total','driver_race_starts','driver_wins','driver_podiums','driver_points','driver_championships'
  ) then raise exception 'invalid_driver_metric'; end if;
  if p_scope='team' and p_metric_key not in(
    'team_races','team_wins','team_podiums','team_drivers','team_xp','team_championships'
  ) then raise exception 'invalid_team_metric'; end if;

  v_fixed_reward:=public.caleris_milestone_reward_xp(p_code);
  if coalesce(p_active,true) and v_fixed_reward not between 5 and 20 then
    raise exception 'milestone_reward_not_defined_in_source';
  end if;

  if p_badge_code is not null and not exists(
    select 1 from public.caleris_achievement_badges where code=p_badge_code
  ) then raise exception 'badge_not_found'; end if;

  if exists(
    select 1 from public.caleris_milestone_definitions
    where code=p_code and (scope<>p_scope or metric_key<>p_metric_key)
  ) then raise exception 'milestone_identity_immutable'; end if;

  insert into public.caleris_milestone_definitions(
    scope,code,title,description,metric_key,target_value,xp_reward,badge_code,active
  )
  values(
    p_scope,p_code,left(btrim(p_title),120),left(coalesce(p_description,''),500),
    p_metric_key,p_target,v_fixed_reward,p_badge_code,coalesce(p_active,true)
  )
  on conflict(code) do update set
    title=excluded.title,
    description=excluded.description,
    target_value=excluded.target_value,
    xp_reward=excluded.xp_reward,
    badge_code=excluded.badge_code,
    active=excluded.active
  returning id into v_milestone_id;

  if p_scope='driver' then
    perform public.caleris_refresh_driver_milestones(m.id) from public.members m;
  else
    perform public.caleris_refresh_team_milestones(t.id) from public.teams t;
  end if;
  return v_milestone_id;
end;
$function$;

revoke all on function public.caleris_admin_save_milestone(text,text,text,text,text,numeric,integer,text,boolean)
  from public,anon,service_role;
grant execute on function public.caleris_admin_save_milestone(text,text,text,text,text,numeric,integer,text,boolean)
  to authenticated;

revoke all on function public.caleris_set_xp_reward(text,integer)
  from public,anon,authenticated,service_role;

revoke insert,update,delete on public.caleris_milestone_definitions
  from public,anon,authenticated;
grant select on public.caleris_milestone_definitions to authenticated;

commit;
