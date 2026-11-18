begin;

-- A season roster is a historical contract-backed snapshot, not a live join to
-- today's members.team_id or today's team name.
create table if not exists public.license_season_roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  season_division_id uuid not null references public.license_season_divisions(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  contract_id uuid not null references public.economy_driver_contracts(id) on delete restrict,
  driver_name_snapshot text not null,
  team_name_snapshot text not null,
  annual_salary_snapshot numeric(20,2) not null check (annual_salary_snapshot > 0),
  created_at timestamptz not null default now(),
  unique(season_id,member_id)
);
create index if not exists license_season_roster_snapshots_division_idx
  on public.license_season_roster_snapshots(season_division_id,team_id,member_id);
create table if not exists public.license_season_team_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  season_division_id uuid not null references public.license_season_divisions(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  team_name_snapshot text not null,
  created_at timestamptz not null default now(),
  unique(season_id,team_id),
  unique(season_division_id,team_id)
);
create index if not exists license_season_team_snapshots_division_idx
  on public.license_season_team_snapshots(season_division_id,team_id);
alter table public.license_season_team_snapshots enable row level security;
revoke all on public.license_season_team_snapshots from public,anon,authenticated,service_role;
grant select on public.license_season_team_snapshots to authenticated;
drop policy if exists "Authenticated members read season team snapshots" on public.license_season_team_snapshots;
create policy "Authenticated members read season team snapshots"
  on public.license_season_team_snapshots for select to authenticated using (true);
alter table public.license_season_roster_snapshots enable row level security;
revoke all on public.license_season_roster_snapshots from public,anon,authenticated,service_role;
grant select on public.license_season_roster_snapshots to authenticated;
drop policy if exists "Authenticated members read season roster snapshots" on public.license_season_roster_snapshots;
create policy "Authenticated members read season roster snapshots"
  on public.license_season_roster_snapshots for select to authenticated using (true);

create or replace function private.guard_season_roster_snapshot_immutable()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  raise exception 'Season roster snapshots are permanent and cannot be changed or deleted.';
end;
$$;
drop trigger if exists license_season_roster_snapshot_immutable on public.license_season_roster_snapshots;
create trigger license_season_roster_snapshot_immutable
before update or delete on public.license_season_roster_snapshots
for each row execute function private.guard_season_roster_snapshot_immutable();
drop trigger if exists license_season_team_snapshot_immutable on public.license_season_team_snapshots;
create trigger license_season_team_snapshot_immutable
before update or delete on public.license_season_team_snapshots
for each row execute function private.guard_season_roster_snapshot_immutable();

-- Keep display labels and team assignment stable even if a character or team
-- is renamed or the Driver moves after the season has ended.
alter table public.caleris_race_result_entries
  add column if not exists driver_name_snapshot text,
  add column if not exists team_name_snapshot text;
alter table public.license_round_standings
  add column if not exists driver_name_snapshot text,
  add column if not exists team_id_snapshot uuid references public.teams(id) on delete restrict,
  add column if not exists team_name_snapshot text;
alter table public.license_final_standings
  add column if not exists driver_name_snapshot text,
  add column if not exists team_id_snapshot uuid references public.teams(id) on delete restrict,
  add column if not exists team_name_snapshot text;
alter table public.license_team_final_standings
  add column if not exists team_name_snapshot text;

create or replace function private.snapshot_race_result_entry_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_season_id uuid;
  v_snapshot public.license_season_roster_snapshots%rowtype;
  v_member public.members%rowtype;
  v_team_name text;
begin
  if tg_op='UPDATE' and old.driver_name_snapshot is not null then
    new.driver_name_snapshot:=old.driver_name_snapshot;
    new.team_name_snapshot:=old.team_name_snapshot;
    new.team_id:=old.team_id;
    return new;
  end if;

  select d.season_id into v_season_id
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  where r.id=new.round_id;

  if v_season_id is not null then
    select * into v_snapshot
    from public.license_season_roster_snapshots s
    where s.season_id=v_season_id and s.member_id=new.member_id;

    if found then
      new.team_id:=v_snapshot.team_id;
      new.driver_name_snapshot:=v_snapshot.driver_name_snapshot;
      new.team_name_snapshot:=v_snapshot.team_name_snapshot;
      return new;
    end if;
  end if;

  select * into v_member from public.members where id=new.member_id;
  if new.driver_name_snapshot is null then
    new.driver_name_snapshot:=coalesce(v_member.character_name,'Driver');
  end if;
  if new.team_id is null then new.team_id:=v_member.team_id; end if;
  select t.name into v_team_name from public.teams t where t.id=new.team_id;
  if new.team_name_snapshot is null then new.team_name_snapshot:=v_team_name; end if;
  return new;
end;
$$;
drop trigger if exists caleris_race_result_entry_identity_snapshot on public.caleris_race_result_entries;
create trigger caleris_race_result_entry_identity_snapshot
before insert or update on public.caleris_race_result_entries
for each row execute function private.snapshot_race_result_entry_identity();

