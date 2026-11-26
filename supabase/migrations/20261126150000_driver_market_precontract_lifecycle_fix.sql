-- Complete the deferred Pre-contract activation without changing existing transfer/loan workers.
begin;

create or replace function private.process_driver_precontracts()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  n record;
  v_next_season public.license_seasons%rowtype;
  v_contract_end date;
  v_done integer:=0;
  v_cancelled integer:=0;
begin
  for n in
    select pc.*,ct.duration_label,ct.starts_on,ct.ends_on
    from public.caleris_driver_precontract_negotiations pc
    join public.contracts ct on ct.id=pc.origin_contract_id
    where pc.status='signed' and ct.status='active'
      and ct.ends_on=pc.contract_ends_on
      and pc.contract_ends_on < (now() at time zone 'Asia/Jakarta')::date
    order by pc.contract_ends_on,pc.created_at
    for update of pc skip locked
  loop
    select * into v_next_season from public.license_seasons s
      where s.starts_on>n.contract_ends_on and s.status in ('draft','active')
      order by s.starts_on limit 1;
    if not found then continue; end if;

    if exists(select 1 from public.caleris_driver_contract_terms t
      where t.member_id=n.driver_member_id and t.first_season_id=v_next_season.id
        and t.team_id<>n.destination_team_id) then
      update public.caleris_driver_precontract_negotiations
        set status='cancelled',updated_at=now() where id=n.id;
      v_cancelled:=v_cancelled+1;
      continue;
    end if;

    if not exists(select 1 from public.members m
      where m.id=n.driver_member_id and m.role='Driver' and m.team_id=n.origin_team_id) then
      update public.caleris_driver_precontract_negotiations
        set status='cancelled',updated_at=now() where id=n.id;
      v_cancelled:=v_cancelled+1;
      continue;
    end if;

    select s.ends_on into v_contract_end
    from public.license_seasons s
    where s.starts_on>=v_next_season.starts_on
    order by s.starts_on
    offset greatest(n.duration_seasons-1,0)
    limit 1;
    v_contract_end:=coalesce(v_contract_end,v_next_season.ends_on);

    insert into public.caleris_driver_contract_terms(
      first_season_id,team_id,member_id,annual_salary,duration_seasons,status,created_by
    ) values(v_next_season.id,n.destination_team_id,n.driver_member_id,n.annual_salary,n.duration_seasons,'active',null)
    on conflict(member_id,first_season_id) do nothing;

    update public.contracts set status='ended'
      where id=n.origin_contract_id and status='active' and ends_on=n.contract_ends_on;
    update public.members set team_id=n.destination_team_id
      where id=n.driver_member_id and role='Driver' and team_id=n.origin_team_id;

    if not exists(select 1 from public.contracts c
      where c.member_id=n.driver_member_id and c.status='active'
        and c.team_id=n.destination_team_id and c.starts_on=v_next_season.starts_on) then
      insert into public.contracts(
        member_id,team_id,duration_label,starts_on,ends_on,salary,target,release_clause,status
      ) values(
        n.driver_member_id,n.destination_team_id,
        n.duration_seasons::text||' Season',
        v_next_season.starts_on,v_contract_end,n.annual_salary,'{}'::jsonb,null,'active'
      );
    end if;

    update public.caleris_driver_precontract_negotiations
      set status='activated',activated_at=now(),updated_at=now() where id=n.id;
    insert into public.caleris_notifications(member_id,category,title,body,href,metadata,idempotency_key)
    select m.id,'driver_precontract','Pre-contract aktif',
      'Perpindahan Driver '||coalesce(d.character_name,'Driver')||' telah berlaku. Kontrak baru tercatat untuk Season berikutnya.',
      '/transfer-market',jsonb_build_object('negotiation_id',n.id,'season_id',v_next_season.id),
      'precontract:'||n.id||':activated:'||m.id
    from public.members m join public.members d on d.id=n.driver_member_id
    where m.team_id=n.destination_team_id and m.role='Owner'
    on conflict do nothing;
    v_done:=v_done+1;
  end loop;
  return jsonb_build_object('activated',v_done,'cancelled',v_cancelled);
end;
$$;
revoke all on function private.process_driver_precontracts() from public,anon,authenticated,service_role;

drop trigger if exists caleris_mv_round_calendar_refresh on public.license_rounds;
create trigger caleris_mv_round_calendar_refresh after insert or update on public.license_rounds
  for each row execute function private.refresh_driver_market_after_change();

commit;
