begin;

create or replace function private.is_driver_transfer_window_open(p_on date default (now() at time zone 'Asia/Jakarta')::date)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.season_calendar_periods p
    where p.period_type in ('end_season','off_season')
      and p_on between p.starts_on and p.ends_on
  );
$$;

create or replace function private.guard_driver_transfer_window()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.move_type in ('transfer','loan')
    and new.status in ('offered','negotiating','pending_fia','approved','approved_waiting_window')
    and not private.is_driver_transfer_window_open((now() at time zone 'Asia/Jakarta')::date) then
    raise exception 'Transfer window sedang ditutup. Negosiasi Driver hanya dapat dilakukan pada End Season dan Off Season.';
  end if;
  return new;
end;
$$;

drop trigger if exists caleris_driver_transfer_window_guard on public.caleris_driver_move_negotiations;
create trigger caleris_driver_transfer_window_guard
before insert or update of status,move_type on public.caleris_driver_move_negotiations
for each row execute function private.guard_driver_transfer_window();

create or replace function public.member_get_transfer_window_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_period public.season_calendar_periods%rowtype;
begin
  select p.* into v_period
  from public.season_calendar_periods p
  where v_today between p.starts_on and p.ends_on
  order by p.starts_on desc,p.sort_order
  limit 1;

  return jsonb_build_object(
    'is_open',coalesce(v_period.period_type in ('end_season','off_season'),false),
    'period_type',v_period.period_type,
    'period_title',v_period.title,
    'starts_on',v_period.starts_on,
    'ends_on',v_period.ends_on,
    'today',v_today
  );
end;
$$;

create or replace function public.member_sign_free_agent(p_driver_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_driver public.members%rowtype;
  v_team public.teams%rowtype;
  v_driver_count integer;
  v_season public.license_seasons%rowtype;
  v_division_id uuid;
  v_registration_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.';
  end if;

  select m.* into v_actor
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());

  if not found or v_actor.role not in ('Owner','Principal') or v_actor.team_id is null then
    raise exception 'Hanya Team Owner/Principal yang terhubung ke tim dapat merekrut Free Agent.';
  end if;

  select * into v_team from public.teams where id=v_actor.team_id for update;
  if not found then raise exception 'Tim tidak ditemukan.'; end if;

  select count(*) into v_driver_count
  from public.members
  where team_id=v_team.id and role='Driver';

  if v_driver_count>=2 then
    raise exception 'Pengecualian Free Agent hanya berlaku untuk tim yang memiliki kurang dari 2 Driver aktif.';
  end if;

  select * into v_driver
  from public.members
  where id=p_driver_member_id and role='Driver'
  for update;

  if not found or v_driver.team_id is not null then
    raise exception 'Driver tidak tersedia sebagai Free Agent.';
  end if;

  if exists(
    select 1 from public.caleris_driver_move_negotiations n
    where n.driver_member_id=v_driver.id
      and n.status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved','loan_active')
  ) then
    raise exception 'Driver sedang terikat negosiasi atau loan aktif.';
  end if;

  if exists(
    select 1 from public.economy_driver_contracts c
    where c.member_id=v_driver.id and c.status='active'
  ) then
    raise exception 'Driver masih memiliki kontrak aktif.';
  end if;

  update public.members
  set team_id=v_team.id
  where id=v_driver.id and role='Driver' and team_id is null;

  if not found then raise exception 'Status Free Agent berubah. Muat ulang daftar Driver.'; end if;

  select * into v_season
  from public.license_seasons
  where status='active'
  order by starts_on desc,created_at desc
  limit 1;

  if found then
    select d.id into v_division_id
    from public.license_season_divisions d
    where d.season_id=v_season.id
      and lower(d.division_key)=lower(v_team.division_key)
    limit 1;

    if v_division_id is not null and not exists(
      select 1 from public.license_season_members sm
      where sm.season_id=v_season.id and sm.member_id=v_driver.id
    ) then
      insert into public.license_season_members(
        season_id,season_division_id,member_id,is_hiatus,preserved_license
      ) values(v_season.id,v_division_id,v_driver.id,false,v_driver.license)
      returning id into v_registration_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'driver_member_id',v_driver.id,
    'team_id',v_team.id,
    'season_registration_id',v_registration_id,
    'team_driver_count',v_driver_count+1
  );
