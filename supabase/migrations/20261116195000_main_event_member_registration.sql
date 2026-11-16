-- Main Event member registration and Admin approval workflow.
alter table public.caleris_team_profiles
  add column if not exists description text,
  add column if not exists vision text,
  add column if not exists long_term_target text;

create table if not exists public.caleris_member_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null check (requested_role in ('Driver','Owner')),
  nickname text not null check (length(btrim(nickname)) between 1 and 32),
  avatar_path text,
  nationality text not null,
  hometown text not null,
  driver_number_preference text,
  preferred_team_id uuid references public.teams(id) on delete set null,
  driver_epithet text,
  team_name text,
  team_logo_path text,
  team_base_nation text,
  team_hometown text,
  team_founded_year integer,
  team_description text,
  team_vision text,
  team_long_term_target text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caleris_registration_role_payload_check check (
    (requested_role='Driver'
      and avatar_path is not null
      and driver_number_preference is not null
      and team_name is null
      and team_logo_path is null)
    or
    (requested_role='Owner'
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
  )
);
create unique index if not exists caleris_member_registrations_one_pending_per_user
  on public.caleris_member_registrations(user_id) where status='pending';
create index if not exists caleris_member_registrations_admin_queue_idx
  on public.caleris_member_registrations(status,created_at desc);

create table if not exists public.caleris_team_driver_applications (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.caleris_member_registrations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  nickname text not null,
  avatar_path text not null,
  nationality text not null,
  hometown text not null,
  driver_number_preference text not null,
  driver_epithet text not null,
  status text not null default 'pending' check (status in ('pending','reviewed','withdrawn')),
  created_at timestamptz not null default now()
);
create index if not exists caleris_team_driver_applications_team_idx
  on public.caleris_team_driver_applications(team_id,status,created_at desc);

alter table public.caleris_member_registrations enable row level security;
alter table public.caleris_team_driver_applications enable row level security;
revoke all on public.caleris_member_registrations, public.caleris_team_driver_applications from public,anon,authenticated,service_role;
grant select on public.caleris_member_registrations, public.caleris_team_driver_applications to authenticated;

