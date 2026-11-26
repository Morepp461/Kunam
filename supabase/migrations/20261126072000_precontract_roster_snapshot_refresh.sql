-- Refresh a draft Season's existing roster snapshots when a Pre-contract is signed
-- after the draft roster was initially synchronized.

begin;

create or replace function private.prepare_driver_precontracts_for_season(p_season_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_season public.license_seasons%rowtype;
  n record;
  v_prepared integer:=0;
  v_cancelled integer:=0;
  v_sync jsonb;
  v_division_id uuid;
  v_team_name text;
  v_contract_id uuid;
  v_driver_name text;
  v_final_position integer;
begin
  select * into v_season from public.license_seasons where id=p_season_id for update;
  if not found then return jsonb_build_object('prepared',0,'reason','season_not_found'); end if;

  for n in
    select pc.*
    from public.caleris_driver_precontract_negotiations pc
    join public.contracts old_contract on old_contract.id=pc.origin_contract_id
    join public.members driver on driver.id=pc.driver_member_id
    where pc.status='signed' and pc.contract_ends_on<v_season.starts_on
      and old_contract.status='active' and old_contract.ends_on=pc.contract_ends_on
      and driver.team_id=pc.origin_team_id
      and v_season.id=(
        select target.id from public.license_seasons target
        where target.starts_on>pc.contract_ends_on and target.status in ('draft','active')
        order by target.starts_on limit 1
      )
    order by pc.contract_ends_on,pc.signed_at
    for update
  loop
    if exists(select 1 from public.caleris_driver_contract_terms t
      where t.member_id=n.driver_member_id and t.first_season_id=v_season.id
        and t.team_id<>n.destination_team_id) then
      update public.caleris_driver_precontract_negotiations
        set status='cancelled',updated_at=now() where id=n.id;
      v_cancelled:=v_cancelled+1;
      continue;
    end if;

    insert into public.caleris_driver_contract_terms(
      first_season_id,team_id,member_id,annual_salary,duration_seasons,status,created_by
    ) values(v_season.id,n.destination_team_id,n.driver_member_id,n.annual_salary,n.duration_seasons,'active',null)
    on conflict(member_id,first_season_id) do update set
      team_id=excluded.team_id,annual_salary=excluded.annual_salary,
      duration_seasons=excluded.duration_seasons,status='active';

    insert into public.economy_driver_contracts(
      season_id,team_id,member_id,annual_salary,status,created_by
    ) values(v_season.id,n.destination_team_id,n.driver_member_id,n.annual_salary,'active',null)
    on conflict(season_id,member_id) do update set
      team_id=excluded.team_id,annual_salary=excluded.annual_salary,
      status='active',created_by=excluded.created_by;
    v_prepared:=v_prepared+1;

    if v_season.status='draft' then
      select d.id,t.name,ec.id,coalesce(m.character_name,'Driver')
        into v_division_id,v_team_name,v_contract_id,v_driver_name
      from public.teams t
      join public.license_season_divisions d
        on d.season_id=v_season.id and lower(d.division_key)=lower(t.division_key)
      join public.economy_driver_contracts ec
        on ec.season_id=v_season.id and ec.team_id=t.id and ec.member_id=n.driver_member_id and ec.status='active'
      join public.members m on m.id=n.driver_member_id
      where t.id=n.destination_team_id
      limit 1;

      if v_division_id is not null then
        v_sync:=private.sync_season_roster(v_season.id);
        insert into public.license_season_members(
          season_id,season_division_id,member_id,is_hiatus,preserved_license
        ) values(v_season.id,v_division_id,n.driver_member_id,false,
          (select license from public.members where id=n.driver_member_id))
        on conflict(member_id,season_id) do update set
          season_division_id=excluded.season_division_id,is_hiatus=false,
          preserved_license=coalesce(excluded.preserved_license,public.license_season_members.preserved_license);

        update public.license_season_roster_snapshots
        set season_division_id=v_division_id,team_id=n.destination_team_id,
            contract_id=v_contract_id,driver_name_snapshot=v_driver_name,
            team_name_snapshot=v_team_name,annual_salary_snapshot=n.annual_salary
        where season_id=v_season.id and member_id=n.driver_member_id;
        insert into public.license_season_roster_snapshots(
          season_id,season_division_id,member_id,team_id,contract_id,
          driver_name_snapshot,team_name_snapshot,annual_salary_snapshot
        ) values(v_season.id,v_division_id,n.driver_member_id,n.destination_team_id,v_contract_id,
          v_driver_name,v_team_name,n.annual_salary)
        on conflict(season_id,member_id) do update set
          season_division_id=excluded.season_division_id,team_id=excluded.team_id,
          contract_id=excluded.contract_id,team_name_snapshot=excluded.team_name_snapshot,
          annual_salary_snapshot=excluded.annual_salary_snapshot;

        delete from public.license_round_standings rs
        using public.license_rounds r,public.license_season_divisions sd
        where rs.round_id=r.id and sd.id=r.season_division_id
          and sd.season_id=v_season.id and sd.id<>v_division_id
          and rs.member_id=n.driver_member_id;
        insert into public.license_round_standings(
          round_id,member_id,points_total,driver_name_snapshot,team_id_snapshot,team_name_snapshot
        )
        select r.id,n.driver_member_id,0,v_driver_name,n.destination_team_id,v_team_name
        from public.license_rounds r where r.season_division_id=v_division_id
        on conflict(round_id,member_id) do update set
          driver_name_snapshot=excluded.driver_name_snapshot,
          team_id_snapshot=excluded.team_id_snapshot,
          team_name_snapshot=excluded.team_name_snapshot;

        delete from public.license_final_standings fs
        using public.license_season_divisions sd
        where sd.id=fs.season_division_id and sd.season_id=v_season.id
          and sd.id<>v_division_id and fs.member_id=n.driver_member_id;
        select coalesce(max(final_position),0)+1 into v_final_position
        from public.license_final_standings where season_division_id=v_division_id;
        insert into public.license_final_standings(
          season_division_id,member_id,final_points,final_position,
          driver_name_snapshot,team_id_snapshot,team_name_snapshot
        ) values(v_division_id,n.driver_member_id,0,v_final_position,
          v_driver_name,n.destination_team_id,v_team_name)
        on conflict(season_division_id,member_id) do update set
          final_points=0,final_position=excluded.final_position,
          driver_name_snapshot=excluded.driver_name_snapshot,
          team_id_snapshot=excluded.team_id_snapshot,
          team_name_snapshot=excluded.team_name_snapshot;
      end if;
    end if;
  end loop;
  return jsonb_build_object('prepared',v_prepared,'cancelled',v_cancelled,'roster_sync',v_sync);
end;
$$;
revoke all on function private.prepare_driver_precontracts_for_season(uuid) from public,anon,authenticated,service_role;

commit;
