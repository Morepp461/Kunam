-- CALERIS Masters Economy Engine core.
-- All money is recorded as immutable, balanced outflow/inflow pairs.
-- Legacy members.balance is intentionally no longer authoritative.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists public.economy_wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  account_kind text not null check (account_kind in (
    'public_member','driver','team_owner','team','vreeo_bank','sponsor_source'
  )),
  profile_user_id uuid references auth.users(id) on delete restrict,
  member_id uuid references public.members(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  balance numeric(20,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint economy_wallet_owner_shape check (
    (account_kind='public_member' and profile_user_id is not null and member_id is null and team_id is null)
    or (account_kind in ('driver','team_owner') and profile_user_id is null and member_id is not null and team_id is null)
    or (account_kind='team' and profile_user_id is null and member_id is null and team_id is not null)
    or (account_kind in ('vreeo_bank','sponsor_source') and profile_user_id is null and member_id is null and team_id is null)
  )
);

create unique index if not exists economy_wallet_public_member_unique
  on public.economy_wallet_accounts(profile_user_id) where account_kind='public_member';
create unique index if not exists economy_wallet_driver_unique
  on public.economy_wallet_accounts(member_id) where account_kind='driver';
create unique index if not exists economy_wallet_owner_unique
  on public.economy_wallet_accounts(member_id) where account_kind='team_owner';
create unique index if not exists economy_wallet_team_unique
  on public.economy_wallet_accounts(team_id) where account_kind='team';
create unique index if not exists economy_wallet_system_unique
  on public.economy_wallet_accounts(account_kind) where account_kind in ('vreeo_bank','sponsor_source');
create index if not exists economy_wallet_member_lookup_idx
  on public.economy_wallet_accounts(member_id) where member_id is not null;
create index if not exists economy_wallet_team_lookup_idx
  on public.economy_wallet_accounts(team_id) where team_id is not null;

create table if not exists public.economy_transactions (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'checkin_reward','prize','bank_reward','sponsor_payout','bank_funding',
    'tax','fine','transfer','admin_adjustment','reversal'
  )),
  source_account_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  destination_account_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  amount numeric(20,2) not null check (amount > 0),
  idempotency_key text not null unique check (length(trim(idempotency_key)) between 8 and 180),
  description text not null check (length(trim(description)) between 1 and 240),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid references auth.users(id) on delete set null,
  reversal_of uuid unique references public.economy_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint economy_transaction_distinct_accounts check (source_account_id<>destination_account_id),
  constraint economy_reversal_shape check ((event_type='reversal')=(reversal_of is not null))
);
create index if not exists economy_transactions_created_idx
  on public.economy_transactions(created_at desc);
create index if not exists economy_transactions_source_idx
  on public.economy_transactions(source_account_id,created_at desc);
create index if not exists economy_transactions_destination_idx
  on public.economy_transactions(destination_account_id,created_at desc);

create table if not exists public.economy_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.economy_transactions(id) on delete restrict,
  account_id uuid not null references public.economy_wallet_accounts(id) on delete restrict,
  entry_side text not null check (entry_side in ('outflow','inflow')),
  amount numeric(20,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint economy_entry_once_per_side unique(transaction_id,entry_side),
  constraint economy_entry_once_per_account unique(transaction_id,account_id)
);
create index if not exists economy_entries_account_created_idx
  on public.economy_entries(account_id,created_at desc);