create or replace function private.snapshot_season_standing_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_division_id uuid;
  v_season_id uuid;
  v_roster public.license_season_roster_snapshots%rowtype;
begin
  if tg_table_name='license_round_standings' then
    select d.id,d.season_id into v_division_id,v_season_id
    from public.license_rounds r
    join public.license_season_divisions d on d.id=r.season_division_id
    where r.id=new.round_id;
  else
    v_division_id:=new.season_division_id;
    select season_id into v_season_id from public.license_season_divisions where id=v_division_id;
  end if;
  if v_season_id is not null and tg_table_name<>'license_team_final_standings' then
    select * into v_roster from public.license_season_roster_snapshots
    where season_id=v_season_id and season_division_id=v_division_id and member_id=new.member_id;
    if found then
      new.driver_name_snapshot:=coalesce(new.driver_name_snapshot,v_roster.driver_name_snapshot);
      new.team_id_snapshot:=coalesce(new.team_id_snapshot,v_roster.team_id);
      new.team_name_snapshot:=coalesce(new.team_name_snapshot,v_roster.team_name_snapshot);
    end if;
  elsif v_season_id is not null then
    select team_name_snapshot into new.team_name_snapshot
    from public.license_season_team_snapshots
    where season_id=v_season_id and season_division_id=v_division_id and team_id=new.team_id;
  end if;
  return new;
end;
$$;
drop trigger if exists license_round_standings_identity_snapshot on public.license_round_standings;
create trigger license_round_standings_identity_snapshot
before insert or update on public.license_round_standings
for each row execute function private.snapshot_season_standing_identity();
drop trigger if exists license_final_standings_identity_snapshot on public.license_final_standings;
create trigger license_final_standings_identity_snapshot
before insert or update on public.license_final_standings
for each row execute function private.snapshot_season_standing_identity();
drop trigger if exists license_team_final_standings_identity_snapshot on public.license_team_final_standings;
create trigger license_team_final_standings_identity_snapshot
before insert or update on public.license_team_final_standings
for each row execute function private.snapshot_season_standing_identity();

-- Resolve the team that a Driver represents for one particular season.
-- A full-season loan is represented by the borrower team, while the salary
-- contract remains attached to the lending team for split-payroll settlement.
create or replace function private.season_driver_effective_team(p_season_id uuid,p_member_id uuid)
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select case when loan.buyer_team_id is not null then loan.buyer_team_id else m.team_id end
  from public.members m
  join public.license_seasons s on s.id=p_season_id
  join public.economy_driver_contracts c
    on c.season_id=s.id and c.member_id=m.id and c.status='active'
  left join lateral (
    select n.buyer_team_id
    from public.caleris_driver_move_negotiations n
    where n.driver_member_id=m.id
      and n.move_type='loan'
      and n.loan_season_id=s.id
      and n.seller_team_id=c.team_id
      and n.status in ('approved_waiting_window','loan_active')
      and n.loan_starts_on=s.starts_on
      and n.loan_ends_on=s.ends_on
      and (
        (n.status='approved_waiting_window' and m.team_id=n.seller_team_id)
        or (n.status='loan_active' and m.team_id=n.buyer_team_id)
      )
    order by n.created_at desc
    limit 1
  ) loan on true
  where m.id=p_member_id
    and m.role='Driver'
    and (
      c.team_id=m.team_id
      or loan.buyer_team_id is not null
    )
  order by c.created_at desc
  limit 1;
$$;
revoke all on function private.season_driver_effective_team(uuid,uuid) from public,anon,authenticated,service_role;

-- Reject manual draft registrations that do not have a live contract for the
-- exact target season and division. This also protects direct PostgREST writes.
create or replace function private.guard_draft_season_member_contract()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
  v_effective_team uuid;
  v_division_key text;
  v_team_division text;
begin
  select s.status,d.division_key
    into v_status,v_division_key
  from public.license_seasons s
  join public.license_season_divisions d on d.season_id=s.id
  where s.id=new.season_id and d.id=new.season_division_id;

  if v_status='draft' then
    v_effective_team:=private.season_driver_effective_team(new.season_id,new.member_id);
    select division_key into v_team_division from public.teams where id=v_effective_team;
    if v_effective_team is null or lower(coalesce(v_team_division,''))<>lower(coalesce(v_division_key,'')) then
      raise exception 'Driver hanya dapat masuk roster draft jika memiliki kontrak aktif untuk season tujuan dan tim/divisi sesuai.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists license_season_member_contract_guard on public.license_season_members;
create trigger license_season_member_contract_guard
before insert or update of season_id,season_division_id,member_id
on public.license_season_members
for each row execute function private.guard_draft_season_member_contract();
revoke all on function private.guard_draft_season_member_contract() from public,anon,authenticated,service_role;

-- Build the next season standings from its actual contract-backed roster.
-- Historical season rows are never deleted or rewritten.
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

-- Replace the lifecycle worker without changing its existing schedule. It only
-- activates a fully configured season after its roster and zeroed standings
-- have been snapshotted successfully.
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
