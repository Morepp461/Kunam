alter table public.caleris_free_agent_contract_offers
 add column if not exists is_counter boolean not null default false;

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
 v_band public.caleris_driver_salary_bands%rowtype;
 v_salary numeric(20,2);
 v_max_total integer;
 v_max_side integer;
 v_total_counters integer;
 v_side_counters integer;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
 where p.user_id=(select auth.uid());
 if not found then raise exception 'Profil karakter tidak ditemukan.'; end if;
 select * into v_neg from public.caleris_free_agent_contract_negotiations
 where id=p_negotiation_id for update;
 if not found or v_neg.status not in ('offered','negotiating') then raise exception 'Negosiasi kontrak tidak lagi aktif.'; end if;
 select * into v_driver from public.members where id=v_neg.driver_member_id for update;
 if not found then raise exception 'Driver tidak ditemukan.'; end if;
 if not ((v_actor.id=v_neg.driver_member_id and v_actor.role='Driver')
   or (v_actor.team_id=v_neg.team_id and v_actor.role='Owner')) then
  raise exception 'Akun kamu bukan pihak dalam negosiasi ini.';
 end if;
 select * into v_last from public.caleris_free_agent_contract_offers
 where negotiation_id=v_neg.id order by created_at desc,id desc limit 1 for update;
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
  update public.caleris_free_agent_contract_negotiations set status='agreed',annual_salary=v_salary,updated_at=now() where id=v_neg.id;
  insert into public.economy_driver_contracts(season_id,team_id,member_id,annual_salary,status,created_by,updated_by)
  values(v_neg.season_id,v_neg.team_id,v_neg.driver_member_id,v_salary,'pending_registration',auth.uid(),auth.uid())
  on conflict(season_id,member_id) do nothing;
  if not found then raise exception 'Kontrak season untuk Driver sudah ada.'; end if;
  return jsonb_build_object('status','agreed','annual_salary',v_salary,'season_id',v_neg.season_id);
 elsif p_action='counter' then
  select
   coalesce((payload->>'max_total_counters')::integer,0),
   coalesce((payload->>'max_counters_per_side')::integer,0)
  into v_max_total,v_max_side
  from public.caleris_configurations
  where category='economy' and config_key='driver-move-negotiation-limits' and is_active
  limit 1;
  if not found or v_max_total<1 or v_max_side<1 then
   raise exception 'Konfigurasi batas negosiasi kontrak belum aktif.';
  end if;
  select count(*) into v_total_counters from public.caleris_free_agent_contract_offers
   where negotiation_id=v_neg.id and is_counter;
  select count(*) into v_side_counters from public.caleris_free_agent_contract_offers
   where negotiation_id=v_neg.id and offered_by_member_id=v_actor.id and is_counter;
  if v_total_counters>=v_max_total or v_side_counters>=v_max_side then
   raise exception 'Batas counter-offer negosiasi telah tercapai.';
  end if;
  v_salary:=p_annual_salary;
  select * into v_band from public.caleris_driver_salary_bands
   where lower(license_label)=lower(trim(coalesce(v_driver.license,'')));
  if not found or v_salary is null or v_salary<v_band.salary_min_eur or v_salary>v_band.salary_max_eur
   or v_salary<>round(v_salary,2) then
   raise exception 'Counter-offer wajib berada dalam rentang gaji lisensi Driver.';
  end if;
  update public.caleris_free_agent_contract_offers set response='countered' where id=v_last.id;
  insert into public.caleris_free_agent_contract_offers(negotiation_id,offered_by_member_id,annual_salary,note,is_counter)
  values(v_neg.id,v_actor.id,v_salary,nullif(trim(p_note),''),true);
  update public.caleris_free_agent_contract_negotiations set status='negotiating',annual_salary=v_salary,updated_at=now() where id=v_neg.id;
  return jsonb_build_object('status','negotiating','annual_salary',v_salary,'total_counters',v_total_counters+1,'side_counters',v_side_counters+1);
 else
  raise exception 'Aksi negosiasi tidak valid.';
 end if;
end;
$$;