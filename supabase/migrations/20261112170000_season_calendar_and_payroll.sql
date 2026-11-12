-- CALERIS season calendar, team-owned annual salary contracts, and race-period payroll.
create or replace function public.is_caleris_fia_or_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
    or exists(
      select 1 from public.profiles p join public.members m on m.id=p.member_id
      where p.user_id=(select auth.uid()) and m.role='FIA'
    );
$$;
revoke all on function public.is_caleris_fia_or_admin() from public,anon;
grant execute on function public.is_caleris_fia_or_admin() to authenticated,service_role;

create table public.season_calendar_periods (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete cascade,
  period_type text not null check(period_type in ('off_season','pre_season','race_period','race_break','end_season')),
  period_number integer,
  title text not null,
  starts_on date not null,
  ends_on date not null,
  sort_order integer not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_calendar_dates_valid check(ends_on>=starts_on),
  constraint season_calendar_number_valid check(
    (period_type in ('race_period','race_break') and period_number is not null and period_number>0)
    or (period_type in ('off_season','pre_season','end_season') and period_number is null)
  )
);
create unique index season_calendar_single_period_unique
  on public.season_calendar_periods(season_id,period_type)
  where period_type in ('off_season','pre_season','end_season');
create unique index season_calendar_numbered_period_unique
  on public.season_calendar_periods(season_id,period_type,period_number)
  where period_type in ('race_period','race_break');
create index season_calendar_season_order_idx
  on public.season_calendar_periods(season_id,sort_order,starts_on);

create table public.season_period_rounds (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.season_calendar_periods(id) on delete cascade,
  season_division_id uuid not null references public.license_season_divisions(id) on delete cascade,
  round_id uuid not null references public.license_rounds(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(round_id),
  unique(period_id,season_division_id,round_id)
);
create index season_period_rounds_period_division_idx
  on public.season_period_rounds(period_id,season_division_id);

create table public.season_calendar_period_revisions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.season_calendar_periods(id) on delete restrict,
  action text not null check(action in ('INSERT','UPDATE')),
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index season_calendar_revisions_period_idx
  on public.season_calendar_period_revisions(period_id,changed_at desc);

create or replace function private.touch_season_calendar_period()
returns trigger language plpgsql set search_path=''
as $cal$ begin new.updated_at:=now(); return new; end; $cal$;
create or replace function private.audit_season_calendar_period()
returns trigger language plpgsql security definer set search_path=''
as $cal$
begin
  insert into public.season_calendar_period_revisions(period_id,action,snapshot,changed_by)
  values(new.id,case when tg_op='INSERT' then 'INSERT' else 'UPDATE' end,
    to_jsonb(new),(select auth.uid()));
  return new;
end;
$cal$;
create trigger season_calendar_period_touch
before update on public.season_calendar_periods
for each row execute function private.touch_season_calendar_period();
create trigger season_calendar_period_audit
after insert or update on public.season_calendar_periods
for each row execute function private.audit_season_calendar_period();

create or replace function private.validate_season_period_round()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_period public.season_calendar_periods%rowtype;
  v_division_season uuid;
  v_round_division uuid;
  v_count integer;
begin
  select * into v_period from public.season_calendar_periods where id=new.period_id;
  if not found or v_period.period_type<>'race_period' then
    raise exception 'Hanya Race Period yang dapat memuat round.';
  end if;
  select season_id into v_division_season from public.license_season_divisions where id=new.season_division_id;
  select season_division_id into v_round_division from public.license_rounds where id=new.round_id;
  if v_division_season is distinct from v_period.season_id or v_round_division is distinct from new.season_division_id then
    raise exception 'Round dan divisi harus berasal dari season yang sama dengan Race Period.';
  end if;
  if exists(select 1 from public.license_rounds where id=new.round_id and status='closed') then
    raise exception 'Round yang sudah diproses tidak dapat dipindahkan ke Race Period.';
  end if;
  select count(*) into v_count from public.season_period_rounds
  where period_id=new.period_id and season_division_id=new.season_division_id
    and (tg_op='INSERT' or id<>new.id);
  if v_count>=5 then raise exception 'Satu Race Period maksimal memuat 5 round per divisi.'; end if;
  return new;
end;
$$;
create trigger season_period_round_validate
before insert or update on public.season_period_rounds
for each row execute function private.validate_season_period_round();

alter table public.season_calendar_periods enable row level security;
alter table public.season_period_rounds enable row level security;
alter table public.season_calendar_period_revisions enable row level security;
revoke all on public.season_calendar_periods,public.season_period_rounds,public.season_calendar_period_revisions from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.season_calendar_periods,public.season_period_rounds to authenticated;
grant select on public.season_calendar_period_revisions to authenticated;
create policy "Authenticated read season calendar" on public.season_calendar_periods
for select to authenticated using(true);
create policy "FIA and Admin manage season calendar" on public.season_calendar_periods
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());
create policy "Authenticated read period round mapping" on public.season_period_rounds
for select to authenticated using(true);
create policy "FIA and Admin manage period round mapping" on public.season_period_rounds
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());
create policy "FIA and Admin read season calendar history" on public.season_calendar_period_revisions
for select to authenticated using(public.is_caleris_fia_or_admin());

