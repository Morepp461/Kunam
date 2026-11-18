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
 if v_season.status not in ('draft','active') then
  raise exception 'Registrasi hanya tersedia pada Pre Season atau season aktif.';
 end if;
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
 select count(*) into v_roster_count from public.members
 where team_id=v_team.id and role='Driver' and id<>v_driver.id;
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
  ) on conflict(season_id,member_id) do nothing;
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