-- Team Brand Identity: persistent two-color identity for every team and new Team Owner registration.
alter table public.caleris_member_registrations
  add column if not exists main_color text not null default '#7A263A',
  add column if not exists secondary_color text not null default '#C6A33A';
alter table public.caleris_team_profiles
  add column if not exists main_color text not null default '#7A263A',
  add column if not exists secondary_color text not null default '#C6A33A';

alter table public.caleris_member_registrations
  drop constraint if exists caleris_member_registrations_main_color_hex_check,
  drop constraint if exists caleris_member_registrations_secondary_color_hex_check;
alter table public.caleris_member_registrations
  add constraint caleris_member_registrations_main_color_hex_check check (main_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint caleris_member_registrations_secondary_color_hex_check check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.caleris_team_profiles
  drop constraint if exists caleris_team_profiles_main_color_hex_check,
  drop constraint if exists caleris_team_profiles_secondary_color_hex_check;
alter table public.caleris_team_profiles
  add constraint caleris_team_profiles_main_color_hex_check check (main_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint caleris_team_profiles_secondary_color_hex_check check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');

CREATE OR REPLACE FUNCTION public.submit_main_event_registration_v2(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_division text;
  v_main_color text;
  v_secondary_color text;
  v_engine_choice text;
  v_engine_id uuid;
  v_engine_name text;
  v_count integer;
  v_result jsonb;
  v_registration_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Data pendaftaran tidak valid.'; end if;
  v_role:=p_payload->>'requested_role';

  if v_role='Owner' then
    v_division:=lower(btrim(coalesce(p_payload->>'initial_division','')));
    if v_division not in ('premio','zwei') then raise exception 'Pilih divisi awal yang valid.'; end if;
    v_main_color:=upper(btrim(coalesce(p_payload->>'team_main_color','')));
    v_secondary_color:=upper(btrim(coalesce(p_payload->>'team_secondary_color','')));
    if v_main_color !~ '^#[0-9A-F]{6}$' or v_secondary_color !~ '^#[0-9A-F]{6}$' then
      raise exception 'Main Color dan Secondary Color wajib dipilih dari palette tim.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('main-event-division:'||v_division,0)
    );
    select
      (select count(*) from public.teams t where lower(t.division_key)=v_division)
      +
      (select count(*) from public.caleris_member_registrations r
       where r.requested_role='Owner' and r.status='pending'
         and r.initial_division=v_division)
    into v_count;

    if (v_division='premio' and v_count>=12) or (v_division='zwei' and v_count>=14) then
      raise exception 'Divisi yang dipilih sudah tidak memiliki slot pendaftaran.';
    end if;

    v_engine_choice:=p_payload->>'engine_choice';
    if v_engine_choice not in ('new','buy') then raise exception 'Pilih opsi Engine.'; end if;

    if v_engine_choice='new' then
      v_engine_name:=nullif(btrim(p_payload->>'requested_engine_name'),'');
      if v_engine_name is null or length(v_engine_name) not between 2 and 60 then
        raise exception 'Nama Engine wajib diisi (2–60 karakter).';
      end if;
      if exists(select 1 from public.caleris_engines where lower(name)=lower(v_engine_name)) then
        raise exception 'Nama Engine sudah digunakan.';
      end if;
    else
      v_engine_id:=nullif(p_payload->>'selected_engine_id','')::uuid;
      if v_engine_id is null or not exists(
        select 1 from public.caleris_engines e
        where e.id=v_engine_id and e.is_active and e.is_for_sale
          and e.owner_team_id is not null
          and e.asking_price between 5000000 and 25000000
      ) then
        raise exception 'Engine yang dipilih tidak tersedia untuk dibeli.';
      end if;
    end if;
  end if;

  v_result:=public.submit_main_event_registration(p_payload);
  v_registration_id:=(v_result->>'registration_id')::uuid;
  if v_role='Owner' then
    update public.caleris_member_registrations
    set initial_division=v_division,
        engine_choice=v_engine_choice,
        requested_engine_name=case when v_engine_choice='new' then v_engine_name else null end,
        selected_engine_id=case when v_engine_choice='buy' then v_engine_id else null end,
        main_color=v_main_color,
        secondary_color=v_secondary_color
    where id=v_registration_id and user_id=(select auth.uid()) and status='pending';
  end if;
  return v_result;
end;
$function$

CREATE OR REPLACE FUNCTION public.admin_review_member_registration(p_registration_id uuid, p_decision text, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_registration public.caleris_member_registrations%rowtype;
  v_profile public.profiles%rowtype;
  v_member public.members%rowtype;
  v_team_id uuid;
  v_member_id uuid;
  v_team_logo_url text;
begin
  if v_actor is null or not exists(select 1 from public.site_admins where user_id=v_actor) then
    raise exception 'Akses administrator diperlukan.';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Keputusan tidak valid.'; end if;
  select * into v_registration from public.caleris_member_registrations where id=p_registration_id for update;
  if not found then raise exception 'Pendaftaran tidak ditemukan.'; end if;
  if v_registration.status<>'pending' then raise exception 'Pendaftaran ini sudah diproses.'; end if;
  select * into v_profile from public.profiles where user_id=v_registration.user_id for update;
  if not found then raise exception 'Profil member tidak ditemukan.'; end if;
  if p_decision='reject' then
    update public.caleris_member_registrations set status='rejected',reviewed_by=v_actor,reviewed_at=now(),
      review_note=nullif(btrim(p_review_note),''),updated_at=now() where id=p_registration_id;
    update public.caleris_team_driver_applications set status='withdrawn' where registration_id=p_registration_id and status='pending';
    return jsonb_build_object('ok',true,'status','rejected');
  end if;

  if v_profile.member_id is not null then
    select * into v_member from public.members where id=v_profile.member_id for update;
    if not found then raise exception 'Record member terhubung tidak ditemukan.'; end if;
    if v_member.role is not null then raise exception 'Akun sudah memiliki role aktif.'; end if;
  else
    v_member.id:=null;
  end if;

  if v_registration.requested_role='Owner' then
    if v_registration.team_name is null or exists(select 1 from public.teams where lower(name)=lower(v_registration.team_name)) then
      raise exception 'Nama tim sudah digunakan atau tidak valid.';
    end if;
    insert into public.teams(name) values(v_registration.team_name) returning id into v_team_id;
    v_team_logo_url:=concat('https://',coalesce((nullif(current_setting('request.headers',true),'')::json->>'host'),'asltczqrmoxnayusvjta.supabase.co'),'/storage/v1/object/public/team-logos/',v_registration.team_logo_path);
    insert into public.caleris_team_profiles(
      team_id,logo_url,country_of_origin,base_location,founded_year,history,description,vision,long_term_target,updated_by,main_color,secondary_color
    ) values (
      v_team_id,v_team_logo_url,v_registration.team_base_nation,v_registration.team_hometown,
      v_registration.team_founded_year,v_registration.team_description,v_registration.team_description,
      v_registration.team_vision,v_registration.team_long_term_target,v_actor,
      v_registration.main_color,v_registration.secondary_color
    );
    if v_member.id is null then
      insert into public.members(character_name,role,team_id)
      values(v_registration.nickname,'Owner',v_team_id) returning id into v_member_id;
    else
      update public.members set character_name=v_registration.nickname,role='Owner',team_id=v_team_id
      where id=v_member.id returning id into v_member_id;
    end if;
  else
    if v_member.id is null then
      insert into public.members(character_name,role) values(v_registration.nickname,'Driver') returning id into v_member_id;
    else
      update public.members set character_name=v_registration.nickname,role='Driver',team_id=null
      where id=v_member.id returning id into v_member_id;
    end if;
    update public.caleris_team_driver_applications set member_id=v_member_id
    where registration_id=p_registration_id;
  end if;

  update public.profiles set member_id=v_member_id,driver_nickname=v_registration.nickname,
    avatar_path=v_registration.avatar_path,avatar_url=null,updated_at=now()
  where user_id=v_registration.user_id;
  update public.caleris_member_registrations set status='approved',reviewed_by=v_actor,reviewed_at=now(),
    review_note=nullif(btrim(p_review_note),''),updated_at=now() where id=p_registration_id;
  return jsonb_build_object('ok',true,'status','approved','member_id',v_member_id,'team_id',v_team_id);
end;
$function$

CREATE OR REPLACE FUNCTION public.admin_list_member_registrations_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  v_result jsonb;
  v_row jsonb;
begin
  if (select auth.uid()) is null or not exists(
    select 1 from public.site_admins where user_id=(select auth.uid())
  ) then raise exception 'Akses administrator diperlukan.'; end if;

  v_base:=public.admin_list_member_registrations();
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'initial_division',r.initial_division,
      'engine_choice',r.engine_choice,
      'requested_engine_name',r.requested_engine_name,
      'selected_engine_id',r.selected_engine_id,
      'selected_engine_name',e.name,
      'main_color',r.main_color,
      'secondary_color',r.secondary_color
    ) order by r.created_at desc
  ),'[]'::jsonb)
  into v_result
  from jsonb_array_elements(coalesce(v_base,'[]'::jsonb)) as items(item)
  join public.caleris_member_registrations r on r.id=(item->>'id')::uuid
  left join public.caleris_engines e on e.id=r.selected_engine_id;
  return coalesce(v_result,'[]'::jsonb);
end;
$function$


create or replace view public.caleris_team_directory as
select t.id,t.name,t.division_key,t.takeover_listed,
  ((select v.total_valuation from public.caleris_team_valuations v where v.team_id=t.id order by v.assessed_at desc,v.id desc limit 1))::numeric as latest_valuation,
  coalesce(tp.main_color,'#7A263A') as main_color,
  coalesce(tp.secondary_color,'#C6A33A') as secondary_color
from public.teams t
left join public.caleris_team_profiles tp on tp.team_id=t.id;
