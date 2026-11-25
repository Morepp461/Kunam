begin;

-- Prizepool rules are keyed by the division's stable key, not by a fixed list of tiers.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.caleris_prizepool_rules'::regclass
      and contype='c' and pg_get_constraintdef(oid) ilike '%division_key%'
  loop
    execute format('alter table public.caleris_prizepool_rules drop constraint %I',c.conname);
  end loop;
end $$;

-- New team base valuation follows division creation order: Tier 1 = €120m,
-- Tier 2 = €100m, then decreases by €20m for each subsequent division.
create or replace function private.set_team_default_base_valuation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_tier integer;
begin
  if new.base_valuation is null then
    select coalesce((
      select tier_no from (
        select division_key,row_number() over(order by first_created,division_key)::integer tier_no
        from (
          select lower(division_key) division_key,min(created_at) first_created
          from public.license_season_divisions
          group by lower(division_key)
        ) d
      ) ranked where ranked.division_key=lower(coalesce(new.division_key,''))
    ),(select count(distinct lower(division_key))+1 from public.license_season_divisions))
    into v_tier;
    new.base_valuation := 140000000 - (20000000 * greatest(v_tier,1));
  end if;
  return new;
end $$;

-- One-time starting grants are ledger transactions created only when a wallet is first inserted.
create or replace function private.grant_initial_economy_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_bank uuid; v_amount numeric(20,2);
begin
  v_amount := case
    when new.account_kind='driver' then 5000000
    when new.account_kind='team' then 100000000
    else 0
  end;
  if v_amount<=0 then return new; end if;
  select id into v_bank from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active order by created_at limit 1;
  if v_bank is null then
    raise exception 'VreeoBank aktif diperlukan untuk saldo awal wallet baru.';
  end if;
  perform private.post_economy_transaction(
    v_bank,new.id,v_amount,'bank_reward',
    case when new.account_kind='driver' then 'One-time Driver starting balance' else 'One-time Team starting balance' end,
    'initial-wallet-grant:'||new.id::text,
    null,
    jsonb_build_object('purpose','one_time_initial_wallet_balance','wallet_kind',new.account_kind,'member_id',new.member_id,'team_id',new.team_id),
    null,false
  );
  return new;
end $$;

drop trigger if exists economy_wallet_initial_balance_grant on public.economy_wallet_accounts;
create trigger economy_wallet_initial_balance_grant
after insert on public.economy_wallet_accounts
for each row execute function private.grant_initial_economy_wallet_balance();

-- Disable VreeoBank cash-loan origination without deleting historical tables or Driver Loan workflows.
revoke execute on function public.member_apply_cash_loan(uuid,numeric,integer) from public,anon,authenticated;
revoke execute on function public.member_apply_team_cash_loan(uuid,numeric,integer) from public,anon,authenticated;