end;
$$;

create or replace function public.fia_create_season_calendar(p_season_id uuid,p_periods jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_period jsonb;
  v_assignment jsonb;
  v_period_id uuid;
  v_type text;
  v_title text;
  v_starts date;
  v_ends date;
  v_number integer;
  v_order integer:=0;
  v_division_id uuid;
  v_round_id uuid;
  v_division_count integer;
  v_type_count integer;
  v_race_count integer:=0;
  v_break_count integer:=0;
  v_period_count integer:=0;
  v_unassigned integer;
  v_previous_end date;
  v_expected_days integer;
  v_race_days integer;
  v_first_start date;
  v_last_end date;
  v_expected text[]:=array[
    'pre_season','race_period','race_break','race_period','race_break',
    'race_period','race_break','race_period','race_break','race_period',
    'end_season','off_season'
  ];
  v_actual text[];
begin
  if not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat membentuk kalender season.';
  end if;

  if not exists(
    select 1 from public.license_seasons
    where id=p_season_id and status in ('draft','active')
  ) then
    raise exception 'Season tidak ditemukan atau sudah selesai.';
  end if;

  if jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)<>12 then
    raise exception 'Kalender CALERIS wajib memuat tepat 12 periode.';
  end if;

  select array_agg(x->>'period_type' order by ordinality)
  into v_actual
  from jsonb_array_elements(p_periods) with ordinality as p(x,ordinality);

  if v_actual is distinct from v_expected then
    raise exception 'Urutan periode harus Pre Season, lima Race Periode dengan empat Break Balancing, End Season, lalu Off Season.';
  end if;

  if exists(select 1 from public.season_calendar_periods where season_id=p_season_id) then
    raise exception 'Kalender season sudah terbentuk. Gunakan Reschedule untuk mengubah tanggal.';
  end if;

  foreach v_type in array array['off_season','pre_season','end_season'] loop
    select count(*) into v_type_count
    from jsonb_array_elements(p_periods) x
    where x->>'period_type'=v_type;
    if v_type_count<>1 then
      raise exception 'Kalender wajib memiliki tepat satu periode %.',v_type;
    end if;
  end loop;

  select count(*) into v_race_count from jsonb_array_elements(p_periods) x where x->>'period_type'='race_period';
  select count(*) into v_break_count from jsonb_array_elements(p_periods) x where x->>'period_type'='race_break';
  if v_race_count<>5 or v_break_count<>4 then
    raise exception 'Kalender wajib memiliki lima Race Periode dan empat Break Balancing Periode.';
  end if;

  select count(*) into v_division_count
  from public.license_season_divisions
  where season_id=p_season_id;
  if v_division_count<1 then
    raise exception 'Buat minimal satu divisi sebelum membentuk kalender.';
  end if;

  for v_period in select value from jsonb_array_elements(p_periods) loop
    v_order:=v_order+1;
    v_type:=v_period->>'period_type';
    v_title:=nullif(trim(v_period->>'title'),'');
    v_starts:=(v_period->>'starts_on')::date;
    v_ends:=(v_period->>'ends_on')::date;

    if v_title is null or v_starts is null or v_ends is null or v_ends<v_starts then
      raise exception 'Nama atau tanggal periode tidak valid.';
    end if;

    if v_previous_end is not null and v_starts<>v_previous_end+1 then
      raise exception 'Setiap periode harus dimulai tepat satu hari setelah periode sebelumnya.';
    end if;

    if v_type='pre_season' then
      v_expected_days:=7;
    elsif v_type='race_break' then
      v_expected_days:=2;
    elsif v_type='end_season' then
      v_expected_days:=5;
    elsif v_type='off_season' then
      v_expected_days:=7;
    elsif v_type='race_period' then
      if jsonb_typeof(v_period->'assignments')<>'array'
        or jsonb_array_length(v_period->'assignments')<>v_division_count
        or (select count(distinct x->>'season_division_id') from jsonb_array_elements(v_period->'assignments') x)<>v_division_count then
        raise exception 'Setiap Race Period wajib mengatur tepat satu daftar round untuk seluruh divisi season.';
      end if;

      select max(jsonb_array_length(x->'round_ids')) into v_race_days
      from jsonb_array_elements(v_period->'assignments') x;

      if v_race_days is null or v_race_days not between 3 and 5 then
        raise exception 'Setiap Race Period harus berisi 3 sampai 5 race per divisi.';
      end if;
      v_expected_days:=v_race_days;
    else
      raise exception 'Jenis periode tidak dikenal.';
    end if;

    if v_ends-v_starts+1<>v_expected_days then
      raise exception 'Durasi % harus tepat % hari berdasarkan jadwal Race Period.',v_type,v_expected_days;
    end if;

    if v_type in ('race_period','race_break') then
      select count(*)+1 into v_number
      from public.season_calendar_periods
      where season_id=p_season_id and period_type=v_type;
    else
      v_number:=null;
    end if;

    insert into public.season_calendar_periods(
      season_id,period_type,period_number,title,starts_on,ends_on,sort_order,created_by
    ) values(
      p_season_id,v_type,v_number,v_title,v_starts,v_ends,v_order,(select auth.uid())
    )
    returning id into v_period_id;

    if v_type='race_period' then
      for v_assignment in select value from jsonb_array_elements(v_period->'assignments') loop
        v_division_id:=(v_assignment->>'season_division_id')::uuid;

        if not exists(
          select 1 from public.license_season_divisions
          where id=v_division_id and season_id=p_season_id
        ) then
          raise exception 'Divisi tidak termasuk season ini.';
        end if;

        if jsonb_typeof(v_assignment->'round_ids')<>'array'
          or jsonb_array_length(v_assignment->'round_ids') not between 3 and 5 then
          raise exception 'Setiap Race Period harus berisi 3 sampai 5 round per divisi.';
        end if;

        if (select count(distinct value) from jsonb_array_elements_text(v_assignment->'round_ids'))<>jsonb_array_length(v_assignment->'round_ids') then
          raise exception 'Round yang sama tidak boleh dipilih dua kali dalam satu Race Period.';
        end if;

        for v_round_id in
          select value::uuid from jsonb_array_elements_text(v_assignment->'round_ids')
        loop
          if not exists(
            select 1 from public.license_rounds
            where id=v_round_id and season_division_id=v_division_id
          ) then
            raise exception 'Round yang dipilih tidak termasuk divisi terkait.';
          end if;

          insert into public.season_period_rounds(period_id,season_division_id,round_id)
          values(v_period_id,v_division_id,v_round_id);
        end loop;
      end loop;
    end if;

    if v_first_start is null then v_first_start:=v_starts; end if;
    v_last_end:=v_ends;
    v_previous_end:=v_ends;
    v_period_count:=v_period_count+1;
  end loop;

  select count(*) into v_unassigned
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  where d.season_id=p_season_id
    and not exists(select 1 from public.season_period_rounds pr where pr.round_id=r.id);

  if v_unassigned>0 then
    raise exception 'Semua round pada seluruh divisi harus dimasukkan ke Race Period. Masih ada % round belum terpetakan.',v_unassigned;
  end if;

  update public.license_seasons
  set starts_on=v_first_start,ends_on=v_last_end
  where id=p_season_id;

  return jsonb_build_object(
    'season_id',p_season_id,
    'periods_created',v_period_count,
    'race_periods',v_race_count,
    'break_balancing_periods',v_break_count,
    'starts_on',v_first_start,
    'ends_on',v_last_end
  );
