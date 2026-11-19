-- CALERIS Intelligence feature suite: additive, owner-scoped planning and Admin-only judicial authority.
-- Existing race, economy, reputation, contract and historical records remain untouched.

-- Digital Court authority belongs to Site Admin only. FIA may not read or decide cases.
drop policy if exists "FIA and Admin update appeals" on public.caleris_appeals;
drop policy if exists "Targets and FIA read appeals" on public.caleris_appeals;
create policy "Admin updates appeals" on public.caleris_appeals
for update to authenticated
using (exists (select 1 from public.site_admins a where a.user_id=(select auth.uid())))
with check (exists (select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Targets and Admin read appeals" on public.caleris_appeals
for select to authenticated
using (
  exists (select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or (target_kind='member' and exists (
    select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_appeals.target_member_id
  ))
  or (target_kind='team' and exists (
    select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_appeals.target_team_id
  ))
);

create or replace function public.fia_decide_appeal(p_appeal_id uuid,p_approve boolean,p_decision text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_appeal public.caleris_appeals%rowtype;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.site_admins a where a.user_id=(select auth.uid())
  ) then raise exception 'Hanya Admin yang berwenang memutuskan banding.'; end if;
  if nullif(trim(p_decision),'') is null then raise exception 'Alasan keputusan wajib diisi.'; end if;
  select * into v_appeal from public.caleris_appeals where id=p_appeal_id for update;
  if not found then raise exception 'Banding tidak ditemukan.'; end if;
  if v_appeal.status<>'pending' then raise exception 'Banding sudah diputuskan.'; end if;
  update public.caleris_appeals
  set status=case when p_approve then 'approved' else 'rejected' end,
      fia_decision=trim(p_decision),decided_by=(select auth.uid()),decided_at=now()
  where id=p_appeal_id;
  return jsonb_build_object('id',p_appeal_id,'status',case when p_approve then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.fia_decide_appeal(uuid,boolean,text) from public,anon,service_role;
grant execute on function public.fia_decide_appeal(uuid,boolean,text) to authenticated;

-- Driver-owned development roadmap. Team Owners can suggest, but cannot edit targets.
create table if not exists public.caleris_driver_roadmaps (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  season_id uuid references public.license_seasons(id) on delete restrict,
  title text not null default 'Driver Development Roadmap',
  targets jsonb not null default '{}'::jsonb check (jsonb_typeof(targets)='object'),
  notes text,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_id,season_id)
);
create table if not exists public.caleris_driver_roadmap_suggestions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  suggested_by uuid not null references auth.users(id) on delete restrict,
  attribute_key text not null check (attribute_key in ('race_pace','qualifying_pace','experience','aggression','defensive_strength','overtake_skill','mistake_rate','tyre_management')),
  target_value integer not null check (target_value between 50 and 100),
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists caleris_driver_roadmap_suggestions_member_idx
on public.caleris_driver_roadmap_suggestions(member_id,status,created_at desc);

alter table public.caleris_driver_roadmaps enable row level security;
alter table public.caleris_driver_roadmap_suggestions enable row level security;
revoke all on public.caleris_driver_roadmaps,public.caleris_driver_roadmap_suggestions from public,anon,authenticated,service_role;
grant select,insert,update on public.caleris_driver_roadmaps to authenticated;
grant select,insert,update on public.caleris_driver_roadmap_suggestions to authenticated;
create policy "Drivers manage own roadmap" on public.caleris_driver_roadmaps
for all to authenticated
using (
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid()) and p.member_id=caleris_driver_roadmaps.member_id and m.role='Driver')
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
)
with check (
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid()) and p.member_id=caleris_driver_roadmaps.member_id and m.role='Driver')
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
create policy "Roadmap suggestions visible to driver team and Admin" on public.caleris_driver_roadmap_suggestions
for select to authenticated
using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_driver_roadmap_suggestions.member_id)
  or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_driver_roadmap_suggestions.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
