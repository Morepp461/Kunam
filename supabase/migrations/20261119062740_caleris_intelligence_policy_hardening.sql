-- Harden Team Budget Guard ownership transitions and renewal season validation.
drop policy if exists "Team Owners manage own budget plans" on public.caleris_team_budget_plans;
create policy "Team Owners read own budget plans" on public.caleris_team_budget_plans
for select to authenticated using (
 exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_team_budget_plans.team_id)
 or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
create policy "Team Owners create own budget plans" on public.caleris_team_budget_plans
for insert to authenticated with check (
 (created_by=(select auth.uid()) and exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_team_budget_plans.team_id))
 or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
create policy "Team Owners update own budget plans" on public.caleris_team_budget_plans
for update to authenticated using (
 exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_team_budget_plans.team_id)
 or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
) with check (
 exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_team_budget_plans.team_id)
 or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
create or replace function public.team_owner_offer_driver_renewal(p_current_contract_id uuid,p_renewal_season_id uuid,p_proposed_salary numeric,p_offer_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor public.members%rowtype;v_contract public.economy_driver_contracts%rowtype;v_season public.license_seasons%rowtype;v_current_season public.license_seasons%rowtype;v_driver_license text;v_min numeric;v_max numeric;v_offer uuid;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
 select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found or v_actor.role<>'Owner' or v_actor.team_id is null then raise exception 'Hanya Team Owner yang dapat menawarkan renewal.'; end if;
 select * into v_contract from public.economy_driver_contracts where id=p_current_contract_id and team_id=v_actor.team_id and status='active';
 if not found then raise exception 'Kontrak aktif Driver pada tim ini tidak ditemukan.'; end if;
 select * into v_season from public.license_seasons where id=p_renewal_season_id;
 if not found or v_season.starts_on<=current_date or v_season.status not in ('draft','active') then raise exception 'Renewal hanya dapat ditawarkan untuk season mendatang yang belum berakhir.'; end if;
 select * into v_current_season from public.license_seasons where id=v_contract.season_id;
 if not found or v_season.starts_on<=v_current_season.starts_on then raise exception 'Renewal harus ditujukan ke season setelah kontrak berjalan.'; end if;
 select license into v_driver_license from public.members where id=v_contract.member_id and role='Driver' and team_id=v_actor.team_id;
 if v_driver_license is null then raise exception 'Target renewal bukan Driver aktif tim ini.'; end if;
 select salary_min_eur,salary_max_eur into v_min,v_max from public.caleris_driver_salary_bands where lower(license_label)=lower(case when upper(v_driver_license)='A' then 'Super License' else v_driver_license end);
 if v_min is null or p_proposed_salary<v_min or p_proposed_salary>v_max then raise exception 'Gaji renewal harus berada dalam salary band lisensi Driver.'; end if;
 insert into public.caleris_driver_renewal_offers(current_contract_id,renewal_season_id,member_id,team_id,proposed_salary,offer_note,created_by)
 values(p_current_contract_id,p_renewal_season_id,v_contract.member_id,v_actor.team_id,p_proposed_salary,nullif(trim(p_offer_note),''),(select auth.uid())) returning id into v_offer;
 return v_offer;
end; $$;