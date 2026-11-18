-- One-click CALERIS MASTERS season setup. The event has two fixed divisions
-- and a complete 12-period calendar with three race rounds in each Race Period.
create or replace function public.fia_create_caleris_season(p_start_date date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_season_id uuid;
  v_season_number integer;
  v_season_key text;
  v_title text;
  v_premio_id uuid;
  v_zwei_id uuid;
  v_premio_rounds uuid[]:=array[]::uuid[];
  v_zwei_rounds uuid[]:=array[]::uuid[];
  v_round_id uuid;
  v_round_number integer;
  v_day_offset integer;
  v_race_period integer;
  v_round_in_period integer;
  v_periods jsonb;
  v_calendar jsonb;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya Admin atau FIA yang dapat membuat season CALERIS MASTERS.';
  end if;
  if p_start_date is null then
    raise exception 'Tanggal mulai Pre Season wajib diisi.';
  end if;
  if p_start_date<v_today then
    raise exception 'Pre Season tidak boleh dimulai sebelum tanggal server hari ini.';
  end if;
  if exists(
    select 1 from public.license_seasons
    where status='draft' and season_key like 'caleris-masters-season-%'
  ) then
    raise exception 'Masih ada draft CALERIS MASTERS. Selesaikan atau jadwalkan ulang season tersebut terlebih dahulu.';
  end if;

  select count(*)+1 into v_season_number from public.license_seasons;
  v_season_key:='caleris-masters-season-'||v_season_number;
  while exists(select 1 from public.license_seasons where season_key=v_season_key) loop
    v_season_number:=v_season_number+1;
    v_season_key:='caleris-masters-season-'||v_season_number;
  end loop;
  v_title:='Caleris Masters Season '||v_season_number;

  insert into public.license_seasons(season_key,title,starts_on,ends_on,status,created_by)
  values(v_season_key,v_title,p_start_date,p_start_date+41,'draft',(select auth.uid()))
  returning id into v_season_id;

  insert into public.license_season_divisions(season_id,division_key,division_name,status)
  values(v_season_id,'premio','Caleris Premio','draft')
  returning id into v_premio_id;
  insert into public.license_season_divisions(season_id,division_key,division_name,status)
  values(v_season_id,'zwei','Caleris Zwei','draft')
  returning id into v_zwei_id;

  -- Five Race Periods × three rounds. Every division runs on the same
  -- calendar dates, and each round opens/closes check-in on its own race day.
  for v_round_number in 1..15 loop
    v_race_period:=((v_round_number-1)/3)::integer+1;
    v_round_in_period:=((v_round_number-1)%3)+1;
    v_day_offset:=7+((v_race_period-1)*5)+(v_round_in_period-1);

    insert into public.license_rounds(
      season_division_id,round_number,title,checkin_opens_at,checkin_closes_at,status,session_type
    ) values(
      v_premio_id,v_round_number,'Round '||lpad(v_round_number::text,2,'0'),
      ((p_start_date+v_day_offset)::timestamp+time '00:00:00') at time zone 'Asia/Jakarta',
      ((p_start_date+v_day_offset)::timestamp+time '23:59:59') at time zone 'Asia/Jakarta',
      'scheduled','race'
    ) returning id into v_round_id;
    v_premio_rounds:=array_append(v_premio_rounds,v_round_id);

    insert into public.license_rounds(
      season_division_id,round_number,title,checkin_opens_at,checkin_closes_at,status,session_type
    ) values(
      v_zwei_id,v_round_number,'Round '||lpad(v_round_number::text,2,'0'),
      ((p_start_date+v_day_offset)::timestamp+time '00:00:00') at time zone 'Asia/Jakarta',
      ((p_start_date+v_day_offset)::timestamp+time '23:59:59') at time zone 'Asia/Jakarta',
      'scheduled','race'
    ) returning id into v_round_id;
    v_zwei_rounds:=array_append(v_zwei_rounds,v_round_id);
  end loop;

  v_periods:=jsonb_build_array(
    jsonb_build_object('period_type','pre_season','title','Pre Season','starts_on',p_start_date,'ends_on',p_start_date+6),
    jsonb_build_object('period_type','race_period','title','Race Period 1','starts_on',p_start_date+7,'ends_on',p_start_date+9,
      'assignments',jsonb_build_array(
        jsonb_build_object('season_division_id',v_premio_id,'round_ids',to_jsonb(v_premio_rounds[1:3])),
        jsonb_build_object('season_division_id',v_zwei_id,'round_ids',to_jsonb(v_zwei_rounds[1:3])))),
    jsonb_build_object('period_type','race_break','title','Break Balancing 1','starts_on',p_start_date+10,'ends_on',p_start_date+11),
    jsonb_build_object('period_type','race_period','title','Race Period 2','starts_on',p_start_date+12,'ends_on',p_start_date+14,
      'assignments',jsonb_build_array(
        jsonb_build_object('season_division_id',v_premio_id,'round_ids',to_jsonb(v_premio_rounds[4:6])),
        jsonb_build_object('season_division_id',v_zwei_id,'round_ids',to_jsonb(v_zwei_rounds[4:6])))),
    jsonb_build_object('period_type','race_break','title','Break Balancing 2','starts_on',p_start_date+15,'ends_on',p_start_date+16),
    jsonb_build_object('period_type','race_period','title','Race Period 3','starts_on',p_start_date+17,'ends_on',p_start_date+19,
      'assignments',jsonb_build_array(
        jsonb_build_object('season_division_id',v_premio_id,'round_ids',to_jsonb(v_premio_rounds[7:9])),
        jsonb_build_object('season_division_id',v_zwei_id,'round_ids',to_jsonb(v_zwei_rounds[7:9])))),
    jsonb_build_object('period_type','race_break','title','Break Balancing 3','starts_on',p_start_date+20,'ends_on',p_start_date+21),
    jsonb_build_object('period_type','race_period','title','Race Period 4','starts_on',p_start_date+22,'ends_on',p_start_date+24,
      'assignments',jsonb_build_array(
        jsonb_build_object('season_division_id',v_premio_id,'round_ids',to_jsonb(v_premio_rounds[10:12])),
        jsonb_build_object('season_division_id',v_zwei_id,'round_ids',to_jsonb(v_zwei_rounds[10:12])))),
    jsonb_build_object('period_type','race_break','title','Break Balancing 4','starts_on',p_start_date+25,'ends_on',p_start_date+26),
    jsonb_build_object('period_type','race_period','title','Race Period 5','starts_on',p_start_date+27,'ends_on',p_start_date+29,
      'assignments',jsonb_build_array(
        jsonb_build_object('season_division_id',v_premio_id,'round_ids',to_jsonb(v_premio_rounds[13:15])),
        jsonb_build_object('season_division_id',v_zwei_id,'round_ids',to_jsonb(v_zwei_rounds[13:15])))),
    jsonb_build_object('period_type','end_season','title','End Season','starts_on',p_start_date+30,'ends_on',p_start_date+34),
    jsonb_build_object('period_type','off_season','title','Off Season','starts_on',p_start_date+35,'ends_on',p_start_date+41)
  );

  v_calendar:=public.fia_create_season_calendar(v_season_id,v_periods);
  return jsonb_build_object(
    'season_id',v_season_id,'season_key',v_season_key,'title',v_title,
    'event_name','Caleris Masters','divisions_created',2,
    'rounds_per_division',15,'periods_created',12,
    'starts_on',p_start_date,'ends_on',p_start_date+41,
    'calendar',v_calendar
  );
end;
$$;

revoke all on function public.fia_create_caleris_season(date) from public,anon;
grant execute on function public.fia_create_caleris_season(date) to authenticated;

-- The first CALERIS season has no completed predecessor to unlock it.
-- Once its start date arrives, it follows the same contract-backed roster
-- readiness checks as every subsequent season.
create or replace function private.process_season_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_completed integer:=0;
  v_contracts_ended integer:=0;
  v_activated integer:=0;
  v_candidate uuid;
  v_candidates integer;
  v_roster jsonb;
begin
  with completed_seasons as (
    update public.license_seasons s
    set status='completed'
    where s.status='active'
      and exists(
        select 1 from public.season_calendar_periods p
        where p.season_id=s.id and p.period_type='end_season'
          and v_today between p.starts_on and p.ends_on
      )
      and exists(select 1 from public.license_season_divisions d where d.season_id=s.id)
      and not exists(
        select 1 from public.license_season_divisions d
        where d.season_id=s.id and d.status<>'completed'
      )
    returning s.id
  ), ended_contracts as (
    update public.economy_driver_contracts c
    set status='ended',updated_at=now()
    where c.status='active' and c.season_id in (select id from completed_seasons)
    returning c.id
  )
  select (select count(*) from completed_seasons),
         (select count(*) from ended_contracts)
  into v_completed,v_contracts_ended;

  if not exists(select 1 from public.license_seasons where status='active') then
    select count(*),(array_agg(next_season.id order by next_season.starts_on,next_season.created_at))[1]
    into v_candidates,v_candidate
    from public.license_seasons next_season
    where next_season.status='draft'
      and next_season.starts_on<=v_today
      and (select count(*) from public.season_calendar_periods p where p.season_id=next_season.id)=12
      and (
        not exists(select 1 from public.license_seasons prior where prior.status='completed')
        or exists(
          select 1
          from public.license_seasons previous_season
          join public.season_calendar_periods off_period
            on off_period.season_id=previous_season.id and off_period.period_type='off_season'
          where previous_season.status='completed'
            and next_season.starts_on=off_period.ends_on+1
            and v_today>off_period.ends_on
        )
      );

    if v_candidates=1 then
      v_roster:=private.sync_season_roster(v_candidate);
      if coalesce((v_roster->>'ready')::boolean,false) then
        update public.license_seasons set status='active'
        where id=v_candidate and status='draft';
        if found then
          update public.license_season_divisions set status='active'
          where season_id=v_candidate and status='draft';
          v_activated:=1;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'today',v_today,'seasons_completed',v_completed,'contracts_ended',v_contracts_ended,
    'seasons_activated',v_activated,'roster_sync',v_roster
  );
end;
$$;

revoke all on function private.process_season_lifecycle() from public,anon,authenticated;
grant execute on function private.process_season_lifecycle() to service_role;