drop policy if exists "Members read own registration submissions" on public.caleris_member_registrations;
create policy "Members read own registration submissions" on public.caleris_member_registrations
for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Admins read registration submissions" on public.caleris_member_registrations;
create policy "Admins read registration submissions" on public.caleris_member_registrations
for select to authenticated using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Team owners read driver applications" on public.caleris_team_driver_applications;
create policy "Team owners read driver applications" on public.caleris_team_driver_applications
for select to authenticated using (
  exists(
    select 1
    from public.profiles owner_profile
    join public.members owner_member on owner_member.id=owner_profile.member_id
    where owner_profile.user_id=(select auth.uid())
      and owner_member.role='Owner'
      and owner_member.team_id=caleris_team_driver_applications.team_id
  )
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('team-logos','team-logos',true,5242880,array['image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/png','image/webp'];

drop policy if exists "Public read Caleris team logos" on storage.objects;
create policy "Public read Caleris team logos" on storage.objects
for select to public using (bucket_id='team-logos');
drop policy if exists "Users upload own Caleris team logos" on storage.objects;
create policy "Users upload own Caleris team logos" on storage.objects
for insert to authenticated with check (
  bucket_id='team-logos' and (storage.foldername(name))[1]=(select auth.uid())::text
);
drop policy if exists "Users update own Caleris team logos" on storage.objects;
create policy "Users update own Caleris team logos" on storage.objects
for update to authenticated using (
  bucket_id='team-logos' and (storage.foldername(name))[1]=(select auth.uid())::text
) with check (
  bucket_id='team-logos' and (storage.foldername(name))[1]=(select auth.uid())::text
);
drop policy if exists "Users delete own Caleris team logos" on storage.objects;
create policy "Users delete own Caleris team logos" on storage.objects
for delete to authenticated using (
  bucket_id='team-logos' and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Team owners read applicant avatars" on storage.objects;
create policy "Team owners read applicant avatars" on storage.objects
for select to authenticated using (
  bucket_id='profile-avatars'
  and exists(
    select 1
    from public.caleris_team_driver_applications a
    join public.profiles applicant on applicant.user_id=a.applicant_user_id
    join public.profiles owner_profile on owner_profile.user_id=(select auth.uid())
    join public.members owner_member on owner_member.id=owner_profile.member_id
    where a.avatar_path=name
      and owner_member.role='Owner'
      and owner_member.team_id=a.team_id
  )
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
      user_id,requested_role,nickname,nationality,hometown,team_name,team_logo_path,
      team_base_nation,team_hometown,team_founded_year,team_description,team_vision,team_long_term_target
    ) values (
      v_user_id,'Owner',v_nickname,v_nationality,v_hometown,v_team_name,v_team_logo_path,
      nullif(btrim(p_payload->>'team_base_nation'),''),nullif(btrim(p_payload->>'team_hometown'),''),v_year,
      btrim(p_payload->>'team_description'),btrim(p_payload->>'team_vision'),btrim(p_payload->>'team_long_term_target')
    ) returning id into v_registration_id;
    update public.profiles set driver_nickname=v_nickname,preferred_role='Team Owner',updated_at=now()
    where user_id=v_user_id;
  end if;

  return jsonb_build_object('ok',true,'registration_id',v_registration_id,'status','pending');
end;
$function$;

create or replace function public.admin_list_member_registrations()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then
    raise exception 'Akses administrator diperlukan.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'user_id',r.user_id,'requested_role',r.requested_role,'nickname',r.nickname,
    'avatar_path',r.avatar_path,'nationality',r.nationality,'hometown',r.hometown,
    'driver_number_preference',r.driver_number_preference,'preferred_team_id',r.preferred_team_id,
    'preferred_team_name',preferred_team.name,'driver_epithet',r.driver_epithet,
    'team_name',r.team_name,'team_logo_path',r.team_logo_path,'team_base_nation',r.team_base_nation,
    'team_hometown',r.team_hometown,'team_founded_year',r.team_founded_year,
    'team_description',r.team_description,'team_vision',r.team_vision,
    'team_long_term_target',r.team_long_term_target,'status',r.status,
    'review_note',r.review_note,'created_at',r.created_at,'reviewed_at',r.reviewed_at,
    'email',u.email,'web_nickname',p.web_nickname,'member_id',p.member_id
  ) order by case r.status when 'pending' then 0 when 'approved' then 1 else 2 end,r.created_at desc),'[]'::jsonb)
  into v_result
  from public.caleris_member_registrations r
  join auth.users u on u.id=r.user_id
  join public.profiles p on p.user_id=r.user_id
  left join public.teams preferred_team on preferred_team.id=r.preferred_team_id;
  return v_result;
end;
$function$;

create or replace function public.team_list_driver_applications()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_user_id uuid:=(select auth.uid()); v_team_id uuid; v_result jsonb;
begin
  select m.team_id into v_team_id
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=v_user_id and m.role='Owner' and m.team_id is not null;
  if v_user_id is null or v_team_id is null then raise exception 'Akses Team Owner diperlukan.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'registration_id',a.registration_id,'nickname',a.nickname,'avatar_path',a.avatar_path,
    'nationality',a.nationality,'hometown',a.hometown,'driver_number_preference',a.driver_number_preference,
    'driver_epithet',a.driver_epithet,'status',a.status,'created_at',a.created_at
  ) order by a.created_at desc),'[]'::jsonb)
  into v_result from public.caleris_team_driver_applications a where a.team_id=v_team_id;
  return v_result;
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
    avatar_path=case when v_registration.requested_role='Driver' then v_registration.avatar_path else avatar_path end,
    avatar_url=case when v_registration.requested_role='Driver' then null else avatar_url end,updated_at=now()
  where user_id=v_registration.user_id;
  update public.caleris_member_registrations set status='approved',reviewed_by=v_actor,reviewed_at=now(),
    review_note=nullif(btrim(p_review_note),''),updated_at=now() where id=p_registration_id;
  return jsonb_build_object('ok',true,'status','approved','member_id',v_member_id,'team_id',v_team_id);
end;
$function$;

revoke all on function public.submit_main_event_registration(jsonb) from public,anon;
revoke all on function public.admin_list_member_registrations() from public,anon;
revoke all on function public.team_list_driver_applications() from public,anon;
revoke all on function public.admin_review_member_registration(uuid,text,text) from public,anon;
grant execute on function public.submit_main_event_registration(jsonb) to authenticated;
grant execute on function public.admin_list_member_registrations() to authenticated;
grant execute on function public.team_list_driver_applications() to authenticated;
grant execute on function public.admin_review_member_registration(uuid,text,text) to authenticated;
