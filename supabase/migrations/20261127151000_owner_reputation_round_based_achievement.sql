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
    select rs.round_id,rs.team_id_snapshot as team_id,sum(rs.points_total) as points
    from public.license_round_standings rs
    join public.license_rounds lr on lr.id=rs.round_id
    where rs.team_id_snapshot is not null
      and lr.race_starts_at>=p_started_at
      and lr.race_starts_at<coalesce(p_ended_at,'infinity'::timestamptz)
    group by rs.round_id,rs.team_id_snapshot
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
declare v_team_id uuid;
begin
  if tg_op='DELETE' then
    v_team_id:=old.team_id_snapshot;
  else
    v_team_id:=new.team_id_snapshot;
  end if;
  perform private.caleris_refresh_owner_reputation_for_team(v_team_id,'round_standing_'||lower(tg_op));
  if tg_op='UPDATE' then
    if old.team_id_snapshot is distinct from new.team_id_snapshot then
      perform private.caleris_refresh_owner_reputation_for_team(old.team_id_snapshot,'round_standing_previous_team');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists caleris_owner_reputation_round_standing_event on public.license_round_standings;
create trigger caleris_owner_reputation_round_standing_event
after insert or update or delete on public.license_round_standings
for each row execute function private.caleris_owner_reputation_round_standing_event();

revoke all on function private.caleris_owner_team_achievement_score(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function private.caleris_owner_reputation_round_standing_event() from public,anon,authenticated;

commit;