create table if not exists public.economy_reward_claims (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type='daily_checkin'),
  source_id uuid not null references public.license_daily_checkins(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  amount numeric(20,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','reversed')),
  transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint economy_reward_claim_source_unique unique(source_type,source_id)
);
create index if not exists economy_reward_claims_pending_idx
  on public.economy_reward_claims(created_at) where status='pending';

alter table public.economy_wallet_accounts enable row level security;
alter table public.economy_transactions enable row level security;
alter table public.economy_entries enable row level security;
alter table public.economy_reward_claims enable row level security;

revoke all privileges on table public.economy_wallet_accounts, public.economy_transactions,
  public.economy_entries, public.economy_reward_claims from public,anon,authenticated,service_role;
grant select on table public.economy_wallet_accounts, public.economy_transactions,
  public.economy_entries, public.economy_reward_claims to authenticated;

drop policy if exists "Admins read all economy wallets" on public.economy_wallet_accounts;
create policy "Admins read all economy wallets" on public.economy_wallet_accounts
for select to authenticated using (
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
drop policy if exists "Members read their economy wallets" on public.economy_wallet_accounts;
create policy "Members read their economy wallets" on public.economy_wallet_accounts
for select to authenticated using (
  (account_kind='public_member' and profile_user_id=(select auth.uid()))
  or (member_id is not null and exists(
    select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=economy_wallet_accounts.member_id
  ))
  or (team_id is not null and exists(
    select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.team_id=economy_wallet_accounts.team_id
  ))
);

drop policy if exists "Admins read economy transactions" on public.economy_transactions;
create policy "Admins read economy transactions" on public.economy_transactions
for select to authenticated using (
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
drop policy if exists "Admins read economy entries" on public.economy_entries;
create policy "Admins read economy entries" on public.economy_entries
for select to authenticated using (
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);
drop policy if exists "Admins read economy reward claims" on public.economy_reward_claims;
create policy "Admins read economy reward claims" on public.economy_reward_claims
for select to authenticated using (
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);

insert into public.economy_wallet_accounts(account_kind)
values ('vreeo_bank'),('sponsor_source')
on conflict do nothing;

create or replace function private.ensure_profile_economy_wallet()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.economy_wallet_accounts(account_kind,profile_user_id)
  values('public_member',new.user_id)
  on conflict(profile_user_id) where account_kind='public_member'
  do update set is_active=true,updated_at=now();
  return new;
end;
$$;

create or replace function private.ensure_member_economy_wallets()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.role='Driver' then
    insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
    values('driver',new.id,true)
    on conflict(member_id) where account_kind='driver'
    do update set is_active=true,updated_at=now();
  else
    update public.economy_wallet_accounts set is_active=false,updated_at=now()
    where account_kind='driver' and member_id=new.id;
  end if;

  if new.role='Owner' then
    insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
    values('team_owner',new.id,true)
    on conflict(member_id) where account_kind='team_owner'
    do update set is_active=true,updated_at=now();
  else
    update public.economy_wallet_accounts set is_active=false,updated_at=now()
    where account_kind='team_owner' and member_id=new.id;
  end if;
  return new;
end;
$$;

create or replace function private.ensure_team_economy_wallet()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.economy_wallet_accounts(account_kind,team_id)
  values('team',new.id)
  on conflict(team_id) where account_kind='team'
  do update set is_active=true,updated_at=now();
  return new;
end;
$$;

drop trigger if exists economy_profile_wallet on public.profiles;
create trigger economy_profile_wallet after insert or update of user_id on public.profiles
for each row execute function private.ensure_profile_economy_wallet();
drop trigger if exists economy_member_wallets on public.members;
create trigger economy_member_wallets after insert or update of role on public.members
for each row execute function private.ensure_member_economy_wallets();
drop trigger if exists economy_team_wallet on public.teams;
create trigger economy_team_wallet after insert on public.teams
for each row execute function private.ensure_team_economy_wallet();

insert into public.economy_wallet_accounts(account_kind,profile_user_id)
select 'public_member',p.user_id from public.profiles p
on conflict(profile_user_id) where account_kind='public_member' do nothing;
insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
select 'driver',m.id,true from public.members m where m.role='Driver'
on conflict(member_id) where account_kind='driver' do nothing;
insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
select 'team_owner',m.id,true from public.members m where m.role='Owner'
on conflict(member_id) where account_kind='team_owner' do nothing;
insert into public.economy_wallet_accounts(account_kind,team_id)
select 'team',t.id from public.teams t
on conflict(team_id) where account_kind='team' do nothing;

create or replace function private.post_economy_transaction(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_event_type text,
  p_description text,
  p_idempotency_key text,
  p_actor_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_reversal_of uuid default null,
  p_allow_pending boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source public.economy_wallet_accounts%rowtype;
  v_destination public.economy_wallet_accounts%rowtype;
  v_existing public.economy_transactions%rowtype;
  v_original public.economy_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Nominal transaksi harus lebih besar dari nol, maksimal 18 digit sebelum koma, dan maksimal dua angka desimal.';
  end if;
  if p_source_account_id is null or p_destination_account_id is null
     or p_source_account_id=p_destination_account_id then
    raise exception 'Sumber dan tujuan transaksi tidak valid.';
  end if;
  if p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal') then
    raise exception 'Jenis transaksi ekonomi tidak dikenal.';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then
    raise exception 'Idempotency key tidak valid.';
  end if;
  if p_description is null or length(trim(p_description)) not between 1 and 240 then
    raise exception 'Deskripsi transaksi wajib diisi (maksimal 240 karakter).';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception 'Metadata transaksi harus berupa object JSON.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));

  select * into v_existing from public.economy_transactions
  where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.source_account_id<>p_source_account_id
       or v_existing.destination_account_id<>p_destination_account_id
       or v_existing.amount<>p_amount
       or v_existing.event_type<>p_event_type then
      raise exception 'Idempotency key sudah digunakan oleh transaksi berbeda.';
    end if;
    return jsonb_build_object('transaction_id',v_existing.id,'status','duplicate');
  end if;

  if p_event_type='reversal' then
    if p_reversal_of is null then raise exception 'Transaksi pembatalan harus merujuk transaksi asal.'; end if;
    select * into v_original from public.economy_transactions where id=p_reversal_of for update;
    if not found then raise exception 'Transaksi asal tidak ditemukan.'; end if;
    if v_original.reversal_of is not null then raise exception 'Transaksi pembatalan tidak dapat dibatalkan lagi.'; end if;
    if v_original.source_account_id<>p_destination_account_id
       or v_original.destination_account_id<>p_source_account_id
       or v_original.amount<>p_amount then
      raise exception 'Arah atau nominal pembatalan tidak cocok dengan transaksi asal.';
    end if;
  elsif p_reversal_of is not null then
    raise exception 'Referensi reversal hanya boleh digunakan pada transaksi reversal.';
  end if;

  perform 1 from public.economy_wallet_accounts
  where id in (p_source_account_id,p_destination_account_id)
  order by id for update;

  select * into v_source from public.economy_wallet_accounts where id=p_source_account_id;
  select * into v_destination from public.economy_wallet_accounts where id=p_destination_account_id;
  if not found or v_source.id is null or v_destination.id is null then
    raise exception 'Wallet sumber atau tujuan tidak ditemukan.';
  end if;
  if not v_source.is_active or not v_destination.is_active then
    raise exception 'Wallet sumber atau tujuan sedang nonaktif.';
  end if;

  if p_event_type='checkin_reward' and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind<>'driver') then
    raise exception 'Reward check-in wajib berasal dari VreeoBank dan masuk ke wallet Driver.';
  elsif p_event_type in ('prize','bank_reward') and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Hadiah dan reward Bank wajib bersumber dari VreeoBank dan menuju wallet penerima.';
  elsif p_event_type='sponsor_payout' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Pembayaran sponsor wajib bersumber dari Sponsor dan menuju wallet penerima.';
  elsif p_event_type='bank_funding' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind<>'vreeo_bank') then
    raise exception 'Pendanaan VreeoBank harus berasal dari sumber Sponsor.';
  elsif p_event_type in ('tax','fine') and (v_destination.account_kind<>'vreeo_bank' or v_source.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Pajak dan denda wajib berasal dari wallet entitas dan masuk ke VreeoBank.';
  elsif p_event_type='transfer' and (v_source.account_kind in ('vreeo_bank','sponsor_source') or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Transfer biasa hanya boleh terjadi antar wallet entitas.';
  elsif p_event_type='admin_adjustment' and (v_source.account_kind='sponsor_source' or v_destination.account_kind='sponsor_source') then
    raise exception 'Penyesuaian saldo tidak boleh menggunakan sumber Sponsor.';
  end if;

  if v_source.balance<p_amount
     and v_source.account_kind<>'sponsor_source'
     and p_event_type not in ('tax','fine') then
    if p_allow_pending then return null; end if;
    raise exception 'Saldo sumber tidak mencukupi.';
  end if;

  insert into public.economy_transactions(
    event_type,source_account_id,destination_account_id,amount,idempotency_key,
    description,metadata,created_by,reversal_of
  ) values (
    p_event_type,p_source_account_id,p_destination_account_id,p_amount,
    p_idempotency_key,trim(p_description),p_metadata,p_actor_id,p_reversal_of
  ) returning id into v_transaction_id;

  insert into public.economy_entries(transaction_id,account_id,entry_side,amount)
  values
    (v_transaction_id,p_source_account_id,'outflow',p_amount),
    (v_transaction_id,p_destination_account_id,'inflow',p_amount);

  update public.economy_wallet_accounts
  set balance=balance-p_amount,updated_at=now()
  where id=p_source_account_id;
  update public.economy_wallet_accounts
  set balance=balance+p_amount,updated_at=now()
  where id=p_destination_account_id;

  return jsonb_build_object('transaction_id',v_transaction_id,'status','posted');
end;
$$;

create or replace function private.validate_economy_transaction_balance()
returns trigger
language plpgsql
security definer
set search_path=''
as $economy_validation$
declare
  v_entry_count integer;
  v_outflow_count integer;
  v_inflow_count integer;
begin
  select
    count(*),
    count(*) filter(where entry_side='outflow' and account_id=new.source_account_id and amount=new.amount),
    count(*) filter(where entry_side='inflow' and account_id=new.destination_account_id and amount=new.amount)
  into v_entry_count,v_outflow_count,v_inflow_count
  from public.economy_entries
  where transaction_id=new.id;

  if v_entry_count<>2 or v_outflow_count<>1 or v_inflow_count<>1 then
    raise exception 'Ledger transaction must contain exactly one matching outflow and one matching inflow.';
  end if;
  return null;
end;
$;

create constraint trigger economy_transaction_balanced_entries
after insert on public.economy_transactions
deferrable initially deferred
for each row execute function private.validate_economy_transaction_balance();

create or replace function private.reject_economy_ledger_mutation()
returns trigger
language plpgsql
set search_path=''
as $economy_immutable$
begin
  raise exception 'Economy ledger records are immutable. Use a reversal transaction.';
end;
$;

create trigger economy_transactions_immutable
before update or delete on public.economy_transactions
for each row execute function private.reject_economy_ledger_mutation();
create trigger economy_entries_immutable
before update or delete on public.economy_entries
for each row execute function private.reject_economy_ledger_mutation();

create or replace function private.guard_economy_reward_claim()
returns trigger
language plpgsql
set search_path=''
as $economy_claim_guard$
begin
  if tg_op='DELETE' then
    raise exception 'Economy reward claims cannot be deleted.';
  end if;
  if new.id is distinct from old.id
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.member_id is distinct from old.member_id
     or new.amount is distinct from old.amount
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'Economy reward claim identity and amount are immutable.';
  end if;
  if not ((old.status='pending' and new.status='paid')
       or (old.status='paid' and new.status='reversed')) then
    raise exception 'Invalid economy reward claim status transition.';
  end if;
  return new;
end;
$;

create trigger economy_reward_claim_guard
before update or delete on public.economy_reward_claims
for each row execute function private.guard_economy_reward_claim();

create or replace function public.admin_post_economy_transaction(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_event_type text,
  p_description text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat mencatat transaksi ekonomi.';
  end if;
  if p_event_type='reversal' then raise exception 'Gunakan fungsi pembatalan transaksi khusus.'; end if;
  return private.post_economy_transaction(
    p_source_account_id,p_destination_account_id,p_amount,p_event_type,p_description,
    p_idempotency_key,(select auth.uid()),coalesce(p_metadata,'{}'::jsonb),null,false
  );
end;
$$;

create or replace function public.admin_reverse_economy_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_original public.economy_transactions%rowtype;
  v_result jsonb;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat membatalkan transaksi ekonomi.';
  end if;
  select * into v_original from public.economy_transactions
  where id=p_transaction_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan.'; end if;
  if v_original.event_type='reversal' then raise exception 'Transaksi reversal tidak dapat dibatalkan.'; end if;
  if exists(select 1 from public.economy_transactions where reversal_of=v_original.id) then
    raise exception 'Transaksi ini sudah dibatalkan.';
  end if;
  v_result:=private.post_economy_transaction(
    v_original.destination_account_id,v_original.source_account_id,v_original.amount,
    'reversal','Pembatalan transaksi: '||v_original.description,
    'reversal:'||v_original.id::text,(select auth.uid()),
    jsonb_build_object('original_transaction_id',v_original.id,'original_event_type',v_original.event_type),
    v_original.id,false
  );
  update public.economy_reward_claims
  set status='reversed'
  where transaction_id=v_original.id and status='paid';
  return v_result;
end;
$$;

create or replace function public.admin_process_pending_economy_rewards()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claim public.economy_reward_claims%rowtype;
  v_bank_id uuid;
  v_driver_wallet_id uuid;
  v_result jsonb;
  v_paid integer:=0;
  v_pending integer:=0;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Hanya Admin yang dapat memproses reward tertunda.';
  end if;
  select id into v_bank_id from public.economy_wallet_accounts where account_kind='vreeo_bank';
  for v_claim in
    select * from public.economy_reward_claims where status='pending'
    order by created_at,id for update skip locked
  loop
    select id into v_driver_wallet_id from public.economy_wallet_accounts
    where account_kind='driver' and member_id=v_claim.member_id and is_active;
    if v_driver_wallet_id is null then
      v_pending:=v_pending+1;
      continue;
    end if;
    v_result:=private.post_economy_transaction(
      v_bank_id,v_driver_wallet_id,v_claim.amount,'checkin_reward',
      'Daily check-in reward','checkin-reward:'||v_claim.source_id::text,
      (select auth.uid()),jsonb_build_object('checkin_id',v_claim.source_id,'claim_id',v_claim.id),
      null,true
    );
    if v_result is null then
      v_pending:=v_pending+1;
      exit;
    end if;
    update public.economy_reward_claims
    set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now()
    where id=v_claim.id;
    v_paid:=v_paid+1;
  end loop;
  return jsonb_build_object('paid',v_paid,'pending',v_pending);
end;
$$;

create or replace function private.award_checkin_economy_reward()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_config public.caleris_configurations%rowtype;
  v_amount numeric;
  v_bank_id uuid;
  v_driver_wallet_id uuid;
  v_claim_id uuid;
  v_result jsonb;
begin
  select * into v_config from public.caleris_configurations
  where category='economy' and config_key='daily-checkin-reward' and is_active;
  if not found then return new; end if;
  v_amount:=nullif(v_config.payload->>'amount','')::numeric;
  if v_amount is null or v_amount<=0 or v_amount>999999999999999999.99 or v_amount<>round(v_amount,2) then return new; end if;

  select id into v_driver_wallet_id from public.economy_wallet_accounts
  where account_kind='driver' and member_id=new.member_id and is_active;
  select id into v_bank_id from public.economy_wallet_accounts where account_kind='vreeo_bank';
  if v_driver_wallet_id is null or v_bank_id is null then return new; end if;

  insert into public.economy_reward_claims(source_type,source_id,member_id,amount,idempotency_key)
  values('daily_checkin',new.id,new.member_id,v_amount,'checkin-reward:'||new.id::text)
  on conflict(source_type,source_id) do nothing
  returning id into v_claim_id;
  if v_claim_id is null then return new; end if;

  v_result:=private.post_economy_transaction(
    v_bank_id,v_driver_wallet_id,v_amount,'checkin_reward',
    'Daily check-in reward','checkin-reward:'||new.id::text,
    (select auth.uid()),jsonb_build_object('checkin_id',new.id,'claim_id',v_claim_id),
    null,true
  );
  if v_result is not null then
    update public.economy_reward_claims
    set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now()
    where id=v_claim_id;
  end if;
  return new;
end;
$$;

drop trigger if exists economy_daily_checkin_reward on public.license_daily_checkins;
create trigger economy_daily_checkin_reward
after insert on public.license_daily_checkins
for each row execute function private.award_checkin_economy_reward();

create or replace view public.economy_wallet_directory
with (security_invoker=true)
as
select
  w.id,w.account_kind,w.profile_user_id,w.member_id,w.team_id,w.balance,w.is_active,w.created_at,w.updated_at,
  case
    when w.account_kind='vreeo_bank' then 'VreeoBank'
    when w.account_kind='sponsor_source' then 'Sponsor Source'
    when w.account_kind='team' then coalesce(t.name,'Team')
    when w.account_kind='public_member' then coalesce(p.web_nickname,p.first_name,p.public_member_id,'Public Member')
    when w.account_kind='driver' then coalesce(m.character_name,p.driver_nickname,p.web_nickname,'Driver')
    when w.account_kind='team_owner' then coalesce(m.character_name,p.web_nickname,'Team Owner')
    else 'Wallet'
  end as display_name
from public.economy_wallet_accounts w
left join public.profiles p on p.user_id=w.profile_user_id
  or (w.member_id is not null and p.member_id=w.member_id)
left join public.members m on m.id=w.member_id
left join public.teams t on t.id=w.team_id;

create or replace view public.economy_transaction_feed
with (security_invoker=true)
as
select
  x.id,x.event_type,x.amount,x.description,x.idempotency_key,x.metadata,x.created_by,x.created_at,
  x.source_account_id,x.destination_account_id,x.reversal_of,
  source.display_name as source_name,destination.display_name as destination_name,
  exists(select 1 from public.economy_transactions r where r.reversal_of=x.id) as is_reversed
from public.economy_transactions x
join public.economy_wallet_directory source on source.id=x.source_account_id
join public.economy_wallet_directory destination on destination.id=x.destination_account_id;

grant select on public.economy_wallet_directory,public.economy_transaction_feed to authenticated;
revoke all on public.economy_wallet_directory,public.economy_transaction_feed from anon,public;

insert into public.caleris_configurations(category,config_key,title,payload,is_active,sort_order)
values(
  'economy','daily-checkin-reward','Daily Check-in Reward',
  '{"amount":0,"source":"VreeoBank","destination":"Driver","currency":"¢p"}'::jsonb,
  false,10
)
on conflict(category,config_key) do nothing;

revoke all on function private.validate_economy_transaction_balance() from public,anon,authenticated,service_role;
revoke all on function private.reject_economy_ledger_mutation() from public,anon,authenticated,service_role;
revoke all on function private.guard_economy_reward_claim() from public,anon,authenticated,service_role;
revoke all on function private.ensure_profile_economy_wallet() from public,anon,authenticated,service_role;
revoke all on function private.ensure_member_economy_wallets() from public,anon,authenticated,service_role;
revoke all on function private.ensure_team_economy_wallet() from public,anon,authenticated,service_role;
revoke all on function private.post_economy_transaction(uuid,uuid,numeric,text,text,text,uuid,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function private.award_checkin_economy_reward() from public,anon,authenticated,service_role;
revoke all on function public.admin_post_economy_transaction(uuid,uuid,numeric,text,text,text,jsonb) from public,anon,service_role;
revoke all on function public.admin_reverse_economy_transaction(uuid) from public,anon,service_role;
revoke all on function public.admin_process_pending_economy_rewards() from public,anon,service_role;
grant execute on function public.admin_post_economy_transaction(uuid,uuid,numeric,text,text,text,jsonb) to authenticated;
grant execute on function public.admin_reverse_economy_transaction(uuid) to authenticated;
grant execute on function public.admin_process_pending_economy_rewards() to authenticated;
