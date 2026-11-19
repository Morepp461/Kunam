-- Team HQ integration with reputation, fan growth, merchandise and hybrid valuation.
-- No new runtime dependencies. All monetary movements use the existing double-entry economy ledger.

alter table public.teams add column if not exists base_valuation numeric(18,2);

create or replace function private.set_team_default_base_valuation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.base_valuation is null then
    new.base_valuation := case when lower(coalesce(new.division_key,'')) like '%zwei%' then 45000000 else 120000000 end;
  end if;
  return new;
end $$;
drop trigger if exists trg_team_default_base_valuation on public.teams;
create trigger trg_team_default_base_valuation before insert or update of division_key on public.teams
for each row execute function private.set_team_default_base_valuation();
update public.teams set base_valuation=case when lower(coalesce(division_key,'')) like '%zwei%' then 45000000 else 120000000 end
where base_valuation is null;

-- Merchandise market configuration is editable by site Admin; values are intentionally bounded.
create table if not exists public.caleris_merchandise_engine_config (
  singleton boolean primary key default true check (singleton),
  is_enabled boolean not null default true,
  base_conversion_rate numeric(8,6) not null default 0.002,
  max_conversion_rate numeric(8,6) not null default 0.01,
  reputation_factor_min numeric(6,3) not null default 0.75,
  reputation_factor_max numeric(6,3) not null default 1.25,
  hq_demand_bonus_per_level numeric(6,3) not null default 2.5,
  hq_capacity_bonus_per_level numeric(6,3) not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.caleris_merchandise_engine_config(singleton) values(true) on conflict(singleton) do nothing;
alter table public.caleris_merchandise_engine_config enable row level security;
drop policy if exists caleris_merch_config_read on public.caleris_merchandise_engine_config;
create policy caleris_merch_config_read on public.caleris_merchandise_engine_config for select to authenticated using(true);
drop policy if exists caleris_merch_config_admin_update on public.caleris_merchandise_engine_config;
create policy caleris_merch_config_admin_update on public.caleris_merchandise_engine_config for update to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=auth.uid()))
with check(exists(select 1 from public.site_admins a where a.user_id=auth.uid()));

create table if not exists public.caleris_merchandise_products (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  product_key text not null,
  product_name text not null,
  unit_price numeric(18,2) not null check(unit_price>0),
  unit_cost numeric(18,2) not null check(unit_cost>=0 and unit_cost<unit_price),
  demand_share numeric(6,4) not null default 0.25 check(demand_share>0 and demand_share<=1),
  capacity_per_round integer not null default 3000 check(capacity_per_round>=0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,product_key)
);
create index if not exists idx_caleris_merch_products_team on public.caleris_merchandise_products(team_id,is_active);
alter table public.caleris_merchandise_products enable row level security;
drop policy if exists caleris_merch_products_read on public.caleris_merchandise_products;
create policy caleris_merch_products_read on public.caleris_merchandise_products for select to authenticated
using(exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.team_id=public.caleris_merchandise_products.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=auth.uid()));
drop policy if exists caleris_merch_products_admin_manage on public.caleris_merchandise_products;
create policy caleris_merch_products_admin_manage on public.caleris_merchandise_products for all to authenticated
using(exists(select 1 from public.site_admins a where a.user_id=auth.uid()))
with check(exists(select 1 from public.site_admins a where a.user_id=auth.uid()));

create table if not exists public.caleris_merchandise_sales_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  round_id uuid not null references public.license_rounds(id) on delete cascade,
  fan_population bigint not null default 0,
  reputation_score integer not null default 0,
  conversion_rate numeric(8,6) not null default 0,
  units_sold integer not null default 0,
  gross_revenue numeric(18,2) not null default 0,
  production_cost numeric(18,2) not null default 0,
  net_revenue numeric(18,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  sale_transaction_id uuid references public.economy_transactions(id),
  production_transaction_id uuid references public.economy_transactions(id),
  created_at timestamptz not null default now(),
  unique(team_id,round_id)
);
create index if not exists idx_caleris_merch_sales_team_created on public.caleris_merchandise_sales_runs(team_id,created_at desc);
alter table public.caleris_merchandise_sales_runs enable row level security;
drop policy if exists caleris_merch_sales_read on public.caleris_merchandise_sales_runs;
create policy caleris_merch_sales_read on public.caleris_merchandise_sales_runs for select to authenticated
using(exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.team_id=public.caleris_merchandise_sales_runs.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=auth.uid()));

