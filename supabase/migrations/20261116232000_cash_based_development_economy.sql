begin;

-- Cash price per +1 attribute point. Token cost remains 1 DDP/TDP per point.
alter table public.caleris_team_development_pricing
  add column if not exists cash_eur_per_point numeric(20,2) not null default 0,
  add column if not exists cash_is_configured boolean not null default false;
alter table public.caleris_driver_development_pricing
  add column if not exists cash_eur_per_point numeric(20,2) not null default 0,
  add column if not exists cash_is_configured boolean not null default false;

update public.caleris_driver_development_pricing set
  ddp_per_point=1,is_configured=true,
  cash_eur_per_point=case attribute_key
    when 'race_pace' then 1000000
    when 'qualifying_pace' then 850000
    when 'experience' then 600000
    when 'aggression' then 450000
    when 'defensive_strength' then 600000
    when 'overtake_skill' then 600000
    when 'mistake_rate' then 450000
    when 'tyre_management' then 750000
  end,
  cash_is_configured=true,updated_at=now();

update public.caleris_team_development_pricing set
  tdp_per_point=1,is_configured=true,
  cash_eur_per_point=case part_key
    when 'race_pace' then 2500000
    when 'qualifying_pace' then 2000000
    when 'engine_power' then 3000000
    when 'aero_power' then 2800000
    when 'low_speed_corners' then 1500000
    when 'high_speed_corners' then 1800000
    when 'traction' then 1500000
    when 'mechanical_grip' then 1500000
    when 'team_tyre_management' then 1200000
    when 'strategy_quality' then 1200000
    when 'team_morale' then 800000
    when 'reliability' then 2000000
    when 'car_tyre_wear' then 1200000
    when 'pit_stop_efficiency' then 1000000
    when 'drs_efficiency' then 1500000
    when 'ers_efficiency' then 2000000
  end,
  cash_is_configured=true,updated_at=now();

alter table public.caleris_driver_development_history
  add column if not exists cash_eur_spent numeric(20,2) not null default 0,
  add column if not exists payment_method text not null default 'token'
    check(payment_method in ('cash','token'));
alter table public.caleris_team_development_part_history
  add column if not exists cash_eur_spent numeric(20,2) not null default 0,
  add column if not exists payment_method text not null default 'token'
    check(payment_method in ('cash','token'));

-- Development token shop is permanently disabled. DDP/TDP are earned from race rewards.
update public.caleris_development_shop_config
set token_price=0,is_active=false,updated_at=now();
revoke all on function public.member_purchase_development_tokens(numeric)
  from public,anon,authenticated,service_role;
revoke all on function public.admin_set_development_shop_price(numeric,boolean)
  from public,anon,authenticated,service_role;

