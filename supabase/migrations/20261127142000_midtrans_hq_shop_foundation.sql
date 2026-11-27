begin;

alter table public.caleris_team_hq_slot_shop_config
  add column if not exists price_idr integer,
  add column if not exists currency text not null default 'IDR',
  add column if not exists payment_provider text not null default 'midtrans';

alter table public.caleris_team_hq_slot_shop_config
  drop constraint if exists caleris_team_hq_slot_shop_price_idr_check;
alter table public.caleris_team_hq_slot_shop_config
  add constraint caleris_team_hq_slot_shop_price_idr_check
  check(price_idr is null or price_idr=29900);
alter table public.caleris_team_hq_slot_shop_config
  drop constraint if exists caleris_team_hq_slot_shop_currency_check;
alter table public.caleris_team_hq_slot_shop_config
  add constraint caleris_team_hq_slot_shop_currency_check check(currency='IDR');
alter table public.caleris_team_hq_slot_shop_config
  drop constraint if exists caleris_team_hq_slot_shop_provider_check;
alter table public.caleris_team_hq_slot_shop_config
  add constraint caleris_team_hq_slot_shop_provider_check check(payment_provider='midtrans');

update public.caleris_team_hq_slot_shop_config
set price_eur=null,price_idr=29900,currency='IDR',payment_provider='midtrans',
    is_active=false,updated_by=null,updated_at=now()
where singleton=true;

create table if not exists public.caleris_midtrans_shop_payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  request_key text not null unique,
  team_id uuid not null references public.teams(id) on delete restrict,
  buyer_member_id uuid not null references public.members(id) on delete restrict,
  buyer_user_id uuid not null,
  amount_idr integer not null check(amount_idr=29900),
  currency text not null default 'IDR' check(currency='IDR'),
  status text not null default 'created' check(status in ('created','pending','paid','expired','cancelled','denied','failed')),
  snap_token text,
  redirect_url text,
  provider_transaction_id text unique,
  payment_type text,
  status_code text,
  fraud_status text,
  provider_payload jsonb not null default '{}'::jsonb check(jsonb_typeof(provider_payload)='object'),
  signature_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists caleris_midtrans_shop_payments_team_idx
  on public.caleris_midtrans_shop_payments(team_id,created_at desc);
create unique index if not exists caleris_midtrans_one_open_order_per_team_idx
  on public.caleris_midtrans_shop_payments(team_id) where status in ('created','pending');

alter table public.caleris_midtrans_shop_payments enable row level security;
revoke all on public.caleris_midtrans_shop_payments from public,anon,authenticated;
grant all on public.caleris_midtrans_shop_payments to service_role;

alter table public.caleris_team_hq_slot_entitlements
  alter column transaction_id drop not null;
alter table public.caleris_team_hq_slot_entitlements
  add column if not exists payment_id uuid references public.caleris_midtrans_shop_payments(id) on delete restrict;
create unique index if not exists caleris_team_hq_slot_entitlement_payment_unique
  on public.caleris_team_hq_slot_entitlements(payment_id) where payment_id is not null;

create or replace function public.caleris_midtrans_shop_item_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare c public.caleris_team_hq_slot_shop_config%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Login diperlukan.'; end if;
  select * into c from public.caleris_team_hq_slot_shop_config where singleton=true;
  return jsonb_build_object(
    'item_key','team_hq_project_slot_plus_one',
    'item_name','Additional HQ Project Slot',
    'price_idr',coalesce(c.price_idr,29900),
    'currency','IDR',
    'payment_provider','midtrans',
    'is_active',coalesce(c.is_active,false)
  );
end;
$function$;

