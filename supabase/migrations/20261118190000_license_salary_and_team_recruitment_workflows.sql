begin;

create table if not exists public.caleris_driver_salary_bands (
  license_label text primary key,
  license_tier text not null check (license_tier in ('bronze','silver','gold','super')),
  salary_min_eur numeric(20,2) not null check (salary_min_eur > 0),
  salary_max_eur numeric(20,2) not null check (salary_max_eur >= salary_min_eur),
  sort_order integer not null unique
);
insert into public.caleris_driver_salary_bands(license_label,license_tier,salary_min_eur,salary_max_eur,sort_order)
values
 ('Bronze','bronze',5000000,7500000,1),
 ('Silver','silver',7600000,12000000,2),
 ('Gold','gold',12100000,22500000,3),
 ('Super License','super',22600000,45000000,4)
on conflict (license_label) do update set
 license_tier=excluded.license_tier,
 salary_min_eur=excluded.salary_min_eur,
 salary_max_eur=excluded.salary_max_eur,
 sort_order=excluded.sort_order;

alter table public.caleris_driver_salary_bands enable row level security;
revoke all on public.caleris_driver_salary_bands from public,anon,authenticated,service_role;
grant select on public.caleris_driver_salary_bands to authenticated;
drop policy if exists "Authenticated read fixed driver salary bands" on public.caleris_driver_salary_bands;
create policy "Authenticated read fixed driver salary bands"
 on public.caleris_driver_salary_bands for select to authenticated using (true);

insert into public.caleris_development_license_tier_mapping(license_label,license_tier,is_active)
values ('Bronze','bronze',true),('Silver','silver',true),('Gold','gold',true),('Super License','super',true)
on conflict (license_label) do update
set license_tier=excluded.license_tier,is_active=true,updated_at=now();

alter table public.economy_driver_contracts
 drop constraint if exists economy_driver_contracts_status_check;
alter table public.economy_driver_contracts
 add constraint economy_driver_contracts_status_check
 check (status in ('pending_registration','active','suspended','ended'));

create or replace function private.guard_driver_contract()
returns trigger language plpgsql set search_path=''
as $$
declare
 v_driver public.members%rowtype;
 v_band public.caleris_driver_salary_bands%rowtype;
begin
 if tg_op='DELETE' then
   raise exception 'Kontrak Driver tidak dapat dihapus. Akhiri kontrak melalui alur lifecycle.';
 end if;
 select * into v_driver from public.members where id=new.member_id;
 if not found or v_driver.role<>'Driver' then
   raise exception 'Kontrak hanya berlaku untuk karakter Driver.';
 end if;
 select * into v_band from public.caleris_driver_salary_bands
 where lower(license_label)=lower(trim(coalesce(v_driver.license,'')));
 if not found then
   raise exception 'Lisensi Driver belum memiliki rentang gaji resmi.';
 end if;
 if new.annual_salary < v_band.salary_min_eur or new.annual_salary > v_band.salary_max_eur
   or new.annual_salary <> round(new.annual_salary,2) then
   raise exception 'Gaji tahunan harus berada pada rentang €% sampai €%.',v_band.salary_min_eur,v_band.salary_max_eur;
 end if;
 if tg_op='UPDATE' then
   if new.id is distinct from old.id or new.season_id is distinct from old.season_id
     or new.team_id is distinct from old.team_id or new.member_id is distinct from old.member_id
     or new.annual_salary is distinct from old.annual_salary then
     raise exception 'Identitas, tim, season, dan nominal gaji kontrak terkunci setelah disepakati.';
   end if;
 end if;
 if new.status in ('active','suspended') and v_driver.team_id is distinct from new.team_id then
   raise exception 'Kontrak aktif hanya dapat dimiliki Driver yang sudah terdaftar pada tim tersebut.';
 end if;
 if new.status='pending_registration' and v_driver.team_id is not null and v_driver.team_id is distinct from new.team_id then
   raise exception 'Driver sudah terikat dengan tim lain.';
 end if;
 return new;
