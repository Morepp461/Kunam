begin;
create or replace function private.sync_season_roster(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_season public.license_seasons%rowtype;
  v_division record;
  v_driver_count integer;
  v_roster_count integer:=0;
  v_team_count integer:=0;
  v_period_count integer;
  v_race_period_count integer;
  v_break_count integer;
  v_unmapped integer;
begin
  select * into v_season
  from public.license_seasons
  where id=p_season_id
  for update;

  if not found or v_season.status<>'draft' then
    return jsonb_build_object('ready',false,'reason','target_season_not_draft');
  end if;

  select count(*) into v_period_count
  from public.season_calendar_periods where season_id=p_season_id;
  if not exists(select 1 from public.license_season_divisions where season_id=p_season_id) then
    return jsonb_build_object('ready',false,'reason','season_has_no_divisions');
  end if;
  select count(*) into v_race_period_count
  from public.season_calendar_periods where season_id=p_season_id and period_type='race_period';
  select count(*) into v_break_count
  from public.season_calendar_periods where season_id=p_season_id and period_type='race_break';

  if v_period_count<>12 or v_race_period_count<>5 or v_break_count<>4
    or not exists(select 1 from public.season_calendar_periods where season_id=p_season_id and period_type='pre_season')
    or not exists(select 1 from public.season_calendar_periods where season_id=p_season_id and period_type='end_season')
    or not exists(select 1 from public.season_calendar_periods where season_id=p_season_id and period_type='off_season') then
    return jsonb_build_object('ready',false,'reason','calendar_not_complete');
  end if;

  if (select array_agg(period_type order by sort_order) from public.season_calendar_periods where season_id=p_season_id)
    is distinct from array['pre_season','race_period','race_break','race_period','race_break','race_period','race_break','race_period','race_break','race_period','end_season','off_season']::text[] then
    return jsonb_build_object('ready',false,'reason','calendar_period_sequence_invalid');
  end if;

  if exists(
    select 1 from (
      select starts_on,lag(ends_on) over(order by sort_order) as previous_end
      from public.season_calendar_periods where season_id=p_season_id
    ) dates
    where previous_end is not null and starts_on<>previous_end+1
  ) then
    return jsonb_build_object('ready',false,'reason','calendar_dates_not_contiguous');
  end if;

  if exists(
    select 1
    from public.license_season_divisions d
    where d.season_id=p_season_id
      and (
        (select count(*) from public.season_calendar_periods p where p.season_id=p_season_id and p.period_type='race_period')<>5
        or exists(
          select 1 from public.season_calendar_periods p
          where p.season_id=p_season_id and p.period_type='race_period'
            and (select count(*) from public.season_period_rounds pr where pr.period_id=p.id and pr.season_division_id=d.id) not between 3 and 5
        )
      )
  ) then
    return jsonb_build_object('ready',false,'reason','race_period_round_count_invalid');
  end if;

  select count(*) into v_unmapped
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  where d.season_id=p_season_id
    and not exists(select 1 from public.season_period_rounds pr where pr.round_id=r.id);
  if v_unmapped>0 then
    return jsonb_build_object('ready',false,'reason','rounds_not_mapped');
  end if;

  -- A transfer approved for the window must finish before the new roster is frozen.
  if exists(
    select 1 from public.caleris_driver_move_negotiations n
    where n.move_type='transfer'
      and n.status in ('approved','approved_waiting_window')
  ) then
    return jsonb_build_object('ready',false,'reason','approved_transfers_pending_execution');
  end if;

  for v_division in
    select d.id,d.division_key
    from public.license_season_divisions d
    where d.season_id=p_season_id
    order by d.division_key
  loop
    select count(*) into v_driver_count
    from public.members m
    where m.role='Driver'
      and private.season_driver_effective_team(p_season_id,m.id) is not null
      and exists(
        select 1 from public.teams t
        where t.id=private.season_driver_effective_team(p_season_id,m.id)
          and lower(t.division_key)=lower(v_division.division_key)
      );
    if v_driver_count=0 then
      return jsonb_build_object('ready',false,'reason','division_has_no_active_contracted_drivers','division_key',v_division.division_key);
    end if;
  end loop;

  -- Keep existing draft registration rows for audit; mark non-eligible rows as
  -- inactive rather than deleting them.
  update public.license_season_members sm
  set is_hiatus=true
  where sm.season_id=p_season_id
    and not exists(
      select 1
      from public.members m
      where m.id=sm.member_id and m.role='Driver'
        and private.season_driver_effective_team(p_season_id,m.id) is not null
        and exists(
          select 1 from public.teams t
          join public.license_season_divisions d
            on d.season_id=p_season_id and lower(d.division_key)=lower(t.division_key)
          where t.id=private.season_driver_effective_team(p_season_id,m.id)
            and d.id=sm.season_division_id
        )
    );

  insert into public.license_season_members(
    season_id,season_division_id,member_id,is_hiatus,preserved_license
  )
  select p_season_id,d.id,m.id,false,m.license
  from public.members m
  join public.teams t on t.id=private.season_driver_effective_team(p_season_id,m.id)
  join public.license_season_divisions d
    on d.season_id=p_season_id and lower(d.division_key)=lower(t.division_key)
  where m.role='Driver'
  on conflict(member_id,season_id) do update
    set season_division_id=excluded.season_division_id,
        is_hiatus=false,
        preserved_license=coalesce(excluded.preserved_license,public.license_season_members.preserved_license);

  insert into public.license_season_team_snapshots(season_id,season_division_id,team_id,team_name_snapshot)
  select p_season_id,d.id,t.id,t.name
  from public.license_season_divisions d
  join public.teams t on lower(t.division_key)=lower(d.division_key)
  where d.season_id=p_season_id
  on conflict(season_id,team_id) do nothing;

  insert into public.license_season_roster_snapshots(
    season_id,season_division_id,member_id,team_id,contract_id,
    driver_name_snapshot,team_name_snapshot,annual_salary_snapshot
  )
  select p_season_id,d.id,m.id,t.id,c.id,
    coalesce(m.character_name,'Driver'),t.name,c.annual_salary
  from public.members m
  join public.teams t on t.id=private.season_driver_effective_team(p_season_id,m.id)
  join public.license_season_divisions d
    on d.season_id=p_season_id and lower(d.division_key)=lower(t.division_key)
  join public.economy_driver_contracts c
    on c.season_id=p_season_id and c.member_id=m.id and c.status='active'
  where m.role='Driver'
    and (
      c.team_id=t.id
      or exists(
        select 1 from public.caleris_driver_move_negotiations n
        where n.driver_member_id=m.id and n.move_type='loan'
          and n.loan_season_id=p_season_id and n.seller_team_id=c.team_id
          and n.buyer_team_id=t.id and n.status in ('approved_waiting_window','loan_active')
          and n.loan_starts_on=v_season.starts_on and n.loan_ends_on=v_season.ends_on
      )
    )
  on conflict(season_id,member_id) do nothing;

  select count(*) into v_roster_count
  from public.license_season_roster_snapshots where season_id=p_season_id;

  -- Seed the new championship tables with zero points. The prior season's
  -- standings and race results remain untouched under their original IDs.
  insert into public.license_round_standings(
    round_id,member_id,points_total,driver_name_snapshot,team_id_snapshot,team_name_snapshot
  )
  select r.id,s.member_id,0,s.driver_name_snapshot,s.team_id,s.team_name_snapshot
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  join public.license_season_roster_snapshots s on s.season_division_id=d.id
  where d.season_id=p_season_id
  on conflict(round_id,member_id) do nothing;

  insert into public.license_final_standings(
    season_division_id,member_id,final_points,final_position,
    driver_name_snapshot,team_id_snapshot,team_name_snapshot
  )
  select s.season_division_id,s.member_id,0,
    row_number() over(partition by s.season_division_id order by s.driver_name_snapshot,s.member_id)::integer,
    s.driver_name_snapshot,s.team_id,s.team_name_snapshot
  from public.license_season_roster_snapshots s
  where s.season_id=p_season_id
  on conflict(season_division_id,member_id) do nothing;

  insert into public.license_team_final_standings(
    season_division_id,team_id,final_points,final_position,team_name_snapshot
  )
  select d.id,t.id,0,
    row_number() over(partition by d.id order by t.name,t.id)::integer,
    t.name
  from public.license_season_divisions d
  join public.teams t on lower(t.division_key)=lower(d.division_key)
  where d.season_id=p_season_id
  on conflict(season_division_id,team_id) do nothing;

  select count(*) into v_team_count
  from public.license_team_final_standings fs
  join public.license_season_divisions d on d.id=fs.season_division_id
  where d.season_id=p_season_id;

  return jsonb_build_object(
    'ready',true,'season_id',p_season_id,
    'drivers_snapshotted',v_roster_count,'teams_in_standings',v_team_count,
    'round_standing_rows',(select count(*) from public.license_round_standings rs
      join public.license_rounds r on r.id=rs.round_id
      join public.license_season_divisions d on d.id=r.season_division_id
      where d.season_id=p_season_id)
  );
end;
$$;
revoke all on function private.sync_season_roster(uuid) from public,anon,authenticated,service_role;
commit;
