-- Avatar is a required part of the first registration stage for both roles.
alter table public.caleris_member_registrations
  drop constraint if exists caleris_registration_role_payload_check;
alter table public.caleris_member_registrations
  add constraint caleris_registration_role_payload_check check (
    (requested_role='Driver'
      and avatar_path is not null
      and driver_number_preference is not null
      and team_name is null
      and team_logo_path is null)
    or
    (requested_role='Owner'
      and avatar_path is not null
      and team_name is not null
      and team_logo_path is not null
      and team_base_nation is not null
      and team_hometown is not null
      and team_founded_year is not null
      and team_description is not null
      and team_vision is not null
      and team_long_term_target is not null
      and preferred_team_id is null
      and driver_number_preference is null)
  );

create or replace function public.submit_main_event_registration(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_member public.members%rowtype;
  v_role text;
  v_nickname text;
  v_avatar_path text;
  v_team_id uuid;
  v_registration_id uuid;
  v_year integer;
  v_team_name text;
  v_team_logo_path text;
  v_nationality text;
  v_hometown text;
begin
  if v_user_id is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Data pendaftaran tidak valid.'; end if;

  select * into v_profile from public.profiles where user_id=v_user_id for update;
  if not found or v_profile.onboarding_completed is not true then
    raise exception 'Selesaikan Paddock Access sebelum mendaftar Main Event.';
  end if;
  v_nationality:=nullif(btrim(v_profile.nationality),'');
  v_hometown:=nullif(btrim(v_profile.hometown),'');
  if v_nationality is null or v_hometown is null then
    raise exception 'Nationality dan hometown wajib tersedia di profil.';
  end if;

  if v_profile.member_id is not null then
    select * into v_member from public.members where id=v_profile.member_id for update;
    if found and v_member.role is not null then
      raise exception 'Akun ini sudah memiliki role aktif.';
    end if;
  end if;

  v_role:=p_payload->>'requested_role';
  if v_role is null or v_role not in ('Driver','Owner') then raise exception 'Role pendaftaran tidak valid.'; end if;
  v_nickname:=nullif(btrim(p_payload->>'nickname'),'');
  if v_nickname is null or length(v_nickname)>32 then raise exception 'Nickname wajib diisi, maksimal 32 karakter.'; end if;

  if exists(select 1 from public.caleris_member_registrations where user_id=v_user_id and status='pending') then
    raise exception 'Masih ada pendaftaran yang menunggu keputusan Admin.';
  end if;

  if v_role='Driver' then
    v_avatar_path:=nullif(p_payload->>'avatar_path','');
    if v_avatar_path is null or split_part(v_avatar_path,'/',1)<>v_user_id::text
       or position('..' in v_avatar_path)>0
       or not exists(select 1 from storage.objects o where o.bucket_id='profile-avatars' and o.name=v_avatar_path) then
      raise exception 'Upload avatar Driver yang valid terlebih dahulu.';
    end if;
    if coalesce(p_payload->>'driver_number_preference','') !~ '^[0-9]{1,4}$' then
      raise exception 'Preferensi nomor Driver wajib berupa 1 sampai 4 digit.';
    end if;
    if length(btrim(coalesce(p_payload->>'driver_epithet','')))<1 or length(btrim(coalesce(p_payload->>'driver_epithet','')))>60 then raise exception 'Julukan Driver wajib diisi, maksimal 60 karakter.'; end if;
    v_team_id:=nullif(p_payload->>'preferred_team_id','')::uuid;
    if v_team_id is not null and not exists(select 1 from public.teams where id=v_team_id) then
      raise exception 'Tim pilihan tidak ditemukan.';
    end if;
    insert into public.caleris_member_registrations(
      user_id,requested_role,nickname,avatar_path,nationality,hometown,
      driver_number_preference,preferred_team_id,driver_epithet
    ) values (
      v_user_id,'Driver',v_nickname,v_avatar_path,v_nationality,v_hometown,
      p_payload->>'driver_number_preference',v_team_id,
      nullif(btrim(p_payload->>'driver_epithet'),'')
    ) returning id into v_registration_id;

    if v_team_id is not null then
      insert into public.caleris_team_driver_applications(
        registration_id,team_id,applicant_user_id,nickname,avatar_path,nationality,hometown,
        driver_number_preference,driver_epithet
      ) values (
        v_registration_id,v_team_id,v_user_id,v_nickname,v_avatar_path,v_nationality,v_hometown,
        p_payload->>'driver_number_preference',coalesce(nullif(btrim(p_payload->>'driver_epithet'),''),'')
      );
    end if;
    update public.profiles set driver_nickname=v_nickname,preferred_role='Driver',updated_at=now()
    where user_id=v_user_id;
  else
    v_avatar_path:=nullif(p_payload->>'avatar_path','');
    if v_avatar_path is null or split_part(v_avatar_path,'/',1)<>v_user_id::text
       or position('..' in v_avatar_path)>0
       or not exists(select 1 from storage.objects o where o.bucket_id='profile-avatars' and o.name=v_avatar_path) then
      raise exception 'Upload avatar Driver Suit yang valid terlebih dahulu.';
    end if;
    v_team_name:=nullif(btrim(p_payload->>'team_name'),'');
    v_team_logo_path:=nullif(p_payload->>'team_logo_path','');
    if v_team_name is null or length(v_team_name) not between 2 and 60 then raise exception 'Nama tim wajib diisi (2–60 karakter).'; end if;
    if v_team_logo_path is null or split_part(v_team_logo_path,'/',1)<>v_user_id::text
       or position('..' in v_team_logo_path)>0
       or not exists(select 1 from storage.objects o where o.bucket_id='team-logos' and o.name=v_team_logo_path) then
      raise exception 'Upload logo tim PNG/WebP transparan terlebih dahulu.';
    end if;
    v_year:=nullif(p_payload->>'team_founded_year','')::integer;
    if v_year is null or v_year<1800 or v_year>extract(year from now())::integer+1 then
      raise exception 'Tahun berdiri tidak valid.';
    end if;
    if length(btrim(coalesce(p_payload->>'team_description','')))<10
       or length(btrim(coalesce(p_payload->>'team_description','')))>1500
       or length(btrim(coalesce(p_payload->>'team_vision','')))<5
       or length(btrim(coalesce(p_payload->>'team_vision','')))>1000
       or length(btrim(coalesce(p_payload->>'team_long_term_target','')))<5
       or length(btrim(coalesce(p_payload->>'team_long_term_target','')))>1000 then
      raise exception 'Deskripsi, visi, dan target jangka panjang wajib dilengkapi.';
    end if;
    if exists(select 1 from public.teams where lower(name)=lower(v_team_name)) then
      raise exception 'Nama tim sudah digunakan.';
    end if;
    insert into public.caleris_member_registrations(
      user_id,requested_role,nickname,avatar_path,nationality,hometown,team_name,team_logo_path,
      team_base_nation,team_hometown,team_founded_year,team_description,team_vision,team_long_term_target
    ) values (
      v_user_id,'Owner',v_nickname,v_avatar_path,v_nationality,v_hometown,v_team_name,v_team_logo_path,
      nullif(btrim(p_payload->>'team_base_nation'),''),nullif(btrim(p_payload->>'team_hometown'),''),v_year,
      btrim(p_payload->>'team_description'),btrim(p_payload->>'team_vision'),btrim(p_payload->>'team_long_term_target')
    ) returning id into v_registration_id;
    update public.profiles set driver_nickname=v_nickname,preferred_role='Team Owner',updated_at=now()
    where user_id=v_user_id;
  end if;

  return jsonb_build_object('ok',true,'registration_id',v_registration_id,'status','pending');
end;
$function$;

create or replace function public.admin_review_member_registration(
  p_registration_id uuid,
  p_decision text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
      team_id,logo_url,country_of_origin,base_location,founded_year,history,description,vision,long_term_target,updated_by
    ) values (
      v_team_id,v_team_logo_url,v_registration.team_base_nation,v_registration.team_hometown,
      v_registration.team_founded_year,v_registration.team_description,v_registration.team_description,
      v_registration.team_vision,v_registration.team_long_term_target,v_actor
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
$function$;