create policy "Team Owners suggest roadmap targets" on public.caleris_driver_roadmap_suggestions
for insert to authenticated
with check (
  suggested_by=(select auth.uid())
  and exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
    join public.members driver on driver.id=caleris_driver_roadmap_suggestions.member_id
    where p.user_id=(select auth.uid()) and owner.role='Owner'
      and owner.team_id=caleris_driver_roadmap_suggestions.team_id
      and driver.role='Driver' and driver.team_id=owner.team_id)
);
create policy "Drivers decide roadmap suggestions" on public.caleris_driver_roadmap_suggestions
for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_driver_roadmap_suggestions.member_id))
with check (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_driver_roadmap_suggestions.member_id)
  and status in ('accepted','rejected')
);

-- Per-team budget plan is a planning/alert layer; it does not create shadow balances
-- or block payroll and other existing Economy Engine settlements.
create table if not exists public.caleris_team_budget_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  planned_budget numeric(20,2) not null check (planned_budget>=0),
  alert_threshold_percent integer not null default 80 check (alert_threshold_percent between 1 and 100),
  category_budgets jsonb not null default '{}'::jsonb check (jsonb_typeof(category_budgets)='object'),
  owner_notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,season_id)
);
alter table public.caleris_team_budget_plans enable row level security;
revoke all on public.caleris_team_budget_plans from public,anon,authenticated,service_role;
grant select,insert,update on public.caleris_team_budget_plans to authenticated;
create policy "Team Owners manage own budget plans" on public.caleris_team_budget_plans
for all to authenticated
using (
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_team_budget_plans.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
)
with check (
  (created_by=(select auth.uid()) and exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_team_budget_plans.team_id))
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);

-- Renewal offer: Team Owner proposes, Driver alone accepts or rejects.
create table if not exists public.caleris_driver_renewal_offers (
  id uuid primary key default gen_random_uuid(),
  current_contract_id uuid not null references public.economy_driver_contracts(id) on delete restrict,
  renewal_season_id uuid not null references public.license_seasons(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  proposed_salary numeric(20,2) not null check (proposed_salary>=0),
  offer_note text,
  driver_note text,
  status text not null default 'offered' check (status in ('offered','accepted','rejected','withdrawn')),
  created_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(current_contract_id,renewal_season_id)
);
alter table public.caleris_driver_renewal_offers enable row level security;
revoke all on public.caleris_driver_renewal_offers from public,anon,authenticated,service_role;
grant select,insert on public.caleris_driver_renewal_offers to authenticated;
create policy "Renewal offers visible to driver team and Admin" on public.caleris_driver_renewal_offers
for select to authenticated
using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_driver_renewal_offers.member_id)
  or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_driver_renewal_offers.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
