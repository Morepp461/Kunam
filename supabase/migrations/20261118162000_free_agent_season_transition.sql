begin;

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
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
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

  -- During End Season/Off Season the signing belongs to the next season, not the finished one.
  if not private.is_driver_transfer_window_open(v_today) then
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

create or replace function public.member_register_driver_for_season(p_season_division_id uuid,p_driver_member_id uuid)
returns uuid
language plpgsql
set search_path=''
as $function$
declare
  v_actor public.members%rowtype;
  v_team_id uuid;
  v_division public.license_season_divisions%rowtype;
  v_target_season public.license_seasons%rowtype;
  v_driver record;
  v_registration_id uuid;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.';
  end if;

  select m.* into v_actor
  from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());

  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
    raise exception 'Hanya Team Owner yang dapat mendaftarkan driver.';
  end if;

  v_team_id:=v_actor.team_id;

  select * into v_division
  from public.license_season_divisions
  where id=p_season_division_id;

  if not found then raise exception 'Season division tidak ditemukan.'; end if;

  select * into v_target_season
  from public.license_seasons
  where id=v_division.season_id;

  if not found or v_target_season.status<>'draft' then
    raise exception 'Pendaftaran roster berikutnya hanya tersedia untuk season draft.';
  end if;

  if not exists(
    select 1 from public.teams t
    where t.id=v_team_id and lower(t.division_key)=lower(v_division.division_key)
  ) then
    raise exception 'Divisi pendaftaran tidak sesuai dengan divisi tim.';
  end if;

  if not exists(
    select 1
    from public.season_calendar_periods active_window
    join public.license_seasons previous_season on previous_season.id=active_window.season_id
    join public.season_calendar_periods off_period
      on off_period.season_id=previous_season.id
     and off_period.period_type='off_season'
    where previous_season.id<>v_target_season.id
      and active_window.period_type in ('end_season','off_season')
      and v_today between active_window.starts_on and active_window.ends_on
      and v_target_season.starts_on=off_period.ends_on+1
  ) then
    raise exception 'Pendaftaran roster season berikutnya hanya dibuka selama End Season dan Off Season sebelumnya.';
  end if;

  select id,role,team_id,license
  into v_driver
  from public.caleris_member_directory
  where id=p_driver_member_id;

  if not found or v_driver.role<>'Driver' or v_driver.team_id is distinct from v_team_id then
    raise exception 'Driver harus berstatus Driver dan terikat pada tim ini.';
  end if;

  if not exists(
    select 1 from public.economy_driver_contracts c
    where c.season_id=v_division.season_id
      and c.team_id=v_team_id
      and c.member_id=p_driver_member_id
      and c.status='active'
  ) then
    raise exception 'Driver belum memiliki kontrak aktif dengan tim untuk season tujuan.';
  end if;

  if exists(
    select 1 from public.license_season_members sm
    where sm.season_id=v_division.season_id and sm.member_id=p_driver_member_id
  ) then
    raise exception 'Driver sudah terdaftar pada season ini.';
  end if;

  insert into public.license_season_members(
    season_id,season_division_id,member_id,is_hiatus,preserved_license
  ) values(
    v_division.season_id,v_division.id,p_driver_member_id,false,v_driver.license
  )
  returning id into v_registration_id;

  return v_registration_id;
end;
$function$;

revoke all on function public.member_sign_free_agent(uuid) from public,anon;
revoke all on function public.member_register_driver_for_season(uuid,uuid) from public,anon;
grant execute on function public.member_sign_free_agent(uuid) to authenticated;
grant execute on function public.member_register_driver_for_season(uuid,uuid) to authenticated;

commit;