end;
$function$;

create or replace function public.fia_reschedule_season_calendar(p_season_id uuid,p_start_date date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_season public.license_seasons%rowtype;
  v_period public.season_calendar_periods%rowtype;
  v_days integer;
  v_cursor date:=p_start_date;
  v_end date;
  v_count integer:=0;
begin
  if not public.is_caleris_fia_or_admin() then
    raise exception 'Hanya FIA atau Admin yang dapat reschedule kalender.';
  end if;
  if p_start_date is null then raise exception 'Tanggal mulai wajib diisi.'; end if;

  select * into v_season from public.license_seasons where id=p_season_id for update;
  if not found or v_season.status<>'draft' then
    raise exception 'Reschedule hanya tersedia untuk season berstatus draft.';
  end if;

  if (select count(*) from public.season_calendar_periods where season_id=p_season_id)<>12 then
    raise exception 'Kalender belum lengkap 12 periode.';
  end if;

  for v_period in
    select * from public.season_calendar_periods
    where season_id=p_season_id
    order by sort_order
    for update
  loop
    if v_period.period_type='pre_season' then
      v_days:=7;
    elsif v_period.period_type='race_break' then
      v_days:=2;
    elsif v_period.period_type='end_season' then
      v_days:=5;
    elsif v_period.period_type='off_season' then
      v_days:=7;
    elsif v_period.period_type='race_period' then
      select max(cnt) into v_days
      from (
        select count(*)::integer cnt
        from public.season_period_rounds
        where period_id=v_period.id
        group by season_division_id
      ) x;
      if v_days not between 3 and 5 then
        raise exception 'Race Period % harus memiliki 3 sampai 5 round per divisi.',v_period.period_number;
      end if;
    else
      raise exception 'Jenis periode tidak valid pada kalender.';
    end if;

    v_end:=v_cursor+v_days-1;
    update public.season_calendar_periods
    set starts_on=v_cursor,ends_on=v_end,updated_by=(select auth.uid())
    where id=v_period.id;

    v_cursor:=v_end+1;
    v_count:=v_count+1;
  end loop;

  update public.license_seasons
  set starts_on=p_start_date,ends_on=v_cursor-1
  where id=p_season_id;

  return jsonb_build_object(
    'season_id',p_season_id,
    'periods_updated',v_count,
    'starts_on',p_start_date,
    'ends_on',v_cursor-1
  );
end;
$function$;

create or replace function private.process_season_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_completed integer:=0;
  v_activated integer:=0;
  v_candidate uuid;
  v_candidates integer;
begin
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
    );
  get diagnostics v_completed=row_count;

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

  return jsonb_build_object(
    'today',v_today,
    'seasons_completed',v_completed,
    'seasons_activated',v_activated
  );
end;
$$;

do $season_lifecycle_schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='caleris-season-lifecycle'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'caleris-season-lifecycle',
    '*/5 * * * *',
    'select private.process_season_lifecycle();'
  );
end;
$season_lifecycle_schedule$;

revoke all on function private.is_driver_transfer_window_open(date) from public,anon,authenticated,service_role;
revoke all on function private.guard_driver_transfer_window() from public,anon,authenticated,service_role;
revoke all on function private.process_season_lifecycle() from public,anon,authenticated,service_role;
revoke all on function public.member_get_transfer_window_status() from public,anon;
revoke all on function public.member_sign_free_agent(uuid) from public,anon;
revoke all on function public.fia_create_season_calendar(uuid,jsonb) from public,anon;
revoke all on function public.fia_reschedule_season_calendar(uuid,date) from public,anon;
grant execute on function public.member_get_transfer_window_status() to authenticated;
grant execute on function public.member_sign_free_agent(uuid) to authenticated;
grant execute on function public.fia_create_season_calendar(uuid,jsonb) to authenticated;
grant execute on function public.fia_reschedule_season_calendar(uuid,date) to authenticated;

commit;