create or replace function public.caleris_midtrans_prepare_order(
  p_user_id uuid,p_team_id uuid,p_request_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_team_name text;
  v_config public.caleris_team_hq_slot_shop_config%rowtype;
  v_payment public.caleris_midtrans_shop_payments%rowtype;
  v_order_id text;
begin
  if p_user_id is null or p_team_id is null then raise exception 'invalid_checkout_identity'; end if;
  if p_request_key is null or length(trim(p_request_key)) not between 8 and 80 then raise exception 'invalid_checkout_request_key'; end if;
  select m,t.name into v_member,v_team_name
  from public.profiles p
  join public.members m on m.id=p.member_id
  join public.teams t on t.id=m.team_id
  where p.user_id=p_user_id and m.team_id=p_team_id and m.role='Owner'
  for update of m;
  if not found then raise exception 'only_linked_team_owner_can_purchase'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('team-hq-midtrans:'||p_team_id::text,0));
  if exists(select 1 from public.caleris_team_hq_slot_entitlements where team_id=p_team_id) then
    return jsonb_build_object('status','already_owned');
  end if;
  select * into v_config from public.caleris_team_hq_slot_shop_config where singleton=true for update;
  if not found or not v_config.is_active or coalesce(v_config.price_idr,0)<>29900 or v_config.payment_provider<>'midtrans' then
    raise exception 'shop_item_unavailable';
  end if;
  select * into v_payment from public.caleris_midtrans_shop_payments
  where request_key=trim(p_request_key);
  if found then
    if v_payment.team_id<>p_team_id or v_payment.buyer_user_id<>p_user_id then raise exception 'checkout_request_key_reused'; end if;
    return jsonb_build_object('status',v_payment.status,'order_id',v_payment.order_id,'amount_idr',v_payment.amount_idr,
      'snap_token',v_payment.snap_token,'redirect_url',v_payment.redirect_url,'payment_id',v_payment.id,
      'team_name',v_team_name,'buyer_name',v_member.character_name);
  end if;
  select * into v_payment from public.caleris_midtrans_shop_payments
  where team_id=p_team_id and status in ('created','pending')
  order by created_at desc limit 1 for update;
  if found then
    if v_payment.buyer_user_id<>p_user_id then raise exception 'team_has_pending_payment'; end if;
    return jsonb_build_object('status','pending_exists','order_id',v_payment.order_id,'amount_idr',v_payment.amount_idr,
      'snap_token',v_payment.snap_token,'redirect_url',v_payment.redirect_url,'payment_id',v_payment.id,
      'team_name',v_team_name,'buyer_name',v_member.character_name);
  end if;
  v_order_id:='CALERIS-HQ-'||replace(gen_random_uuid()::text,'-','');
  insert into public.caleris_midtrans_shop_payments(order_id,request_key,team_id,buyer_member_id,buyer_user_id,amount_idr)
  values(v_order_id,trim(p_request_key),p_team_id,v_member.id,p_user_id,29900)
  returning * into v_payment;
  return jsonb_build_object('status','created','order_id',v_payment.order_id,'amount_idr',v_payment.amount_idr,
    'payment_id',v_payment.id,'team_name',v_team_name,'buyer_name',v_member.character_name);
end;
$function$;

