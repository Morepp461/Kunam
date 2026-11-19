alter table public.caleris_driver_renewal_offers
  add column if not exists duration_seasons integer not null default 1
  check (duration_seasons between 1 and 5);

create or replace function public.team_owner_offer_driver_renewal(
  p_current_contract_id uuid,
  p_duration_seasons integer,
  p_proposed_salary numeric,
  p_offer_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_contract public.economy_driver_contracts%rowtype;
  v_current_season public.license_seasons%rowtype;
  v_first_season uuid;
  v_season_count integer;
  v_driver_license text;
  v_min numeric;
  v_max numeric;
  v_offer uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  if p_duration_seasons not between 1 and 5 then raise exception 'Durasi kontrak harus 1 sampai 5 season.'; end if;
  select m.* into v_actor
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
    raise exception 'Hanya Team Owner yang dapat menawarkan renewal.';
  end if;
  select * into v_contract from public.economy_driver_contracts
  where id=p_current_contract_id and team_id=v_actor.team_id and status='active'
  for update;
  if not found then raise exception 'Kontrak aktif Driver pada tim ini tidak ditemukan.'; end if;
  select * into v_current_season from public.license_seasons where id=v_contract.season_id;
  if not found then raise exception 'Season kontrak berjalan tidak ditemukan.'; end if;

  select count(*), (array_agg(id order by starts_on))[1]
    into v_season_count, v_first_season
  from (
    select id,starts_on from public.license_seasons
    where starts_on>v_current_season.starts_on
      and status in ('draft','active')
    order by starts_on
    limit p_duration_seasons
  ) next_seasons;
  if v_season_count<>p_duration_seasons or v_first_season is null then
    raise exception 'Jumlah season mendatang belum mencukupi untuk durasi yang dipilih.';
  end if;

  select license into v_driver_license from public.members
  where id=v_contract.member_id and role='Driver' and team_id=v_actor.team_id;
  if v_driver_license is null then raise exception 'Target renewal bukan Driver aktif tim ini.'; end if;
  select salary_min_eur,salary_max_eur into v_min,v_max
  from public.caleris_driver_salary_bands
  where lower(license_label)=lower(case when upper(v_driver_license)='A' then 'Super License' else v_driver_license end);
  if v_min is null or p_proposed_salary<v_min or p_proposed_salary>v_max then
    raise exception 'Gaji renewal harus berada dalam salary band lisensi Driver.';
  end if;

  insert into public.caleris_driver_renewal_offers(
    current_contract_id,renewal_season_id,duration_seasons,member_id,team_id,
    proposed_salary,offer_note,created_by
  ) values (
    p_current_contract_id,v_first_season,p_duration_seasons,v_contract.member_id,
    v_actor.team_id,p_proposed_salary,nullif(trim(p_offer_note),''),(select auth.uid())
  ) returning id into v_offer;
  return v_offer;
end;
$$;

create or replace function public.member_decide_driver_renewal(
  p_offer_id uuid,
  p_accept boolean,
  p_driver_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_member_id uuid;
  v_offer public.caleris_driver_renewal_offers%rowtype;
  v_driver_license text;
  v_min numeric;
  v_max numeric;
  v_current_season public.license_seasons%rowtype;
  v_season record;
  v_count integer := 0;
  v_contract_ids uuid[] := '{}';
  v_contract_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select member_id into v_member_id from public.profiles where user_id=(select auth.uid());
  if v_member_id is null then raise exception 'Akun belum terhubung ke Driver.'; end if;
  select * into v_offer from public.caleris_driver_renewal_offers
  where id=p_offer_id and member_id=v_member_id for update;
  if not found or v_offer.status<>'offered' then raise exception 'Penawaran renewal tidak tersedia atau sudah diputuskan.'; end if;
  if not exists(select 1 from public.members where id=v_member_id and role='Driver' and team_id=v_offer.team_id) then
    raise exception 'Hanya Driver yang masih terikat pada tim penawar dapat memutuskan renewal ini.';
  end if;

  if p_accept then
    select license into v_driver_license from public.members where id=v_member_id;
    select salary_min_eur,salary_max_eur into v_min,v_max
    from public.caleris_driver_salary_bands
    where lower(license_label)=lower(case when upper(v_driver_license)='A' then 'Super License' else v_driver_license end);
    if v_min is null or v_offer.proposed_salary<v_min or v_offer.proposed_salary>v_max then
      raise exception 'Salary band lisensi berubah. Minta Team Owner mengirim penawaran baru.';
    end if;
    select s.* into v_current_season from public.license_seasons s
    join public.economy_driver_contracts c on c.season_id=s.id
    where c.id=v_offer.current_contract_id;
    for v_season in
      select id from public.license_seasons
      where starts_on>v_current_season.starts_on and status in ('draft','active')
      order by starts_on limit greatest(1,coalesce(v_offer.duration_seasons,1))
    loop
      if exists(select 1 from public.economy_driver_contracts
        where season_id=v_season.id and member_id=v_member_id and status='active') then
        raise exception 'Driver sudah memiliki kontrak aktif pada salah satu season tujuan.';
      end if;
      insert into public.economy_driver_contracts(season_id,team_id,member_id,annual_salary,status,created_by)
      values(v_season.id,v_offer.team_id,v_member_id,v_offer.proposed_salary,'active',(select auth.uid()))
      returning id into v_contract_id;
      v_contract_ids:=array_append(v_contract_ids,v_contract_id);
      v_count:=v_count+1;
    end loop;
    if v_count<>greatest(1,coalesce(v_offer.duration_seasons,1)) then
      raise exception 'Season mendatang tidak lagi mencukupi untuk durasi renewal.';
    end if;
  end if;

  update public.caleris_driver_renewal_offers
  set status=case when p_accept then 'accepted' else 'rejected' end,
      driver_note=nullif(trim(p_driver_note),''),decided_at=now(),updated_at=now()
  where id=p_offer_id;
  return jsonb_build_object('offer_id',p_offer_id,
    'status',case when p_accept then 'accepted' else 'rejected' end,
    'contract_ids',to_jsonb(v_contract_ids),'duration_seasons',coalesce(v_offer.duration_seasons,1));
end;
$$;

revoke all on function public.team_owner_offer_driver_renewal(uuid,integer,numeric,text) from public;
grant execute on function public.team_owner_offer_driver_renewal(uuid,integer,numeric,text) to authenticated;
revoke all on function public.member_decide_driver_renewal(uuid,boolean,text) from public;
grant execute on function public.member_decide_driver_renewal(uuid,boolean,text) to authenticated;