create policy "FIA and Admin manage license seasons" on public.license_seasons
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());
create policy "FIA and Admin manage license divisions" on public.license_season_divisions
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());
create policy "FIA and Admin manage season drivers" on public.license_season_members
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());
create policy "FIA and Admin manage license rounds" on public.license_rounds
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());
create policy "FIA and Admin manage round standings" on public.license_round_standings
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());
create policy "FIA and Admin manage final standings" on public.license_final_standings
for all to authenticated using(public.is_caleris_fia_or_admin()) with check(public.is_caleris_fia_or_admin());

alter table public.economy_transactions drop constraint economy_transactions_event_type_check;
alter table public.economy_transactions add constraint economy_transactions_event_type_check
check(event_type in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll'));

create table public.economy_driver_contracts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  annual_salary numeric(20,2) not null check(annual_salary>0),
  status text not null default 'active' check(status in ('active','suspended','ended')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(season_id,member_id)
);
create index economy_driver_contracts_team_season_idx
  on public.economy_driver_contracts(team_id,season_id,status);
create table public.economy_payroll_claims (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  period_id uuid not null references public.season_calendar_periods(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  annual_salary numeric(20,2) not null check(annual_salary>0),
  period_count integer not null check(period_count>0),
  amount numeric(20,2) not null check(amount>0),
  status text not null default 'pending' check(status in ('pending','paid')),
  transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(period_id,member_id)
);
create index economy_payroll_pending_idx on public.economy_payroll_claims(created_at) where status='pending';
create index economy_payroll_member_season_idx on public.economy_payroll_claims(member_id,season_id);

alter table public.economy_driver_contracts enable row level security;
alter table public.economy_payroll_claims enable row level security;
revoke all on public.economy_driver_contracts,public.economy_payroll_claims from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.economy_driver_contracts to authenticated;
grant select on public.economy_payroll_claims to authenticated;
create policy "Team owners and Admin read driver contracts" on public.economy_driver_contracts
for select to authenticated using(
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
    where p.user_id=(select auth.uid()) and owner.role='Owner' and owner.team_id=economy_driver_contracts.team_id)
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=economy_driver_contracts.member_id)
);
create policy "Team owners and Admin create driver contracts" on public.economy_driver_contracts
for insert to authenticated with check(
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or (exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
      where p.user_id=(select auth.uid()) and owner.role='Owner' and owner.team_id=economy_driver_contracts.team_id)
    and exists(select 1 from public.members driver where driver.id=economy_driver_contracts.member_id
      and driver.role='Driver' and driver.team_id=economy_driver_contracts.team_id))
);
create policy "Team owners and Admin update driver contracts" on public.economy_driver_contracts
for update to authenticated using(
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
    where p.user_id=(select auth.uid()) and owner.role='Owner' and owner.team_id=economy_driver_contracts.team_id)
) with check(
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or (exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
      where p.user_id=(select auth.uid()) and owner.role='Owner' and owner.team_id=economy_driver_contracts.team_id)
    and exists(select 1 from public.members driver where driver.id=economy_driver_contracts.member_id
      and driver.role='Driver' and driver.team_id=economy_driver_contracts.team_id))
);
create policy "Team owners and Admin delete driver contracts" on public.economy_driver_contracts
for delete to authenticated using(
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
    where p.user_id=(select auth.uid()) and owner.role='Owner' and owner.team_id=economy_driver_contracts.team_id)
);
create policy "Members read own payroll and team payroll" on public.economy_payroll_claims
for select to authenticated using(
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=economy_payroll_claims.member_id)
  or exists(select 1 from public.profiles p join public.members owner on owner.id=p.member_id
    where p.user_id=(select auth.uid()) and owner.role='Owner' and owner.team_id=economy_payroll_claims.team_id)
);