-- Cash Development payments are internal double-entry transfers to the Development Treasury.
alter table public.economy_transactions drop constraint if exists economy_transactions_event_type_check;
alter table public.economy_transactions add constraint economy_transactions_event_type_check
  check(event_type = any(array[
    'checkin_reward','prize','bank_reward','sponsor_payout','bank_funding',
    'tax','fine','transfer','admin_adjustment','reversal','payroll',
    'loan_disbursement','loan_repayment','development_upgrade'
  ]::text[]));

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
as $function$
declare
  v_source public.economy_wallet_accounts%rowtype;
  v_destination public.economy_wallet_accounts%rowtype;
  v_existing public.economy_transactions%rowtype;
  v_original public.economy_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_amount is null or p_amount<=0 or p_amount>999999999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Nominal transaksi tidak valid.'; end if;
  if p_source_account_id is null or p_destination_account_id is null or p_source_account_id=p_destination_account_id then raise exception 'Wallet tidak valid.'; end if;
  if p_event_type not in ('checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_upgrade') then raise exception 'Jenis transaksi tidak dikenal.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then raise exception 'Idempotency key tidak valid.'; end if;
  if p_description is null or length(trim(p_description)) not between 1 and 240 then raise exception 'Deskripsi transaksi tidak valid.'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then raise exception 'Metadata transaksi tidak valid.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into v_existing from public.economy_transactions where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.source_account_id<>p_source_account_id or v_existing.destination_account_id<>p_destination_account_id or v_existing.amount<>p_amount or v_existing.event_type<>p_event_type then
      raise exception 'Idempotency key digunakan transaksi berbeda.';
    end if;
    return jsonb_build_object('transaction_id',v_existing.id,'status','duplicate');
  end if;

  if p_event_type='reversal' then
    if p_reversal_of is null then raise exception 'Referensi reversal wajib ada.'; end if;
    select * into v_original from public.economy_transactions where id=p_reversal_of for update;
    if not found or v_original.reversal_of is not null then raise exception 'Transaksi asal tidak valid.'; end if;
    if v_original.source_account_id<>p_destination_account_id or v_original.destination_account_id<>p_source_account_id or v_original.amount<>p_amount then
      raise exception 'Reversal tidak cocok.';
    end if;
  elsif p_reversal_of is not null then
    raise exception 'Referensi reversal hanya untuk reversal.';
  end if;

  perform 1 from public.economy_wallet_accounts
  where id in (p_source_account_id,p_destination_account_id)
  order by id for update;
  select * into v_source from public.economy_wallet_accounts where id=p_source_account_id;
  select * into v_destination from public.economy_wallet_accounts where id=p_destination_account_id;

  if v_source.id is null or v_destination.id is null or not v_source.is_active or not v_destination.is_active then
    raise exception 'Wallet tidak ditemukan atau nonaktif.';
  end if;

  if p_event_type='checkin_reward' and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind not in ('driver','team_owner','public_member')) then
    raise exception 'Rute reward check-in tidak valid.';
  elsif p_event_type in ('prize','bank_reward') and (v_source.account_kind<>'vreeo_bank' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Rute reward Bank tidak valid.';
  elsif p_event_type='sponsor_payout' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Rute sponsor tidak valid.';
  elsif p_event_type='bank_funding' and (v_source.account_kind<>'sponsor_source' or v_destination.account_kind<>'vreeo_bank') then
    raise exception 'Rute funding Bank tidak valid.';
  elsif p_event_type in ('tax','fine') and (v_destination.account_kind<>'vreeo_bank' or v_source.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Rute pajak/denda tidak valid.';
  elsif p_event_type='transfer' and (v_source.account_kind in ('vreeo_bank','sponsor_source') or v_destination.account_kind in ('vreeo_bank','sponsor_source')) then
    raise exception 'Rute transfer tidak valid.';
  elsif p_event_type='admin_adjustment' and (v_source.account_kind='sponsor_source' or v_destination.account_kind='sponsor_source') then
    raise exception 'Rute penyesuaian tidak valid.';
  elsif p_event_type='development_upgrade' and (
    v_source.account_kind not in ('driver','team')
    or v_destination.account_kind<>'development_shop'
  ) then
    raise exception 'Rute pembayaran Development tidak valid.';
  elsif p_event_type='payroll' and (
    v_source.account_kind<>'team'
    or v_destination.account_kind<>'driver'
    or not exists(
      select 1 from public.members m
      where m.id=v_destination.member_id and m.role='Driver'
        and (
          m.team_id=v_source.team_id
          or exists(
            select 1 from public.caleris_driver_move_negotiations n
            where n.id=nullif(p_metadata->>'loan_negotiation_id','')::uuid
              and n.driver_member_id=m.id
              and n.move_type='loan'
              and n.status in ('loan_active','loan_returned')
              and n.loan_season_id=nullif(p_metadata->>'season_id','')::uuid
              and v_source.team_id in (n.buyer_team_id,n.seller_team_id)
          )
        )
    )
  ) then
    raise exception 'Payroll harus berasal dari tim kontrak Driver atau salah satu tim pada Driver Loan aktif/selesai.';
  end if;

  if v_source.balance<p_amount and v_source.account_kind<>'sponsor_source' and p_event_type not in ('tax','fine') then
    if p_allow_pending then return null; end if;
    raise exception 'Saldo sumber tidak mencukupi.';
  end if;

  insert into public.economy_transactions(
    event_type,source_account_id,destination_account_id,amount,idempotency_key,
    description,metadata,created_by,reversal_of
  )
  values(
    p_event_type,p_source_account_id,p_destination_account_id,p_amount,p_idempotency_key,
    trim(p_description),p_metadata,p_actor_id,p_reversal_of
  )
  returning id into v_transaction_id;

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
$function$;

drop function if exists public.member_upgrade_development_attribute(uuid,text,text,numeric);
create function public.member_upgrade_development_attribute(
  p_actor_id uuid,
  p_scope text,
  p_attribute_key text,
  p_new_value numeric,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_profile public.profiles%rowtype;
  v_old numeric(5,2);
  v_delta numeric(5,2);
  v_cash_rate numeric(20,2);
  v_cash_cost numeric(20,2):=0;
  v_token_cost numeric(20,2):=0;
  v_cash_wallet_id uuid;
  v_treasury_id uuid;
  v_dev public.caleris_development_accounts%rowtype;
  v_attr_id uuid;
  v_history_id uuid;
  v_cash_remaining numeric(20,2);
  v_token_remaining numeric(20,2);
  v_idempotency text;
  v_tx jsonb;
  v_now timestamptz:=now();
begin
  if p_actor_id is null or p_scope not in ('team','driver') or p_payment_method not in ('cash','token') then
    raise exception 'Data upgrade Development tidak valid.';
  end if;
  if p_new_value is null or p_new_value<50 or p_new_value>100 or p_new_value<>round(p_new_value,2) then
    raise exception 'Nilai atribut harus 50 sampai 100.';
  end if;

  select * into v_profile from public.profiles where user_id=p_actor_id;
  if not found or v_profile.member_id is null then raise exception 'Profil member tidak ditemukan.'; end if;
  select * into v_member from public.members where id=v_profile.member_id for update;
  if not found then raise exception 'Member tidak ditemukan.'; end if;

  if p_scope='team' then
    if v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Hanya Owner atau Principal tim yang dapat upgrade atribut tim.'; end if;
    select current_value,id into v_old,v_attr_id
      from public.caleris_team_development_parts
      where team_id=v_member.team_id and part_key=p_attribute_key for update;
    select cash_eur_per_point into v_cash_rate
      from public.caleris_team_development_pricing
      where part_key=p_attribute_key and cash_is_configured;
  else
    if v_member.role<>'Driver' then raise exception 'Hanya Driver yang dapat upgrade atribut driver.'; end if;
    select current_value,id into v_old,v_attr_id
      from public.caleris_driver_development_attributes
      where member_id=v_member.id and attribute_key=p_attribute_key for update;
    select cash_eur_per_point into v_cash_rate
      from public.caleris_driver_development_pricing
      where attribute_key=p_attribute_key and cash_is_configured;
  end if;

  if v_attr_id is null then raise exception 'Atribut tidak ditemukan.'; end if;
  if p_new_value<=v_old then raise exception 'Upgrade harus menaikkan nilai atribut.'; end if;
  v_delta:=p_new_value-v_old;
  if v_delta<=0 then raise exception 'Perubahan nilai atribut tidak valid.'; end if;

  if p_payment_method='cash' then
    if v_cash_rate is null or v_cash_rate<=0 then raise exception 'Harga cash atribut belum dikonfigurasi Admin.'; end if;
    v_cash_cost:=round(v_delta*v_cash_rate,2);
    if p_scope='driver' then
      select id into v_cash_wallet_id from public.economy_wallet_accounts
      where account_kind='driver' and member_id=v_member.id and is_active for update;
    else
      select id into v_cash_wallet_id from public.economy_wallet_accounts
      where account_kind='team' and team_id=v_member.team_id and is_active for update;
    end if;
    if v_cash_wallet_id is null then raise exception 'Wallet cash untuk Development tidak ditemukan.'; end if;
    select id into v_treasury_id from public.economy_wallet_accounts
    where account_kind='development_shop' and is_active order by created_at limit 1 for update;
    if v_treasury_id is null then raise exception 'Development Treasury belum tersedia.'; end if;

    v_idempotency:='development-upgrade:'||md5(
      v_member.id::text||':'||p_scope||':'||p_attribute_key||':'||
      v_old::text||':'||p_new_value::text||':'||p_payment_method
    );
    v_tx:=private.post_economy_transaction(
      v_cash_wallet_id,v_treasury_id,v_cash_cost,'development_upgrade',
      'Development upgrade · '||p_attribute_key,v_idempotency,p_actor_id,
      jsonb_build_object('member_id',v_member.id,'team_id',v_member.team_id,
        'scope',p_scope,'attribute_key',p_attribute_key,'previous_value',v_old,
        'new_value',p_new_value,'point_delta',v_delta,'cash_eur_per_point',v_cash_rate)
    );
    select balance into v_cash_remaining from public.economy_wallet_accounts where id=v_cash_wallet_id;
  else
    v_token_cost:=v_delta;
    if p_scope='driver' then
      select * into v_dev from public.caleris_development_accounts
      where asset_type='DDP' and member_id=v_member.id for update;
    else
      select * into v_dev from public.caleris_development_accounts
      where asset_type='TDP' and team_id=v_member.team_id for update;
    end if;
    if v_dev.id is null then raise exception 'Saldo Development Token belum tersedia.'; end if;
    if v_dev.balance<v_token_cost then raise exception 'Saldo token Development tidak mencukupi.'; end if;
    update public.caleris_development_accounts
    set balance=balance-v_token_cost,updated_at=v_now where id=v_dev.id;
    insert into public.caleris_development_ledger(
      account_id,delta,source_type,description,idempotency_key,created_by,metadata
    ) values (
      v_dev.id,-v_token_cost,'attribute_upgrade',
      initcap(p_scope)||' free Development reward: '||p_attribute_key,
      'attribute-upgrade:'||p_scope||':'||md5(v_member.id::text||':'||p_attribute_key||':'||v_old::text||':'||p_new_value::text),
      p_actor_id,jsonb_build_object('attribute_key',p_attribute_key,
        'previous_value',v_old,'new_value',p_new_value,'point_cost',v_token_cost,
        'payment_method','token','free_race_reward',true)
    );
    v_token_remaining:=v_dev.balance-v_token_cost;
  end if;

  if p_scope='team' then
    update public.caleris_team_development_parts
      set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
    insert into public.caleris_team_development_part_history(
      team_id,part_key,previous_value,new_value,tdp_spent,created_by,
      cash_eur_spent,payment_method
    ) values(
      v_member.team_id,p_attribute_key,v_old,p_new_value,v_token_cost,p_actor_id,
      v_cash_cost,p_payment_method
    ) returning id into v_history_id;
  else
    update public.caleris_driver_development_attributes
      set current_value=p_new_value,updated_at=v_now,updated_by=p_actor_id where id=v_attr_id;
    insert into public.caleris_driver_development_history(
      member_id,attribute_key,previous_value,new_value,ddp_spent,created_by,
      cash_eur_spent,payment_method
    ) values(
      v_member.id,p_attribute_key,v_old,p_new_value,v_token_cost,p_actor_id,
      v_cash_cost,p_payment_method
    ) returning id into v_history_id;
  end if;

  return jsonb_build_object(
    'scope',p_scope,'attribute_key',p_attribute_key,'previous_value',v_old,
    'new_value',p_new_value,'point_delta',v_delta,'payment_method',p_payment_method,
    'cash_spent',v_cash_cost,'token_spent',v_token_cost,
    'remaining_cash',v_cash_remaining,'remaining_tokens',v_token_remaining,
    'transaction',v_tx,'history_id',v_history_id
  );
end;
$function$;

revoke all on function public.member_upgrade_development_attribute(uuid,text,text,numeric,text)
  from public,anon,authenticated;
grant execute on function public.member_upgrade_development_attribute(uuid,text,text,numeric,text)
  to service_role;

-- Existing divisions retain any explicitly configured reward. Unconfigured/zero
-- rows receive the agreed P1 reward of 3 DDP + 3 TDP; pole reward stays disabled.
update public.caleris_race_reward_rules
set driver_win_ddp=3,team_win_tdp=3,is_active=true,updated_at=now()
where not is_active and driver_win_ddp=0 and team_win_tdp=0
  and driver_pole_ddp=0 and team_pole_tdp=0;

create or replace function private.seed_default_development_race_rewards()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  insert into public.caleris_race_reward_rules(
    season_division_id,driver_win_ddp,team_win_tdp,
    driver_pole_ddp,team_pole_tdp,is_active
  ) values(new.id,3,3,0,0,true)
  on conflict(season_division_id) do nothing;
  return new;
end;
$function$;
drop trigger if exists seed_default_development_race_rewards on public.license_season_divisions;
create trigger seed_default_development_race_rewards
after insert on public.license_season_divisions
for each row execute function private.seed_default_development_race_rewards();
revoke all on function private.seed_default_development_race_rewards()
  from public,anon,authenticated,service_role;

commit;