create policy "Team Owners create renewal offers" on public.caleris_driver_renewal_offers
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and status='offered'
  and exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
    join public.economy_driver_contracts c on c.id=current_contract_id
    join public.members driver on driver.id=c.member_id
    where p.user_id=(select auth.uid()) and owner.role='Owner'
      and owner.team_id=caleris_driver_renewal_offers.team_id
      and c.team_id=owner.team_id and c.member_id=caleris_driver_renewal_offers.member_id
      and c.status='active' and driver.role='Driver' and driver.team_id=owner.team_id)
);
create or replace function public.team_owner_offer_driver_renewal(
  p_current_contract_id uuid,p_renewal_season_id uuid,p_proposed_salary numeric,p_offer_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor public.members%rowtype;v_contract public.economy_driver_contracts%rowtype;
v_season public.license_seasons%rowtype;v_current_season public.license_seasons%rowtype;
v_driver_license text;v_min numeric;v_max numeric;v_offer uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then raise exception 'Hanya Team Owner yang dapat menawarkan renewal.'; end if;
  select * into v_contract from public.economy_driver_contracts where id=p_current_contract_id and team_id=v_actor.team_id and status='active';
  if not found then raise exception 'Kontrak aktif Driver pada tim ini tidak ditemukan.'; end if;
  select * into v_season from public.license_seasons where id=p_renewal_season_id;
  if not found then raise exception 'Season renewal tidak ditemukan.'; end if;
  select * into v_current_season from public.license_seasons where id=v_contract.season_id;
  if not found or v_season.starts_on<=v_current_season.starts_on then raise exception 'Renewal harus ditujukan ke season setelah kontrak berjalan.'; end if;
  select license into v_driver_license from public.members where id=v_contract.member_id and role='Driver' and team_id=v_actor.team_id;
  if v_driver_license is null then raise exception 'Target renewal bukan Driver aktif tim ini.'; end if;
  select salary_min_eur,salary_max_eur into v_min,v_max from public.caleris_driver_salary_bands
  where lower(license_label)=lower(case when upper(v_driver_license)='A' then 'Super License' else v_driver_license end);
  if v_min is null or p_proposed_salary<v_min or p_proposed_salary>v_max then
    raise exception 'Gaji renewal harus berada dalam salary band lisensi Driver.';
  end if;
  insert into public.caleris_driver_renewal_offers(current_contract_id,renewal_season_id,member_id,team_id,proposed_salary,offer_note,created_by)
  values(p_current_contract_id,p_renewal_season_id,v_contract.member_id,v_actor.team_id,p_proposed_salary,nullif(trim(p_offer_note),''),(select auth.uid()))
  returning id into v_offer;
  return v_offer;
end;
$$;
revoke all on function public.team_owner_offer_driver_renewal(uuid,uuid,numeric,text) from public,anon,service_role;
grant execute on function public.team_owner_offer_driver_renewal(uuid,uuid,numeric,text) to authenticated;

create or replace function public.member_decide_driver_renewal(p_offer_id uuid,p_accept boolean,p_driver_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;v_offer public.caleris_driver_renewal_offers%rowtype;
v_driver_license text;v_min numeric;v_max numeric;v_contract_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select member_id into v_member_id from public.profiles where user_id=(select auth.uid());
  if v_member_id is null then raise exception 'Akun belum terhubung ke Driver.'; end if;
  select * into v_offer from public.caleris_driver_renewal_offers where id=p_offer_id and member_id=v_member_id for update;
  if not found or v_offer.status<>'offered' then raise exception 'Penawaran renewal tidak tersedia atau sudah diputuskan.'; end if;
  if not exists(select 1 from public.members where id=v_member_id and role='Driver' and team_id=v_offer.team_id) then
    raise exception 'Hanya Driver yang masih terikat pada tim penawar dapat memutuskan renewal ini.';
  end if;
  if p_accept then
    select license into v_driver_license from public.members where id=v_member_id;
    select salary_min_eur,salary_max_eur into v_min,v_max from public.caleris_driver_salary_bands
    where lower(license_label)=lower(case when upper(v_driver_license)='A' then 'Super License' else v_driver_license end);
    if v_min is null or v_offer.proposed_salary<v_min or v_offer.proposed_salary>v_max then
      raise exception 'Salary band lisensi berubah. Minta Team Owner mengirim penawaran baru.';
    end if;
    if exists(select 1 from public.economy_driver_contracts where season_id=v_offer.renewal_season_id and member_id=v_member_id and status='active') then
      raise exception 'Driver sudah memiliki kontrak aktif untuk season tujuan.';
    end if;
    insert into public.economy_driver_contracts(season_id,team_id,member_id,annual_salary,status,created_by)
    values(v_offer.renewal_season_id,v_offer.team_id,v_member_id,v_offer.proposed_salary,'active',(select auth.uid()))
    returning id into v_contract_id;
  end if;
  update public.caleris_driver_renewal_offers
  set status=case when p_accept then 'accepted' else 'rejected' end,
      driver_note=nullif(trim(p_driver_note),''),decided_at=now(),updated_at=now()
  where id=p_offer_id;
  return jsonb_build_object('offer_id',p_offer_id,'status',case when p_accept then 'accepted' else 'rejected' end,'contract_id',v_contract_id);
end;
$$;
revoke all on function public.member_decide_driver_renewal(uuid,boolean,text) from public,anon,service_role;
grant execute on function public.member_decide_driver_renewal(uuid,boolean,text) to authenticated;
