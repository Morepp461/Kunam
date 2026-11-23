create table if not exists public.caleris_driver_contract_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  current_contract_id uuid not null references public.economy_driver_contracts(id) on delete restrict,
  requested_salary numeric(18,2) not null check (requested_salary > 0),
  requested_duration_seasons integer not null check (requested_duration_seasons between 1 and 5),
  request_note text,
  status text not null default 'pending' check (status in ('pending','offer_sent','declined','withdrawn')),
  renewal_offer_id uuid references public.caleris_driver_renewal_offers(id) on delete restrict,
  owner_response_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caleris_driver_contract_requests_note_length check (request_note is null or length(request_note) <= 1000),
  constraint caleris_driver_contract_requests_response_length check (owner_response_note is null or length(owner_response_note) <= 1000)
);

create index if not exists caleris_driver_contract_requests_team_status_idx
  on public.caleris_driver_contract_requests(team_id,status,created_at desc);
create index if not exists caleris_driver_contract_requests_member_idx
  on public.caleris_driver_contract_requests(member_id,created_at desc);
create unique index if not exists caleris_driver_contract_requests_one_pending_per_driver
  on public.caleris_driver_contract_requests(member_id) where status='pending';

alter table public.caleris_driver_contract_requests enable row level security;
revoke all on public.caleris_driver_contract_requests from anon,authenticated;
grant select on public.caleris_driver_contract_requests to authenticated;

drop policy if exists "Drivers owners and admins read contract requests" on public.caleris_driver_contract_requests;
create policy "Drivers owners and admins read contract requests"
on public.caleris_driver_contract_requests for select to authenticated
using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=caleris_driver_contract_requests.member_id)
  or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_driver_contract_requests.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);

create or replace function public.member_submit_driver_contract_request(
  p_requested_salary numeric,
  p_duration_seasons integer,
  p_request_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_contract public.economy_driver_contracts%rowtype;
  v_season_id uuid;
  v_min numeric;
  v_max numeric;
  v_request_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  if p_duration_seasons not between 1 and 5 then raise exception 'Durasi kontrak harus 1 sampai 5 season.'; end if;
  if p_requested_salary is null or p_requested_salary<=0 then raise exception 'Gaji yang diajukan harus lebih besar dari nol.'; end if;
  if length(coalesce(p_request_note,''))>1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  select m.* into v_member
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_member.role<>'Driver' or v_member.team_id is null then
    raise exception 'Pengajuan renewal hanya tersedia bagi Driver yang sedang terikat pada tim.';
  end if;

  select id into v_season_id from public.license_seasons
  where status='active' order by starts_on desc limit 1;
  if v_season_id is null then raise exception 'Tidak ada season aktif untuk kontrak saat ini.'; end if;

  select * into v_contract from public.economy_driver_contracts
  where season_id=v_season_id and member_id=v_member.id and team_id=v_member.team_id and status='active'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'Kontrak aktif pada season berjalan tidak ditemukan. Gunakan Job Search untuk melamar tim lain.'; end if;

  select salary_min_eur,salary_max_eur into v_min,v_max
  from public.caleris_driver_salary_bands
  where lower(license_label)=lower(case when upper(v_member.license)='A' then 'Super License' else v_member.license end);
  if v_min is null or p_requested_salary<v_min or p_requested_salary>v_max then
    raise exception 'Gaji pengajuan harus berada dalam salary band lisensi Driver.';
  end if;

  insert into public.caleris_driver_contract_requests(team_id,member_id,current_contract_id,requested_salary,requested_duration_seasons,request_note)
  values(v_member.team_id,v_member.id,v_contract.id,round(p_requested_salary,2),p_duration_seasons,nullif(trim(p_request_note),''))
  returning id into v_request_id;
  return v_request_id;
end;
$function$;

create or replace function public.team_owner_offer_driver_renewal_from_request(
  p_request_id uuid,
  p_duration_seasons integer,
  p_proposed_salary numeric,
  p_offer_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor public.members%rowtype;
  v_request public.caleris_driver_contract_requests%rowtype;
  v_offer_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
    raise exception 'Hanya Team Owner yang dapat memproses pengajuan kontrak.';
  end if;
  select * into v_request from public.caleris_driver_contract_requests
  where id=p_request_id and team_id=v_actor.team_id and status='pending' for update;
  if not found then raise exception 'Pengajuan tidak tersedia atau sudah diproses.'; end if;

  v_offer_id:=public.team_owner_offer_driver_renewal(
    v_request.current_contract_id,p_duration_seasons,p_proposed_salary,p_offer_note
  );
  update public.caleris_driver_contract_requests
  set status='offer_sent',renewal_offer_id=v_offer_id,owner_response_note=nullif(trim(p_offer_note),''),
      reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now()
  where id=v_request.id;
  return v_offer_id;
end;
$function$;

create or replace function public.team_owner_decline_driver_contract_request(
  p_request_id uuid,
  p_response_note text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor public.members%rowtype;
  v_request public.caleris_driver_contract_requests%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  if length(coalesce(p_response_note,''))>1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;
  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
    raise exception 'Hanya Team Owner yang dapat memproses pengajuan kontrak.';
  end if;
  select * into v_request from public.caleris_driver_contract_requests
  where id=p_request_id and team_id=v_actor.team_id and status='pending' for update;
  if not found then raise exception 'Pengajuan tidak tersedia atau sudah diproses.'; end if;
  update public.caleris_driver_contract_requests
  set status='declined',owner_response_note=nullif(trim(p_response_note),''),reviewed_by=(select auth.uid()),
      reviewed_at=now(),updated_at=now()
  where id=v_request.id;
  return true;
end;
$function$;

revoke all on function public.member_submit_driver_contract_request(numeric,integer,text) from public,anon;
revoke all on function public.team_owner_offer_driver_renewal_from_request(uuid,integer,numeric,text) from public,anon;
revoke all on function public.team_owner_decline_driver_contract_request(uuid,text) from public,anon;
grant execute on function public.member_submit_driver_contract_request(numeric,integer,text) to authenticated;
grant execute on function public.team_owner_offer_driver_renewal_from_request(uuid,integer,numeric,text) to authenticated;
grant execute on function public.team_owner_decline_driver_contract_request(uuid,text) to authenticated;
