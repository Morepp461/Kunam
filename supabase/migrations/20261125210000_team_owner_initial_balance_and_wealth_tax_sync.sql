begin;

create or replace function private.grant_initial_economy_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_bank uuid;
  v_amount numeric(20,2);
  v_description text;
begin
  v_amount := case
    when new.account_kind='driver' then 5000000
    when new.account_kind='team_owner' then 10000000
    when new.account_kind='team' then 100000000
    else 0
  end;
  if v_amount<=0 then return new; end if;

  select id into v_bank
  from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active
  order by created_at
  limit 1;
  if v_bank is null then
    raise exception 'VreeoBank aktif diperlukan untuk saldo awal wallet baru.';
  end if;

  v_description := case new.account_kind
    when 'driver' then 'One-time Driver starting balance'
    when 'team_owner' then 'One-time Team Owner starting balance'
    else 'One-time Team starting balance'
  end;

  perform private.post_economy_transaction(
    v_bank,new.id,v_amount,'bank_reward',
    v_description,
    'initial-wallet-grant:'||new.id::text,
    null,
    jsonb_build_object(
      'purpose','one_time_initial_wallet_balance',
      'wallet_kind',new.account_kind,
      'member_id',new.member_id,
      'team_id',new.team_id
    ),
    null,false
  );
  return new;
end
$function$;

-- Backfill the newly introduced Team Owner starting balance exactly once
-- for already-existing Team Owner wallets that have never received it.
do $block$
declare
  v_bank uuid;
  v_wallet record;
begin
  select id into v_bank
  from public.economy_wallet_accounts
  where account_kind='vreeo_bank' and is_active
  order by created_at
  limit 1;

  if v_bank is null then
    raise exception 'VreeoBank aktif diperlukan untuk saldo awal Team Owner.';
  end if;

  for v_wallet in
    select w.id,w.member_id
    from public.economy_wallet_accounts w
    where w.account_kind='team_owner' and w.is_active
      and not exists (
        select 1 from public.economy_transactions t
        where t.idempotency_key='initial-wallet-grant:'||w.id::text
      )
    order by w.created_at,w.id
  loop
    perform private.post_economy_transaction(
      v_bank,v_wallet.id,10000000,'bank_reward',
      'One-time Team Owner starting balance',
      'initial-wallet-grant:'||v_wallet.id::text,
      null,
      jsonb_build_object(
        'purpose','one_time_initial_wallet_balance',
        'wallet_kind','team_owner',
        'member_id',v_wallet.member_id
      ),
      null,false
    );
  end loop;
end
$block$;

-- Seed the Testing database from the active Production tax schedule only
-- when a scope has no Wealth Tax configuration yet. Existing Admin settings
-- are never overwritten.
insert into public.caleris_tax_rules
  (tax_type,tax_scope,label,minimum_base,rate_percent,is_active,sort_order)
select 'wealth',seed.tax_scope,seed.label,seed.minimum_base,seed.rate_percent,true,seed.sort_order
from (values
  ('member','Member Tier 1',20000000::numeric,5::numeric,1),
  ('member','Member Tier 2',50000000::numeric,8::numeric,2),
  ('member','Member Tier 3',100000000::numeric,12::numeric,3),
  ('team','Team Tier 1',500000000::numeric,5::numeric,1),
  ('team','Team Tier 2',750000000::numeric,8::numeric,2),
  ('team','Team Tier 3',1000000000::numeric,12::numeric,3)
) as seed(tax_scope,label,minimum_base,rate_percent,sort_order)
where not exists (
  select 1 from public.caleris_tax_rules existing
  where existing.tax_type='wealth' and existing.tax_scope=seed.tax_scope
);

commit;
