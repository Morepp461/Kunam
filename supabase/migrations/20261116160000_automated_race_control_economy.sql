begin;

alter table public.license_rounds
  add column if not exists session_type text not null default 'race'
  check (session_type in ('race','sprint'));

alter table public.caleris_race_result_entries
  add column if not exists grid_position integer check (grid_position is null or grid_position > 0),
  add column if not exists finish_time_ms integer check (finish_time_ms is null or finish_time_ms > 0),
  add column if not exists gap_ms integer check (gap_ms is null or gap_ms >= 0);

alter table public.caleris_race_results
  add column if not exists driver_of_day_member_id uuid references public.members(id) on delete restrict,
  add column if not exists fastest_lap_member_id uuid references public.members(id) on delete restrict,
  add column if not exists fastest_lap_ms integer check (fastest_lap_ms is null or fastest_lap_ms > 0);

create table if not exists public.caleris_race_stints (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.license_rounds(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  stint_number integer not null check (stint_number > 0),
  tyre_compound text not null check (tyre_compound in ('soft','medium','hard','intermediate','wet')),
  created_at timestamptz not null default now(),
  unique(round_id,member_id,stint_number)
);
alter table public.caleris_race_stints enable row level security;
revoke all on public.caleris_race_stints from public,anon,authenticated,service_role;
grant select on public.caleris_race_stints to authenticated;
create policy "Authenticated members read race stints" on public.caleris_race_stints
  for select to authenticated using (true);
create index if not exists caleris_race_stints_round_idx on public.caleris_race_stints(round_id,member_id,stint_number);

create table if not exists public.caleris_race_points_rules (
  session_type text not null check (session_type in ('race','sprint')),
  finishing_position integer not null check (finishing_position > 0),
  points numeric(8,2) not null check (points >= 0),
  pole_bonus numeric(8,2) not null default 0 check (pole_bonus >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(session_type,finishing_position)
);
alter table public.caleris_race_points_rules enable row level security;
revoke all on public.caleris_race_points_rules from public,anon,authenticated,service_role;
grant select on public.caleris_race_points_rules to authenticated;
create policy "Authenticated members read race points rules" on public.caleris_race_points_rules
  for select to authenticated using (true);
insert into public.caleris_race_points_rules(session_type,finishing_position,points,pole_bonus)
values
 ('race',1,25,2),('race',2,18,0),('race',3,15,0),('race',4,12,0),('race',5,10,0),
 ('race',6,8,0),('race',7,6,0),('race',8,4,0),('race',9,2,0),('race',10,1,0),
 ('sprint',1,6,2),('sprint',2,5,0),('sprint',3,4,0),('sprint',4,3,0),('sprint',5,2,0),('sprint',6,1,0)
on conflict(session_type,finishing_position) do nothing;

create or replace function public.fia_submit_race_classification(
  p_round_id uuid,
  p_entries jsonb,
  p_driver_of_day_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_round public.license_rounds%rowtype;
  v_division public.license_season_divisions%rowtype;
  v_entry jsonb;
  v_member_id uuid;
  v_team_id uuid;
  v_status text;
  v_position integer;
  v_grid integer;
  v_finish_ms integer;
  v_fastest_ms integer;
  v_pole_id uuid;
  v_winner_id uuid;
  v_fastest_driver uuid;
  v_fastest_time integer;
  v_count integer;
  v_registered integer;
  v_points numeric;
  v_previous numeric;
  v_cumulative numeric;
  v_result jsonb;
  v_payroll jsonb;
  v_repayments jsonb;
  v_finalized jsonb;
  v_payout jsonb;
  v_has_wdc boolean;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat mengesahkan hasil race.';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries)=0 then
    raise exception 'Data klasifikasi race wajib berupa daftar Driver.';
  end if;
  select * into v_round from public.license_rounds where id=p_round_id for update;
  if not found or v_round.status='closed' then raise exception 'Round tidak tersedia atau sudah ditutup.'; end if;
  if v_round.checkin_closes_at > now() then raise exception 'Race hanya dapat disahkan setelah periode check-in berakhir.'; end if;
  if exists(select 1 from public.license_rounds p where p.season_division_id=v_round.season_division_id and p.round_number<v_round.round_number and p.status<>'closed') then
    raise exception 'Round harus disahkan secara berurutan.';
  end if;
  select * into v_division from public.license_season_divisions where id=v_round.season_division_id;
  select count(*) into v_registered from public.license_season_members where season_division_id=v_round.season_division_id and not is_hiatus;
  if jsonb_array_length(p_entries)<>v_registered then
    raise exception 'Klasifikasi harus memuat seluruh Driver aktif yang terdaftar (%).',v_registered;
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as x(member_id uuid)
    group by member_id having count(*)>1
  ) then raise exception 'Driver duplikat ditemukan.'; end if;

  select x.member_id into v_pole_id
  from jsonb_to_recordset(p_entries) as x(member_id uuid,grid_position integer)
  where x.grid_position=1;
  if v_pole_id is null then raise exception 'Grid position P1 wajib diisi untuk menentukan Pole Position.'; end if;
  select x.member_id into v_winner_id
  from jsonb_to_recordset(p_entries) as x(member_id uuid,finish_status text,finishing_position integer)
  where x.finish_status='finished' and x.finishing_position=1;
  if v_winner_id is null then raise exception 'Harus ada tepat satu pemenang dengan posisi P1.'; end if;
  if (select count(*) from jsonb_to_recordset(p_entries) as x(member_id uuid,finish_status text,finishing_position integer) where x.finish_status='finished' and x.finishing_position=1)<>1 then
    raise exception 'Posisi P1 hanya boleh dimiliki satu Driver.';
  end if;
  if p_driver_of_day_member_id is null then raise exception 'Driver of the Day wajib dipilih.'; end if;
  if p_driver_of_day_member_id is not null and not exists (
    select 1 from jsonb_to_recordset(p_entries) as x(member_id uuid) where x.member_id=p_driver_of_day_member_id
  ) then raise exception 'Driver of the Day harus berasal dari klasifikasi race ini.'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_entries) as x(member_id uuid,grid_position integer,finish_status text,finishing_position integer,finish_time_ms integer,fastest_lap_ms integer,stints jsonb)
    left join public.license_season_members sm on sm.member_id=x.member_id and sm.season_division_id=v_round.season_division_id and not sm.is_hiatus
    left join public.members m on m.id=x.member_id
    where sm.id is null or m.role is distinct from 'Driver'
      or x.grid_position is null or x.grid_position<1
      or x.finish_status not in ('finished','dnf','dns','dsq')
      or (x.finish_status='finished' and (x.finishing_position is null or x.finishing_position<1 or x.finish_time_ms is null or x.finish_time_ms<1))
      or (x.finish_status<>'finished' and x.finishing_position is not null)
      or (x.fastest_lap_ms is not null and x.fastest_lap_ms<1)
      or jsonb_typeof(coalesce(x.stints,'[]'::jsonb))<>'array'
      or jsonb_array_length(coalesce(x.stints,'[]'::jsonb))=0
      or exists(select 1 from jsonb_array_elements_text(coalesce(x.stints,'[]'::jsonb)) s(value) where s.value not in ('soft','medium','hard','intermediate','wet'))
  ) then raise exception 'Ada data Driver, waktu, status, atau compound ban yang tidak valid.'; end if;
  if (select count(distinct x.grid_position) from jsonb_to_recordset(p_entries) as x(grid_position integer))<>v_registered then
    raise exception 'Grid position harus unik untuk seluruh Driver.';
  end if;
  if (select count(distinct x.finishing_position) from jsonb_to_recordset(p_entries) as x(finish_status text,finishing_position integer) where x.finish_status='finished')<>
     (select count(*) from jsonb_to_recordset(p_entries) as x(finish_status text) where x.finish_status='finished') then
    raise exception 'Finishing position tidak boleh duplikat.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_entries) as x(finish_status text,finishing_position integer) where x.finish_status='finished' and x.finishing_position>(select count(*) from jsonb_to_recordset(p_entries) y where y.finish_status='finished')) then
    raise exception 'Finishing position harus berurutan tanpa celah.';
  end if;

  select x.member_id,x.fastest_lap_ms into v_fastest_driver,v_fastest_time
  from jsonb_to_recordset(p_entries) as x(member_id uuid,fastest_lap_ms integer)
  where x.fastest_lap_ms is not null order by x.fastest_lap_ms limit 1;
  if v_fastest_driver is null then raise exception 'Fastest lap wajib dicatat untuk minimal satu Driver.'; end if;

  delete from public.caleris_race_stints where round_id=p_round_id;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_member_id:=(v_entry->>'member_id')::uuid;
    select team_id into v_team_id from public.members where id=v_member_id;
    v_status:=v_entry->>'finish_status';
    v_position:=nullif(v_entry->>'finishing_position','')::integer;
    v_grid:=(v_entry->>'grid_position')::integer;
    v_finish_ms:=nullif(v_entry->>'finish_time_ms','')::integer;
    v_fastest_ms:=nullif(v_entry->>'fastest_lap_ms','')::integer;
    insert into public.caleris_race_result_entries(round_id,member_id,team_id,finish_status,finishing_position,note,fastest_lap_ms,recorded_by,recorded_at,grid_position,finish_time_ms,gap_ms)
    values(p_round_id,v_member_id,v_team_id,v_status,v_position,nullif(v_entry->>'note',''),v_fastest_ms,(select auth.uid()),now(),v_grid,v_finish_ms,
      case when v_status='finished' then greatest(0,v_finish_ms-(select (x->>'finish_time_ms')::integer from jsonb_array_elements(p_entries) as x(value) where x.value->>'finishing_position'='1' limit 1)) else null end)
    on conflict(round_id,member_id) do update set team_id=excluded.team_id,finish_status=excluded.finish_status,finishing_position=excluded.finishing_position,
      note=excluded.note,fastest_lap_ms=excluded.fastest_lap_ms,recorded_by=excluded.recorded_by,recorded_at=now(),
      grid_position=excluded.grid_position,finish_time_ms=excluded.finish_time_ms,gap_ms=excluded.gap_ms;
    insert into public.caleris_race_stints(round_id,member_id,stint_number,tyre_compound)
    select p_round_id,v_member_id,ordinality,value from jsonb_array_elements_text(coalesce(v_entry->'stints','[]'::jsonb)) with ordinality;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_member_id:=(v_entry->>'member_id')::uuid;
    v_position:=nullif(v_entry->>'finishing_position','')::integer;
    v_points:=0;
    if v_position is not null then
      select coalesce(points,0) into v_points from public.caleris_race_points_rules
      where session_type=v_round.session_type and finishing_position=v_position and is_active;
      v_points:=coalesce(v_points,0);
    end if;
    if v_member_id=v_pole_id then
      select v_points+coalesce(max(pole_bonus),0) into v_points from public.caleris_race_points_rules where session_type=v_round.session_type and is_active;
    end if;
    select coalesce((select points_total from public.license_round_standings rs join public.license_rounds pr on pr.id=rs.round_id
      where rs.member_id=v_member_id and pr.season_division_id=v_round.season_division_id and pr.round_number<v_round.round_number
      order by pr.round_number desc limit 1),0) into v_previous;
    v_cumulative:=v_previous+v_points;
    insert into public.license_round_standings(round_id,member_id,points_total,updated_by)
    values(p_round_id,v_member_id,v_cumulative,(select auth.uid()))
    on conflict(round_id,member_id) do update set points_total=excluded.points_total,updated_by=excluded.updated_by,updated_at=now();
  end loop;

  v_result:=public.process_license_round(p_round_id);
  perform public.fia_record_race_result(p_round_id,v_winner_id,v_pole_id);
  update public.caleris_race_results set driver_of_day_member_id=p_driver_of_day_member_id,
    fastest_lap_member_id=v_fastest_driver,fastest_lap_ms=v_fastest_time where round_id=p_round_id;

  if not exists(select 1 from public.license_rounds where season_division_id=v_round.season_division_id and status<>'closed') then
    delete from public.license_final_standings where season_division_id=v_round.season_division_id;
    delete from public.license_team_final_standings where season_division_id=v_round.season_division_id;

    insert into public.license_final_standings(season_division_id,member_id,final_points,final_position,updated_by)
    select v_round.season_division_id,rs.member_id,max(rs.points_total),
      row_number() over(order by max(rs.points_total) desc,rs.member_id)::integer,(select auth.uid())
    from public.license_round_standings rs join public.license_rounds r on r.id=rs.round_id
    where r.season_division_id=v_round.season_division_id
    group by rs.member_id
    on conflict(season_division_id,member_id) do update set final_points=excluded.final_points,final_position=excluded.final_position,updated_by=excluded.updated_by,updated_at=now();

    insert into public.license_team_final_standings(season_division_id,team_id,final_points,final_position,updated_by)
    select v_round.season_division_id,t.id,coalesce(sum(coalesce(delta.points,0)),0),
      row_number() over(order by coalesce(sum(coalesce(delta.points,0)),0) desc,t.id)::integer,(select auth.uid())
    from public.teams t left join (
      select e.team_id,rs.round_id,rs.member_id,
        rs.points_total-coalesce((select prior.points_total from public.license_round_standings prior join public.license_rounds pround on pround.id=prior.round_id
          where prior.member_id=rs.member_id and pround.season_division_id=v_round.season_division_id and pround.round_number<r.round_number
          order by pround.round_number desc limit 1),0) as points
      from public.license_round_standings rs join public.license_rounds r on r.id=rs.round_id and r.season_division_id=v_round.season_division_id
      join public.caleris_race_result_entries e on e.round_id=rs.round_id and e.member_id=rs.member_id
    ) delta on delta.team_id=t.id
    where lower(t.division_key)=lower(v_division.division_key)
    group by t.id
    on conflict(season_division_id,team_id) do update set final_points=excluded.final_points,final_position=excluded.final_position,updated_by=excluded.updated_by,updated_at=now();

    select exists(select 1 from public.caleris_configurations where category='license' and config_key='scoring-wdc-'||v_division.division_key and is_active and coalesce(nullif(payload->>'points','')::numeric,0)>0) into v_has_wdc;
    if v_has_wdc and exists(select 1 from public.caleris_prizepool_rules where division_key=v_division.division_key and is_active) then
      begin
        v_finalized:=public.finalize_license_division(v_round.season_division_id);
        v_payout:=public.payout_season_prizepool(v_round.season_division_id);
      exception when others then
        v_payout:=jsonb_build_object('status','pending_configuration','detail',sqlerrm);
      end;
    else
      v_payout:=jsonb_build_object('status','pending_configuration','detail','WDC scoring atau Prizepool belum diaktifkan.');
    end if;
  end if;

  return jsonb_build_object('round_id',p_round_id,'winner_member_id',v_winner_id,'pole_member_id',v_pole_id,
    'fastest_lap_member_id',v_fastest_driver,'driver_of_day_member_id',p_driver_of_day_member_id,
    'drivers_classified',v_registered,'round_processing',v_result,'prizepool',coalesce(v_payout,'{"status":"not_final_round"}'::jsonb));
end;
$$;

revoke all on function public.fia_submit_race_classification(uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.fia_submit_race_classification(uuid,jsonb,uuid) to authenticated;

commit;