end;
$$;

revoke insert,update,delete on public.economy_driver_contracts from authenticated;
grant select on public.economy_driver_contracts to authenticated;

create table if not exists public.caleris_free_agent_contract_negotiations (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.license_seasons(id) on delete restrict,
 team_id uuid not null references public.teams(id) on delete restrict,
 driver_member_id uuid not null references public.members(id) on delete restrict,
 annual_salary numeric(20,2) not null check (annual_salary>0),
 status text not null default 'offered' check (status in ('offered','negotiating','agreed','rejected','cancelled')),
 initiated_by uuid not null references public.members(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists caleris_free_agent_one_open_negotiation_idx
 on public.caleris_free_agent_contract_negotiations(driver_member_id)
 where status in ('offered','negotiating');

create table if not exists public.caleris_free_agent_contract_offers (
 id uuid primary key default gen_random_uuid(),
 negotiation_id uuid not null references public.caleris_free_agent_contract_negotiations(id) on delete restrict,
 offered_by_member_id uuid not null references public.members(id) on delete restrict,
 annual_salary numeric(20,2) not null check (annual_salary>0),
 note text,
 response text not null default 'pending' check (response in ('pending','countered','accepted','rejected','superseded')),
 created_at timestamptz not null default now()
);
create index if not exists caleris_free_agent_contract_offers_latest_idx
 on public.caleris_free_agent_contract_offers(negotiation_id,created_at desc,id desc);

alter table public.caleris_free_agent_contract_negotiations enable row level security;
alter table public.caleris_free_agent_contract_offers enable row level security;
revoke all on public.caleris_free_agent_contract_negotiations,public.caleris_free_agent_contract_offers from public,anon,authenticated,service_role;
grant select on public.caleris_free_agent_contract_negotiations,public.caleris_free_agent_contract_offers to authenticated;

drop policy if exists "Negotiation parties read free agent salary negotiations" on public.caleris_free_agent_contract_negotiations;
create policy "Negotiation parties read free agent salary negotiations"
 on public.caleris_free_agent_contract_negotiations for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=driver_member_id)
  or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role in ('Owner','Principal') and m.team_id=caleris_free_agent_contract_negotiations.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 );
