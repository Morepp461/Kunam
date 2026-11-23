-- Allow a rostered Driver to request a first contract when no active contract row exists.
-- Existing renewal offers keep the same decision/contract-creation engine.
alter table public.caleris_driver_contract_requests
  alter column current_contract_id drop not null;

alter table public.caleris_driver_renewal_offers
  alter column current_contract_id drop not null;

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
  v_has_active_contract boolean:=false;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  if p_duration_seasons not between 1 and 5 then raise exception 'Durasi kontrak harus 1 sampai 5 season.'; end if;
  if p_requested_salary is null or p_requested_salary<=0 then raise exception 'Gaji yang diajukan harus lebih besar dari nol.'; end if;
  if length(coalesce(p_request_note,''))>1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  select m.* into v_member
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_member.role<>'Driver' or v_member.team_id is null then
    raise exception 'Pengajuan kontrak hanya tersedia bagi Driver yang terhubung ke tim.';
  end if;

  select id into v_season_id from public.license_seasons
  where status='active' order by starts_on desc limit 1;
  if v_season_id is null then raise exception 'Tidak ada season aktif untuk pengajuan kontrak.'; end if;

  select * into v_contract from public.economy_driver_contracts
  where season_id=v_season_id and member_id=v_member.id and team_id=v_member.team_id and status='active'
  order by created_at desc limit 1 for update;
  v_has_active_contract:=found;

  select salary_min_eur,salary_max_eur into v_min,v_max
  from public.caleris_driver_salary_bands
  where lower(license_label)=lower(case when upper(v_member.license)='A' then 'Super License' else v_member.license end);
  if v_min is null or p_requested_salary<v_min or p_requested_salary>v_max then
    raise exception 'Gaji pengajuan harus berada dalam salary band lisensi Driver.';
  end if;

  insert into public.caleris_driver_contract_requests(
    team_id,member_id,current_contract_id,requested_salary,requested_duration_seasons,request_note
  ) values (
    v_member.team_id,v_member.id,case when v_has_active_contract then v_contract.id else null end,
    round(p_requested_salary,2),p_duration_seasons,nullif(trim(p_request_note),'')
  )
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
  v_driver_license text;
  v_min numeric;
  v_max numeric;
  v_active_season public.license_seasons%rowtype;
  v_first_season uuid;
  v_offer_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  if p_duration_seasons not between 1 and 5 then raise exception 'Durasi kontrak harus 1 sampai 5 season.'; end if;
  if p_proposed_salary is null or p_proposed_salary<=0 then raise exception 'Gaji penawaran harus lebih besar dari nol.'; end if;
  if length(coalesce(p_offer_note,''))>1000 then raise exception 'Catatan penawaran maksimal 1000 karakter.'; end if;

  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
    raise exception 'Hanya Team Owner yang dapat memproses pengajuan kontrak.';
  end if;
  select * into v_request from public.caleris_driver_contract_requests
  where id=p_request_id and team_id=v_actor.team_id and status='pending' for update;
  if not found then raise exception 'Pengajuan tidak tersedia atau sudah diproses.'; end if;

  if v_request.current_contract_id is not null then
    v_offer_id:=public.team_owner_offer_driver_renewal(
      v_request.current_contract_id,p_duration_seasons,p_proposed_salary,p_offer_note
    );
  else
    select license into v_driver_license from public.members
    where id=v_request.member_id and role='Driver' and team_id=v_actor.team_id;
    if v_driver_license is null then raise exception 'Target pengajuan bukan Driver aktif tim ini.'; end if;

    select * into v_active_season from public.license_seasons
    where status='active' order by starts_on desc limit 1;
    if not found then raise exception 'Tidak ada season aktif untuk membuat kontrak.'; end if;

    select id into v_first_season from public.license_seasons
    where starts_on>v_active_season.starts_on and status in ('draft','active')
    order by starts_on limit 1;
    if v_first_season is null then
      raise exception 'Season berikutnya belum dibuat. Penawaran kontrak dapat dikirim setelah season baru tersedia.';
    end if;

    select salary_min_eur,salary_max_eur into v_min,v_max
    from public.caleris_driver_salary_bands
    where lower(license_label)=lower(case when upper(v_driver_license)='A' then 'Super License' else v_driver_license end);
    if v_min is null or p_proposed_salary<v_min or p_proposed_salary>v_max then
      raise exception 'Gaji kontrak harus berada dalam salary band lisensi Driver.';
    end if;

    insert into public.caleris_driver_renewal_offers(
      current_contract_id,renewal_season_id,duration_seasons,member_id,team_id,
      proposed_salary,offer_note,created_by
    ) values (
      null,v_first_season,p_duration_seasons,v_request.member_id,v_actor.team_id,
      round(p_proposed_salary,2),nullif(trim(p_offer_note),''),(select auth.uid())
    ) returning id into v_offer_id;
  end if;

  update public.caleris_driver_contract_requests
  set status='offer_sent',renewal_offer_id=v_offer_id,owner_response_note=nullif(trim(p_offer_note,' '),''),
      reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now()
  where id=v_request.id;
  return v_offer_id;
end;
$function$;

revoke all on function public.member_submit_driver_contract_request(numeric,integer,text) from public,anon;
revoke all on function public.team_owner_offer_driver_renewal_from_request(uuid,integer,numeric,text) from public,anon;
grant execute on function public.member_submit_driver_contract_request(numeric,integer,text) to authenticated;
grant execute on function public.team_owner_offer_driver_renewal_from_request(uuid,integer,numeric,text) to authenticated;
