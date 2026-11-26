begin;

create or replace function public.caleris_milestone_reward_xp(p_code text)
returns integer
language sql
immutable
set search_path=''
as $function$
  select case p_code
    when 'career_first_title' then 20
    when 'career_first_podium' then 5
    when 'career_ten_podiums' then 12
    when 'career_100_points' then 8
    when 'career_500_points' then 15
    when 'career_race_starts_1' then 5
    when 'career_race_starts_10' then 10
    when 'career_race_starts_25' then 15
    when 'career_first_win' then 10
    when 'career_five_wins' then 18
    when 'driver_xp_50' then 5
    when 'driver_xp_100' then 5
    when 'driver_xp_200' then 8
    when 'driver_xp_400' then 10
    when 'driver_xp_800' then 12
    when 'driver_xp_1600' then 15
    when 'driver_xp_3200' then 18
    when 'driver_xp_6400' then 20
    when 'team_first_title' then 20
    when 'team_drivers_2' then 5
    when 'team_first_podium' then 5
    when 'team_podiums_10' then 12
    when 'team_races_10' then 10
    when 'team_first_win' then 10
    when 'team_wins_5' then 18
    when 'team_xp_50' then 5
    when 'team_xp_100' then 8
    when 'team_xp_200' then 12
    when 'team_xp_400' then 20
    else 0
  end;
$function$;

update public.caleris_milestone_definitions
set xp_reward=public.caleris_milestone_reward_xp(code)
where scope in ('driver','team');

create table if not exists private.caleris_team_milestone_xp_awards (
  team_id uuid not null,
  milestone_id uuid not null,
  member_id uuid not null,
  awarded_xp integer not null check (awarded_xp between 5 and 20),
  source_id text not null,
  created_at timestamptz not null default now(),
  primary key(team_id,milestone_id),
  unique(member_id,source_id)
);

create or replace function private.caleris_award_team_milestone_xp(
  p_team_id uuid,
  p_milestone_id uuid
) returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_code text;
  v_title text;
  v_reward integer;
  v_owner_member_id uuid;
  v_source_id text;
  v_inserted integer;
begin
  if p_team_id is null or p_milestone_id is null then return; end if;

  select d.code,d.title,public.caleris_milestone_reward_xp(d.code)
  into v_code,v_title,v_reward
  from public.caleris_milestone_definitions d
  join public.caleris_milestone_progress p
    on p.milestone_id=d.id and p.team_id=p_team_id and p.scope='team'
  where d.id=p_milestone_id and d.scope='team' and d.active and p.completed_at is not null;

  if not found or v_reward not between 5 and 20 then return; end if;

  select m.id into v_owner_member_id
  from public.members m
  where m.team_id=p_team_id and m.role='Owner'
  order by m.created_at,m.id
  limit 1;
  if v_owner_member_id is null then return; end if;

  v_source_id:='team:'||p_team_id::text||':'||v_code;
  insert into private.caleris_team_milestone_xp_awards(team_id,milestone_id,member_id,awarded_xp,source_id)
  values(p_team_id,p_milestone_id,v_owner_member_id,v_reward,v_source_id)
  on conflict(team_id,milestone_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return; end if;

  insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description,metadata)
  values(
    v_owner_member_id,v_reward,'milestone',v_source_id,
    'Team milestone · '||left(v_title,160),
    jsonb_build_object(
      'scope','team','team_id',p_team_id,'milestone_id',p_milestone_id,
      'milestone_code',v_code,'reward_xp',v_reward,'recipient_role','Owner'
    )
  )
  on conflict(member_id,source_type,source_id) do nothing;

  perform public.caleris_log_activity(
    v_owner_member_id,p_team_id,'milestone_completed','Team milestone tercapai',
    left(v_title,160)||' · +'||v_reward||' XP',
    jsonb_build_object('source_id',v_source_id,'team_id',p_team_id,'milestone_id',p_milestone_id,'xp',v_reward)
  );
end;
$function$;

create or replace function public.caleris_team_milestone_xp_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.scope='team' and new.team_id is not null and new.completed_at is not null then
    perform private.caleris_award_team_milestone_xp(new.team_id,new.milestone_id);
  end if;
  return new;
end;
$function$;

revoke all on function private.caleris_award_team_milestone_xp(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.caleris_team_milestone_xp_trigger() from public,anon,authenticated,service_role;

drop trigger if exists caleris_team_milestone_xp_award on public.caleris_milestone_progress;
create trigger caleris_team_milestone_xp_award
after insert or update of completed_at on public.caleris_milestone_progress
for each row
when (new.scope='team' and new.team_id is not null and new.completed_at is not null)
execute function public.caleris_team_milestone_xp_trigger();

create or replace function public.caleris_team_milestone_member_refresh()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    if old.team_id is not null then perform public.caleris_refresh_team_milestones(old.team_id); end if;
    return old;
  end if;
  if new.team_id is not null then perform public.caleris_refresh_team_milestones(new.team_id); end if;
  if tg_op='UPDATE' and old.team_id is not null and old.team_id is distinct from new.team_id then
    perform public.caleris_refresh_team_milestones(old.team_id);
  end if;
  return new;
end;
$function$;

revoke all on function public.caleris_team_milestone_member_refresh() from public,anon,authenticated,service_role;
drop trigger if exists caleris_team_milestone_member_refresh on public.members;
create trigger caleris_team_milestone_member_refresh
after insert or delete or update of role,team_id on public.members
for each row execute function public.caleris_team_milestone_member_refresh();

-- Backfill all existing eligible member and team achievements. This operates
-- only on each database's own existing records; no Testing data is copied.
do $backfill$
declare
  v_member record;
  v_team record;
begin
  for v_member in select id from public.members where role in ('Driver','Owner') order by id loop
    perform public.caleris_refresh_driver_milestones(v_member.id);
  end loop;
  for v_team in select id from public.teams order by id loop
    perform public.caleris_refresh_team_milestones(v_team.id);
  end loop;
end;
$backfill$;

commit;
