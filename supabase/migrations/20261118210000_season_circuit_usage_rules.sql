-- Enforce one circuit appearance per season per division.
-- Cross-division reuse is allowed, including the same race date.
-- Configurable CALERIS MASTERS race calendar.
-- The 12-period structure is fixed; FIA chooses 3-5 Circuit Pool entries
-- for each division in each Race Period. Maximum 25 rounds per division.
create or replace function public.fia_create_caleris_season(
  p_start_date date,
  p_schedule jsonb
)
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
  v_periods jsonb:='[]'::jsonb;
  v_period jsonb;
  v_assignment jsonb;
  v_premio_circuits jsonb;
  v_zwei_circuits jsonb;
  v_premio_rounds uuid[];
  v_zwei_rounds uuid[];
  v_round_id uuid;
  v_circuit record;
  v_period_number integer;
  v_round_number integer;
  v_global_round_number integer;
  v_premio_total integer:=0;
  v_zwei_total integer:=0;
  v_period_days integer;
  v_day_offset integer:=7;
  v_period_start date;
  v_period_end date;
  v_start date;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_race_periods integer:=0;
  v_calendar jsonb;
begin
  if (select auth.uid()) is null or not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya Admin atau FIA yang dapat membuat season CALERIS MASTERS.';
  end if;
  if p_start_date is null or p_start_date<v_today then
    raise exception 'Tanggal mulai Pre Season tidak valid.';
  end if;
  if jsonb_typeof(p_schedule) is distinct from 'array' or jsonb_array_length(p_schedule)<>5 then
    raise exception 'Jadwal wajib berisi tepat lima Race Period.';
  end if;
  if exists(select 1 from public.license_seasons where status='draft' and season_key like 'caleris-masters-season-%') then
    raise exception 'Masih ada draft CALERIS MASTERS. Selesaikan atau jadwalkan ulang season tersebut terlebih dahulu.';
  end if;

  -- Validate schedule completely before creating any season records.
  for v_period in select value from jsonb_array_elements(p_schedule) loop
    v_period_number:=coalesce((v_period->>'period_number')::integer,0);
    if v_period_number<1 or v_period_number>5 then
      raise exception 'Nomor Race Period tidak valid.';
    end if;
    v_premio_circuits:=v_period->'premio_circuits';
    v_zwei_circuits:=v_period->'zwei_circuits';
    if jsonb_typeof(v_premio_circuits) is distinct from 'array'
      or jsonb_array_length(v_premio_circuits) not between 3 and 5
      or jsonb_typeof(v_zwei_circuits) is distinct from 'array'
      or jsonb_array_length(v_zwei_circuits) not between 3 and 5 then
      raise exception 'Setiap divisi harus memiliki 3 sampai 5 race round di setiap Race Period.';
    end if;
    if (select count(distinct value) from jsonb_array_elements_text(v_premio_circuits))<>jsonb_array_length(v_premio_circuits)
      or (select count(distinct value) from jsonb_array_elements_text(v_zwei_circuits))<>jsonb_array_length(v_zwei_circuits) then
      raise exception 'Sirkuit tidak boleh dipilih dua kali dalam Race Period yang sama.';
    end if;
    if exists(
      select 1 from jsonb_array_elements_text(v_premio_circuits) x
      where not exists(select 1 from public.caleris_circuits c where c.id=x.value::uuid)
    ) or exists(
      select 1 from jsonb_array_elements_text(v_zwei_circuits) x
      where not exists(select 1 from public.caleris_circuits c where c.id=x.value::uuid)
    ) then
      raise exception 'Sirkuit yang dipilih tidak tersedia di Circuit Pool.';
    end if;
    v_premio_total:=v_premio_total+jsonb_array_length(v_premio_circuits);
    v_zwei_total:=v_zwei_total+jsonb_array_length(v_zwei_circuits);
  end loop;
  if v_premio_total>25 or v_zwei_total>25 then
    raise exception 'Maksimal 25 race round per divisi dalam satu season.';
  end if;
  -- A circuit may appear only once across the entire season within each division.
  -- Premio and Zwei are validated independently, so both may race at the same circuit/date.
  if exists(
    select 1 from jsonb_array_elements(p_schedule) p
    cross join lateral jsonb_array_elements_text(p->'premio_circuits') c(value)
    group by c.value having count(*)>1
  ) then
    raise exception 'Setiap sirkuit hanya boleh digunakan satu kali per season di Caleris Premio.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_schedule) p
    cross join lateral jsonb_array_elements_text(p->'zwei_circuits') c(value)
    group by c.value having count(*)>1
  ) then
    raise exception 'Setiap sirkuit hanya boleh digunakan satu kali per season di Caleris Zwei.';
  end if;

  if (select count(distinct (x->>'period_number')::integer) from jsonb_array_elements(p_schedule) x)<>5 then
    raise exception 'Setiap Race Period 1 sampai 5 wajib diisi tepat satu kali.';
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
  values(v_season_id,'premio','Caleris Premio','draft') returning id into v_premio_id;
  insert into public.license_season_divisions(season_id,division_key,division_name,status)
  values(v_season_id,'zwei','Caleris Zwei','draft') returning id into v_zwei_id;

  v_periods:=v_periods||jsonb_build_array(jsonb_build_object(
    'period_type','pre_season','title','Pre Season','starts_on',p_start_date,'ends_on',p_start_date+6
  ));

  for v_period_number in 1..5 loop
    select value into v_period from jsonb_array_elements(p_schedule)
    where (value->>'period_number')::integer=v_period_number;
    v_premio_circuits:=v_period->'premio_circuits';
    v_zwei_circuits:=v_period->'zwei_circuits';
    v_period_days:=greatest(jsonb_array_length(v_premio_circuits),jsonb_array_length(v_zwei_circuits));
    v_period_start:=p_start_date+v_day_offset;
    v_period_end:=v_period_start+v_period_days-1;
    v_premio_rounds:=array[]::uuid[];
    v_zwei_rounds:=array[]::uuid[];

    for v_round_number in 1..jsonb_array_length(v_premio_circuits) loop
      select c.id,c.name,c.country_code into v_circuit
      from public.caleris_circuits c where c.id=(v_premio_circuits->> (v_round_number-1))::uuid;
      insert into public.license_rounds(
        season_division_id,round_number,title,checkin_opens_at,checkin_closes_at,
        status,session_type,circuit_name,circuit_country_code
      ) values(
        v_premio_id,coalesce((select max(round_number)+1 from public.license_rounds where season_division_id=v_premio_id),1),
        'Round '||lpad((v_premio_total-(select coalesce(sum(jsonb_array_length(x->'premio_circuits')),0) from jsonb_array_elements(p_schedule) x where (x->>'period_number')::integer>=v_period_number)+v_round_number)::text,2,'0'),
        ((v_period_start+v_round_number-1)::timestamp) at time zone 'Asia/Jakarta',
        ((v_period_start+v_round_number-1)::timestamp+time '23:59:59') at time zone 'Asia/Jakarta',
        'scheduled','race',v_circuit.name,v_circuit.country_code
      ) returning id into v_round_id;
      v_premio_rounds:=array_append(v_premio_rounds,v_round_id);
    end loop;

    for v_round_number in 1..jsonb_array_length(v_zwei_circuits) loop
      select c.id,c.name,c.country_code into v_circuit
      from public.caleris_circuits c where c.id=(v_zwei_circuits->> (v_round_number-1))::uuid;
      insert into public.license_rounds(
        season_division_id,round_number,title,checkin_opens_at,checkin_closes_at,
        status,session_type,circuit_name,circuit_country_code
      ) values(
        v_zwei_id,coalesce((select max(round_number)+1 from public.license_rounds where season_division_id=v_zwei_id),1),
        'Round '||lpad((v_zwei_total-(select coalesce(sum(jsonb_array_length(x->'zwei_circuits')),0) from jsonb_array_elements(p_schedule) x where (x->>'period_number')::integer>=v_period_number)+v_round_number)::text,2,'0'),
        ((v_period_start+v_round_number-1)::timestamp) at time zone 'Asia/Jakarta',
        ((v_period_start+v_round_number-1)::timestamp+time '23:59:59') at time zone 'Asia/Jakarta',
        'scheduled','race',v_circuit.name,v_circuit.country_code
      ) returning id into v_round_id;
      v_zwei_rounds:=array_append(v_zwei_rounds,v_round_id);
    end loop;

    v_periods:=v_periods||jsonb_build_array(jsonb_build_object(
      'period_type','race_period','title','Race Period '||v_period_number,
      'starts_on',v_period_start,'ends_on',v_period_end,
      'assignments',jsonb_build_array(
        jsonb_build_object('season_division_id',v_premio_id,'round_ids',to_jsonb(v_premio_rounds)),
        jsonb_build_object('season_division_id',v_zwei_id,'round_ids',to_jsonb(v_zwei_rounds))
      )
    ));
    v_day_offset:=v_day_offset+v_period_days;
    if v_period_number<5 then
      v_periods:=v_periods||jsonb_build_array(jsonb_build_object(
        'period_type','race_break','title','Break Balancing '||v_period_number,
        'starts_on',p_start_date+v_day_offset,'ends_on',p_start_date+v_day_offset+1
      ));
      v_day_offset:=v_day_offset+2;
    end if;
  end loop;

  v_periods:=v_periods||jsonb_build_array(
    jsonb_build_object('period_type','end_season','title','End Season','starts_on',p_start_date+v_day_offset,'ends_on',p_start_date+v_day_offset+4),
    jsonb_build_object('period_type','off_season','title','Off Season','starts_on',p_start_date+v_day_offset+5,'ends_on',p_start_date+v_day_offset+11)
  );

  v_calendar:=public.fia_create_season_calendar(v_season_id,v_periods);
  return jsonb_build_object(
    'season_id',v_season_id,'season_key',v_season_key,'title',v_title,
    'event_name','Caleris Masters','divisions_created',2,
    'premio_rounds',v_premio_total,'zwei_rounds',v_zwei_total,
    'periods_created',12,'starts_on',p_start_date,
    'ends_on',p_start_date+v_day_offset+11,'calendar',v_calendar
  );
end;
$$;

revoke all on function public.fia_create_caleris_season(date,jsonb) from public,anon;
grant execute on function public.fia_create_caleris_season(date,jsonb) to authenticated;
