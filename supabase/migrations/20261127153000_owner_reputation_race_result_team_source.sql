begin;

create or replace function private.caleris_owner_team_achievement_score(
  p_team_id uuid,p_started_at timestamptz,p_ended_at timestamptz
)
returns numeric
language sql
stable
security definer
set search_path=''
as $function$
  with round_team_points as (
    select rs.round_id,coalesce(rs.team_id_snapshot,re.team_id) as team_id,sum(rs.points_total) as points
    from public.license_round_standings rs
    join public.license_rounds lr on lr.id=rs.round_id
    left join public.caleris_race_result_entries re
      on re.round_id=rs.round_id and re.member_id=rs.member_id
    where coalesce(rs.team_id_snapshot,re.team_id) is not null
      and lr.race_starts_at>=p_started_at
      and lr.race_starts_at<coalesce(p_ended_at,'infinity'::timestamptz)
    group by rs.round_id,coalesce(rs.team_id_snapshot,re.team_id)
  ),
  ranked_rounds as (
    select round_id,team_id,points,
      count(*) over(partition by round_id)::numeric as field_size,
      rank() over(partition by round_id order by points desc) as position
    from round_team_points
  )
  select coalesce(avg(
    case when field_size<=1 then 100
      else greatest(0,least(100,100*(field_size-position)/(field_size-1))) end
  ),0)
  from ranked_rounds
  where team_id=p_team_id;
$function$;

create or replace function private.caleris_owner_reputation_round_standing_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_round_id uuid;
  v_member_id uuid;
  v_team_id uuid;
begin
  if tg_op='DELETE' then
    v_round_id:=old.round_id;
    v_member_id:=old.member_id;
  else
    v_round_id:=new.round_id;
    v_member_id:=new.member_id;
  end if;
  select coalesce(rs.team_id_snapshot,re.team_id) into v_team_id
  from public.license_round_standings rs
  left join public.caleris_race_result_entries re
    on re.round_id=rs.round_id and re.member_id=rs.member_id
  where rs.round_id=v_round_id and rs.member_id=v_member_id;
  perform private.caleris_refresh_owner_reputation_for_team(v_team_id,'round_standing_'||lower(tg_op));
  if tg_op='UPDATE' then
    select coalesce(old.team_id_snapshot,re.team_id) into v_team_id
    from public.caleris_race_result_entries re
    where re.round_id=old.round_id and re.member_id=old.member_id;
    if v_team_id is not null then
      perform private.caleris_refresh_owner_reputation_for_team(v_team_id,'round_standing_previous_team');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function private.caleris_owner_reputation_race_entry_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    perform private.caleris_refresh_owner_reputation_for_team(old.team_id,'race_entry_removed');
    return old;
  end if;
  perform private.caleris_refresh_owner_reputation_for_team(new.team_id,'race_entry_changed');
  if tg_op='UPDATE' then
    if old.team_id is distinct from new.team_id then
      perform private.caleris_refresh_owner_reputation_for_team(old.team_id,'race_entry_previous_team');
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_owner_reputation_race_entry_event on public.caleris_race_result_entries;
create trigger caleris_owner_reputation_race_entry_event
after insert or update or delete on public.caleris_race_result_entries
for each row execute function private.caleris_owner_reputation_race_entry_event();

do $owner_reputation_team_result_backfill$
declare v_owner record;
begin
  for v_owner in
    select distinct owner_member_id
    from public.caleris_team_owner_tenures
  loop
    perform private.caleris_refresh_owner_reputation(
      v_owner.owner_member_id,
      'owner_reputation_team_result_source_backfill'
    );
  end loop;
end;
$owner_reputation_team_result_backfill$;

revoke all on function private.caleris_owner_team_achievement_score(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_round_standing_event() from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_race_entry_event() from public,anon,authenticated;

commit;