create or replace function private.guard_driver_contract()
returns trigger language plpgsql set search_path=''
as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.economy_payroll_claims c where c.season_id=old.season_id and c.member_id=old.member_id) then
      raise exception 'Kontrak tidak dapat dihapus setelah payroll season terbentuk.';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.economy_payroll_claims c where c.season_id=old.season_id and c.member_id=old.member_id) then
    if new.annual_salary is distinct from old.annual_salary or new.team_id is distinct from old.team_id or new.member_id is distinct from old.member_id or new.season_id is distinct from old.season_id then
      raise exception 'Nominal dan kepemilikan kontrak terkunci setelah payroll season terbentuk.';
    end if;
  end if;
  if not exists(select 1 from public.members m where m.id=new.member_id and m.role='Driver' and m.team_id=new.team_id) then
    raise exception 'Kontrak hanya dapat dibuat untuk Driver aktif pada tim yang sama.';
  end if;
  return new;
end;
$$;
create trigger economy_driver_contract_guard
before insert or update or delete on public.economy_driver_contracts
for each row execute function private.guard_driver_contract();

create or replace function private.post_economy_transaction(
  p_source_account_id uuid,p_destination_account_id uuid,p_amount numeric,p_event_type text,
  p_description text,p_idempotency_key text,p_actor_id uuid,p_metadata jsonb default '{}'::jsonb,
  p_reversal_of uuid default null,p_allow_pending boolean default false
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_source public.economy_wallet_accounts%rowtype;
  v_destination public.economy_wallet_accounts%rowtype;
  v_existing public.economy_transactions%rowtype;
  v_original public.economy_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Nominal transaksi tidak valid.'; end if;
  if p_source_account_id is null or p_destination_account_id is null or p_source_account_id=p_destination_account_id then raise exception 'Wallet tidak valid.'; end if;
  if p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then raise exception 'Idempotency key tidak valid.'; end if;
  if p_description is null or length(trim(p_description)) not between 1 and 240 then raise exception 'Deskripsi transaksi tidak valid.'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then raise exception 'Metadata transaksi tidak valid.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into v_existing from public.economy_transactions where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.source_account_id<>p_source_account_id or v_existing.destination_account_id<>p_destination_account_id or v_existing.amount<>p_amount or v_existing.event_type<>p_event_type then raise exception 'Idempotency key digunakan transaksi berbeda.'; end if;
    return jsonb_build_object('transaction_id',v_existing.id,'status','duplicate');
  end if;
  if p_event_type='reversal' then
    if p_reversal_of is null then raise exception 'Referensi reversal wajib ada.'; end if;
    select * into v_original from public.economy_transactions where id=p_reversal_of for update;
    if not found or v_original.reversal_of is not null then raise exception 'Transaksi asal tidak valid.'; end if;
    if v_original.source_account_id<>p_destination_account_id or v_original.destination_account_id<>p_source_account_id or v_original.amount<>p_amount then raise exception 'Reversal tidak cocok.'; end if;
  elsif p_reversal_of is not null then raise exception 'Referensi reversal hanya untuk reversal.'; end if;
  perform 1 from public.economy_wallet_accounts where id in (p_source_account_id,p_destination_account_id) order by id for update;
  select * into v_source from public.economy_wallet_accounts where id=p_source_account_id;
  select * into v_destination from public.economy_wallet_accounts where id=p_destination_account_id;
  if v_source.id is null or v_destination.id is null or not v_source.is_active or not v_destination.is_active then raise exception 'Wallet tidak ditemukan atau nonaktif.'; end if;
  if p_event_type='checkin_reward' and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind<>'driver') then raise exception 'Rute reward check-in tidak valid.';
  elsif p_event_type in ('prize','bank_reward') and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute reward Bank tidak valid.';
  elsif p_event_type='sponsor_payout' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute sponsor tidak valid.';
  elsif p_event_type='bank_funding' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind<>'vreeo_bank') then raise exception 'Rute funding Bank tidak valid.';
  elsif p_event_type in ('tax','fine') and (v_destination.account_kind<>'vreeo_bank' or v_source.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute pajak/denda tidak valid.';
  elsif p_event_type='transfer' and (v_source.account_kind in ('vreeo_bank','sponsor_source') or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then raise exception 'Rute transfer tidak valid.';
  elsif p_event_type='admin_adjustment' and (v_source.account_kind='sponsor_source' or v_destination.account_kind='sponsor_source') then raise exception 'Rute penyesuaian tidak valid.';
  elsif p_event_type='payroll' and (v_source.account_kind<>'team' or v_destination.account_kind<>'driver' or not exists(select 1 from public.members m where m.id=v_destination.member_id and m.team_id=v_source.team_id and m.role='Driver')) then raise exception 'Payroll harus berasal dari Team Wallet Driver yang sama.';
  end if;
  if v_source.balance<p_amount and v_source.account_kind<>'sponsor_source' and p_event_type not in ('tax','fine') then
    if p_allow_pending then return null; end if;
    raise exception 'Saldo sumber tidak mencukupi.';
  end if;
  insert into public.economy_transactions(event_type,source_account_id,destination_account_id,amount,idempotency_key,description,metadata,created_by,reversal_of)
  values(p_event_type,p_source_account_id,p_destination_account_id,p_amount,p_idempotency_key,trim(p_description),p_metadata,p_actor_id,p_reversal_of)
  returning id into v_transaction_id;
  insert into public.economy_entries(transaction_id,account_id,entry_side,amount)
  values(v_transaction_id,p_source_account_id,'outflow',p_amount),(v_transaction_id,p_destination_account_id,'inflow',p_amount);
  update public.economy_wallet_accounts set balance=balance-p_amount,updated_at=now() where id=p_source_account_id;
  update public.economy_wallet_accounts set balance=balance+p_amount,updated_at=now() where id=p_destination_account_id;
  return jsonb_build_object('transaction_id',v_transaction_id,'status','posted');
end;
$$;

create or replace function private.payroll_for_period_round(p_round_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_map public.season_period_rounds%rowtype;
  v_period public.season_calendar_periods%rowtype;
  v_season_id uuid;
  v_period_count integer;
  v_period_position integer;
  v_assigned_count integer;
  v_item record;
  v_team_wallet uuid;
  v_driver_wallet uuid;
  v_amount numeric(20,2);
  v_paid integer:=0;
  v_pending integer:=0;
  v_result jsonb;
  v_claim_id uuid;
begin
  select map.* into v_map from public.season_period_rounds map where map.round_id=p_round_id;
  if not found then return jsonb_build_object('paid',0,'pending',0,'skipped','round_not_assigned'); end if;
  select * into v_period from public.season_calendar_periods where id=v_map.period_id and period_type='race_period';
  if not found then return jsonb_build_object('paid',0,'pending',0,'skipped','not_race_period'); end if;
  select count(*) into v_assigned_count from public.season_period_rounds where period_id=v_period.id and season_division_id=v_map.season_division_id;
  if v_assigned_count not between 3 and 5 then raise exception 'Race Period wajib berisi 3 sampai 5 round pada setiap divisi.'; end if;
  if exists(select 1 from public.season_period_rounds other_map
    join public.license_rounds other_round on other_round.id=other_map.round_id
    where other_map.period_id=v_period.id and other_map.season_division_id=v_map.season_division_id
      and other_round.round_number>(select round_number from public.license_rounds where id=p_round_id)) then
    return jsonb_build_object('paid',0,'pending',0,'skipped','not_final_round');
  end if;
  select count(*) into v_period_count from public.season_calendar_periods
  where season_id=v_period.season_id and period_type='race_period';
  if v_period_count<1 then raise exception 'Season belum memiliki Race Period.'; end if;
  select count(*) into v_period_position from public.season_calendar_periods
  where season_id=v_period.season_id and period_type='race_period' and sort_order<=v_period.sort_order;
  for v_item in
    select c.*,m.character_name from public.economy_driver_contracts c
    join public.members m on m.id=c.member_id and m.role='Driver' and m.team_id=c.team_id
    join public.license_season_members sm on sm.member_id=c.member_id and sm.season_id=c.season_id
      and sm.season_division_id=v_map.season_division_id and not sm.is_hiatus
    where c.season_id=v_period.season_id and c.status='active'
    order by c.member_id
  loop
    v_amount:=case when v_period_position=v_period_count
      then v_item.annual_salary-coalesce((select sum(pc.amount) from public.economy_payroll_claims pc
        join public.season_calendar_periods pp on pp.id=pc.period_id
        where pc.season_id=v_period.season_id and pc.member_id=v_item.member_id
          and pp.period_type='race_period' and pp.sort_order<v_period.sort_order),0)
      else round(v_item.annual_salary/v_period_count,2) end;
    if v_amount<=0 then continue; end if;
    insert into public.economy_payroll_claims(season_id,period_id,team_id,member_id,annual_salary,period_count,amount)
    values(v_period.season_id,v_period.id,v_item.team_id,v_item.member_id,v_item.annual_salary,v_period_count,v_amount)
    on conflict(period_id,member_id) do nothing returning id into v_claim_id;
    if v_claim_id is null then continue; end if;
    select id into v_team_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_item.team_id and is_active;
    select id into v_driver_wallet from public.economy_wallet_accounts where account_kind='driver' and member_id=v_item.member_id and is_active;
    if v_team_wallet is null or v_driver_wallet is null then
      v_pending:=v_pending+1;
      continue;
    end if;
    v_result:=private.post_economy_transaction(v_team_wallet,v_driver_wallet,v_amount,'payroll',
      'Annual salary · '||v_period.title,
      'payroll:'||v_period.id::text||':'||v_item.member_id::text,p_actor_id,
      jsonb_build_object('season_id',v_period.season_id,'period_id',v_period.id,'member_id',v_item.member_id,'team_id',v_item.team_id,'annual_salary',v_item.annual_salary,'period_count',v_period_count),
      null,true);
    if v_result is null then v_pending:=v_pending+1;
    else
      update public.economy_payroll_claims set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now() where id=v_claim_id;
      v_paid:=v_paid+1;
    end if;
  end loop;
  return jsonb_build_object('paid',v_paid,'pending',v_pending,'period_id',v_period.id,'period_count',v_period_count);
end;
$$;

create or replace function public.admin_process_pending_economy_payroll(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_claim public.economy_payroll_claims%rowtype;
  v_team_wallet uuid;
  v_driver_wallet uuid;
  v_result jsonb;
  v_paid integer:=0;
  v_pending integer:=0;
begin
  if p_actor_id is null or not exists(select 1 from public.site_admins a where a.user_id=p_actor_id) then raise exception 'Hanya Admin yang dapat memproses payroll tertunda.'; end if;
  for v_claim in select * from public.economy_payroll_claims where status='pending' order by created_at,id for update skip locked loop
    select id into v_team_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_claim.team_id and is_active;
    select id into v_driver_wallet from public.economy_wallet_accounts where account_kind='driver' and member_id=v_claim.member_id and is_active;
    if v_team_wallet is null or v_driver_wallet is null then v_pending:=v_pending+1; continue; end if;
    v_result:=private.post_economy_transaction(v_team_wallet,v_driver_wallet,v_claim.amount,'payroll',
      'Annual salary · pending payroll','payroll:'||v_claim.period_id::text||':'||v_claim.member_id::text,
      p_actor_id,jsonb_build_object('season_id',v_claim.season_id,'period_id',v_claim.period_id,'member_id',v_claim.member_id,'team_id',v_claim.team_id,'annual_salary',v_claim.annual_salary,'period_count',v_claim.period_count),null,true);
    if v_result is null then v_pending:=v_pending+1; else
      update public.economy_payroll_claims set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now() where id=v_claim.id;
      v_paid:=v_paid+1;
    end if;
  end loop;
  return jsonb_build_object('paid',v_paid,'pending',v_pending);
end;
$$;

create or replace function public.process_license_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_round public.license_rounds%rowtype;
  v_rule public.caleris_configurations%rowtype;
  v_member record;
  v_streak integer;v_threshold integer;v_penalty numeric;v_current numeric;v_delta numeric;
  v_processed integer:=0;v_payroll jsonb;
begin
  if not public.is_caleris_fia_or_admin() then raise exception 'Hanya Admin atau FIA yang dapat memproses round.'; end if;
  select * into v_round from public.license_rounds where id=p_round_id for update;
  if not found then raise exception 'Round tidak ditemukan.'; end if;
  if v_round.status='closed' then raise exception 'Round sudah diproses.'; end if;
  if v_round.checkin_closes_at>now() then raise exception 'Periode check-in round ini belum berakhir.'; end if;
  if exists(select 1 from public.license_rounds previous where previous.season_division_id=v_round.season_division_id and previous.round_number<v_round.round_number and previous.status<>'closed') then
    raise exception 'Round harus diproses berurutan. Selesaikan seluruh round sebelumnya terlebih dahulu.';
  end if;
  if not exists(select 1 from public.license_season_divisions sd join public.license_seasons s on s.id=sd.season_id where sd.id=v_round.season_division_id and sd.status='active' and s.status='active') then
    raise exception 'Season dan divisi harus aktif untuk memproses round.';
  end if;
  select * into v_rule from public.caleris_configurations where category='license' and config_key='scoring-inactivity' and is_active;
  v_threshold:=nullif(v_rule.payload->>'absence_races','')::integer;
  v_penalty:=nullif(v_rule.payload->>'penalty_points','')::numeric;
  if v_threshold is null or v_threshold<=0 or v_penalty is null or v_penalty<=0 then raise exception 'Konfigurasi inactivity penalty belum valid.'; end if;
  for v_member in select sm.member_id,sm.season_id,sm.consecutive_absent_rounds from public.license_season_members sm where sm.season_division_id=v_round.season_division_id and not sm.is_hiatus loop
    if exists(select 1 from public.license_daily_checkins c where c.member_id=v_member.member_id and c.checkin_date between (v_round.checkin_opens_at at time zone 'Asia/Jakarta')::date and (v_round.checkin_closes_at at time zone 'Asia/Jakarta')::date) then
      v_streak:=0;
    else
      v_streak:=v_member.consecutive_absent_rounds+1;
      if v_streak>=v_threshold and mod(v_streak,v_threshold)=0 then
        select coalesce(sum(l.points_delta),0) into v_current from public.license_score_ledger l where l.member_id=v_member.member_id and l.season_id=v_member.season_id and l.source_type<>'wdc';
        v_delta:=-least(v_penalty,greatest(v_current,0));
        if v_delta<0 then
          insert into public.license_score_ledger(member_id,season_id,season_division_id,source_type,points_delta,idempotency_key,description,metadata)
          values(v_member.member_id,v_member.season_id,v_round.season_division_id,'inactivity_penalty',v_delta,'absence:'||v_round.id::text||':'||v_member.member_id::text,'Inactivity penalty after consecutive rounds without daily check-in',jsonb_build_object('round_id',v_round.id,'absence_streak',v_streak,'configured_penalty',v_penalty))
          on conflict(idempotency_key) do nothing;
        end if;
      end if;
    end if;
    update public.license_season_members set consecutive_absent_rounds=v_streak where season_division_id=v_round.season_division_id and member_id=v_member.member_id;
    v_processed:=v_processed+1;
  end loop;
  update public.license_rounds set status='closed',processed_at=now(),processed_by=(select auth.uid()) where id=p_round_id;
  v_payroll:=private.payroll_for_period_round(p_round_id,(select auth.uid()));
  return jsonb_build_object('round_id',p_round_id,'drivers_processed',v_processed,'status','closed','payroll',v_payroll);
end;
$$;

revoke all on function private.audit_season_calendar_period() from public,anon,authenticated,service_role;
revoke all on function private.touch_season_calendar_period() from public,anon,authenticated,service_role;
revoke all on function private.validate_season_period_round() from public,anon,authenticated,service_role;
revoke all on function private.guard_driver_contract() from public,anon,authenticated,service_role;
revoke all on function private.payroll_for_period_round(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_process_pending_economy_payroll(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_process_pending_economy_payroll(uuid) to service_role;
revoke all on function public.process_license_round(uuid) from public,anon,service_role;
grant execute on function public.process_license_round(uuid) to authenticated;

create unique index season_calendar_order_unique on public.season_calendar_periods(season_id,sort_order);

create or replace function private.validate_period_round_count()
returns trigger language plpgsql set search_path=''
as $$
declare v_period_id uuid;v_division_id uuid;v_count integer;v_type text;
begin
  v_period_id:=case when tg_op='DELETE' then old.period_id else new.period_id end;
  v_division_id:=case when tg_op='DELETE' then old.season_division_id else new.season_division_id end;
  select period_type into v_type from public.season_calendar_periods where id=v_period_id;
  if v_type='race_period' then
    select count(*) into v_count from public.season_period_rounds
    where period_id=v_period_id and season_division_id=v_division_id;
    if v_count not between 3 and 5 then
      raise exception 'Setiap Race Period harus berisi 3 sampai 5 round untuk divisi terkait.';
    end if;
  end if;
  return null;
end;
$$;
create constraint trigger season_period_round_count_check
after insert or update or delete on public.season_period_rounds
deferrable initially deferred
for each row execute function private.validate_period_round_count();

-- Keep the existing lifetime-WDC validation intact; only widen its operator permission to FIA/Admin.
do $$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.finalize_license_division(uuid)'::regprocedure);
  v_definition:=replace(v_definition,
    'if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then',
    'if not public.is_caleris_fia_or_admin() then');
  if v_definition=pg_get_functiondef('public.finalize_license_division(uuid)'::regprocedure) then
    raise exception 'Could not update FIA authorization for WDC finalization.';
  end if;
  execute v_definition;
end;
$$;

alter table public.economy_payroll_claims drop constraint economy_payroll_claims_status_check;
alter table public.economy_payroll_claims add constraint economy_payroll_claims_status_check
check(status in ('pending','paid','reversed'));
create or replace function private.guard_economy_payroll_claim()
returns trigger language plpgsql set search_path=''
as $$
begin
  if tg_op='DELETE' then raise exception 'Payroll claims cannot be deleted.'; end if;
  if new.id is distinct from old.id or new.season_id is distinct from old.season_id
    or new.period_id is distinct from old.period_id or new.team_id is distinct from old.team_id
    or new.member_id is distinct from old.member_id or new.annual_salary is distinct from old.annual_salary
    or new.period_count is distinct from old.period_count or new.amount is distinct from old.amount
    or new.created_at is distinct from old.created_at then
    raise exception 'Payroll claim identity and amount are immutable.';
  end if;
  if not ((old.status='pending' and new.status='paid') or (old.status='paid' and new.status='reversed')) then
    raise exception 'Invalid payroll claim status transition.';
  end if;
  return new;
end;
$$;
create trigger economy_payroll_claim_guard
before update or delete on public.economy_payroll_claims
for each row execute function private.guard_economy_payroll_claim();

-- Mark payroll claims reversed when their immutable ledger transaction is reversed.
do $reversal$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.admin_reverse_economy_transaction(uuid,uuid)'::regprocedure);
  v_definition:=replace(v_definition,
    '  return v_result;',
    '  update public.economy_payroll_claims set status=''reversed'' where transaction_id=v_original.id and status=''paid'';'||E'\n  '||'return v_result;');
  if v_definition=pg_get_functiondef('public.admin_reverse_economy_transaction(uuid,uuid)'::regprocedure) then
    raise exception 'Could not extend reversal handler for payroll claims.';
  end if;
  execute v_definition;
end;
$reversal$;

revoke all on function private.validate_period_round_count() from public,anon,authenticated,service_role;
revoke all on function private.guard_economy_payroll_claim() from public,anon,authenticated,service_role;

create or replace function public.fia_create_season_calendar_period(
  p_season_id uuid,p_period_type text,p_period_number integer,p_title text,
  p_starts_on date,p_ends_on date,p_sort_order integer,p_assignments jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_period_id uuid;
  v_assignment jsonb;
  v_round_id uuid;
  v_division_id uuid;
  v_count integer;
begin
  if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat membentuk kalender season.'; end if;
  if p_period_type not in ('off_season','pre_season','race_period','race_break','end_season') then raise exception 'Jenis periode tidak valid.'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 100 then raise exception 'Nama periode wajib diisi.'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on then raise exception 'Tanggal periode tidak valid.'; end if;
  if p_sort_order is null or p_sort_order<1 then raise exception 'Urutan periode tidak valid.'; end if;
  if p_period_type in ('race_period','race_break') and (p_period_number is null or p_period_number<1) then raise exception 'Nomor periode wajib diisi.'; end if;
  if p_period_type in ('off_season','pre_season','end_season') and p_period_number is not null then raise exception 'Periode ini tidak menggunakan nomor urut berulang.'; end if;
  if p_period_type='race_period' and jsonb_typeof(p_assignments)<>'array' then raise exception 'Daftar round Race Period tidak valid.'; end if;
  insert into public.season_calendar_periods(season_id,period_type,period_number,title,starts_on,ends_on,sort_order,created_by)
  values(p_season_id,p_period_type,p_period_number,trim(p_title),p_starts_on,p_ends_on,p_sort_order,(select auth.uid()))
  returning id into v_period_id;
  if p_period_type='race_period' then
    select count(*) into v_count from public.license_season_divisions where season_id=p_season_id;
    if v_count=0 or jsonb_array_length(p_assignments)<>v_count then raise exception 'Setiap divisi season harus memiliki 3 sampai 5 round pada Race Period.'; end if;
    for v_assignment in select value from jsonb_array_elements(p_assignments) loop
      v_division_id:=(v_assignment->>'season_division_id')::uuid;
      if not exists(select 1 from public.license_season_divisions where id=v_division_id and season_id=p_season_id) then raise exception 'Divisi tidak termasuk season ini.'; end if;
      if jsonb_typeof(v_assignment->'round_ids')<>'array' or jsonb_array_length(v_assignment->'round_ids') not between 3 and 5 then raise exception 'Setiap Race Period harus berisi 3 sampai 5 round per divisi.'; end if;
      for v_round_id in select value::text::uuid from jsonb_array_elements_text(v_assignment->'round_ids') loop
        insert into public.season_period_rounds(period_id,season_division_id,round_id)
        values(v_period_id,v_division_id,v_round_id);
      end loop;
    end loop;
  end if;
  return jsonb_build_object('id',v_period_id);
end;
$$;
revoke all on function public.fia_create_season_calendar_period(uuid,text,integer,text,date,date,integer,jsonb) from public,anon,service_role;
grant execute on function public.fia_create_season_calendar_period(uuid,text,integer,text,date,date,integer,jsonb) to authenticated;
revoke insert on public.season_calendar_periods from authenticated;
revoke insert,update,delete on public.season_period_rounds from authenticated;

create or replace function public.fia_create_season_calendar(p_season_id uuid,p_periods jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_period jsonb;
  v_assignment jsonb;
  v_period_id uuid;
  v_type text;
  v_title text;
  v_starts date;
  v_ends date;
  v_number integer;
  v_order integer:=0;
  v_division_id uuid;
  v_round_id uuid;
  v_division_count integer;
  v_type_count integer;
  v_race_count integer:=0;
  v_period_count integer:=0;
  v_unassigned integer;
  v_last_start date;
begin
  if not public.is_caleris_fia_or_admin() then raise exception 'Hanya FIA atau Admin yang dapat membentuk kalender season.'; end if;
  if not exists(select 1 from public.license_seasons where id=p_season_id and status in ('draft','active')) then raise exception 'Season tidak ditemukan atau sudah selesai.'; end if;
  if jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)<4 then raise exception 'Kalender harus memuat Off Season, Pre Season, minimal satu Race Period, dan End Season.'; end if;
  if exists(select 1 from public.season_calendar_periods where season_id=p_season_id) then raise exception 'Kalender season sudah terbentuk. Gunakan Reschedule untuk mengubah tanggal.'; end if;
  for v_type in select unnest(array['off_season','pre_season','end_season']) loop
    select count(*) into v_type_count from jsonb_array_elements(p_periods) x where x->>'period_type'=v_type;
    if v_type_count<>1 then raise exception 'Kalender wajib memiliki tepat satu periode %.',v_type; end if;
  end loop;
  select count(*) into v_race_count from jsonb_array_elements(p_periods) x where x->>'period_type'='race_period';
  if v_race_count<1 then raise exception 'Season wajib memiliki minimal satu Race Period.'; end if;
  select count(*) into v_division_count from public.license_season_divisions where season_id=p_season_id;
  if v_division_count<1 then raise exception 'Buat minimal satu divisi sebelum membentuk kalender.'; end if;

  for v_period in select value from jsonb_array_elements(p_periods) loop
    v_order:=v_order+1;
    v_type:=v_period->>'period_type';
    if v_type not in ('off_season','pre_season','race_period','race_break','end_season') then raise exception 'Jenis periode tidak valid.'; end if;
    v_title:=nullif(trim(v_period->>'title'),'');
    v_starts:=(v_period->>'starts_on')::date;
    v_ends:=(v_period->>'ends_on')::date;
    if v_title is null or v_starts is null or v_ends is null or v_ends<v_starts then raise exception 'Nama atau tanggal periode tidak valid.'; end if;
    if v_type in ('race_period','race_break') then
      select count(*)+1 into v_number from public.season_calendar_periods
      where season_id=p_season_id and period_type=v_type;
    else v_number:=null; end if;
    insert into public.season_calendar_periods(season_id,period_type,period_number,title,starts_on,ends_on,sort_order,created_by)
    values(p_season_id,v_type,v_number,v_title,v_starts,v_ends,v_order,(select auth.uid()))
    returning id into v_period_id;
    if v_type='race_period' then
      if jsonb_typeof(v_period->'assignments')<>'array' or jsonb_array_length(v_period->'assignments')<>v_division_count then
        raise exception 'Setiap Race Period wajib mengatur round untuk seluruh divisi season.';
      end if;
      for v_assignment in select value from jsonb_array_elements(v_period->'assignments') loop
        v_division_id:=(v_assignment->>'season_division_id')::uuid;
        if not exists(select 1 from public.license_season_divisions where id=v_division_id and season_id=p_season_id) then raise exception 'Divisi tidak termasuk season ini.'; end if;
        if jsonb_typeof(v_assignment->'round_ids')<>'array' or jsonb_array_length(v_assignment->'round_ids') not between 3 and 5 then raise exception 'Setiap Race Period harus berisi 3 sampai 5 round per divisi.'; end if;
        for v_round_id in select value::text::uuid from jsonb_array_elements_text(v_assignment->'round_ids') loop
          insert into public.season_period_rounds(period_id,season_division_id,round_id) values(v_period_id,v_division_id,v_round_id);
        end loop;
      end loop;
    end if;
    v_period_count:=v_period_count+1;
  end loop;
  select count(*) into v_unassigned from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  where d.season_id=p_season_id and not exists(select 1 from public.season_period_rounds pr where pr.round_id=r.id);
  if v_unassigned>0 then raise exception 'Semua round pada seluruh divisi harus dimasukkan ke dalam Race Period. Masih ada % round belum terpetakan.',v_unassigned; end if;
  return jsonb_build_object('season_id',p_season_id,'periods_created',v_period_count,'race_periods',v_race_count);
end;
$$;
revoke all on function public.fia_create_season_calendar(uuid,jsonb) from public,anon,service_role;
grant execute on function public.fia_create_season_calendar(uuid,jsonb) to authenticated;
