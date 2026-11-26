-- Integrate signed Pre-contracts with the existing season roster resolver.
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
begin
  select * into v_season from public.license_seasons where id=p_season_id for update;
  if not found then return jsonb_build_object('prepared',0,'reason','season_not_found'); end if;

  for n in
    select pc.*
    from public.caleris_driver_precontract_negotiations pc
    where pc.status='signed' and pc.contract_ends_on<v_season.starts_on
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
  end loop;

  if v_season.status='draft' and v_prepared>0 then
    v_sync:=private.sync_season_roster(v_season.id);
  end if;
  return jsonb_build_object('prepared',v_prepared,'cancelled',v_cancelled,'roster_sync',v_sync);
end;
$$;
revoke all on function private.prepare_driver_precontracts_for_season(uuid) from public,anon,authenticated,service_role;

create or replace function private.prepare_precontract_after_sign()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_season_id uuid;
begin
  if new.status='signed' and old.status is distinct from 'signed' then
    select s.id into v_season_id
    from public.license_seasons s
    where s.starts_on>new.contract_ends_on and s.status in ('draft','active')
    order by s.starts_on limit 1;
    if v_season_id is not null then
      perform private.prepare_driver_precontracts_for_season(v_season_id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_precontract_after_sign() from public,anon,authenticated,service_role;

create or replace function private.prepare_precontracts_for_new_season()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.prepare_driver_precontracts_for_season(new.id);
  return new;
end;
$$;
revoke all on function private.prepare_precontracts_for_new_season() from public,anon,authenticated,service_role;

drop trigger if exists caleris_precontract_prepare_after_sign on public.caleris_driver_precontract_negotiations;
create trigger caleris_precontract_prepare_after_sign
  after update of status on public.caleris_driver_precontract_negotiations
  for each row execute function private.prepare_precontract_after_sign();

drop trigger if exists caleris_precontract_prepare_new_season on public.license_seasons;
create trigger caleris_precontract_prepare_new_season
  after insert on public.license_seasons
  for each row execute function private.prepare_precontracts_for_new_season();

create or replace function private.season_driver_effective_team(p_season_id uuid,p_member_id uuid)
returns uuid
language sql stable security definer set search_path=''
as $$
  select case
    when loan.buyer_team_id is not null then loan.buyer_team_id
    when precontract.destination_team_id is not null then precontract.destination_team_id
    else m.team_id
  end
  from public.members m
  join public.license_seasons s on s.id=p_season_id
  join public.economy_driver_contracts c
    on c.season_id=s.id and c.member_id=m.id and c.status='active'
  left join lateral (
    select n.buyer_team_id
    from public.caleris_driver_move_negotiations n
    where n.driver_member_id=m.id
      and n.move_type='loan'
      and n.loan_season_id=s.id
      and n.seller_team_id=c.team_id
      and n.status in ('approved_waiting_window','loan_active')
      and n.loan_starts_on=s.starts_on
      and n.loan_ends_on=s.ends_on
      and (
        (n.status='approved_waiting_window' and m.team_id=n.seller_team_id)
        or (n.status='loan_active' and m.team_id=n.buyer_team_id)
      )
    order by n.created_at desc
    limit 1
  ) loan on true
  left join lateral (
    select pc.destination_team_id
    from public.caleris_driver_precontract_negotiations pc
    where pc.driver_member_id=m.id
      and pc.destination_team_id=c.team_id
      and pc.status in ('signed','activated')
      and s.starts_on>pc.contract_ends_on
    order by pc.signed_at desc
    limit 1
  ) precontract on true
  where m.id=p_member_id
    and m.role='Driver'
    and not exists(
      select 1 from public.caleris_team_inactivity_states frozen
      where frozen.team_id=case
        when loan.buyer_team_id is not null then loan.buyer_team_id
        when precontract.destination_team_id is not null then precontract.destination_team_id
        else m.team_id end
        and frozen.status in ('frozen','awaiting_compensation')
    )
    and (
      c.team_id=m.team_id
      or loan.buyer_team_id is not null
      or precontract.destination_team_id is not null
    )
  order by c.created_at desc
  limit 1;
$$;
revoke all on function private.season_driver_effective_team(uuid,uuid) from public,anon,authenticated,service_role;

commit;