create or replace function public.caleris_midtrans_store_snap_order(
  p_order_id text,p_snap_token text,p_redirect_url text
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_payment public.caleris_midtrans_shop_payments%rowtype;
begin
  if p_order_id is null or p_snap_token is null or p_redirect_url is null then raise exception 'invalid_snap_response'; end if;
  update public.caleris_midtrans_shop_payments
  set snap_token=p_snap_token,redirect_url=p_redirect_url,status='pending',updated_at=now()
  where order_id=p_order_id and status in ('created','pending')
  returning * into v_payment;
  if not found then
    select * into v_payment from public.caleris_midtrans_shop_payments where order_id=p_order_id;
    if not found or v_payment.status='paid' then raise exception 'payment_order_not_updatable'; end if;
  end if;
  return jsonb_build_object('stored',true,'order_id',v_payment.order_id,'status',v_payment.status);
end;
$function$;

create or replace function public.caleris_midtrans_finalize_order(
  p_order_id text,p_transaction_status text,p_gross_amount numeric,p_status_code text,
  p_fraud_status text,p_payment_type text,p_provider_transaction_id text,p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_payment public.caleris_midtrans_shop_payments%rowtype;
  v_new_status text;
  v_entitlement_id uuid;
begin
  if p_order_id is null then raise exception 'invalid_order_id'; end if;
  select * into v_payment from public.caleris_midtrans_shop_payments where order_id=p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if p_gross_amount is distinct from v_payment.amount_idr::numeric then raise exception 'payment_amount_mismatch'; end if;
  if p_transaction_status in ('settlement','capture') then
    if coalesce(p_status_code,'')<>'200' or (p_fraud_status is not null and lower(p_fraud_status)<>'accept') then
      raise exception 'payment_not_accepted';
    end if;
    if v_payment.status='paid' then
      return jsonb_build_object('status','already_paid','order_id',p_order_id,'entitlement_id',
        (select id from public.caleris_team_hq_slot_entitlements where payment_id=v_payment.id));
    end if;
    update public.caleris_midtrans_shop_payments
    set status='paid',provider_transaction_id=coalesce(p_provider_transaction_id,provider_transaction_id),
        payment_type=p_payment_type,status_code=p_status_code,fraud_status=p_fraud_status,
        provider_payload=case when jsonb_typeof(p_payload)='object' then p_payload else '{}'::jsonb end,signature_verified_at=now(),paid_at=now(),updated_at=now()
    where id=v_payment.id;
    insert into public.caleris_team_hq_slot_entitlements(team_id,purchased_by,transaction_id,payment_id)
    values(v_payment.team_id,v_payment.buyer_user_id,null,v_payment.id)
    on conflict(team_id) do nothing
    returning id into v_entitlement_id;
    if v_entitlement_id is null then
      select id into v_entitlement_id from public.caleris_team_hq_slot_entitlements where team_id=v_payment.team_id;
      return jsonb_build_object('status','already_owned','order_id',p_order_id,'entitlement_id',v_entitlement_id);
    end if;
    return jsonb_build_object('status','paid','order_id',p_order_id,'entitlement_id',v_entitlement_id);
  end if;
  v_new_status:=case p_transaction_status
    when 'pending' then 'pending'
    when 'expire' then 'expired'
    when 'cancel' then 'cancelled'
    when 'deny' then 'denied'
    else 'failed' end;
  if v_payment.status<>'paid' then
    update public.caleris_midtrans_shop_payments
    set status=v_new_status,provider_transaction_id=coalesce(p_provider_transaction_id,provider_transaction_id),
        payment_type=p_payment_type,status_code=p_status_code,fraud_status=p_fraud_status,
        provider_payload=case when jsonb_typeof(p_payload)='object' then p_payload else '{}'::jsonb end,signature_verified_at=now(),updated_at=now()
    where id=v_payment.id;
  end if;
  return jsonb_build_object('status',v_new_status,'order_id',p_order_id);
end;
$function$;

revoke all on function public.caleris_midtrans_shop_item_status() from public,anon;
grant execute on function public.caleris_midtrans_shop_item_status() to authenticated;

revoke all on function public.caleris_midtrans_prepare_order(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.caleris_midtrans_store_snap_order(text,text,text) from public,anon,authenticated;
revoke all on function public.caleris_midtrans_finalize_order(text,text,numeric,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.caleris_midtrans_prepare_order(uuid,uuid,text) to service_role;
grant execute on function public.caleris_midtrans_store_snap_order(text,text,text) to service_role;
grant execute on function public.caleris_midtrans_finalize_order(text,text,numeric,text,text,text,text,jsonb) to service_role;

revoke all on function public.member_purchase_team_hq_project_slot(text) from public,anon,authenticated;
revoke all on function public.admin_set_team_hq_slot_shop_item(numeric,boolean) from public,anon,authenticated;
revoke all on function public.admin_get_team_hq_slot_shop_config() from public,anon,authenticated;

commit;