create table if not exists public.caleris_merchandise_sales_items (
  id uuid primary key default gen_random_uuid(),
  sales_run_id uuid not null references public.caleris_merchandise_sales_runs(id) on delete cascade,
  product_id uuid not null references public.caleris_merchandise_products(id),
  product_name text not null,
  units_sold integer not null default 0,
  unit_price numeric(18,2) not null,
  unit_cost numeric(18,2) not null,
  gross_revenue numeric(18,2) not null default 0,
  production_cost numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_caleris_merch_items_run on public.caleris_merchandise_sales_items(sales_run_id);
alter table public.caleris_merchandise_sales_items enable row level security;
drop policy if exists caleris_merch_items_read on public.caleris_merchandise_sales_items;
create policy caleris_merch_items_read on public.caleris_merchandise_sales_items for select to authenticated
using(exists(select 1 from public.caleris_merchandise_sales_runs r where r.id=sales_run_id
  and (exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.team_id=r.team_id)
    or exists(select 1 from public.site_admins a where a.user_id=auth.uid())));

-- A dedicated NPC market and supplier are separate from VreeoBank and Sponsor Source.
alter table public.economy_wallet_accounts drop constraint if exists economy_wallet_accounts_account_kind_check;
alter table public.economy_wallet_accounts add constraint economy_wallet_accounts_account_kind_check
check(account_kind=any(array['public_member','driver','team_owner','team','vreeo_bank','sponsor_source','development_shop','merchandise_market','merchandise_supplier']::text[]));
alter table public.economy_wallet_accounts drop constraint if exists economy_wallet_owner_shape;
alter table public.economy_wallet_accounts add constraint economy_wallet_owner_shape check(
  ((account_kind='public_member') and profile_user_id is not null and member_id is null and team_id is null)
  or (account_kind in ('driver','team_owner') and profile_user_id is null and member_id is not null and team_id is null)
  or (account_kind='team' and profile_user_id is null and member_id is null and team_id is not null)
  or (account_kind in ('vreeo_bank','sponsor_source','development_shop','merchandise_market','merchandise_supplier')
      and profile_user_id is null and member_id is null and team_id is null)
);
alter table public.economy_transactions drop constraint if exists economy_transactions_event_type_check;
alter table public.economy_transactions add constraint economy_transactions_event_type_check
check(event_type=any(array['checkin_reward','prize','bank_reward','sponsor_payout','bank_funding','tax','fine','transfer','admin_adjustment','reversal','payroll','loan_disbursement','loan_repayment','development_upgrade','team_hq_upgrade','merchandise_sale','merchandise_production']::text[]));

do $$
begin
  if not exists(select 1 from public.economy_wallet_accounts where account_kind='merchandise_market' and is_active) then
    insert into public.economy_wallet_accounts(account_kind,balance,is_active) values('merchandise_market',0,true);
  end if;
  if not exists(select 1 from public.economy_wallet_accounts where account_kind='merchandise_supplier' and is_active) then
    insert into public.economy_wallet_accounts(account_kind,balance,is_active) values('merchandise_supplier',0,true);
  end if;
end $$;

create or replace function private.team_hq_effects_for_team(p_team_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'fan_growth_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'fan_growth_bonus_percent')::numeric,0)*f.condition/100),0),
    'fanbase_reputation_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'fanbase_reputation_bonus')::numeric,0)*f.condition/100),0),
    'commercial_credibility_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'commercial_credibility_bonus')::numeric,0)*f.condition/100),0),
    'merchandise_demand_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'merchandise_demand_bonus_percent')::numeric,0)*f.condition/100),0),
    'merchandise_capacity_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'merchandise_capacity_bonus_percent')::numeric,0)*f.condition/100),0),
    'sponsor_attraction_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'sponsor_attraction_bonus_percent')::numeric,0)*f.condition/100),0)
  )
  from public.caleris_team_hq_facilities f
  join public.caleris_team_hq_facility_configs c on c.facility_key=f.facility_key
  where f.team_id=p_team_id and f.level>0;
$$;
revoke all on function private.team_hq_effects_for_team(uuid) from public,anon,authenticated;

-- HQ marketing and commercial departments now have measurable, condition-scaled effects.
update public.caleris_team_hq_facility_configs c
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object(
    'fan_growth_bonus_percent',level*1.0,
    'fanbase_reputation_bonus',level*0.5,
    'merchandise_demand_bonus_percent',level*2.5
  )) from generate_series(1,8) as levels(level)
),updated_at=now()
where facility_key='marketing_department';
update public.caleris_team_hq_facility_configs c
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object(
    'commercial_credibility_bonus',level*0.5,
    'merchandise_demand_bonus_percent',level*2.0,
    'merchandise_capacity_bonus_percent',level*3.0,
    'sponsor_attraction_bonus_percent',level*1.0
  )) from generate_series(1,8) as levels(level)
),updated_at=now()
where facility_key='commercial_department';

