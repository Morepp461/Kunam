begin;

create table if not exists public.caleris_assets_catalog (
  asset_code text primary key,
  category text not null check (category in ('motorcycles','cars','ships','aircraft_jets','houses','apartments','hotels','wristwatches')),
  tier smallint not null check (tier between 1 and 5),
  brand_name text not null,
  asset_class text not null,
  price_eur numeric(18,2) not null check (price_eur > 0),
  market_value_eur numeric(18,2) not null check (market_value_eur >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(category,tier)
);

insert into public.caleris_assets_catalog(asset_code,category,tier,brand_name,asset_class,price_eur,market_value_eur) values
('motorcycles_tier_1','motorcycles',1,'Yamaho','Scooter',100000,100000),
('motorcycles_tier_2','motorcycles',2,'Hondai','Street',300000,300000),
('motorcycles_tier_3','motorcycles',3,'Kawasuki','Sport',750000,750000),
('motorcycles_tier_4','motorcycles',4,'Ducatti','Superbike',2000000,2000000),
('motorcycles_tier_5','motorcycles',5,'Harleydavon','Premium/Heritage',5000000,5000000),
('cars_tier_1','cars',1,'Avanzo','Compact',250000,250000),
('cars_tier_2','cars',2,'Hyande','Executive',750000,750000),
('cars_tier_3','cars',3,'GTW','Sports',2000000,2000000),
('cars_tier_4','cars',4,'Lambegini','Supercar',6000000,6000000),
('cars_tier_5','cars',5,'Farrara','Hypercar',15000000,15000000),
('ships_tier_1','ships',1,'Yamaro','Personal Watercraft',500000,500000),
('ships_tier_2','ships',2,'Baylinor','Speedboat',2000000,2000000),
('ships_tier_3','ships',3,'Benetau','Yacht',7500000,7500000),
('ships_tier_4','ships',4,'Sunseeka','Superyacht',25000000,25000000),
('ships_tier_5','ships',5,'Azimutti','Megayacht',60000000,60000000),
('aircraft_jets_tier_1','aircraft_jets',1,'Robinsun','Helicopter',1500000,1500000),
('aircraft_jets_tier_2','aircraft_jets',2,'Sessna','Propeller Aircraft',5000000,5000000),
('aircraft_jets_tier_3','aircraft_jets',3,'Pilatuz','Light Jet',15000000,15000000),
('aircraft_jets_tier_4','aircraft_jets',4,'Bombardair','Midsize Jet',40000000,40000000),
('aircraft_jets_tier_5','aircraft_jets',5,'Gulfstreama','Long-range Jet',100000000,100000000),
('houses_tier_1','houses',1,'Ikeva','Compact House',300000,300000),
('houses_tier_2','houses',2,'Lennora','Family House',900000,900000),
('houses_tier_3','houses',3,'Damacor','Premium House',2500000,2500000),
('houses_tier_4','houses',4,'Mansorya','Mansion',7500000,7500000),
('houses_tier_5','houses',5,'Emaara','Estate',20000000,20000000),
('apartments_tier_1','apartments',1,'Studiora','Studio',100000,100000),
('apartments_tier_2','apartments',2,'Apartella','One-bedroom',300000,300000),
('apartments_tier_3','apartments',3,'Urbanova','Two-bedroom',750000,750000),
('apartments_tier_4','apartments',4,'Penthara','Penthouse',2000000,2000000),
('apartments_tier_5','apartments',5,'Skylofto','Luxury Penthouse',5000000,5000000),
('hotels_tier_1','hotels',1,'Hiltona','Boutique',5000000,5000000),
('hotels_tier_2','hotels',2,'Marriota','Business',15000000,15000000),
('hotels_tier_3','hotels',3,'Hyatton','Resort',40000000,40000000),
('hotels_tier_4','hotels',4,'Ritz-Carlona','Grand Hotel',100000000,100000000),
('hotels_tier_5','hotels',5,'Four Seasona','Iconic/Luxury',250000000,250000000),
('wristwatches_tier_1','wristwatches',1,'Casiora','Entry',25000,25000),
('wristwatches_tier_2','wristwatches',2,'Seikora','Classic',100000,100000),
('wristwatches_tier_3','wristwatches',3,'Tag Heura','Luxury',350000,350000),
('wristwatches_tier_4','wristwatches',4,'Rolexx','Haute Horlogerie',1500000,1500000),
('wristwatches_tier_5','wristwatches',5,'Pateka','Collector',5000000,5000000)
on conflict(asset_code) do update set
  category=excluded.category,tier=excluded.tier,brand_name=excluded.brand_name,
  asset_class=excluded.asset_class,price_eur=excluded.price_eur,market_value_eur=excluded.market_value_eur,active=true;

create table if not exists public.caleris_member_assets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  asset_code text not null references public.caleris_assets_catalog(asset_code) on delete restrict,
  acquired_at timestamptz not null default now(),
  acquisition_price_eur numeric(18,2) not null check (acquisition_price_eur > 0),
  acquisition_transaction_id uuid not null references public.economy_transactions(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists caleris_member_assets_member_idx on public.caleris_member_assets(member_id,acquired_at desc);
create index if not exists caleris_member_assets_code_idx on public.caleris_member_assets(asset_code);

create table if not exists public.caleris_asset_market_listings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.caleris_member_assets(id) on delete restrict,
  seller_member_id uuid not null references public.members(id) on delete restrict,
  asking_price_eur numeric(18,2) not null check (asking_price_eur > 0),
  status text not null default 'active' check (status in ('active','sold','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sold_at timestamptz
);
create unique index if not exists caleris_asset_one_active_listing_idx
  on public.caleris_asset_market_listings(asset_id) where status='active';
create index if not exists caleris_asset_listings_active_idx
  on public.caleris_asset_market_listings(status,created_at desc);

create table if not exists public.caleris_asset_audit_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.caleris_member_assets(id) on delete restrict,
  event_type text not null check (event_type in ('purchase','listed','unlisted','sale_transfer')),
  actor_member_id uuid not null references public.members(id) on delete restrict,
  from_member_id uuid references public.members(id) on delete restrict,
  to_member_id uuid references public.members(id) on delete restrict,
  amount_eur numeric(18,2),
  transaction_id uuid references public.economy_transactions(id) on delete restrict,
  listing_id uuid references public.caleris_asset_market_listings(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);
create index if not exists caleris_asset_audit_owner_idx
  on public.caleris_asset_audit_events(from_member_id,to_member_id,created_at desc);

alter table public.caleris_assets_catalog enable row level security;
alter table public.caleris_member_assets enable row level security;
alter table public.caleris_asset_market_listings enable row level security;
alter table public.caleris_asset_audit_events enable row level security;

drop policy if exists caleris_assets_catalog_read on public.caleris_assets_catalog;
create policy caleris_assets_catalog_read on public.caleris_assets_catalog
for select to authenticated using(active);

drop policy if exists caleris_member_assets_owner_read on public.caleris_member_assets;
create policy caleris_member_assets_owner_read on public.caleris_member_assets
for select to authenticated using(member_id=public.caleris_current_member_id());

drop policy if exists caleris_asset_listings_market_read on public.caleris_asset_market_listings;
create policy caleris_asset_listings_market_read on public.caleris_asset_market_listings
for select to authenticated using(status='active' or seller_member_id=public.caleris_current_member_id());

drop policy if exists caleris_asset_audit_involved_read on public.caleris_asset_audit_events;
create policy caleris_asset_audit_involved_read on public.caleris_asset_audit_events
for select to authenticated using(
  actor_member_id=public.caleris_current_member_id()
  or from_member_id=public.caleris_current_member_id()
  or to_member_id=public.caleris_current_member_id()
);

revoke all on public.caleris_assets_catalog,public.caleris_member_assets,public.caleris_asset_market_listings,public.caleris_asset_audit_events from public,anon,authenticated;
grant select on public.caleris_assets_catalog,public.caleris_member_assets,public.caleris_asset_market_listings,public.caleris_asset_audit_events to authenticated;

create or replace function private.ensure_member_economy_wallets()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_user_id uuid;
begin
  if new.role='Driver' then
    insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
    values('driver',new.id,true)
    on conflict(member_id) where account_kind='driver'
    do update set is_active=true,updated_at=now();
  elsif new.role='Owner' then
    insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
    values('team_owner',new.id,true)
    on conflict(member_id) where account_kind='team_owner'
    do update set is_active=true,updated_at=now();
  else
    select p.user_id into v_user_id from public.profiles p where p.member_id=new.id limit 1;
    if v_user_id is not null then
      insert into public.economy_wallet_accounts(account_kind,profile_user_id,is_active)
      values('public_member',v_user_id,true)
      on conflict(profile_user_id) where account_kind='public_member'
      do update set is_active=true,updated_at=now();
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.ensure_profile_member_wallet()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_role text;
begin
  if new.member_id is null then return new; end if;
  select m.role into v_role from public.members m where m.id=new.member_id;
  if v_role is not null and v_role not in ('Driver','Owner') then
    insert into public.economy_wallet_accounts(account_kind,profile_user_id,is_active)
    values('public_member',new.user_id,true)
    on conflict(profile_user_id) where account_kind='public_member'
    do update set is_active=true,updated_at=now();
  end if;
  return new;
end;
$function$;

drop trigger if exists economy_profile_member_wallet on public.profiles;
create trigger economy_profile_member_wallet
after insert or update of member_id on public.profiles
for each row execute function private.ensure_profile_member_wallet();

insert into public.economy_wallet_accounts(account_kind,profile_user_id,is_active)
select 'public_member',p.user_id,true
from public.profiles p
join public.members m on m.id=p.member_id
where m.role not in ('Driver','Owner')
on conflict(profile_user_id) where account_kind='public_member'
do update set is_active=true,updated_at=now();

create or replace function private.caleris_assets_member_wallet(p_member_id uuid)
returns uuid language plpgsql stable security definer set search_path=''
as $function$
declare v_role text; v_user_id uuid; v_wallet_id uuid;
begin
  select m.role,p.user_id into v_role,v_user_id
  from public.members m
  left join public.profiles p on p.member_id=m.id
  where m.id=p_member_id;
  if not found then return null; end if;
  if v_role='Driver' then
    select id into v_wallet_id from public.economy_wallet_accounts
    where account_kind='driver' and member_id=p_member_id and is_active;
  elsif v_role='Owner' then
    select id into v_wallet_id from public.economy_wallet_accounts
    where account_kind='team_owner' and member_id=p_member_id and is_active;
  elsif v_user_id is not null then
    select id into v_wallet_id from public.economy_wallet_accounts
    where account_kind='public_member' and profile_user_id=v_user_id and is_active;
  end if;
  return v_wallet_id;
end;
$function$;

alter table public.economy_transactions
  drop constraint if exists economy_transactions_event_type_check;
alter table public.economy_transactions
  add constraint economy_transactions_event_type_check
  check(event_type=any(array[
    'checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer',
    'admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_upgrade',
    'team_hq_upgrade','merchandise_sale','merchandise_production','contract_compensation','asset_purchase','asset_sale'
  ]::text[]));

do $patch_economy_asset_purchase_event$
declare
  d text;
  old_guard text;
  new_guard text;
  old_route text;
  new_route text;
begin
  d:=pg_get_functiondef('private.post_economy_transaction(uuid,uuid,numeric,text,text,text,uuid,jsonb,uuid,boolean)'::regprocedure);
  old_guard:='if p_event_type not in (''checkin_reward'',''prize'',''bank_reward'',''sponsor_payout'',''bank_funding'',''tax'',''fine'',''transfer'',''admin_adjustment'',''reversal'',''payroll'',''loan_disbursement'',''loan_repayment'',''development_upgrade'',''team_hq_upgrade'',''contract_compensation'') then raise exception ''Jenis transaksi tidak dikenal.''; end if;';
  new_guard:='if p_event_type not in (''checkin_reward'',''prize'',''bank_reward'',''sponsor_payout'',''bank_funding'',''tax'',''fine'',''transfer'',''admin_adjustment'',''reversal'',''payroll'',''loan_disbursement'',''loan_repayment'',''development_upgrade'',''team_hq_upgrade'',''contract_compensation'',''asset_purchase'',''asset_sale'') then raise exception ''Jenis transaksi tidak dikenal.''; end if;';
  if position(old_guard in d)=0 then raise exception 'Economy transaction event allow-list changed; refusing unsafe patch.'; end if;
  d:=replace(d,old_guard,new_guard);
  old_route:='elsif p_event_type=''transfer'' and (v_source.account_kind in (''vreeo_bank'',''sponsor_source'') or v_destination.account_kind in (''vreeo_bank'',''sponsor_source'')) then'||chr(10)||'  raise exception ''Rute transfer tidak valid.'';';
  new_route:=old_route||' elsif p_event_type=''asset_purchase'' and (v_source.account_kind not in (''driver'',''team_owner'',''public_member'') or v_destination.account_kind<>''vreeo_bank'') then'||chr(10)||'  raise exception ''Rute pembelian aset tidak valid.'';'||chr(10)||' elsif p_event_type=''asset_sale'' and (v_source.account_kind not in (''driver'',''team_owner'',''public_member'') or v_destination.account_kind not in (''driver'',''team_owner'',''public_member'')) then'||chr(10)||'  raise exception ''Rute penjualan aset tidak valid.'';';
  if position(old_route in d)=0 then raise exception 'Economy transaction route guard changed; refusing unsafe patch.'; end if;
  d:=replace(d,old_route,new_route);
  execute d;
end;
$patch_economy_asset_purchase_event$;

create or replace function private.caleris_assets_market_value(p_member_id uuid)
returns numeric language sql stable security definer set search_path=''
as $function$
  select coalesce(sum(c.market_value_eur),0)
  from public.caleris_member_assets a
  join public.caleris_assets_catalog c on c.asset_code=a.asset_code
  where a.member_id=p_member_id;
$function$;

create or replace function private.caleris_assets_reputation_bonus(p_member_id uuid)
returns integer language sql stable security definer set search_path=''
as $function$
  select least(10,floor(2*(ln(1+(private.caleris_assets_market_value(p_member_id)/10000000))/ln(2)))::integer);
$function$;

create or replace function private.refresh_driver_reputation_after_assets(p_member_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  v_metrics jsonb;
  v_weights jsonb;
  v_item record;
  v_value numeric;
  v_total numeric:=0;
  v_weight numeric:=0;
  v_base_score integer;
  v_bonus integer;
  v_score integer;
  v_old_score integer;
  v_band text;
  v_market_value numeric;
  v_new_metrics jsonb;
begin
  if p_member_id is null or not exists(select 1 from public.members where id=p_member_id and role='Driver') then return; end if;
  select score,metrics into v_old_score,v_metrics
  from public.caleris_driver_reputation where member_id=p_member_id for update;
  if not found then return; end if;
  select config_value into v_weights
  from public.caleris_brand_ecosystem_config where config_key='driver_reputation_weights';
  if jsonb_typeof(v_weights)<>'object' then return; end if;
  for v_item in select key,value from jsonb_each(v_weights) loop
    v_value:=coalesce((v_metrics->>v_item.key)::numeric,0);
    if v_value<0 or v_value>100 then return; end if;
    v_total:=v_total+v_value*(v_item.value#>>'{}')::numeric;
    v_weight:=v_weight+(v_item.value#>>'{}')::numeric;
  end loop;
  if v_weight<=0 then return; end if;
  v_base_score:=round((v_total/v_weight)*99.99)::integer;
  v_market_value:=private.caleris_assets_market_value(p_member_id);
  v_bonus:=private.caleris_assets_reputation_bonus(p_member_id);
  v_score:=least(9999,v_base_score+v_bonus);
  v_band:=case when v_score>=7000 then 'elite' when v_score>=4500 then 'top' when v_score>=2500 then 'competitive' when v_score>=1000 then 'established' else 'developing' end;
  v_new_metrics:=coalesce(v_metrics,'{}'::jsonb)||jsonb_build_object(
    'asset_market_value_eur',v_market_value,
    'asset_reputation_bonus',v_bonus,
    'base_reputation_score',v_base_score
  );
  update public.caleris_driver_reputation
  set score=v_score,band=v_band,metrics=v_new_metrics,calculated_at=now()
  where member_id=p_member_id;
  if v_old_score is distinct from v_score then
    insert into public.caleris_reputation_history(entity_kind,member_id,previous_score,new_score,metrics,source_event)
    values('driver',p_member_id,v_old_score,v_score,v_new_metrics,'asset_ownership_change');
  end if;
end;
$function$;

do $patch_admin_driver_reputation$
declare
  d text;
  old_decl text;
  new_decl text;
  old_insert text;
  new_insert text;
  old_history text;
  new_history text;
  old_return text;
  new_return text;
begin
  d:=pg_get_functiondef('public.admin_set_driver_reputation(uuid,integer,jsonb,text)'::regprocedure);
  old_decl:='declare v_old integer;';
  new_decl:='declare v_old integer; v_bonus integer; v_final_score integer; v_metrics jsonb; v_market_value numeric;';
  if position(old_decl in d)=0 then raise exception 'Driver reputation declaration changed; refusing unsafe patch.'; end if;
  d:=replace(d,old_decl,new_decl);
  old_insert:='select score into v_old from public.caleris_driver_reputation where member_id=p_member_id for update;';
  new_insert:='v_market_value:=private.caleris_assets_market_value(p_member_id); v_bonus:=private.caleris_assets_reputation_bonus(p_member_id); v_final_score:=least(9999,p_score+v_bonus); v_metrics:=p_metrics||jsonb_build_object(''asset_market_value_eur'',v_market_value,''asset_reputation_bonus'',v_bonus,''base_reputation_score'',p_score); '||old_insert;
  if position(old_insert in d)=0 then raise exception 'Driver reputation write point changed; refusing unsafe patch.'; end if;
  d:=replace(d,old_insert,new_insert);
  old_history:='values(p_member_id,p_score,case when p_score>=7000 then ''elite'' when p_score>=4500 then ''top'' when p_score>=2500 then ''competitive'' when p_score>=1000 then ''established'' else ''developing'' end,p_metrics,now())';
  new_history:='values(p_member_id,v_final_score,case when v_final_score>=7000 then ''elite'' when v_final_score>=4500 then ''top'' when v_final_score>=2500 then ''competitive'' when v_final_score>=1000 then ''established'' else ''developing'' end,v_metrics,now())';
  if position(old_history in d)=0 then raise exception 'Driver reputation score expression changed; refusing unsafe patch.'; end if;
  d:=replace(d,old_history,new_history);
  old_history:='values(''driver'',p_member_id,v_old,p_score,p_metrics,p_source_event);';
  new_history:='values(''driver'',p_member_id,v_old,v_final_score,v_metrics,p_source_event);';
  if position(old_history in d)=0 then raise exception 'Driver reputation history write changed; refusing unsafe patch.'; end if;
  d:=replace(d,old_history,new_history);
  old_return:='return jsonb_build_object(''member_id'',p_member_id,''score'',p_score);';
  new_return:='return jsonb_build_object(''member_id'',p_member_id,''score'',v_final_score,''asset_reputation_bonus'',v_bonus);';
  if position(old_return in d)=0 then raise exception 'Driver reputation response changed; refusing unsafe patch.'; end if;
  d:=replace(d,old_return,new_return);
  execute d;
end;
$patch_admin_driver_reputation$;

create or replace function public.caleris_assets_get_dashboard()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare
  v_member_id uuid:=(select public.caleris_current_member_id());
  v_wallet_id uuid;
  v_wallet_balance numeric:=0;
  v_member_role text;
  v_payload jsonb;
begin
  if (select auth.uid()) is null or v_member_id is null then raise exception 'member_profile_required'; end if;
  select role into v_member_role from public.members where id=v_member_id;
  v_wallet_id:=private.caleris_assets_member_wallet(v_member_id);
  if v_wallet_id is not null then
    select balance into v_wallet_balance from public.economy_wallet_accounts where id=v_wallet_id and is_active;
  end if;
  select jsonb_build_object(
    'member_id',v_member_id,
    'member_role',v_member_role,
    'wallet_available',v_wallet_id is not null,
    'wallet_balance',coalesce(v_wallet_balance,0),
    'asset_market_value_eur',private.caleris_assets_market_value(v_member_id),
    'asset_reputation_bonus',private.caleris_assets_reputation_bonus(v_member_id),
    'catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'asset_code',c.asset_code,'category',c.category,'tier',c.tier,'brand_name',c.brand_name,
        'asset_class',c.asset_class,'price_eur',c.price_eur,'market_value_eur',c.market_value_eur
      ) order by c.category,c.tier)
      from public.caleris_assets_catalog c where c.active
    ),'[]'::jsonb),
    'owned',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'asset_code',a.asset_code,'category',c.category,'tier',c.tier,
        'brand_name',c.brand_name,'asset_class',c.asset_class,'market_value_eur',c.market_value_eur,
        'acquired_at',a.acquired_at,'acquisition_price_eur',a.acquisition_price_eur,
        'is_listed',exists(select 1 from public.caleris_asset_market_listings l where l.asset_id=a.id and l.status='active')
      ) order by a.acquired_at desc)
      from public.caleris_member_assets a join public.caleris_assets_catalog c on c.asset_code=a.asset_code
      where a.member_id=v_member_id
    ),'[]'::jsonb),
    'listings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'listing_id',l.id,'asset_id',a.id,'asset_code',c.asset_code,'category',c.category,'tier',c.tier,
        'brand_name',c.brand_name,'asset_class',c.asset_class,'market_value_eur',c.market_value_eur,
        'asking_price_eur',l.asking_price_eur,'seller_member_id',l.seller_member_id,
        'seller_name',m.character_name,'seller_member_code',m.member_code,'created_at',l.created_at,
        'is_own_listing',l.seller_member_id=v_member_id
      ) order by l.created_at desc)
      from public.caleris_asset_market_listings l
      join public.caleris_member_assets a on a.id=l.asset_id
      join public.caleris_assets_catalog c on c.asset_code=a.asset_code
      join public.members m on m.id=l.seller_member_id
      where l.status='active'
    ),'[]'::jsonb)
  ) into v_payload;
  return v_payload;