drop policy if exists "Negotiation parties read free agent salary offers" on public.caleris_free_agent_contract_offers;
create policy "Negotiation parties read free agent salary offers"
 on public.caleris_free_agent_contract_offers for select to authenticated using (
  exists(select 1 from public.caleris_free_agent_contract_negotiations n
    join public.profiles p on p.member_id=n.driver_member_id
    where n.id=caleris_free_agent_contract_offers.negotiation_id and p.user_id=(select auth.uid()))
  or exists(select 1 from public.caleris_free_agent_contract_negotiations n
    join public.profiles p on true join public.members m on m.id=p.member_id
    where n.id=caleris_free_agent_contract_offers.negotiation_id and p.user_id=(select auth.uid()) and m.team_id=n.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 );

create or replace function public.member_start_free_agent_contract_negotiation(
 p_driver_member_id uuid,p_annual_salary numeric,p_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_actor public.members%rowtype;
 v_driver public.members%rowtype;
 v_season public.license_seasons%rowtype;
 v_band public.caleris_driver_salary_bands%rowtype;
 v_negotiation_id uuid;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
 where p.user_id=(select auth.uid());
 if not found or v_actor.role not in ('Owner','Principal') or v_actor.team_id is null then
  raise exception 'Hanya Team Owner/Principal yang dapat mengajukan kontrak Free Agent.';
 end if;
 select * into v_driver from public.members where id=p_driver_member_id and role='Driver' for update;
 if not found or v_driver.team_id is not null then
  raise exception 'Driver tidak lagi tersedia sebagai Free Agent.';
 end if;
 select * into v_band from public.caleris_driver_salary_bands
 where lower(license_label)=lower(trim(coalesce(v_driver.license,'')));
 if not found or p_annual_salary is null or p_annual_salary<v_band.salary_min_eur
   or p_annual_salary>v_band.salary_max_eur or p_annual_salary<>round(p_annual_salary,2) then
  raise exception 'Gaji tahunan harus mengikuti rentang lisensi Driver.';
 end if;
 if (select count(*) from public.members where team_id=v_actor.team_id and role='Driver')>=2 then
  raise exception 'Perekrutan Free Agent hanya tersedia untuk tim dengan kurang dari dua Driver.';
 end if;
 if exists(select 1 from public.economy_driver_contracts c
   where c.member_id=v_driver.id and c.status in ('pending_registration','active','suspended')) then
  raise exception 'Driver masih memiliki kontrak yang belum berakhir.';
 end if;
 select * into v_season from public.license_seasons where status='active'
 order by starts_on desc,created_at desc limit 1;
 if not found then
  select * into v_season from public.license_seasons where status='draft'
  order by starts_on,created_at desc limit 1;
 end if;
 if not found then raise exception 'Belum ada season aktif atau draft untuk kontrak Driver.'; end if;
 if exists(select 1 from public.caleris_free_agent_contract_negotiations n
   where n.driver_member_id=v_driver.id and n.status in ('offered','negotiating')) then
  raise exception 'Driver sedang menjalani negosiasi kontrak lain.';
 end if;
 insert into public.caleris_free_agent_contract_negotiations(
  season_id,team_id,driver_member_id,annual_salary,initiated_by,status
 ) values(v_season.id,v_actor.team_id,v_driver.id,p_annual_salary,v_actor.id,'offered')
 returning id into v_negotiation_id;
 insert into public.caleris_free_agent_contract_offers(negotiation_id,offered_by_member_id,annual_salary,note)
 values(v_negotiation_id,v_actor.id,p_annual_salary,nullif(trim(p_note),''));
 return v_negotiation_id;
end;
$$;

create or replace function public.member_respond_free_agent_contract_negotiation(
 p_negotiation_id uuid,p_action text,p_annual_salary numeric default null,p_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_actor public.members%rowtype;
 v_neg public.caleris_free_agent_contract_negotiations%rowtype;
 v_driver public.members%rowtype;
 v_last public.caleris_free_agent_contract_offers%rowtype;
 v_last_team uuid;
 v_band public.caleris_driver_salary_bands%rowtype;
 v_salary numeric(20,2);
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
 where p.user_id=(select auth.uid());
 if not found then raise exception 'Profil karakter tidak ditemukan.'; end if;
 select * into v_neg from public.caleris_free_agent_contract_negotiations
 where id=p_negotiation_id for update;
 if not found or v_neg.status not in ('offered','negotiating') then
  raise exception 'Negosiasi kontrak tidak lagi aktif.';
 end if;
 select * into v_driver from public.members where id=v_neg.driver_member_id for update;
 if not found then raise exception 'Driver tidak ditemukan.'; end if;
 if not ((v_actor.id=v_neg.driver_member_id and v_actor.role='Driver')
   or (v_actor.team_id=v_neg.team_id and v_actor.role in ('Owner','Principal'))) then
  raise exception 'Akun kamu bukan pihak dalam negosiasi ini.';
 end if;
 select * into v_last from public.caleris_free_agent_contract_offers
 where negotiation_id=v_neg.id order by created_at desc,id desc limit 1 for update;
 select team_id into v_last_team from public.members where id=v_last.offered_by_member_id;
 if v_last.id is null or v_last.offered_by_member_id=v_actor.id then
  raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.';
 end if;
 if p_action='reject' then
  update public.caleris_free_agent_contract_offers set response='rejected' where id=v_last.id;
  update public.caleris_free_agent_contract_negotiations set status='rejected',updated_at=now() where id=v_neg.id;
  return jsonb_build_object('status','rejected');
 elsif p_action='accept' then
  v_salary:=v_last.annual_salary;
  update public.caleris_free_agent_contract_offers set response='accepted' where id=v_last.id;
  update public.caleris_free_agent_contract_negotiations
   set status='agreed',annual_salary=v_salary,updated_at=now() where id=v_neg.id;
  insert into public.economy_driver_contracts(
   season_id,team_id,member_id,annual_salary,status,created_by,updated_by
  ) values(v_neg.season_id,v_neg.team_id,v_neg.driver_member_id,v_salary,'pending_registration',auth.uid(),auth.uid())
  on conflict(season_id,member_id) do nothing;
  if not found then raise exception 'Kontrak season untuk Driver sudah ada.'; end if;
  return jsonb_build_object('status','agreed','annual_salary',v_salary,'season_id',v_neg.season_id);
 elsif p_action='counter' then
  v_salary:=p_annual_salary;
  select * into v_band from public.caleris_driver_salary_bands
   where lower(license_label)=lower(trim(coalesce(v_driver.license,'')));
  if not found or v_salary is null or v_salary<v_band.salary_min_eur or v_salary>v_band.salary_max_eur
    or v_salary<>round(v_salary,2) then
   raise exception 'Counter-offer wajib berada dalam rentang gaji lisensi Driver.';
  end if;
  update public.caleris_free_agent_contract_offers set response='countered' where id=v_last.id;
  insert into public.caleris_free_agent_contract_offers(negotiation_id,offered_by_member_id,annual_salary,note)
  values(v_neg.id,v_actor.id,v_salary,nullif(trim(p_note),''));
  update public.caleris_free_agent_contract_negotiations
   set status='negotiating',annual_salary=v_salary,updated_at=now() where id=v_neg.id;
  return jsonb_build_object('status','negotiating','annual_salary',v_salary);
 else
  raise exception 'Aksi negosiasi tidak valid.';
 end if;
end;
$$;

create or replace function public.team_register_driver_to_fia(p_member_id uuid,p_season_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_actor public.members%rowtype;
 v_driver public.members%rowtype;
 v_team public.teams%rowtype;
 v_season public.license_seasons%rowtype;
 v_division public.license_season_divisions%rowtype;
 v_contract public.economy_driver_contracts%rowtype;
 v_roster_count integer;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
 where p.user_id=(select auth.uid());
 if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
  raise exception 'Hanya Team Owner yang dapat mengirim registrasi Driver ke FIA.';
 end if;
 select * into v_team from public.teams where id=v_actor.team_id for update;
 if not found then raise exception 'Tim tidak ditemukan.'; end if;
 select * into v_driver from public.members where id=p_member_id and role='Driver' for update;
 if not found then raise exception 'Driver tidak ditemukan.'; end if;
 select * into v_season from public.license_seasons where id=p_season_id;
 if not found then raise exception 'Season tidak ditemukan.'; end if;
 if v_season.status not in ('draft','active') then raise exception 'Registrasi hanya tersedia pada Pre Season atau season aktif.'; end if;
 select * into v_division from public.license_season_divisions
 where season_id=p_season_id and lower(division_key)=lower(v_team.division_key) limit 1;
 if not found then raise exception 'Divisi tim belum tersedia pada season yang dipilih.'; end if;
 select * into v_contract from public.economy_driver_contracts
 where season_id=p_season_id and team_id=v_team.id and member_id=v_driver.id
   and status in ('pending_registration','active') for update;
 if not found then raise exception 'Driver belum memiliki kontrak yang disepakati untuk season ini.'; end if;
 if v_driver.team_id is not null and v_driver.team_id<>v_team.id then
  raise exception 'Driver sudah terikat dengan tim lain.';
 end if;
 select count(*) into v_roster_count from public.members where team_id=v_team.id and role='Driver' and id<>v_driver.id;
 if v_roster_count>=2 then raise exception 'Roster tim sudah mencapai batas dua Driver.'; end if;
 update public.members set team_id=v_team.id where id=v_driver.id and team_id is null;
 update public.economy_driver_contracts set status='active',updated_by=auth.uid(),updated_at=now()
 where id=v_contract.id and status='pending_registration';
 insert into public.license_season_members(season_id,season_division_id,member_id,is_hiatus,preserved_license)
 values(p_season_id,v_division.id,v_driver.id,false,v_driver.license)
 on conflict(season_id,member_id) do nothing;
 if v_season.status='active' then
  insert into public.license_season_roster_snapshots(
   season_id,season_division_id,member_id,team_id,contract_id,
   driver_name_snapshot,team_name_snapshot,annual_salary_snapshot
  ) values(
   p_season_id,v_division.id,v_driver.id,v_team.id,v_contract.id,
   coalesce(v_driver.character_name,'Driver'),v_team.name,v_contract.annual_salary
  ) on conflict(season_division_id,member_id) do nothing;
  insert into public.license_round_standings(round_id,member_id,points_total)
  select r.id,v_driver.id,0 from public.license_rounds r
  where r.season_division_id=v_division.id and r.status<>'closed' and r.processed_at is null
  on conflict(round_id,member_id) do nothing;
  insert into public.license_final_standings(season_division_id,member_id,final_points,final_position,updated_by)
  select v_division.id,v_driver.id,0,
   coalesce((select max(fs.final_position)+1 from public.license_final_standings fs where fs.season_division_id=v_division.id),1),
   auth.uid()
  on conflict(season_division_id,member_id) do nothing;
 end if;
 return jsonb_build_object('ok',true,'member_id',v_driver.id,'team_id',v_team.id,'season_id',p_season_id,'season_status',v_season.status);
end;
$$;

create or replace function private.guard_caleris_job_advert()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_actor public.members%rowtype;
 v_band public.caleris_driver_salary_bands%rowtype;
 v_salary_ceiling numeric(20,2);
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
 where p.user_id=(select auth.uid());
 if not found or v_actor.role<>'Owner' or v_actor.team_id is distinct from new.team_id then
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
   raise exception 'Lowongan hanya dapat diterbitkan oleh Team Owner untuk timnya sendiri.';
  end if;
 end if;
 if new.position_kind='Driver' then
  select * into v_band from public.caleris_driver_salary_bands
   where lower(license_label)=lower(trim(coalesce(new.minimum_license,'')));
  select max(salary_max_eur) into v_salary_ceiling from public.caleris_driver_salary_bands;
  if not found or new.salary_min is null or new.salary_max is null
    or new.salary_min<v_band.salary_min_eur or new.salary_max>v_salary_ceiling
    or new.salary_max<new.salary_min then
   raise exception 'Rentang gaji lowongan harus valid untuk lisensi minimum yang dipilih.';
  end if;
 else
  if new.position_kind<>'Team Owner' then raise exception 'Posisi lowongan tidak valid.'; end if;
  new.minimum_license:=null;new.salary_min:=null;new.salary_max:=null;
 end if;
 return new;
end;
$$;
drop trigger if exists caleris_job_advert_salary_guard on public.caleris_job_adverts;
create trigger caleris_job_advert_salary_guard
before insert or update on public.caleris_job_adverts
for each row execute function private.guard_caleris_job_advert();

revoke all on function public.member_sign_free_agent(uuid) from public,anon,authenticated,service_role;
revoke all on function public.member_start_free_agent_contract_negotiation(uuid,numeric,text) from public,anon;
revoke all on function public.member_respond_free_agent_contract_negotiation(uuid,text,numeric,text) from public,anon;
revoke all on function public.team_register_driver_to_fia(uuid,uuid) from public,anon;
grant execute on function public.member_start_free_agent_contract_negotiation(uuid,numeric,text) to authenticated;
grant execute on function public.member_respond_free_agent_contract_negotiation(uuid,text,numeric,text) to authenticated;
grant execute on function public.team_register_driver_to_fia(uuid,uuid) to authenticated;

commit;