create or replace function private.apply_team_hq_reputation_effects()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_effects jsonb; v_weights jsonb; v_metrics jsonb; v_score integer;
begin
  if pg_trigger_depth()>1 then return new; end if;
  v_effects:=private.team_hq_effects_for_team(new.team_id);
  select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='team_reputation_weights';
  if v_weights is null then v_weights:='{"championship":25,"race_performance":25,"consistency":15,"driver_reputation":15,"fanbase":10,"commercial_credibility":10}'::jsonb; end if;
  v_metrics:=new.metrics||jsonb_build_object(
    'fanbase',least(100,greatest(0,coalesce((new.metrics->>'fanbase')::numeric,0)+coalesce((v_effects->>'fanbase_reputation_bonus')::numeric,0))),
    'commercial_credibility',least(100,greatest(0,coalesce((new.metrics->>'commercial_credibility')::numeric,0)+coalesce((v_effects->>'commercial_credibility_bonus')::numeric,0))),
    'team_hq_effects',v_effects
  );
  v_score:=private.calculate_brand_weighted_score(v_metrics,v_weights);
  update public.caleris_team_reputation set score=v_score,
    band=case when v_score>=7000 then 'elite' when v_score>=4500 then 'top' when v_score>=2500 then 'competitive' when v_score>=1000 then 'established' else 'developing' end,
    metrics=v_metrics,calculated_at=now()
  where team_id=new.team_id;
  insert into public.caleris_reputation_history(entity_kind,team_id,previous_score,new_score,metrics,source_event)
  values('team',new.team_id,new.score,v_score,v_metrics,'team_hq_effects');
  return new;
end $$;
drop trigger if exists trg_team_hq_reputation_effects on public.caleris_team_reputation;
create trigger trg_team_hq_reputation_effects after insert or update of score,metrics on public.caleris_team_reputation
for each row execute function private.apply_team_hq_reputation_effects();
revoke all on function private.apply_team_hq_reputation_effects() from public,anon,authenticated;

create or replace function private.apply_team_hq_fan_growth_bonus()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_effects jsonb; v_bonus bigint;
begin
  if new.entity_kind<>'team' or new.team_id is null or new.population_delta<=0 then return new; end if;
  v_effects:=private.team_hq_effects_for_team(new.team_id);
  v_bonus:=round(new.population_delta*coalesce((v_effects->>'fan_growth_bonus_percent')::numeric,0)/100)::bigint;
  if v_bonus<=0 then return new; end if;
  update public.caleris_fan_populations set population=population+v_bonus,updated_at=now()
  where entity_kind='team' and team_id=new.team_id and region_key=new.region_key;
  if found then
    insert into public.caleris_fan_population_history(entity_kind,team_id,region_key,population_delta,source_event,metadata)
    values('team',new.team_id,new.region_key,v_bonus,'team_hq_fan_growth_bonus',
      jsonb_build_object('round_id',new.round_id,'base_growth_delta',new.population_delta,'bonus_percent',v_effects->>'fan_growth_bonus_percent'));
  end if;
  return new;
end $$;
drop trigger if exists trg_team_hq_fan_growth_bonus on public.caleris_fan_growth_events;
create trigger trg_team_hq_fan_growth_bonus after insert on public.caleris_fan_growth_events
for each row execute function private.apply_team_hq_fan_growth_bonus();
revoke all on function private.apply_team_hq_fan_growth_bonus() from public,anon,authenticated;