end;
$function$;

create or replace function public.caleris_assets_buy(p_asset_code text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_member_id uuid:=(select public.caleris_current_member_id());
  v_asset public.caleris_assets_catalog%rowtype;
  v_wallet_id uuid;
  v_bank_id uuid;
  v_asset_id uuid:=gen_random_uuid();
  v_tx jsonb;
  v_tx_id uuid;
  v_status text;
  v_metadata jsonb;
begin
  if v_uid is null or v_member_id is null then raise exception 'member_profile_required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 150 then raise exception 'invalid_idempotency_key'; end if;
  select * into v_asset from public.caleris_assets_catalog where asset_code=p_asset_code and active for share;
  if not found then raise exception 'asset_not_available'; end if;
  v_wallet_id:=private.caleris_assets_member_wallet(v_member_id);
  if v_wallet_id is null then raise exception 'personal_wallet_unavailable'; end if;
  select id into v_bank_id from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active;
  if v_bank_id is null then raise exception 'vreeo_bank_unavailable'; end if;
  v_tx:=private.post_economy_transaction(
    v_wallet_id,v_bank_id,v_asset.price_eur,'asset_purchase',
    'Assets Marketplace: '||v_asset.brand_name||' '||v_asset.asset_class,
    'assets:purchase:'||trim(p_idempotency_key),v_uid,
    jsonb_build_object('member_id',v_member_id,'asset_code',v_asset.asset_code,'asset_id',v_asset_id,'market_value_eur',v_asset.market_value_eur),
    null,false
  );
  v_tx_id:=(v_tx->>'transaction_id')::uuid;
  v_status:=v_tx->>'status';
  select metadata into v_metadata from public.economy_transactions where id=v_tx_id;
  v_asset_id:=nullif(v_metadata->>'asset_id','')::uuid;
  if v_asset_id is null then raise exception 'asset_transaction_metadata_missing'; end if;
  if not exists(select 1 from public.caleris_member_assets where id=v_asset_id) then
    insert into public.caleris_member_assets(id,member_id,asset_code,acquisition_price_eur,acquisition_transaction_id)
    values(v_asset_id,v_member_id,v_asset.asset_code,v_asset.price_eur,v_tx_id);
    insert into public.caleris_asset_audit_events(asset_id,event_type,actor_member_id,to_member_id,amount_eur,transaction_id,metadata)
    values(v_asset_id,'purchase',v_member_id,v_member_id,v_asset.price_eur,v_tx_id,jsonb_build_object('asset_code',v_asset.asset_code,'tax_eur',0));
    perform private.refresh_driver_reputation_after_assets(v_member_id);
  end if;
  return jsonb_build_object('status',v_status,'asset_id',v_asset_id,'transaction_id',v_tx_id,'price_eur',v_asset.price_eur);
end;
$function$;

create or replace function public.caleris_assets_list(p_asset_id uuid,p_asking_price_eur numeric)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_member_id uuid:=(select public.caleris_current_member_id()); v_asset public.caleris_member_assets%rowtype; v_listing_id uuid;
begin
  if (select auth.uid()) is null or v_member_id is null then raise exception 'member_profile_required'; end if;
  if p_asking_price_eur is null or p_asking_price_eur<=0 or p_asking_price_eur>999999999999999999.99 or p_asking_price_eur<>round(p_asking_price_eur,2) then raise exception 'invalid_asking_price'; end if;
  select * into v_asset from public.caleris_member_assets where id=p_asset_id and member_id=v_member_id for update;
  if not found then raise exception 'asset_not_owned'; end if;
  if exists(select 1 from public.caleris_asset_market_listings where asset_id=p_asset_id and status='active') then raise exception 'asset_already_listed'; end if;
  insert into public.caleris_asset_market_listings(asset_id,seller_member_id,asking_price_eur)
  values(p_asset_id,v_member_id,p_asking_price_eur) returning id into v_listing_id;
  insert into public.caleris_asset_audit_events(asset_id,event_type,actor_member_id,from_member_id,amount_eur,listing_id,metadata)
  values(p_asset_id,'listed',v_member_id,v_member_id,p_asking_price_eur,v_listing_id,jsonb_build_object('tax_eur',0));
  return jsonb_build_object('status','listed','listing_id',v_listing_id);
end;
$function$;

create or replace function public.caleris_assets_cancel_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_member_id uuid:=(select public.caleris_current_member_id()); v_listing public.caleris_asset_market_listings%rowtype;
begin
  if (select auth.uid()) is null or v_member_id is null then raise exception 'member_profile_required'; end if;
  select * into v_listing from public.caleris_asset_market_listings where id=p_listing_id and seller_member_id=v_member_id and status='active' for update;
  if not found then raise exception 'listing_not_found'; end if;
  update public.caleris_asset_market_listings set status='cancelled',updated_at=now() where id=p_listing_id;
  insert into public.caleris_asset_audit_events(asset_id,event_type,actor_member_id,from_member_id,listing_id,metadata)
  values(v_listing.asset_id,'unlisted',v_member_id,v_member_id,v_listing.id,'{}'::jsonb);
  return jsonb_build_object('status','cancelled');
end;
$function$;

create or replace function public.caleris_assets_buy_listing(p_listing_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_buyer uuid:=(select public.caleris_current_member_id());
  v_listing public.caleris_asset_market_listings%rowtype;
  v_asset public.caleris_member_assets%rowtype;
  v_existing public.economy_transactions%rowtype;
  v_buyer_wallet uuid;
  v_seller_wallet uuid;
  v_tx jsonb;
  v_tx_id uuid;
  v_status text;
begin
  if v_uid is null or v_buyer is null then raise exception 'member_profile_required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 150 then raise exception 'invalid_idempotency_key'; end if;
  select * into v_existing from public.economy_transactions where idempotency_key='assets:sale:'||trim(p_idempotency_key);
  if found then
    if v_existing.event_type<>'asset_sale' or v_existing.metadata->>'buyer_member_id'<>v_buyer::text or v_existing.metadata->>'listing_id'<>p_listing_id::text then
      raise exception 'idempotency_key_reused';
    end if;
    return jsonb_build_object('status','duplicate','asset_id',v_existing.metadata->>'asset_id','transaction_id',v_existing.id,'price_eur',v_existing.amount);
  end if;
  select * into v_listing from public.caleris_asset_market_listings where id=p_listing_id and status='active' for update;
  if not found then raise exception 'listing_not_available'; end if;
  if v_listing.seller_member_id=v_buyer then raise exception 'cannot_buy_own_listing'; end if;
  select * into v_asset from public.caleris_member_assets where id=v_listing.asset_id and member_id=v_listing.seller_member_id for update;
  if not found then raise exception 'listing_owner_mismatch'; end if;
  v_buyer_wallet:=private.caleris_assets_member_wallet(v_buyer);
  v_seller_wallet:=private.caleris_assets_member_wallet(v_listing.seller_member_id);
  if v_buyer_wallet is null or v_seller_wallet is null then raise exception 'personal_wallet_unavailable'; end if;
  v_tx:=private.post_economy_transaction(
    v_buyer_wallet,v_seller_wallet,v_listing.asking_price_eur,'asset_sale',
    'Assets Marketplace: pembelian listing '||p_listing_id::text,
    'assets:sale:'||trim(p_idempotency_key),v_uid,
    jsonb_build_object('buyer_member_id',v_buyer,'seller_member_id',v_listing.seller_member_id,'asset_id',v_asset.id,'listing_id',v_listing.id,'tax_eur',0),
    null,false
  );
  v_tx_id:=(v_tx->>'transaction_id')::uuid;
  v_status:=v_tx->>'status';
  if v_status='posted' then
    update public.caleris_member_assets set member_id=v_buyer,acquired_at=now(),acquisition_price_eur=v_listing.asking_price_eur,acquisition_transaction_id=v_tx_id where id=v_asset.id;
    update public.caleris_asset_market_listings set status='sold',updated_at=now(),sold_at=now() where id=v_listing.id;
    insert into public.caleris_asset_audit_events(asset_id,event_type,actor_member_id,from_member_id,to_member_id,amount_eur,transaction_id,listing_id,metadata)
    values(v_asset.id,'sale_transfer',v_buyer,v_listing.seller_member_id,v_buyer,v_listing.asking_price_eur,v_tx_id,v_listing.id,jsonb_build_object('tax_eur',0));
    perform private.refresh_driver_reputation_after_assets(v_buyer);
    perform private.refresh_driver_reputation_after_assets(v_listing.seller_member_id);
  elsif not exists(select 1 from public.caleris_member_assets where id=v_asset.id and member_id=v_buyer) then
    raise exception 'asset_sale_duplicate_without_transfer';
  end if;
  return jsonb_build_object('status',v_status,'asset_id',v_asset.id,'transaction_id',v_tx_id,'price_eur',v_listing.asking_price_eur);
end;
$function$;

create or replace function private.refresh_driver_reputation_for_asset_catalog()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_member record;
begin
  if new.market_value_eur is distinct from old.market_value_eur then
    for v_member in select member_id from public.caleris_driver_reputation loop
      perform private.refresh_driver_reputation_after_assets(v_member.member_id);
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_assets_catalog_reputation_refresh on public.caleris_assets_catalog;
create trigger caleris_assets_catalog_reputation_refresh
after update of market_value_eur on public.caleris_assets_catalog
for each row execute function private.refresh_driver_reputation_for_asset_catalog();

revoke all on function public.caleris_assets_get_dashboard() from public,anon;
revoke all on function public.caleris_assets_buy(text,text) from public,anon;
revoke all on function public.caleris_assets_list(uuid,numeric) from public,anon;
revoke all on function public.caleris_assets_cancel_listing(uuid) from public,anon;
revoke all on function public.caleris_assets_buy_listing(uuid,text) from public,anon;
grant execute on function public.caleris_assets_get_dashboard() to authenticated;
grant execute on function public.caleris_assets_buy(text,text) to authenticated;
grant execute on function public.caleris_assets_list(uuid,numeric) to authenticated;
grant execute on function public.caleris_assets_cancel_listing(uuid) to authenticated;
grant execute on function public.caleris_assets_buy_listing(uuid,text) to authenticated;

revoke all on function private.ensure_member_economy_wallets() from public,anon,authenticated;
revoke all on function private.ensure_profile_member_wallet() from public,anon,authenticated;
revoke all on function private.caleris_assets_member_wallet(uuid) from public,anon,authenticated;
revoke all on function private.caleris_assets_market_value(uuid) from public,anon,authenticated;
revoke all on function private.caleris_assets_reputation_bonus(uuid) from public,anon,authenticated;
revoke all on function private.refresh_driver_reputation_after_assets(uuid) from public,anon,authenticated;
revoke all on function private.refresh_driver_reputation_for_asset_catalog() from public,anon,authenticated;

commit;