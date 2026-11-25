-- Reputation band labels and inventory-backed merchandise market.
-- No runtime dependency changes. Production costs are charged when stock is manufactured.

create or replace function private.normalize_caleris_reputation_band()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.band := case
    when coalesce(new.score,0) >= 7000 then 'elite'
    when coalesce(new.score,0) >= 4500 then 'world'
    when coalesce(new.score,0) >= 2500 then 'national'
    when coalesce(new.score,0) >= 1000 then 'local'
    else 'junior'
  end;
  return new;
end
$$;
revoke all on function private.normalize_caleris_reputation_band() from public,anon,authenticated,service_role;

drop trigger if exists trg_team_reputation_band_labels on public.caleris_team_reputation;
create trigger trg_team_reputation_band_labels
before insert or update of score,band on public.caleris_team_reputation
for each row execute function private.normalize_caleris_reputation_band();

drop trigger if exists trg_driver_reputation_band_labels on public.caleris_driver_reputation;
create trigger trg_driver_reputation_band_labels
before insert or update of score,band on public.caleris_driver_reputation
for each row execute function private.normalize_caleris_reputation_band();

update public.caleris_team_reputation
set band=case when score>=7000 then 'elite' when score>=4500 then 'world'
  when score>=2500 then 'national' when score>=1000 then 'local' else 'junior' end;
update public.caleris_driver_reputation
set band=case when score>=7000 then 'elite' when score>=4500 then 'world'
  when score>=2500 then 'national' when score>=1000 then 'local' else 'junior' end;

create table if not exists public.caleris_merchandise_catalog (
  product_key text primary key,
  product_name text not null,
  unit_cost numeric(18,2) not null default 0 check(unit_cost>=0),
  reference_price numeric(18,2) not null default 0 check(reference_price>=0),
  price_elasticity numeric(6,3) not null default 1.000 check(price_elasticity between 0.100 and 5.000),
  demand_share numeric(6,4) not null default 0.125 check(demand_share>0 and demand_share<=1),
  capacity_per_round integer not null default 3000 check(capacity_per_round>=0),
  production_capacity_per_order integer not null default 3000 check(production_capacity_per_order>=1),
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.caleris_merchandise_catalog enable row level security;
drop policy if exists caleris_merch_catalog_read on public.caleris_merchandise_catalog;
create policy caleris_merch_catalog_read on public.caleris_merchandise_catalog
for select to authenticated using(true);
grant select on public.caleris_merchandise_catalog to authenticated;

insert into public.caleris_merchandise_catalog(
  product_key,product_name,unit_cost,reference_price,price_elasticity,demand_share,
  capacity_per_round,production_capacity_per_order,is_enabled
)
values
  ('t_shirt','T-Shirt',0,0,1.000,0.125,3000,3000,true),
  ('polo_shirt','Polo Shirt',0,0,1.000,0.125,3000,3000,true),
  ('cap','Cap',0,0,1.000,0.125,3000,3000,true),
  ('fan_card','Fan Card',0,0,1.000,0.125,3000,3000,true),
  ('jacket','Jacket',0,0,1.000,0.125,3000,3000,true),
  ('sticker','Sticker',0,0,1.000,0.125,3000,3000,true),
  ('flag','Flag',0,0,1.000,0.125,3000,3000,true),
  ('scarf','Scarf',0,0,1.000,0.125,3000,3000,true)
on conflict(product_key) do update set product_name=excluded.product_name;

alter table public.caleris_merchandise_products
  add column if not exists catalog_enabled boolean not null default true,
  add column if not exists stock_quantity integer not null default 0,
  add column if not exists reference_price numeric(18,2) not null default 0,
  add column if not exists price_elasticity numeric(6,3) not null default 1.000,
  add column if not exists production_capacity_per_order integer not null default 3000;

alter table public.caleris_merchandise_products
  drop constraint if exists caleris_merchandise_products_check,
  drop constraint if exists caleris_merchandise_products_unit_price_check;
alter table public.caleris_merchandise_products
  add constraint caleris_merchandise_products_unit_cost_nonnegative check(unit_cost>=0),
  add constraint caleris_merchandise_products_unit_price_nonnegative check(unit_price>=0),
  add constraint caleris_merchandise_products_stock_nonnegative check(stock_quantity>=0),
  add constraint caleris_merchandise_products_reference_price_nonnegative check(reference_price>=0),
  add constraint caleris_merchandise_products_price_elasticity_check check(price_elasticity between 0.100 and 5.000),
  add constraint caleris_merchandise_products_production_capacity_check check(production_capacity_per_order>=1);

create index if not exists idx_caleris_merch_products_catalog_active
  on public.caleris_merchandise_products(team_id,catalog_enabled,is_active);

update public.caleris_merchandise_products
set catalog_enabled=false,is_active=false
where product_key in ('jersey','miniature','hoodie');

update public.caleris_merchandise_products
set product_name='Cap',catalog_enabled=true,is_active=false,stock_quantity=0,
    unit_cost=0,reference_price=0,price_elasticity=1.000,demand_share=0.125,
    capacity_per_round=3000,production_capacity_per_order=3000
where product_key='cap';

create table if not exists public.caleris_merchandise_production_batches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  product_id uuid not null references public.caleris_merchandise_products(id) on delete restrict,
  product_name text not null,
  units_produced integer not null check(units_produced>0),
  units_remaining integer not null check(units_remaining>=0 and units_remaining<=units_produced),
  unit_cost numeric(18,2) not null check(unit_cost>0),
  total_cost numeric(18,2) not null check(total_cost>0),
  transaction_id uuid not null unique references public.economy_transactions(id) on delete restrict,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_caleris_merch_production_team_created
  on public.caleris_merchandise_production_batches(team_id,created_at desc);
create index if not exists idx_caleris_merch_production_product_stock
  on public.caleris_merchandise_production_batches(product_id,created_at,id)
  where units_remaining>0;
alter table public.caleris_merchandise_production_batches enable row level security;
drop policy if exists caleris_merch_production_read on public.caleris_merchandise_production_batches;
create policy caleris_merch_production_read on public.caleris_merchandise_production_batches
for select to authenticated
using(
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=auth.uid() and m.team_id=caleris_merchandise_production_batches.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=auth.uid())
);
grant select on public.caleris_merchandise_production_batches to authenticated;