create or replace function private.seed_team_merchandise_products(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.caleris_merchandise_products(team_id,product_key,product_name,unit_price,unit_cost,demand_share,capacity_per_round)
  values
    (p_team_id,'jersey','Official Team Jersey',250000,110000,0.40,3000),
    (p_team_id,'cap','Team Cap',90000,35000,0.25,2500),
    (p_team_id,'miniature','Miniature Race Car',180000,90000,0.15,1200),
    (p_team_id,'hoodie','Team Hoodie',220000,100000,0.20,1800)
  on conflict(team_id,product_key) do nothing;
end $$;
revoke all on function private.seed_team_merchandise_products(uuid) from public,anon,authenticated;

create or replace function private.seed_team_merchandise_products_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.seed_team_merchandise_products(new.id); return new; end $$;
drop trigger if exists trg_seed_team_merchandise_products on public.teams;
create trigger trg_seed_team_merchandise_products after insert on public.teams
for each row execute function private.seed_team_merchandise_products_trigger();
revoke all on function private.seed_team_merchandise_products_trigger() from public,anon,authenticated;
do $$ declare v_team record; begin for v_team in select id from public.teams loop perform private.seed_team_merchandise_products(v_team.id); end loop; end $$;

create or replace function public.member_update_merchandise_product(
  p_product_id uuid,p_unit_price numeric,p_is_active boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_member public.members%rowtype; v_product public.caleris_merchandise_products%rowtype;
begin
  if v_user is null then raise exception 'Login diperlukan.'; end if;
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
  if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then raise exception 'Hanya Owner atau Principal yang dapat mengelola merchandise.'; end if;
  select * into v_product from public.caleris_merchandise_products where id=p_product_id and team_id=v_member.team_id for update;
  if not found then raise exception 'Produk merchandise tidak ditemukan.'; end if;
  if p_unit_price is null or p_unit_price<v_product.unit_cost*1.10 or p_unit_price>10000000 then raise exception 'Harga jual harus minimal 110% biaya produksi dan maksimal €10.000.000.'; end if;
  update public.caleris_merchandise_products set unit_price=round(p_unit_price,2),is_active=coalesce(p_is_active,true),updated_at=now() where id=p_product_id;
  return jsonb_build_object('status','updated','product_id',p_product_id);
end $$;
revoke all on function public.member_update_merchandise_product(uuid,numeric,boolean) from public,anon;
grant execute on function public.member_update_merchandise_product(uuid,numeric,boolean) to authenticated;

create or replace function private.post_merchandise_ledger_transaction(
  p_source uuid,p_destination uuid,p_amount numeric,p_event_type text,p_key text,p_description text,p_metadata jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_existing public.economy_transactions%rowtype; v_source public.economy_wallet_accounts%rowtype; v_dest public.economy_wallet_accounts%rowtype; v_id uuid;
begin
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal merchandise tidak valid.'; end if;
  if p_event_type not in ('merchandise_sale','merchandise_production') then raise exception 'Event merchandise tidak valid.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key,0));
  select * into v_existing from public.economy_transactions where idempotency_key=p_key;
  if found then return v_existing.id; end if;
  perform 1 from public.economy_wallet_accounts where id in (p_source,p_destination) order by id for update;
  select * into v_source from public.economy_wallet_accounts where id=p_source;
  select * into v_dest from public.economy_wallet_accounts where id=p_destination;
  if not v_source.is_active or not v_dest.is_active then raise exception 'Wallet merchandise nonaktif.'; end if;
  if p_event_type='merchandise_sale' and (v_source.account_kind<>'merchandise_market' or v_dest.account_kind<>'team') then raise exception 'Rute penjualan merchandise tidak valid.'; end if;
  if p_event_type='merchandise_production' and (v_source.account_kind<>'team' or v_dest.account_kind<>'merchandise_supplier') then raise exception 'Rute biaya produksi merchandise tidak valid.'; end if;
  insert into public.economy_transactions(event_type,source_account_id,destination_account_id,amount,idempotency_key,description,metadata)
  values(p_event_type,p_source,p_destination,p_amount,p_key,p_description,p_metadata) returning id into v_id;
  insert into public.economy_entries(transaction_id,account_id,entry_side,amount)
  values(v_id,p_source,'outflow',p_amount),(v_id,p_destination,'inflow',p_amount);
  update public.economy_wallet_accounts set balance=balance-p_amount,updated_at=now() where id=p_source;
  update public.economy_wallet_accounts set balance=balance+p_amount,updated_at=now() where id=p_destination;
  return v_id;
end $$;
revoke all on function private.post_merchandise_ledger_transaction(uuid,uuid,numeric,text,text,text,jsonb) from public,anon,authenticated;

create or replace function private.process_merchandise_sales_for_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_team record; v_product record; v_config public.caleris_merchandise_engine_config%rowtype;
  v_market public.economy_wallet_accounts%rowtype; v_supplier public.economy_wallet_accounts%rowtype; v_wallet public.economy_wallet_accounts%rowtype;
  v_run_id uuid; v_fans bigint; v_rep integer; v_rep_factor numeric; v_quality numeric; v_conversion numeric; v_effects jsonb;
  v_share_total numeric; v_capacity_bonus numeric; v_units integer; v_gross numeric; v_cost numeric;
  v_total_units integer; v_total_gross numeric:=0; v_processed integer:=0; v_sale_tx uuid; v_cost_tx uuid;
begin
  select * into v_config from public.caleris_merchandise_engine_config where singleton=true;
  if not found or not v_config.is_enabled then return jsonb_build_object('status','disabled'); end if;
  if not exists(select 1 from public.caleris_race_results where round_id=p_round_id and published_at is not null) then
    return jsonb_build_object('status','round_not_published');
  end if;
  select * into v_market from public.economy_wallet_accounts where account_kind='merchandise_market' and is_active limit 1;
  select * into v_supplier from public.economy_wallet_accounts where account_kind='merchandise_supplier' and is_active limit 1;
  if v_market.id is null or v_supplier.id is null then raise exception 'Wallet merchandise market/supplier belum tersedia.'; end if;

  for v_team in select distinct e.team_id from public.caleris_race_result_entries e
    where e.round_id=p_round_id and e.team_id is not null order by e.team_id
  loop
    if exists(select 1 from public.caleris_merchandise_sales_runs where team_id=v_team.team_id and round_id=p_round_id) then continue; end if;
    select coalesce(sum(population),0),coalesce(avg(loyalty),50),coalesce(avg(engagement),50),coalesce(avg(sentiment),50)
    into v_fans,v_quality,v_conversion,v_capacity_bonus
    from public.caleris_fan_populations where entity_kind='team' and team_id=v_team.team_id;
    select coalesce(score,0) into v_rep from public.caleris_team_reputation where team_id=v_team.team_id;
    v_rep_factor:=v_config.reputation_factor_min+(v_config.reputation_factor_max-v_config.reputation_factor_min)*(least(10000,greatest(0,v_rep))/10000);
    v_quality:=1+(((coalesce(v_quality,50)+coalesce(v_conversion,50)+coalesce(v_capacity_bonus,50))/3)-50)/100*0.5;
    v_effects:=private.team_hq_effects_for_team(v_team.team_id);
    v_capacity_bonus:=least(100,coalesce((v_effects->>'merchandise_capacity_bonus_percent')::numeric,0));
    v_conversion:=least(v_config.max_conversion_rate,greatest(0,v_config.base_conversion_rate*v_rep_factor*v_quality*(1+least(100,coalesce((v_effects->>'merchandise_demand_bonus_percent')::numeric,0))/100)));
    select coalesce(sum(demand_share),0) into v_share_total from public.caleris_merchandise_products where team_id=v_team.team_id and is_active;
    if v_share_total<=0 then continue; end if;
    select * into v_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_team.team_id and is_active for update;
    if not found then continue; end if;
    v_gross:=0;v_cost:=0;v_total_units:=0;v_sale_tx:=null;v_cost_tx:=null;
    insert into public.caleris_merchandise_sales_runs(team_id,round_id,fan_population,reputation_score,conversion_rate,metadata)
    values(v_team.team_id,p_round_id,v_fans,v_rep,v_conversion,jsonb_build_object('hq_effects',v_effects,'fan_quality_factor',v_quality,'reputation_factor',v_rep_factor))
    returning id into v_run_id;
    for v_product in select * from public.caleris_merchandise_products where team_id=v_team.team_id and is_active order by product_key
    loop
      v_units:=least(
        round(v_product.capacity_per_round*(1+v_capacity_bonus/100))::integer,
        greatest(0,round(v_fans*v_conversion*(v_product.demand_share/v_share_total))::integer)
      );
      v_gross:=v_gross+(v_units*v_product.unit_price);
      v_cost:=v_cost+(v_units*v_product.unit_cost);
      v_total_units:=v_total_units+v_units;
      insert into public.caleris_merchandise_sales_items(sales_run_id,product_id,product_name,units_sold,unit_price,unit_cost,gross_revenue,production_cost)
      values(v_run_id,v_product.id,v_product.product_name,v_units,v_product.unit_price,v_product.unit_cost,v_units*v_product.unit_price,v_units*v_product.unit_cost);
    end loop;
    if v_gross>0 then
      v_sale_tx:=private.post_merchandise_ledger_transaction(v_market.id,v_wallet.id,v_gross,'merchandise_sale',
        'merchandise:sale:'||p_round_id::text||':'||v_team.team_id::text,'Merchandise sales round '||p_round_id::text,
        jsonb_build_object('team_id',v_team.team_id,'round_id',p_round_id,'sales_run_id',v_run_id));
    end if;
    if v_cost>0 then
      v_cost_tx:=private.post_merchandise_ledger_transaction(v_wallet.id,v_supplier.id,v_cost,'merchandise_production',
        'merchandise:production:'||p_round_id::text||':'||v_team.team_id::text,'Merchandise production cost round '||p_round_id::text,
        jsonb_build_object('team_id',v_team.team_id,'round_id',p_round_id,'sales_run_id',v_run_id));
    end if;
    update public.caleris_merchandise_sales_runs set units_sold=v_total_units,gross_revenue=v_gross,
      production_cost=v_cost,net_revenue=v_gross-v_cost,sale_transaction_id=v_sale_tx,production_transaction_id=v_cost_tx
    where id=v_run_id;
    v_total_gross:=v_total_gross+v_gross;v_processed:=v_processed+1;
  end loop;
  return jsonb_build_object('status','processed','teams',v_processed,'gross_revenue',v_total_gross);
end $$;
revoke all on function private.process_merchandise_sales_for_round(uuid) from public,anon,authenticated;

-- Team reputation now consumes HQ effects; the fan-growth engine gets a separate, idempotent growth bonus event.
create or replace function private.trigger_refresh_sponsorship_targets()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_division uuid;v_season uuid;
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is distinct from new.published_at) then
    select lr.season_division_id,sd.season_id into v_division,v_season
    from public.license_rounds lr join public.license_season_divisions sd on sd.id=lr.season_division_id
    where lr.id=new.round_id;
    perform private.ensure_brand_fan_populations();
    perform private.refresh_sponsorship_targets_for_round(new.round_id);
    perform private.apply_fan_growth_for_round(new.round_id);
    perform private.apply_fan_inactivity_for_round(new.round_id);
    if v_division is not null then perform private.refresh_brand_reputation_for_division(v_division); end if;
    perform private.process_merchandise_sales_for_round(new.round_id);
    if v_season is not null then perform private.auto_generate_team_sponsorship_offers(v_season); end if;
  end if;
  return new;
end $$;

create or replace function public.admin_assess_team_valuation(
  p_team_id uuid,
  p_base_valuation numeric,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_admin boolean;
  v_team record;
  v_seasons uuid[];
  v_latest uuid;
  v_previous uuid;
  v_wallet numeric := 0;
  v_development numeric := 0;
  v_achievement numeric := 0;
  v_license numeric := 0;
  v_cashflow numeric := 0;
  v_hq_asset_value numeric := 0;
  v_reputation_raw numeric := 0;
  v_reputation_score numeric := 0;
  v_debt numeric := 0;
  v_overdue numeric := 0;
  v_points_latest numeric := 0;
  v_points_previous numeric := 0;
  v_pos_latest numeric := 100;
  v_pos_previous numeric := 100;
  v_points_score numeric := 0;
  v_position_score numeric := 0;
  v_trend numeric := 0;
  v_history numeric := 0;
  v_development_score numeric := 0;
  v_achievement_score numeric := 0;
  v_wallet_score numeric := 0;
  v_license_score numeric := 0;
  v_cashflow_score numeric := 0;
  v_debt_penalty numeric := 0;
  v_overdue_penalty numeric := 0;
  v_score numeric := 0;
  v_total numeric := 0;
  v_season_start date;
  v_season_end date;
  v_snapshot jsonb;
  v_id uuid;
  v_max_points numeric := 0;
  v_max_position integer := 0;
  v_max_achievements integer := 0;
  v_max_wallet numeric := 0;
  v_max_cashflow numeric := 0;
begin
  select exists(select 1 from public.site_admins a where a.user_id=auth.uid()) into v_admin;
  if not v_admin then raise exception 'Admin access required'; end if;
  if p_base_valuation is null or p_base_valuation < 0 then raise exception 'Base valuation must be zero or greater'; end if;

  select id,name into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'Team not found'; end if;

  update public.teams set base_valuation=p_base_valuation where id=p_team_id;
  select coalesce(sum(asset_value),0) into v_hq_asset_value
  from public.caleris_team_hq_facilities where team_id=p_team_id;
  select coalesce(score,0) into v_reputation_raw
  from public.caleris_team_reputation where team_id=p_team_id;
  v_reputation_score:=least(100,greatest(0,v_reputation_raw/100));

  select array_agg(id order by starts_on desc) into v_seasons
  from (select id,starts_on from public.license_seasons where status <> 'draft' order by starts_on desc limit 2) s;
  v_latest := v_seasons[1];
  v_previous := v_seasons[2];

  select coalesce(balance,0) into v_wallet from public.economy_wallet_accounts
  where team_id=p_team_id and account_kind='team' and is_active=true limit 1;

  select coalesce(avg(current_value),50) into v_development
  from public.caleris_team_development_parts where team_id=p_team_id;

  select coalesce(count(*),0) into v_achievement from public.caleris_achievements
  where team_id=p_team_id;

  select coalesce(max(case upper(coalesce(m.license,'')) when 'A' then 100 when 'B' then 80 when 'C' then 60 when 'D' then 40 when 'E' then 20 when 'F' then 0 else 0 end),0)
  into v_license from public.members m where m.team_id=p_team_id and m.role='Driver';

  select coalesce(sum(l.total_due-l.amount_repaid),0),
         coalesce(sum(case when l.status='overdue' then l.total_due-l.amount_repaid else 0 end),0)
  into v_debt,v_overdue from public.economy_cash_loans l
  where l.loan_type='team' and l.team_id=p_team_id and l.status in ('active','overdue');

  if v_latest is not null then
    select coalesce(sum(fs.final_points),0),coalesce(avg(fs.final_position),100)
    into v_points_latest,v_pos_latest
    from public.license_final_standings fs
    join public.license_season_divisions d on d.id=fs.season_division_id
    join public.members m on m.id=fs.member_id
    where d.season_id=v_latest and m.team_id=p_team_id;

    select coalesce(sum(case when t.destination_account_id=w.id then t.amount else -t.amount end),0) into v_cashflow
    from public.economy_transactions t
    join public.economy_wallet_accounts w on w.team_id=p_team_id and w.account_kind='team'
      and (w.id=t.source_account_id or w.id=t.destination_account_id)
    where t.created_at >= (select starts_on::timestamptz from public.license_seasons where id=v_latest)
      and t.created_at < ((select ends_on from public.license_seasons where id=v_latest)+1)::timestamptz
      and t.event_type not in ('loan_disbursement','loan_repayment');
  end if;
  if v_previous is not null then
    select coalesce(sum(fs.final_points),0),coalesce(avg(fs.final_position),100)
    into v_points_previous,v_pos_previous
    from public.license_final_standings fs
    join public.license_season_divisions d on d.id=fs.season_division_id
    join public.members m on m.id=fs.member_id
    where d.season_id=v_previous and m.team_id=p_team_id;
  end if;

  select coalesce(max(x.points),0),coalesce(max(x.position),0),coalesce(max(x.achievements),0),
         coalesce(max(x.wallet),0),coalesce(max(x.cashflow),0)
  into v_max_points,v_max_position,v_max_achievements,v_max_wallet,v_max_cashflow
  from (
    select t.id,
      coalesce((select sum(fs.final_points) from public.license_final_standings fs join public.license_season_divisions d on d.id=fs.season_division_id join public.members m on m.id=fs.member_id where d.season_id=v_latest and m.team_id=t.id),0) points,
      coalesce((select avg(fs.final_position) from public.license_final_standings fs join public.license_season_divisions d on d.id=fs.season_division_id join public.members m on m.id=fs.member_id where d.season_id=v_latest and m.team_id=t.id),100) position,
      (select count(*) from public.caleris_achievements a where a.team_id=t.id) achievements,
      coalesce((select w.balance from public.economy_wallet_accounts w where w.team_id=t.id and w.account_kind='team' and w.is_active=true limit 1),0) wallet,
      greatest(0,coalesce((select sum(case when tx.destination_account_id=w.id then tx.amount else -tx.amount end) from public.economy_transactions tx join public.economy_wallet_accounts w on w.team_id=t.id and w.account_kind='team' and (w.id=tx.source_account_id or w.id=tx.destination_account_id) where tx.event_type not in ('loan_disbursement','loan_repayment') and (v_latest is null or (tx.created_at >= (select starts_on::timestamptz from public.license_seasons where id=v_latest) and tx.created_at < ((select ends_on from public.license_seasons where id=v_latest)+1)::timestamptz))),0)) cashflow
    from public.teams t
  ) x;

  v_points_score := case when v_max_points>0 then least(100,v_points_latest/v_max_points*100) else 0 end;
  v_position_score := case when v_max_position>1 then greatest(0,least(100,(v_max_position-v_pos_latest)/(v_max_position-1)*100)) else 0 end;
  v_trend := (v_points_score*0.5 + v_position_score*0.5);
  if v_previous is not null then
    v_trend := v_trend*0.65 + (
      (case when v_max_points>0 then least(100,v_points_previous/v_max_points*100) else 0 end)*0.5
      + (case when v_max_position>1 then greatest(0,least(100,(v_max_position-v_pos_previous)/(v_max_position-1)*100)) else 0 end)*0.5
    )*0.35;
  end if;

  v_development_score := least(100,greatest(0,v_development));
  v_achievement_score := case when v_max_achievements>0 then least(100,v_achievement::numeric/v_max_achievements*100) else 0 end;
  v_wallet_score := case when v_max_wallet>0 then least(100,v_wallet/v_max_wallet*100) else 0 end;
  v_license_score := v_license;
  v_cashflow_score := case when v_max_cashflow>0 then least(100,greatest(0,v_cashflow)/v_max_cashflow*100) else 0 end;
  v_debt_penalty := case when v_debt+v_wallet>0 then least(30,(v_debt/(v_debt+v_wallet))*30) else 0 end;
  v_overdue_penalty := case when v_debt>0 then least(30,(v_overdue/v_debt)*30) else 0 end;

  -- Existing operating components retain their agreed weights; brand reputation contributes 10%.
  v_score := (v_development_score*25 + v_achievement_score*15 + v_trend*20 + v_wallet_score*10 + v_license_score*10 + v_cashflow_score*10 + v_reputation_score*10)/100;
  v_score := greatest(0,least(100,v_score-v_debt_penalty-v_overdue_penalty));
  -- HQ construction assets are added once, separately from the base-value score.
  v_total := round(p_base_valuation*v_score/100 + v_hq_asset_value,2);

  v_snapshot := jsonb_build_object(
    'development_progress',jsonb_build_object('score',round(v_development_score,2),'weight',25,'average_attribute',round(v_development,2)),
    'achievement_history',jsonb_build_object('score',round(v_achievement_score,2),'weight',15,'count',v_achievement),
    'two_season_trend',jsonb_build_object('score',round(v_trend,2),'weight',20,'latest_points',v_points_latest,'previous_points',v_points_previous,'latest_average_position',v_pos_latest,'previous_average_position',v_pos_previous),
    'team_wallet',jsonb_build_object('score',round(v_wallet_score,2),'weight',10,'balance',v_wallet),
    'best_driver_license',jsonb_build_object('score',round(v_license_score,2),'weight',10,'rank',v_license),
    'season_net_cashflow',jsonb_build_object('score',round(v_cashflow_score,2),'weight',10,'net_amount',v_cashflow),
    'team_reputation',jsonb_build_object('score',round(v_reputation_score,2),'weight',10,'raw_score',v_reputation_raw),
    'team_hq_assets',jsonb_build_object('asset_value',v_hq_asset_value,'included_additively',true),
    'brand_equity',jsonb_build_object('fan_population',(select coalesce(sum(population),0) from public.caleris_fan_populations where entity_kind='team' and team_id=p_team_id),'reputation_score',v_reputation_raw),
    'active_team_debt',jsonb_build_object('amount',v_debt,'penalty_points',round(v_debt_penalty,2)),
    'overdue_installments',jsonb_build_object('amount',v_overdue,'penalty_points',round(v_overdue_penalty,2)),
    'weights_normalized_from',100
  );

  insert into public.caleris_team_valuations(
    team_id,season_id,assets_value,development_value,history_value,achievements_value,
    financial_health_value,total_valuation,base_valuation,team_score,score_breakdown,
    debt_penalty,overdue_penalty,notes,assessed_by
  ) values (
    p_team_id,v_latest,p_base_valuation,v_development+v_hq_asset_value,v_trend,v_achievement,
    v_wallet,v_total,p_base_valuation,round(v_score,4),v_snapshot,
    round(v_debt_penalty,4),round(v_overdue_penalty,4),nullif(trim(p_notes),''),auth.uid()
  ) returning id into v_id;

  return jsonb_build_object('valuation_id',v_id,'base_valuation',p_base_valuation,'team_score',round(v_score,4),'total_valuation',v_total,'score_breakdown',v_snapshot);
end;
$$;
revoke all on function public.admin_assess_team_valuation(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.admin_assess_team_valuation(uuid,numeric,text) to authenticated,service_role;

