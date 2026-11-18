begin;

create or replace function private.guard_driver_transfer_window()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.move_type in ('transfer','loan')
    and new.status in ('offered','negotiating','seller_accepted','pending_fia','approved','approved_waiting_window')
    and not private.is_driver_transfer_window_open((now() at time zone 'Asia/Jakarta')::date) then
    raise exception 'Transfer window sedang ditutup. Negosiasi Driver hanya dapat dilakukan pada End Season dan Off Season.';
  end if;
  return new;
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
    from public.season_calendar_periods off_period
    join public.license_seasons previous_season on previous_season.id=off_period.season_id
    where previous_season.id<>v_target_season.id
      and previous_season.status='completed'
      and off_period.period_type='off_season'
      and v_today between off_period.starts_on and off_period.ends_on
      and v_target_season.starts_on=off_period.ends_on+1
  ) then
    raise exception 'Pendaftaran roster season berikutnya hanya dibuka selama Off Season sebelumnya.';
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

revoke all on function private.guard_driver_transfer_window() from public,anon,authenticated,service_role;
revoke all on function public.member_register_driver_for_season(uuid,uuid) from public,anon;
grant execute on function public.member_register_driver_for_season(uuid,uuid) to authenticated;

commit;