create or replace function private.seed_team_merchandise_products(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.caleris_merchandise_products(
    team_id,product_key,product_name,unit_price,unit_cost,demand_share,capacity_per_round,
    is_active,catalog_enabled,stock_quantity,reference_price,price_elasticity,production_capacity_per_order
  )
  select p_team_id,c.product_key,c.product_name,0,c.unit_cost,c.demand_share,c.capacity_per_round,
    false,true,0,c.reference_price,c.price_elasticity,c.production_capacity_per_order
  from public.caleris_merchandise_catalog c
  where c.is_enabled
  on conflict(team_id,product_key) do nothing;
end
$$;
revoke all on function private.seed_team_merchandise_products(uuid) from public,anon,authenticated,service_role;

do $$
declare v_team record;
begin
  for v_team in select id from public.teams loop
    perform private.seed_team_merchandise_products(v_team.id);
  end loop;
end
$$;

create or replace function public.admin_update_merchandise_catalog_item(
  p_product_key text,
  p_unit_cost numeric,
  p_reference_price numeric,
  p_price_elasticity numeric,
  p_demand_share numeric,
  p_capacity_per_round integer,
  p_production_capacity_per_order integer,
  p_is_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_catalog public.caleris_merchandise_catalog%rowtype;
begin
  if v_user is null or not exists(select 1 from public.site_admins a where a.user_id=v_user) then
    raise exception 'Admin access required.';
  end if;
  if p_unit_cost is null or p_unit_cost<=0 or p_reference_price is null or p_reference_price<=0
    or p_price_elasticity is null or p_price_elasticity<0.1 or p_price_elasticity>5
    or p_demand_share is null or p_demand_share<=0 or p_demand_share>1
    or p_capacity_per_round is null or p_capacity_per_round<0
    or p_production_capacity_per_order is null or p_production_capacity_per_order<1
  then raise exception 'Konfigurasi biaya, harga acuan, elastisitas, demand share, atau kapasitas tidak valid.'; end if;

  update public.caleris_merchandise_catalog
  set unit_cost=round(p_unit_cost,2),reference_price=round(p_reference_price,2),
      price_elasticity=p_price_elasticity,demand_share=p_demand_share,
      capacity_per_round=p_capacity_per_round,
      production_capacity_per_order=p_production_capacity_per_order,
      is_enabled=coalesce(p_is_enabled,false),updated_at=now(),updated_by=v_user
  where product_key=p_product_key
  returning * into v_catalog;
  if not found then raise exception 'Produk katalog merchandise tidak ditemukan.'; end if;

  update public.caleris_merchandise_products
  set product_name=v_catalog.product_name,unit_cost=v_catalog.unit_cost,
      demand_share=v_catalog.demand_share,capacity_per_round=v_catalog.capacity_per_round,
      reference_price=v_catalog.reference_price,price_elasticity=v_catalog.price_elasticity,
      production_capacity_per_order=v_catalog.production_capacity_per_order,
      catalog_enabled=v_catalog.is_enabled,
      is_active=case when v_catalog.is_enabled then is_active else false end,
      updated_at=now()
  where product_key=v_catalog.product_key;

  update public.caleris_quest_catalog
  set is_active=exists(select 1 from public.caleris_merchandise_catalog
    where is_enabled and unit_cost>0 and reference_price>0),updated_at=now()
  where quest_key='team_merchandise_production_daily';

  return jsonb_build_object('status','updated','product_key',v_catalog.product_key,'is_enabled',v_catalog.is_enabled);
end
$$;
revoke all on function public.admin_update_merchandise_catalog_item(text,numeric,numeric,numeric,numeric,integer,integer,boolean) from public,anon,service_role;
grant execute on function public.admin_update_merchandise_catalog_item(text,numeric,numeric,numeric,numeric,integer,integer,boolean) to authenticated;

create or replace function public.member_update_merchandise_product(
  p_product_id uuid,p_unit_price numeric,p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_member public.members%rowtype; v_product public.caleris_merchandise_products%rowtype;
begin
  if v_user is null then raise exception 'Login diperlukan.'; end if;
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
  if not found or v_member.role<>'Owner' or v_member.team_id is null then
    raise exception 'Hanya Team Owner yang dapat mengelola merchandise.';
  end if;
  select * into v_product from public.caleris_merchandise_products
  where id=p_product_id and team_id=v_member.team_id and catalog_enabled for update;
  if not found then raise exception 'Produk merchandise tidak ditemukan.'; end if;
  if p_unit_price is null or p_unit_price<=0 then raise exception 'Harga jual harus lebih besar dari nol.'; end if;
  if coalesce(p_is_active,true) and (v_product.unit_cost<=0 or v_product.reference_price<=0) then
    raise exception 'Biaya produksi dan harga acuan produk belum dikonfigurasi Admin.';
  end if;
  update public.caleris_merchandise_products
  set unit_price=round(p_unit_price,2),is_active=coalesce(p_is_active,true),updated_at=now()
  where id=p_product_id;
  return jsonb_build_object('status','updated','product_id',p_product_id,'unit_margin',round(p_unit_price-v_product.unit_cost,2));
end
$$;
revoke all on function public.member_update_merchandise_product(uuid,numeric,boolean) from public,anon,service_role;
grant execute on function public.member_update_merchandise_product(uuid,numeric,boolean) to authenticated;

create or replace function private.calculate_merchandise_price_factor(
  p_reference_price numeric,p_unit_price numeric,p_elasticity numeric
)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when p_reference_price is null or p_reference_price<=0 or p_unit_price is null or p_unit_price<=0
      or p_elasticity is null or p_elasticity<0 then 0::numeric
    else least(3::numeric,greatest(0.1::numeric,power(p_reference_price/p_unit_price,p_elasticity)))
  end
$$;
revoke all on function private.calculate_merchandise_price_factor(numeric,numeric,numeric) from public,anon,authenticated,service_role;

create or replace function public.member_produce_merchandise(p_product_id uuid,p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_member public.members%rowtype;
  v_product public.caleris_merchandise_products%rowtype;
  v_wallet public.economy_wallet_accounts%rowtype;
  v_supplier public.economy_wallet_accounts%rowtype;
  v_config public.caleris_merchandise_engine_config%rowtype;
  v_effects jsonb;
  v_capacity_bonus numeric:=0;
  v_max_quantity integer;
  v_batch_id uuid:=pg_catalog.gen_random_uuid();
  v_transaction_id uuid;
  v_total_cost numeric(18,2);
begin
  if v_user is null then raise exception 'Login diperlukan.'; end if;
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
  if not found or v_member.role<>'Owner' or v_member.team_id is null then
    raise exception 'Hanya Team Owner yang dapat memproduksi merchandise.';
  end if;
  if p_quantity is null or p_quantity<1 then raise exception 'Jumlah produksi minimal satu unit.'; end if;

  select * into v_product from public.caleris_merchandise_products
  where id=p_product_id and team_id=v_member.team_id and catalog_enabled and is_active
  for update;
  if not found then raise exception 'Aktifkan produk sebelum memulai produksi.'; end if;
  if v_product.unit_cost<=0 or v_product.reference_price<=0 or v_product.unit_price<=0 then
    raise exception 'Biaya produksi, harga acuan, dan harga jual harus dikonfigurasi terlebih dahulu.';
  end if;

  select * into v_config from public.caleris_merchandise_engine_config where singleton=true;
  v_effects:=private.team_hq_effects_for_team(v_member.team_id);
  v_capacity_bonus:=least(100,coalesce((v_effects->>'merchandise_capacity_bonus_percent')::numeric,0)
    *coalesce(v_config.hq_capacity_bonus_per_level,3)/3);
  v_max_quantity:=greatest(1,round(v_product.production_capacity_per_order*(1+v_capacity_bonus/100))::integer);
  if p_quantity>v_max_quantity then
    raise exception 'Jumlah produksi melebihi kapasitas batch saat ini (% unit).',v_max_quantity;
  end if;

  select * into v_wallet from public.economy_wallet_accounts
  where account_kind='team' and team_id=v_member.team_id and is_active for update;
  if not found then raise exception 'Team Wallet tidak tersedia.'; end if;
  select * into v_supplier from public.economy_wallet_accounts
  where account_kind='merchandise_supplier' and is_active limit 1;
  if not found then raise exception 'Wallet pemasok merchandise belum tersedia.'; end if;

  v_total_cost:=round(v_product.unit_cost*p_quantity,2);
  if v_wallet.balance<v_total_cost then
    raise exception 'Saldo Team Wallet tidak cukup untuk produksi. Dibutuhkan €%.',v_total_cost;
  end if;

  v_transaction_id:=private.post_merchandise_ledger_transaction(
    v_wallet.id,v_supplier.id,v_total_cost,'merchandise_production',
    'merchandise:production:'||v_batch_id::text,
    'Merchandise production: '||v_product.product_name,
    jsonb_build_object('team_id',v_member.team_id,'product_id',v_product.id,
      'product_name',v_product.product_name,'units',p_quantity,'production_batch_id',v_batch_id)
  );

  insert into public.caleris_merchandise_production_batches(
    id,team_id,product_id,product_name,units_produced,units_remaining,unit_cost,total_cost,transaction_id,created_by
  ) values (
    v_batch_id,v_member.team_id,v_product.id,v_product.product_name,p_quantity,p_quantity,
    v_product.unit_cost,v_total_cost,v_transaction_id,v_member.id
  );

  update public.caleris_merchandise_products
  set stock_quantity=stock_quantity+p_quantity,updated_at=now()
  where id=v_product.id;

  return jsonb_build_object('status','produced','batch_id',v_batch_id,'product_id',v_product.id,
    'units_produced',p_quantity,'unit_cost',v_product.unit_cost,'total_cost',v_total_cost,
    'stock_quantity',v_product.stock_quantity+p_quantity,'transaction_id',v_transaction_id);
end
$$;
revoke all on function public.member_produce_merchandise(uuid,integer) from public,anon,service_role;
grant execute on function public.member_produce_merchandise(uuid,integer) to authenticated;

create or replace function private.process_merchandise_sales_for_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_team record;
  v_product public.caleris_merchandise_products%rowtype;
  v_batch public.caleris_merchandise_production_batches%rowtype;
  v_config public.caleris_merchandise_engine_config%rowtype;
  v_market public.economy_wallet_accounts%rowtype;
  v_wallet public.economy_wallet_accounts%rowtype;
  v_run_id uuid;
  v_fans bigint;
  v_rep integer;
  v_rep_factor numeric;
  v_quality numeric;
  v_conversion numeric;
  v_effects jsonb;
  v_share_total numeric;
  v_capacity_bonus numeric;
  v_price_factor numeric;
  v_desired_units integer;
  v_units integer;
  v_remaining integer;
  v_take integer;
  v_product_cogs numeric;
  v_average_cost numeric;
  v_gross numeric;
  v_cost numeric;
  v_total_units integer;
  v_total_gross numeric:=0;
  v_processed integer:=0;
  v_sale_tx uuid;
begin
  select * into v_config from public.caleris_merchandise_engine_config where singleton=true;
  if not found or not v_config.is_enabled then return jsonb_build_object('status','disabled'); end if;
  if not exists(select 1 from public.caleris_race_results where round_id=p_round_id and published_at is not null) then
    return jsonb_build_object('status','round_not_published');
  end if;

  select * into v_market from public.economy_wallet_accounts
  where account_kind='merchandise_market' and is_active limit 1;
  if v_market.id is null then raise exception 'Wallet merchandise market belum tersedia.'; end if;

  for v_team in
    select distinct e.team_id from public.caleris_race_result_entries e
    where e.round_id=p_round_id and e.team_id is not null order by e.team_id
  loop
    if exists(select 1 from public.caleris_merchandise_sales_runs where team_id=v_team.team_id and round_id=p_round_id) then
      continue;
    end if;

    select coalesce(sum(population),0),coalesce(avg(loyalty),50),coalesce(avg(engagement),50),coalesce(avg(sentiment),50)
    into v_fans,v_quality,v_conversion,v_capacity_bonus
    from public.caleris_fan_populations where entity_kind='team' and team_id=v_team.team_id;
    select coalesce(score,0) into v_rep from public.caleris_team_reputation where team_id=v_team.team_id;
    v_rep_factor:=v_config.reputation_factor_min
      +(v_config.reputation_factor_max-v_config.reputation_factor_min)
      *(least(10000::numeric,greatest(0,v_rep)::numeric)/10000);
    v_quality:=1+(((coalesce(v_quality,50)+coalesce(v_conversion,50)+coalesce(v_capacity_bonus,50))/3)-50)/100*0.5;
    v_effects:=private.team_hq_effects_for_team(v_team.team_id);
    v_capacity_bonus:=least(100,coalesce((v_effects->>'merchandise_capacity_bonus_percent')::numeric,0)
      *v_config.hq_capacity_bonus_per_level/3);
    v_conversion:=least(v_config.max_conversion_rate,greatest(0,
      v_config.base_conversion_rate*v_rep_factor*v_quality
      *(1+least(100,coalesce((v_effects->>'merchandise_demand_bonus_percent')::numeric,0)
      *v_config.hq_demand_bonus_per_level/2.5)/100)));

    select coalesce(sum(demand_share),0) into v_share_total
    from public.caleris_merchandise_products
    where team_id=v_team.team_id and catalog_enabled and is_active
      and unit_price>0 and reference_price>0 and unit_cost>0;
    if v_share_total<=0 then continue; end if;

    select * into v_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_team.team_id and is_active for update;
    if not found then continue; end if;

    v_gross:=0;v_cost:=0;v_total_units:=0;v_sale_tx:=null;
    insert into public.caleris_merchandise_sales_runs(
      team_id,round_id,fan_population,reputation_score,conversion_rate,metadata
    ) values (
      v_team.team_id,p_round_id,v_fans,v_rep,v_conversion,
      jsonb_build_object('hq_effects',v_effects,'fan_quality_factor',v_quality,
        'reputation_factor',v_rep_factor,'pricing_model','reference_price_elasticity_v1')
    ) returning id into v_run_id;

    for v_product in
      select * from public.caleris_merchandise_products
      where team_id=v_team.team_id and catalog_enabled and is_active
        and unit_price>0 and reference_price>0 and unit_cost>0
      order by product_key for update
    loop
      v_price_factor:=private.calculate_merchandise_price_factor(
        v_product.reference_price,v_product.unit_price,v_product.price_elasticity
      );
      v_desired_units:=greatest(0,round(v_fans*v_conversion
        *(v_product.demand_share/v_share_total)*v_price_factor)::integer);
      v_units:=least(
        round(v_product.capacity_per_round*(1+v_capacity_bonus/100))::integer,
        v_product.stock_quantity,
        v_desired_units
      );
      v_remaining:=v_units;v_product_cogs:=0;

      if v_remaining>0 then
        for v_batch in
          select * from public.caleris_merchandise_production_batches
          where product_id=v_product.id and units_remaining>0
          order by created_at,id for update
        loop
          exit when v_remaining<=0;
          v_take:=least(v_remaining,v_batch.units_remaining);
          update public.caleris_merchandise_production_batches
          set units_remaining=units_remaining-v_take where id=v_batch.id;
          v_product_cogs:=v_product_cogs+(v_take*v_batch.unit_cost);
          v_remaining:=v_remaining-v_take;
        end loop;
      end if;

      v_units:=v_units-v_remaining;
      if v_units>0 then
        update public.caleris_merchandise_products
        set stock_quantity=greatest(0,stock_quantity-v_units),updated_at=now()
        where id=v_product.id;
      end if;
      v_average_cost:=case when v_units>0 then v_product_cogs/v_units else 0 end;
      v_gross:=v_gross+(v_units*v_product.unit_price);
      v_cost:=v_cost+v_product_cogs;
      v_total_units:=v_total_units+v_units;

      insert into public.caleris_merchandise_sales_items(
        sales_run_id,product_id,product_name,units_sold,unit_price,unit_cost,gross_revenue,production_cost
      ) values (
        v_run_id,v_product.id,v_product.product_name,v_units,v_product.unit_price,
        v_average_cost,v_units*v_product.unit_price,v_product_cogs
      );
    end loop;

    if v_gross>0 then
      v_sale_tx:=private.post_merchandise_ledger_transaction(
        v_market.id,v_wallet.id,v_gross,'merchandise_sale',
        'merchandise:sale:'||p_round_id::text||':'||v_team.team_id::text,
        'Merchandise sales round '||p_round_id::text,
        jsonb_build_object('team_id',v_team.team_id,'round_id',p_round_id,'sales_run_id',v_run_id)
      );
    end if;

    update public.caleris_merchandise_sales_runs
    set units_sold=v_total_units,gross_revenue=v_gross,production_cost=v_cost,
      net_revenue=v_gross-v_cost,sale_transaction_id=v_sale_tx,production_transaction_id=null
    where id=v_run_id;

    v_total_gross:=v_total_gross+v_gross;
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object('status','processed','teams',v_processed,'gross_revenue',v_total_gross);
end
$$;
revoke all on function private.process_merchandise_sales_for_round(uuid) from public,anon,authenticated,service_role;

create or replace function private.caleris_quest_metric_progress(
  p_member_id uuid,p_team_id uuid,p_metric_key text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_metric_filter jsonb default '{}'::jsonb
)
returns numeric
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_value numeric:=0;
  v_attribute text:=coalesce(p_metric_filter->>'attribute_key','');
begin
  case p_metric_key
    when 'driver_training_completed' then
      select count(*)::numeric into v_value from public.caleris_driver_training_attempts a
      where a.member_id=p_member_id and a.status in ('success','failed')
        and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;
    when 'driver_training_variety' then
      select count(distinct a.training_key)::numeric into v_value from public.caleris_driver_training_attempts a
      where a.member_id=p_member_id and a.status in ('success','failed')
        and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;
    when 'driver_training_hard' then
      select count(*)::numeric into v_value from public.caleris_driver_training_attempts a
      where a.member_id=p_member_id and a.mode_key='hard' and a.status in ('success','failed')
        and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;
    when 'driver_training_attribute' then
      select count(*)::numeric into v_value from public.caleris_driver_training_attempts a
      join public.caleris_driver_training_catalog c on c.training_key=a.training_key
      where a.member_id=p_member_id and c.attribute_key=v_attribute
        and a.status in ('success','failed') and a.resolved_at>=p_starts_at and a.resolved_at<p_ends_at;
    when 'driver_development' then
      select count(*)::numeric into v_value from public.caleris_driver_development_history h
      where h.member_id=p_member_id and h.created_at>=p_starts_at and h.created_at<p_ends_at;
    when 'driver_development_attribute' then
      select count(*)::numeric into v_value from public.caleris_driver_development_history h
      where h.member_id=p_member_id and h.attribute_key=v_attribute
        and h.created_at>=p_starts_at and h.created_at<p_ends_at;
    when 'race_checkin' then
      select count(*)::numeric into v_value from public.caleris_member_race_checkins c
      where c.member_id=p_member_id and c.checkin_at>=p_starts_at and c.checkin_at<p_ends_at;
    when 'team_development' then
      select count(*)::numeric into v_value from public.caleris_team_development_part_history h
      where h.team_id=p_team_id and h.created_at>=p_starts_at and h.created_at<p_ends_at;
    when 'team_development_attribute' then
      select count(*)::numeric into v_value from public.caleris_team_development_part_history h
      where h.team_id=p_team_id and h.part_key=v_attribute
        and h.created_at>=p_starts_at and h.created_at<p_ends_at;
    when 'team_sponsor_signed' then
      select count(*)::numeric into v_value from public.caleris_sponsorship_contracts c
      where c.target_kind='team' and c.target_team_id=p_team_id
        and c.started_at>=p_starts_at and c.started_at<p_ends_at;
    when 'team_job_advert' then
      select count(*)::numeric into v_value from public.caleris_job_adverts j
      where j.team_id=p_team_id and j.status='published'
        and j.created_at>=p_starts_at and j.created_at<p_ends_at;
    when 'team_affiliation' then
      select count(*)::numeric into v_value from public.caleris_team_affiliations a
      where a.status='accepted' and (a.team_a_id=p_team_id or a.team_b_id=p_team_id)
        and a.updated_at>=p_starts_at and a.updated_at<p_ends_at;
    when 'team_driver_contract' then
      select count(*)::numeric into v_value from public.economy_driver_contracts c
      where c.team_id=p_team_id and c.status='active'
        and c.created_at>=p_starts_at and c.created_at<p_ends_at;
    when 'team_merchandise_production' then
      select count(*)::numeric into v_value from public.caleris_merchandise_production_batches b
      where b.team_id=p_team_id and b.created_at>=p_starts_at and b.created_at<p_ends_at;
    else
      raise exception 'Quest metric tidak dikenal: %',p_metric_key;
  end case;
  return coalesce(v_value,0);
end
$$;
revoke all on function private.caleris_quest_metric_progress(uuid,uuid,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated,service_role;

insert into public.caleris_quest_catalog(
  quest_key,role_scope,quest_type,category,title,description,metric_key,target_value,
  difficulty,period_types,metric_filter,is_active,sort_order
)
values(
  'team_merchandise_production_daily','team_owner','daily','Merchandise',
  'Produce Team Merchandise','Complete at least one production batch for an active team product.',
  'team_merchandise_production',1,'easy',
  array['pre_season','race_period','race_break','end_season','off_season']::text[],
  '{}'::jsonb,false,900
)
on conflict(quest_key) do update set
  category=excluded.category,title=excluded.title,description=excluded.description,
  metric_key=excluded.metric_key,target_value=excluded.target_value,difficulty=excluded.difficulty,
  period_types=excluded.period_types,metric_filter=excluded.metric_filter,sort_order=excluded.sort_order;

update public.caleris_quest_catalog
set is_active=exists(select 1 from public.caleris_merchandise_catalog
  where is_enabled and unit_cost>0 and reference_price>0)
where quest_key='team_merchandise_production_daily';