-- Store official race cash rewards and maintenance charges separately from legacy DDP/TDP rules.
create table if not exists public.caleris_race_cash_rewards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.license_rounds(id) on delete restrict,
  recipient_type text not null check(recipient_type in ('driver','team')),
  recipient_id uuid not null,
  amount numeric(20,2) not null check(amount>0),
  transaction_id uuid not null references public.economy_transactions(id) on delete restrict,
  reversed_transaction_id uuid references public.economy_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique(round_id,recipient_type,recipient_id)
);
create table if not exists public.caleris_car_maintenance_charges (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.license_rounds(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  amount numeric(20,2) not null default 1000000 check(amount=1000000),
  transaction_id uuid not null references public.economy_transactions(id) on delete restrict,
  reversed_transaction_id uuid references public.economy_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique(round_id,member_id)
);
alter table public.caleris_race_cash_rewards enable row level security;
alter table public.caleris_car_maintenance_charges enable row level security;
revoke all on public.caleris_race_cash_rewards,public.caleris_car_maintenance_charges from public,anon,authenticated;
grant select on public.caleris_race_cash_rewards,public.caleris_car_maintenance_charges to authenticated;
create policy "Admins read race cash rewards" on public.caleris_race_cash_rewards for select to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "Admins read maintenance charges" on public.caleris_car_maintenance_charges for select to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.sync_official_race_cash_and_maintenance(p_round_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_round public.license_rounds%rowtype; v_bank uuid; v_entry record;
  v_existing public.caleris_race_cash_rewards%rowtype;
  v_charge public.caleris_car_maintenance_charges%rowtype;
  v_wallet uuid; v_source uuid; v_destination uuid; v_tx jsonb; v_amount numeric(20,2); v_winner_team uuid;
begin
  select * into v_round from public.license_rounds where id=p_round_id for update;
  if not found or v_round.status<>'closed' then return; end if;
  select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active order by created_at limit 1;
  if v_bank is null then raise exception 'VreeoBank aktif tidak ditemukan untuk race settlement.'; end if;
  for v_entry in select e.member_id,e.team_id,e.finish_status,e.finishing_position from public.caleris_race_result_entries e where e.round_id=p_round_id loop
    v_amount:=case when v_entry.finish_status='finished' and v_entry.finishing_position=1 then 1000000 when v_entry.finish_status='finished' and v_entry.finishing_position=2 then 750000 when v_entry.finish_status='finished' and v_entry.finishing_position=3 then 500000 else 0 end;
    select * into v_existing from public.caleris_race_cash_rewards where round_id=p_round_id and recipient_type='driver' and recipient_id=v_entry.member_id for update;
    if found and v_existing.reversed_at is null and (v_amount=0 or v_existing.amount<>v_amount) then
      select source_account_id,destination_account_id into v_source,v_destination from public.economy_transactions where id=v_existing.transaction_id;
      v_tx:=private.post_economy_transaction(v_destination,v_source,v_existing.amount,'reversal','Reversal race reward · corrected official result','race-reward-reversal:'||v_existing.id::text,null,jsonb_build_object('round_id',p_round_id,'reward_id',v_existing.id),v_existing.transaction_id,false);
      update public.caleris_race_cash_rewards set reversed_transaction_id=(v_tx->>'transaction_id')::uuid,reversed_at=now() where id=v_existing.id;
    end if;
    if v_amount>0 and (not found or v_existing.reversed_at is not null or v_existing.amount<>v_amount) then
      select id into v_wallet from public.economy_wallet_accounts where member_id=v_entry.member_id and account_kind='driver' and is_active;
      if v_wallet is null then raise exception 'Wallet Driver untuk race reward tidak ditemukan.'; end if;
      v_tx:=private.post_economy_transaction(v_bank,v_wallet,v_amount,'prize','Race reward · Round '||v_round.round_number||' · P'||v_entry.finishing_position,'race-reward:'||p_round_id::text||':driver:'||v_entry.member_id::text||':'||v_amount::text,null,jsonb_build_object('round_id',p_round_id,'member_id',v_entry.member_id,'position',v_entry.finishing_position),null,false);
      insert into public.caleris_race_cash_rewards(round_id,recipient_type,recipient_id,amount,transaction_id) values(p_round_id,'driver',v_entry.member_id,v_amount,(v_tx->>'transaction_id')::uuid)
      on conflict(round_id,recipient_type,recipient_id) do update set amount=excluded.amount,transaction_id=excluded.transaction_id,reversed_transaction_id=null,reversed_at=null;
    end if;
    select * into v_charge from public.caleris_car_maintenance_charges where round_id=p_round_id and member_id=v_entry.member_id for update;
    if found and v_charge.reversed_at is null and (v_entry.finish_status<>'dnf' or v_charge.team_id is distinct from v_entry.team_id) then
      select source_account_id,destination_account_id into v_source,v_destination from public.economy_transactions where id=v_charge.transaction_id;
      v_tx:=private.post_economy_transaction(v_destination,v_source,v_charge.amount,'reversal','Reversal Car Maintenance · corrected official result','car-maintenance-reversal:'||v_charge.id::text,null,jsonb_build_object('round_id',p_round_id,'charge_id',v_charge.id),v_charge.transaction_id,false);
      update public.caleris_car_maintenance_charges set reversed_transaction_id=(v_tx->>'transaction_id')::uuid,reversed_at=now() where id=v_charge.id;
    end if;
    if v_entry.finish_status='dnf' and (not found or v_charge.reversed_at is not null or v_charge.team_id is distinct from v_entry.team_id) then
      select id into v_wallet from public.economy_wallet_accounts where team_id=v_entry.team_id and account_kind='team' and is_active;
      if v_wallet is null then raise exception 'Team Wallet untuk Car Maintenance tidak ditemukan.'; end if;
      v_tx:=private.post_economy_transaction(v_wallet,v_bank,1000000,'fine','Car Maintenance · DNF · Round '||v_round.round_number,'car-maintenance-dnf:'||p_round_id::text||':'||v_entry.member_id::text||':'||v_entry.team_id::text,null,jsonb_build_object('round_id',p_round_id,'member_id',v_entry.member_id,'team_id',v_entry.team_id,'reason','dnf'),null,false);
      insert into public.caleris_car_maintenance_charges(round_id,member_id,team_id,amount,transaction_id) values(p_round_id,v_entry.member_id,v_entry.team_id,1000000,(v_tx->>'transaction_id')::uuid)
      on conflict(round_id,member_id) do update set team_id=excluded.team_id,amount=excluded.amount,transaction_id=excluded.transaction_id,reversed_transaction_id=null,reversed_at=null;
    end if;
  end loop;
  select e.team_id into v_winner_team from public.caleris_race_result_entries e where e.round_id=p_round_id and e.finish_status='finished' and e.finishing_position=1 limit 1;
  select * into v_existing from public.caleris_race_cash_rewards where round_id=p_round_id and recipient_type='team' for update;
  if found and v_existing.reversed_at is null and (v_winner_team is null or v_existing.recipient_id is distinct from v_winner_team) then
    select source_account_id,destination_account_id into v_source,v_destination from public.economy_transactions where id=v_existing.transaction_id;
    v_tx:=private.post_economy_transaction(v_destination,v_source,v_existing.amount,'reversal','Reversal team race reward · corrected official result','race-team-reward-reversal:'||v_existing.id::text,null,jsonb_build_object('round_id',p_round_id,'reward_id',v_existing.id),v_existing.transaction_id,false);
    update public.caleris_race_cash_rewards set reversed_transaction_id=(v_tx->>'transaction_id')::uuid,reversed_at=now() where id=v_existing.id;
  end if;
  if v_winner_team is not null and (not found or v_existing.reversed_at is not null or v_existing.recipient_id is distinct from v_winner_team) then
    select id into v_wallet from public.economy_wallet_accounts where team_id=v_winner_team and account_kind='team' and is_active;
    if v_wallet is null then raise exception 'Team Wallet pemenang tidak ditemukan.'; end if;
    v_tx:=private.post_economy_transaction(v_bank,v_wallet,1000000,'prize','Race team reward · Round '||v_round.round_number,'race-reward:'||p_round_id::text||':team:'||v_winner_team::text,null,jsonb_build_object('round_id',p_round_id,'team_id',v_winner_team,'winner_reward',true),null,false);
    insert into public.caleris_race_cash_rewards(round_id,recipient_type,recipient_id,amount,transaction_id) values(p_round_id,'team',v_winner_team,1000000,(v_tx->>'transaction_id')::uuid)
    on conflict(round_id,recipient_type,recipient_id) do update set amount=excluded.amount,transaction_id=excluded.transaction_id,reversed_transaction_id=null,reversed_at=null;
  end if;
end $$;

create or replace function private.sync_official_race_cash_on_round_close()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.sync_official_race_cash_and_maintenance(new.id); return new; end $$;
create or replace function private.sync_official_race_cash_on_result_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.sync_official_race_cash_and_maintenance(coalesce(new.round_id,old.round_id)); return coalesce(new,old); end $$;
drop trigger if exists caleris_official_round_economy_sync on public.license_rounds;
create trigger caleris_official_round_economy_sync after update of status on public.license_rounds for each row when (new.status='closed' and old.status is distinct from new.status) execute function private.sync_official_race_cash_on_round_close();
drop trigger if exists caleris_official_result_economy_sync on public.caleris_race_result_entries;
create trigger caleris_official_result_economy_sync after insert or update or delete on public.caleris_race_result_entries for each row execute function private.sync_official_race_cash_on_result_change();

commit;
