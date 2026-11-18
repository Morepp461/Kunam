drop policy if exists "Negotiation parties read free agent salary negotiations" on public.caleris_free_agent_contract_negotiations;
create policy "Negotiation parties read free agent salary negotiations"
 on public.caleris_free_agent_contract_negotiations for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=driver_member_id)
  or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_free_agent_contract_negotiations.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
drop policy if exists "Negotiation parties read free agent salary offers" on public.caleris_free_agent_contract_offers;
create policy "Negotiation parties read free agent salary offers"
 on public.caleris_free_agent_contract_offers for select to authenticated using (
  exists(select 1 from public.caleris_free_agent_contract_negotiations n
    join public.profiles p on p.member_id=n.driver_member_id
    where n.id=caleris_free_agent_contract_offers.negotiation_id and p.user_id=(select auth.uid()))
  or exists(select 1 from public.caleris_free_agent_contract_negotiations n
    join public.profiles p on p.user_id=(select auth.uid()) join public.members m on m.id=p.member_id
    where n.id=caleris_free_agent_contract_offers.negotiation_id and m.role='Owner' and m.team_id=n.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
create or replace function public.member_start_free_agent_contract_negotiation(p_driver_member_id uuid,p_annual_salary numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor public.members%rowtype;v_driver public.members%rowtype;v_season public.license_seasons%rowtype;v_band public.caleris_driver_salary_bands%rowtype;v_id uuid;
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found or v_actor.role<>'Owner' or v_actor.team_id is null then raise exception 'Hanya Team Owner yang dapat mengajukan kontrak Free Agent.'; end if;
 select * into v_driver from public.members where id=p_driver_member_id and role='Driver' for update;
 if not found or v_driver.team_id is not null then raise exception 'Driver tidak lagi tersedia sebagai Free Agent.'; end if;
 select * into v_band from public.caleris_driver_salary_bands where lower(license_label)=lower(trim(coalesce(v_driver.license,'')));
 if not found or p_annual_salary is null or p_annual_salary<v_band.salary_min_eur or p_annual_salary>v_band.salary_max_eur or p_annual_salary<>round(p_annual_salary,2) then raise exception 'Gaji tahunan harus mengikuti rentang lisensi Driver.'; end if;
 if (select count(*) from public.members where team_id=v_actor.team_id and role='Driver')>=2 then raise exception 'Perekrutan Free Agent hanya tersedia untuk tim dengan kurang dari dua Driver.'; end if;
 if exists(select 1 from public.economy_driver_contracts c where c.member_id=v_driver.id and c.status in ('pending_registration','active','suspended')) then raise exception 'Driver masih memiliki kontrak yang belum berakhir.'; end if;
 select * into v_season from public.license_seasons where status='active' order by starts_on desc,created_at desc limit 1;
 if not found then select * into v_season from public.license_seasons where status='draft' order by starts_on,created_at desc limit 1; end if;
 if not found then raise exception 'Belum ada season aktif atau draft untuk kontrak Driver.'; end if;
 if exists(select 1 from public.caleris_free_agent_contract_negotiations n where n.driver_member_id=v_driver.id and n.status in ('offered','negotiating')) then raise exception 'Driver sedang menjalani negosiasi kontrak lain.'; end if;
 insert into public.caleris_free_agent_contract_negotiations(season_id,team_id,driver_member_id,annual_salary,initiated_by,status) values(v_season.id,v_actor.team_id,v_driver.id,p_annual_salary,v_actor.id,'offered') returning id into v_id;
 insert into public.caleris_free_agent_contract_offers(negotiation_id,offered_by_member_id,annual_salary,note) values(v_id,v_actor.id,p_annual_salary,nullif(trim(p_note),''));
 return v_id;
end; $$;
create or replace function public.member_respond_free_agent_contract_negotiation(p_negotiation_id uuid,p_action text,p_annual_salary numeric default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.members%rowtype;v_neg public.caleris_free_agent_contract_negotiations%rowtype;v_driver public.members%rowtype;v_last public.caleris_free_agent_contract_offers%rowtype;v_band public.caleris_driver_salary_bands%rowtype;v_salary numeric(20,2);
begin
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());if not found then raise exception 'Profil karakter tidak ditemukan.';end if;
 select * into v_neg from public.caleris_free_agent_contract_negotiations where id=p_negotiation_id for update;if not found or v_neg.status not in ('offered','negotiating') then raise exception 'Negosiasi kontrak tidak lagi aktif.';end if;
 select * into v_driver from public.members where id=v_neg.driver_member_id for update;if not found then raise exception 'Driver tidak ditemukan.';end if;
 if not ((v_actor.id=v_neg.driver_member_id and v_actor.role='Driver') or (v_actor.team_id=v_neg.team_id and v_actor.role='Owner')) then raise exception 'Akun kamu bukan pihak dalam negosiasi ini.';end if;
 select * into v_last from public.caleris_free_agent_contract_offers where negotiation_id=v_neg.id order by created_at desc,id desc limit 1 for update;
 if v_last.id is null or v_last.offered_by_member_id=v_actor.id then raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.';end if;
 if p_action='reject' then update public.caleris_free_agent_contract_offers set response='rejected' where id=v_last.id;update public.caleris_free_agent_contract_negotiations set status='rejected',updated_at=now() where id=v_neg.id;return jsonb_build_object('status','rejected');
 elsif p_action='accept' then
  v_salary:=v_last.annual_salary;update public.caleris_free_agent_contract_offers set response='accepted' where id=v_last.id;update public.caleris_free_agent_contract_negotiations set status='agreed',annual_salary=v_salary,updated_at=now() where id=v_neg.id;
  insert into public.economy_driver_contracts(season_id,team_id,member_id,annual_salary,status,created_by,updated_by) values(v_neg.season_id,v_neg.team_id,v_neg.driver_member_id,v_salary,'pending_registration',auth.uid(),auth.uid()) on conflict(season_id,member_id) do nothing;
  if not found then raise exception 'Kontrak season untuk Driver sudah ada.';end if;
  return jsonb_build_object('status','agreed','annual_salary',v_salary,'season_id',v_neg.season_id);
 elsif p_action='counter' then
  v_salary:=p_annual_salary;select * into v_band from public.caleris_driver_salary_bands where lower(license_label)=lower(trim(coalesce(v_driver.license,'')));
  if not found or v_salary is null or v_salary<v_band.salary_min_eur or v_salary>v_band.salary_max_eur or v_salary<>round(v_salary,2) then raise exception 'Counter-offer wajib berada dalam rentang gaji lisensi Driver.';end if;
  update public.caleris_free_agent_contract_offers set response='countered' where id=v_last.id;insert into public.caleris_free_agent_contract_offers(negotiation_id,offered_by_member_id,annual_salary,note) values(v_neg.id,v_actor.id,v_salary,nullif(trim(p_note),''));update public.caleris_free_agent_contract_negotiations set status='negotiating',annual_salary=v_salary,updated_at=now() where id=v_neg.id;return jsonb_build_object('status','negotiating','annual_salary',v_salary);
 else raise exception 'Aksi negosiasi tidak valid.';end if;
end; $$;