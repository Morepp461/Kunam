-- Recalculate Driver Market Value once per source transaction.
-- Multiple race-classification writes (standings + published result + result metadata)
-- must produce one Growth Factor step, not one step per row trigger.
begin;

create table if not exists private.caleris_driver_market_recalc_queue (
  transaction_id bigint not null,
  member_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists caleris_driver_market_recalc_queue_tx_scope_idx
  on private.caleris_driver_market_recalc_queue (
    transaction_id,
    coalesce(member_id::text, '__FULL_RECALC__')
  );

revoke all on private.caleris_driver_market_recalc_queue from public, anon, authenticated, service_role;

create or replace function private.process_driver_market_recalc_queue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_txid bigint := new.transaction_id;
  v_queue_count integer;
  v_reason text;
begin
  -- Another deferred trigger event may already have processed and removed this row.
  if not exists (
    select 1
    from private.caleris_driver_market_recalc_queue q
    where q.transaction_id = v_txid
      and coalesce(q.member_id::text, '__FULL_RECALC__') =
          coalesce(new.member_id::text, '__FULL_RECALC__')
  ) then
    return null;
  end if;

  -- A full-recalculation marker supersedes all per-member markers in this transaction.
  if exists (
    select 1 from private.caleris_driver_market_recalc_queue q
    where q.transaction_id = v_txid and q.member_id is null
  ) then
    if new.member_id is null then
      select q.reason into v_reason
      from private.caleris_driver_market_recalc_queue q
      where q.transaction_id = v_txid and q.member_id is null
      limit 1;
      perform private.recalculate_driver_market_values(null, coalesce(v_reason, 'source_change'));
      delete from private.caleris_driver_market_recalc_queue where transaction_id = v_txid;
    end if;
    return null;
  end if;

  select count(*), min(q.reason)
    into v_queue_count, v_reason
  from private.caleris_driver_market_recalc_queue q
  where q.transaction_id = v_txid;

  -- Several affected members in one transaction are reconciled in one full pass.
  if v_queue_count > 1 then
    perform private.recalculate_driver_market_values(null, 'batch_source_change');
    delete from private.caleris_driver_market_recalc_queue where transaction_id = v_txid;
    return null;
  end if;

  if new.member_id is not null then
    if exists (
      select 1 from public.members m
      where m.id = new.member_id and m.role = 'Driver'
    ) then
      perform private.recalculate_driver_market_values(new.member_id, coalesce(new.reason, 'source_change'));
    else
      -- Keep the current MV table limited to members who still hold the Driver role.
      delete from public.caleris_driver_market_values where member_id = new.member_id;
    end if;
  end if;

  delete from private.caleris_driver_market_recalc_queue q
  where q.transaction_id = v_txid
    and coalesce(q.member_id::text, '__FULL_RECALC__') =
        coalesce(new.member_id::text, '__FULL_RECALC__');

  return null;
end;
$function$;

revoke all on function private.process_driver_market_recalc_queue() from public, anon, authenticated, service_role;

drop trigger if exists caleris_mv_recalc_queue_deferred on private.caleris_driver_market_recalc_queue;
create constraint trigger caleris_mv_recalc_queue_deferred
after insert on private.caleris_driver_market_recalc_queue
deferrable initially deferred
for each row execute function private.process_driver_market_recalc_queue();

create or replace function private.refresh_driver_market_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member_id uuid;
  v_old_member_id uuid;
  v_reason text := tg_table_name;
  v_txid bigint := txid_current();
begin
  -- Ignore no-op updates and fields that do not participate in the approved MV formula.
  if tg_op = 'UPDATE' then
    case tg_table_name
      when 'caleris_driver_attributes' then
        if old.member_id is not distinct from new.member_id
          and old.attributes is not distinct from new.attributes then return null; end if;
      when 'caleris_driver_reputation' then
        if old.member_id is not distinct from new.member_id
          and old.score is not distinct from new.score then return null; end if;
      when 'license_daily_checkins' then
        if old.member_id is not distinct from new.member_id
          and old.round_id is not distinct from new.round_id then return null; end if;
      when 'license_round_standings' then
        if old.member_id is not distinct from new.member_id
          and old.round_id is not distinct from new.round_id
          and old.points_total is not distinct from new.points_total then return null; end if;
      when 'caleris_race_results' then
        if old.published_at is not distinct from new.published_at
          and (new.published_at is null or (
            old.driver_of_day_member_id is not distinct from new.driver_of_day_member_id
            and old.round_id is not distinct from new.round_id
          )) then return null; end if;
      when 'contracts' then
        if old.member_id is not distinct from new.member_id
          and old.team_id is not distinct from new.team_id
          and old.status is not distinct from new.status
          and old.ends_on is not distinct from new.ends_on then return null; end if;
      when 'economy_driver_contracts' then
        if old.member_id is not distinct from new.member_id
          and old.team_id is not distinct from new.team_id
          and old.status is not distinct from new.status then return null; end if;
      when 'members' then
        if old.team_id is not distinct from new.team_id
          and old.license is not distinct from new.license
          and old.role is not distinct from new.role then return null; end if;
      when 'license_rounds' then
        if old.season_division_id is not distinct from new.season_division_id
          and old.session_type is not distinct from new.session_type then return null; end if;
      when 'license_season_members' then
        if old.member_id is not distinct from new.member_id
          and old.season_id is not distinct from new.season_id
          and old.season_division_id is not distinct from new.season_division_id then return null; end if;
    end case;
  end if;

  -- Race-result rows are authoritative only while published. Multiple writes in one
  -- classification transaction collapse into one full recalculation marker.
  if tg_table_name = 'caleris_race_results' then
    if tg_op = 'INSERT' and new.published_at is null then return null; end if;
    if tg_op = 'DELETE' and old.published_at is null then return null; end if;
    if tg_op = 'UPDATE' and old.published_at is null and new.published_at is null then return null; end if;

    insert into private.caleris_driver_market_recalc_queue(transaction_id, member_id, reason)
    values(v_txid, null, 'race_result')
    on conflict do nothing;
    return null;
  end if;

  -- A round entering/leaving the calendar or changing division/session affects the
  -- season-wide normalization denominator, so it requires one full recalculation.
  if tg_table_name = 'license_rounds' then
    insert into private.caleris_driver_market_recalc_queue(transaction_id, member_id, reason)
    values(v_txid, null, 'round_calendar')
    on conflict do nothing;
    return null;
  end if;

  if tg_table_name = 'members' then
    if tg_op = 'DELETE' then return null; end if; -- MV row is removed by its FK cascade.
    if tg_op = 'INSERT' then
      if new.role is distinct from 'Driver' then return null; end if;
      v_member_id := new.id;
    else
      v_member_id := new.id;
    end if;
  elsif tg_table_name = 'license_season_members' then
    if tg_op = 'DELETE' then
      v_member_id := old.member_id;
    elsif tg_op = 'INSERT' then
      v_member_id := new.member_id;
    else
      v_member_id := new.member_id;
      v_old_member_id := old.member_id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_member_id := old.member_id;
    elsif tg_op = 'INSERT' then
      v_member_id := new.member_id;
    else
      v_member_id := new.member_id;
      v_old_member_id := old.member_id;
    end if;
  end if;

  if v_old_member_id is not null and v_old_member_id is distinct from v_member_id then
    insert into private.caleris_driver_market_recalc_queue(transaction_id, member_id, reason)
    values(v_txid, v_old_member_id, v_reason)
    on conflict do nothing;
  end if;

  if v_member_id is not null then
    insert into private.caleris_driver_market_recalc_queue(transaction_id, member_id, reason)
    values(v_txid, v_member_id, v_reason)
    on conflict do nothing;
  end if;

  return null;
end;
$function$;

revoke all on function private.refresh_driver_market_after_change() from public, anon, authenticated, service_role;

-- New Driver/member and home-division changes must seed/reconcile MV immediately.
drop trigger if exists caleris_mv_members_refresh on public.members;
create trigger caleris_mv_members_refresh
after update of team_id, license, role on public.members
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_members_insert_refresh on public.members;
create trigger caleris_mv_members_insert_refresh
after insert on public.members
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_season_members_refresh on public.license_season_members;
create trigger caleris_mv_season_members_refresh
after insert or update or delete on public.license_season_members
for each row execute function private.refresh_driver_market_after_change();

-- Deletions/corrections of authoritative inputs must also refresh the affected MV.
drop trigger if exists caleris_mv_attributes_delete_refresh on public.caleris_driver_attributes;
create trigger caleris_mv_attributes_delete_refresh after delete on public.caleris_driver_attributes
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_reputation_delete_refresh on public.caleris_driver_reputation;
create trigger caleris_mv_reputation_delete_refresh after delete on public.caleris_driver_reputation
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_checkin_delete_refresh on public.license_daily_checkins;
create trigger caleris_mv_checkin_delete_refresh after delete on public.license_daily_checkins
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_standings_delete_refresh on public.license_round_standings;
create trigger caleris_mv_standings_delete_refresh after delete on public.license_round_standings
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_race_results_delete_refresh on public.caleris_race_results;
create trigger caleris_mv_race_results_delete_refresh after delete on public.caleris_race_results
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_contracts_delete_refresh on public.contracts;
create trigger caleris_mv_contracts_delete_refresh after delete on public.contracts
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_economy_contracts_delete_refresh on public.economy_driver_contracts;
create trigger caleris_mv_economy_contracts_delete_refresh after delete on public.economy_driver_contracts
for each row execute function private.refresh_driver_market_after_change();

drop trigger if exists caleris_mv_round_calendar_delete_refresh on public.license_rounds;
create trigger caleris_mv_round_calendar_delete_refresh after delete on public.license_rounds
for each row execute function private.refresh_driver_market_after_change();

commit;
