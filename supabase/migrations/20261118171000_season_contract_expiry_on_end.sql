begin;
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
        where p.season_id=s.id
          and p.period_type='end_season'
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
    where c.status='active'
      and c.season_id in (select id from completed_seasons)
    returning c.id
  )
  select (select count(*) from completed_seasons),
         (select count(*) from ended_contracts)
  into v_completed,v_contracts_ended;

  if not exists(select 1 from public.license_seasons where status='active') then
    select count(*),(array_agg(next_season.id))[1]
    into v_candidates,v_candidate
    from public.license_seasons next_season
    where next_season.status='draft'
      and next_season.starts_on<=v_today
      and (select count(*) from public.season_calendar_periods p where p.season_id=next_season.id)=12
      and exists(
        select 1
        from public.license_seasons previous_season
        join public.season_calendar_periods off_period
          on off_period.season_id=previous_season.id
         and off_period.period_type='off_season'
        where previous_season.status='completed'
          and next_season.starts_on=off_period.ends_on+1
          and v_today>off_period.ends_on
      );

    if v_candidates=1 then
      v_roster:=private.sync_season_roster(v_candidate);
      if coalesce((v_roster->>'ready')::boolean,false) then
        update public.license_seasons
        set status='active'
        where id=v_candidate and status='draft';

        if found then
          update public.license_season_divisions
          set status='active'
          where season_id=v_candidate and status='draft';
          v_activated:=1;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'today',v_today,
    'seasons_completed',v_completed,
    'contracts_ended',v_contracts_ended,
    'seasons_activated',v_activated,
    'roster_sync',v_roster
  );
end;
$$;
revoke all on function private.process_season_lifecycle() from public,anon,authenticated,service_role;
commit;
