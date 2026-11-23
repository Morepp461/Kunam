begin;

create or replace function public.caleris_refresh_driver_milestones(p_member uuid)
returns void
language plpgsql security definer set search_path=public
as $driver_milestones$
declare d record; metric_value numeric; total_xp numeric; inserted integer;
begin
  if p_member is null or not exists(select 1 from public.members where id=p_member) then return; end if;
  select coalesce(sum(amount),0) into total_xp
  from public.caleris_xp_ledger where member_id=p_member;

  for d in
    select * from public.caleris_milestone_definitions
    where active=true and scope='driver'
  loop
    metric_value := case d.metric_key
      when 'xp_total' then total_xp
      when 'driver_race_starts' then (
        select count(distinct e.round_id)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.member_id=p_member and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      )
      when 'driver_wins' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.member_id=p_member and e.finishing_position=1
          and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      )
      when 'driver_podiums' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.member_id=p_member and e.finishing_position between 1 and 3
          and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      )
      when 'driver_points' then (
        select coalesce(sum(rs.points_total),0)::numeric
        from public.license_round_standings rs
        join public.license_rounds r on r.id=rs.round_id
        where rs.member_id=p_member
          and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      )
      else null
    end;
    if metric_value is null then continue; end if;

    insert into public.caleris_milestone_progress(milestone_id,scope,member_id,current_value,completed_at)
    values(d.id,'driver',p_member,metric_value,
      case when metric_value>=d.target_value then now() end)
    on conflict(milestone_id,member_id) do update
      set current_value=excluded.current_value,
          completed_at=case
            when excluded.current_value>=d.target_value
              then coalesce(caleris_milestone_progress.completed_at,excluded.completed_at)
            else caleris_milestone_progress.completed_at
          end,
          updated_at=now();

    if metric_value>=d.target_value then
      if d.badge_code is not null then
        insert into public.caleris_member_badges(member_id,badge_code,source_type,source_id)
        values(p_member,d.badge_code,'milestone',d.code)
        on conflict do nothing;
      end if;
      if coalesce(d.xp_reward,0)>0 then
        insert into public.caleris_xp_ledger(member_id,amount,source_type,source_id,description)
        values(p_member,d.xp_reward,'milestone',d.code,'Milestone reward: '||d.title)
        on conflict(member_id,source_type,source_id) do nothing;
        get diagnostics inserted = row_count;
        if inserted=1 then
          perform public.caleris_log_activity(
            p_member,null,'milestone_completed','Milestone tercapai',d.title,
            jsonb_build_object('source_id','milestone:'||d.code,'metric_key',d.metric_key,'target',d.target_value)
          );
        end if;
      end if;
    end if;
  end loop;
end;
$driver_milestones$;

create or replace function public.caleris_refresh_team_milestones(p_team uuid)
returns void language plpgsql security definer set search_path=public
as $team_milestones$
declare d record; metric_value numeric;
begin
  if p_team is null then return; end if;
  for d in
    select * from public.caleris_milestone_definitions
    where active=true and scope='team'
  loop
    metric_value := case d.metric_key
      when 'team_races' then (
        select count(distinct e.round_id)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.team_id=p_team and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      )
      when 'team_wins' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.team_id=p_team and e.finishing_position=1
          and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      )
      when 'team_podiums' then (
        select count(*)::numeric
        from public.caleris_race_result_entries e
        join public.license_rounds r on r.id=e.round_id
        where e.team_id=p_team and e.finishing_position between 1 and 3
          and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      )
      when 'team_drivers' then (
        select count(*)::numeric from public.members m
        where m.team_id=p_team and m.role='Driver'
      )
      else null
    end;
    if metric_value is null then continue; end if;
    insert into public.caleris_milestone_progress(milestone_id,scope,team_id,current_value,completed_at)
    values(d.id,'team',p_team,metric_value,
      case when metric_value>=d.target_value then now() end)
    on conflict(milestone_id,team_id) do update
      set current_value=excluded.current_value,
          completed_at=case
            when excluded.current_value>=d.target_value
              then coalesce(caleris_milestone_progress.completed_at,excluded.completed_at)
            else caleris_milestone_progress.completed_at
          end,
          updated_at=now();
  end loop;
end;
$team_milestones$;

create or replace function public.caleris_get_community_dashboard()
returns jsonb
language plpgsql stable security definer set search_path=public
as $dashboard$
declare member_id uuid; team uuid; total_xp numeric; payload jsonb;
begin
  member_id:=public.caleris_current_member_id();
  if auth.uid() is null or member_id is null then raise exception 'member_profile_required'; end if;
  select m.team_id into team from public.members m where m.id=member_id;
  select coalesce(sum(amount),0) into total_xp from public.caleris_xp_ledger where caleris_xp_ledger.member_id=member_id;
  select jsonb_build_object(
    'member_id',member_id,
    'total_xp',total_xp,
    'level',public.caleris_xp_level(total_xp),
    'driver_stats',jsonb_build_object(
      'race_starts',(select count(distinct e.round_id) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')),
      'wins',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and e.finishing_position=1 and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')),
      'podiums',(select count(*) from public.caleris_race_result_entries e join public.license_rounds r on r.id=e.round_id where e.member_id=member_id and e.finishing_position between 1 and 3 and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')),
      'points',(select coalesce(sum(rs.points_total),0) from public.license_round_standings rs join public.license_rounds r on r.id=rs.round_id where rs.member_id=member_id and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed'))
    ),
    'team_id',team
  ) into payload;
  return payload;
end;
$dashboard$;

create or replace function public.caleris_get_season_community_data(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $season_data$
declare payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'season',(select to_jsonb(s) from public.license_seasons s where s.id=p_season),
    'divisions',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from public.license_season_divisions d where d.season_id=p_season),
    'current_driver_standings',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'season_division_id',d.id,'division_name',d.division_name,'member_id',rs.member_id,
        'driver_name_snapshot',max(rs.driver_name_snapshot),'team_id_snapshot',max(rs.team_id_snapshot),
        'team_name_snapshot',max(rs.team_name_snapshot),'final_points',sum(rs.points_total)
      ) order by sum(rs.points_total) desc),'[]'::jsonb)
      from public.license_round_standings rs
      join public.license_rounds r on r.id=rs.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
        and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
      group by d.id,d.division_name,rs.member_id
    ),
    'driver_standings',(
      select coalesce(jsonb_agg(to_jsonb(fs)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_final_standings fs
      join public.license_season_divisions d on d.id=fs.season_division_id
      where d.season_id=p_season
    ),
    'team_standings',(
      select coalesce(jsonb_agg(to_jsonb(ts)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_team_final_standings ts
      join public.license_season_divisions d on d.id=ts.season_division_id
      where d.season_id=p_season
    ),
    'rounds',(
      select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('division_name',d.division_name)),'[]'::jsonb)
      from public.license_rounds r
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
    ),
    'race_results',(
      select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('round_number',r.round_number,'division_name',d.division_name)),'[]'::jsonb)
      from public.caleris_race_result_entries e
      join public.license_rounds r on r.id=e.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season
        and lower(coalesce(r.race_lifecycle_status,r.status,''))in('completed','closed')
    ),
    'scoring_rules',(
      select coalesce(jsonb_agg(to_jsonb(pr)),'[]'::jsonb)
      from public.caleris_race_points_rules pr where pr.is_active
    )
  ) into payload;
  if payload->'season' is null or payload->'season'='null'::jsonb then raise exception 'season_not_found'; end if;
  return coalesce(payload,'{}'::jsonb);
end;
$season_data$;

commit;
