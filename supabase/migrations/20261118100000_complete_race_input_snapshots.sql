begin;

alter table public.caleris_race_result_entries
  add column if not exists driver_number integer,
  add column if not exists driver_country text,
  add column if not exists driver_flag text,
  add column if not exists laps_behind integer;

alter table public.caleris_race_result_entries
  drop constraint if exists caleris_race_result_entries_driver_number_check,
  add constraint caleris_race_result_entries_driver_number_check
    check (driver_number is null or driver_number > 0),
  drop constraint if exists caleris_race_result_entries_laps_behind_check,
  add constraint caleris_race_result_entries_laps_behind_check
    check (laps_behind is null or laps_behind >= 0);

alter table public.caleris_race_results
  add column if not exists pole_time_ms integer;

alter table public.caleris_race_results
  drop constraint if exists caleris_race_results_pole_time_ms_check,
  add constraint caleris_race_results_pole_time_ms_check
    check (pole_time_ms is null or pole_time_ms > 0);

create or replace function public.fia_submit_race_classification_v2(
  p_round_id uuid,
  p_entries jsonb,
  p_driver_of_day_member_id uuid,
  p_pole_time_ms integer,
  p_circuit_name text,
  p_circuit_country_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_round public.license_rounds%rowtype;
  v_result jsonb;
  v_entry_count integer;
  v_number_count integer;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat mengesahkan hasil race.';
  end if;

  if p_round_id is null then raise exception 'Round wajib dipilih.'; end if;
  if p_pole_time_ms is null or p_pole_time_ms <= 0 then
    raise exception 'Pole lap time wajib diisi.';
  end if;
  if nullif(trim(p_circuit_name),'') is null
     or p_circuit_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Circuit dan negara circuit wajib dipilih.';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array'
     or jsonb_array_length(p_entries)=0 then
    raise exception 'Data klasifikasi race wajib berupa daftar Driver.';
  end if;

  select * into v_round
  from public.license_rounds
  where id=p_round_id
  for update;

  if not found or v_round.status='closed' then
    raise exception 'Round tidak tersedia atau sudah ditutup.';
  end if;

  if not exists (
    select 1 from public.caleris_circuits c
    where lower(trim(c.name))=lower(trim(p_circuit_name))
      and c.country_code=p_circuit_country_code
  ) then
    raise exception 'Circuit tidak ditemukan di Circuit Pool.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_entries) as x(
      member_id uuid,
      driver_number integer,
      driver_country text,
      driver_flag text,
      finish_status text,
      laps_behind integer,
      gap_ms integer
    )
    where x.member_id is null
       or x.driver_number is null or x.driver_number<=0
       or nullif(trim(x.driver_country),'') is null
       or nullif(trim(x.driver_flag),'') is null
       or (x.finish_status='dnf' and (x.laps_behind is null or x.laps_behind<0))
       or (x.finish_status<>'dnf' and x.laps_behind is not null)
       or (x.gap_ms is not null and x.gap_ms<0)
  ) then
    raise exception 'Nomor mobil, negara, bendera, laps behind, atau gap tidak valid.';
  end if;

  select count(*),count(distinct x.driver_number)
    into v_entry_count,v_number_count
  from jsonb_to_recordset(p_entries) as x(driver_number integer);

  if v_entry_count<>v_number_count then
    raise exception 'Nomor mobil tidak boleh duplikat dalam satu race.';
  end if;

  update public.license_rounds
  set circuit_name=trim(p_circuit_name),
      circuit_country_code=p_circuit_country_code
  where id=p_round_id;

  -- Reuse the existing atomic race engine for participant validation, scoring,
  -- race rewards, round processing, season settlement, and publication.
  v_result:=public.fia_submit_race_classification(
    p_round_id,
    p_entries,
    p_driver_of_day_member_id
  );

  -- Persist the extra screenshot/CSV snapshot fields in the same transaction.
  update public.caleris_race_result_entries e
  set driver_number=x.driver_number,
      driver_country=trim(x.driver_country),
      driver_flag=trim(x.driver_flag),
      laps_behind=x.laps_behind,
      gap_ms=x.gap_ms
  from jsonb_to_recordset(p_entries) as x(
    member_id uuid,
    driver_number integer,
    driver_country text,
    driver_flag text,
    laps_behind integer,
    gap_ms integer
  )
  where e.round_id=p_round_id
    and e.member_id=x.member_id;

  update public.caleris_race_results
  set pole_time_ms=p_pole_time_ms
  where round_id=p_round_id;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'circuit_name',trim(p_circuit_name),
    'circuit_country_code',p_circuit_country_code,
    'pole_time_ms',p_pole_time_ms,
    'metadata_snapshots_saved',true
  );
end;
$$;

revoke all on function public.fia_submit_race_classification_v2(uuid,jsonb,uuid,integer,text,text)
  from public,anon,service_role;
grant execute on function public.fia_submit_race_classification_v2(uuid,jsonb,uuid,integer,text,text)
  to authenticated;

commit;
