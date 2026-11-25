-- Hard-mode merchandise market, division-aware manufacturing, timed batches and fan reviews.
-- Existing quest catalog and quest progress remain the single quest system.

grant select on public.caleris_merchandise_products, public.caleris_merchandise_sales_runs,
  public.caleris_merchandise_sales_items, public.caleris_merchandise_engine_config to authenticated;

alter table public.caleris_merchandise_production_batches
  add column if not exists status text not null default 'ready' check(status in ('producing','ready','sold_out')),
  add column if not exists completes_at timestamptz,
  add column if not exists completed_at timestamptz;
update public.caleris_merchandise_production_batches
set status=case when units_remaining=0 then 'sold_out' else 'ready' end,
    completed_at=created_at,completes_at=created_at where completes_at is null;

create table if not exists public.caleris_merchandise_division_costs(
  division_key text not null,product_key text not null,unit_cost numeric(18,2) not null check(unit_cost>0),
  updated_at timestamptz not null default now(),primary key(division_key,product_key)
);
alter table public.caleris_merchandise_division_costs enable row level security;
revoke all on public.caleris_merchandise_division_costs from public,anon,authenticated;

create or replace function private.ensure_merchandise_division_costs(p_division_key text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_multiplier numeric;
begin
  if nullif(trim(p_division_key),'') is null then return; end if;
  v_multiplier:=case lower(trim(p_division_key)) when 'premio' then 1.15 when 'zwei' then 1.00 else 1.00 end;
  insert into public.caleris_merchandise_division_costs(division_key,product_key,unit_cost) values
    (trim(p_division_key),'t_shirt',round(12*v_multiplier,2)),
    (trim(p_division_key),'polo_shirt',round(18*v_multiplier,2)),
    (trim(p_division_key),'cap',round(8*v_multiplier,2)),
    (trim(p_division_key),'fan_card',round(2*v_multiplier,2)),
    (trim(p_division_key),'jacket',round(30*v_multiplier,2)),
    (trim(p_division_key),'sticker',round(1*v_multiplier,2)),
    (trim(p_division_key),'flag',round(5*v_multiplier,2)),
    (trim(p_division_key),'scarf',round(9*v_multiplier,2))
  on conflict(division_key,product_key) do nothing;
end $$;
revoke all on function private.ensure_merchandise_division_costs(text) from public,anon,authenticated,service_role;

create or replace function private.sync_team_merchandise_division_costs()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform private.ensure_merchandise_division_costs(new.division_key);
  update public.caleris_merchandise_products p set unit_cost=d.unit_cost,updated_at=now()
  from public.caleris_merchandise_division_costs d
  where p.team_id=new.id and d.division_key=new.division_key and d.product_key=p.product_key;
  return new;
end $$;
revoke all on function private.sync_team_merchandise_division_costs() from public,anon,authenticated,service_role;
drop trigger if exists a_team_merchandise_division_costs on public.teams;
create trigger a_team_merchandise_division_costs after insert or update of division_key on public.teams
for each row execute function private.sync_team_merchandise_division_costs();

create or replace function private.seed_merchandise_division_from_season()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform private.ensure_merchandise_division_costs(new.division_key);
  update public.caleris_merchandise_products p set unit_cost=d.unit_cost,updated_at=now()
  from public.caleris_merchandise_division_costs d join public.teams t on t.id=p.team_id
  where t.division_key=new.division_key and d.division_key=new.division_key and d.product_key=p.product_key;
  return new;
end $$;
revoke all on function private.seed_merchandise_division_from_season() from public,anon,authenticated,service_role;
drop trigger if exists trg_seed_merchandise_division_from_season on public.license_season_divisions;
create trigger trg_seed_merchandise_division_from_season after insert or update of division_key on public.license_season_divisions
for each row execute function private.seed_merchandise_division_from_season();

do $$ declare r record; begin
  for r in select distinct division_key from public.teams where division_key is not null
    union select distinct division_key from public.license_season_divisions where division_key is not null
  loop perform private.ensure_merchandise_division_costs(r.division_key); end loop;
end $$;
update public.caleris_merchandise_products p set unit_cost=d.unit_cost,updated_at=now()
from public.teams t join public.caleris_merchandise_division_costs d on d.division_key=t.division_key
where p.team_id=t.id and p.product_key=d.product_key;

create or replace function private.finalize_merchandise_production(p_team_id uuid default null)
returns integer language plpgsql security definer set search_path=''
as $$
declare r record;v_count integer:=0;
begin
  for r in update public.caleris_merchandise_production_batches
    set status='ready',completed_at=now(),units_remaining=units_produced
    where status='producing' and completes_at<=now() and (p_team_id is null or team_id=p_team_id)
    returning product_id,team_id,units_produced
  loop
    update public.caleris_merchandise_products set stock_quantity=stock_quantity+r.units_produced,updated_at=now()
    where id=r.product_id and team_id=r.team_id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function private.finalize_merchandise_production(uuid) from public,anon,authenticated,service_role;

create or replace function public.member_finalize_merchandise_production()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();v_member public.members%rowtype;
begin
  if v_user is null then raise exception 'Login diperlukan.'; end if;
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
  if not found or v_member.role<>'Owner' or v_member.team_id is null then raise exception 'Hanya Team Owner yang dapat mengakses produksi merchandise.'; end if;
  return private.finalize_merchandise_production(v_member.team_id);
end $$;
revoke all on function public.member_finalize_merchandise_production() from public,anon,service_role;
grant execute on function public.member_finalize_merchandise_production() to authenticated;

create or replace function private.finalize_merchandise_before_settlement()
returns trigger language plpgsql security definer set search_path=''
as $$ begin perform private.finalize_merchandise_production(new.team_id);return new;end $$;
revoke all on function private.finalize_merchandise_before_settlement() from public,anon,authenticated,service_role;
drop trigger if exists trg_finalize_merchandise_before_settlement on public.caleris_merchandise_sales_runs;
create trigger trg_finalize_merchandise_before_settlement before insert on public.caleris_merchandise_sales_runs
for each row execute function private.finalize_merchandise_before_settlement();

create or replace function private.mark_merchandise_batch_sold_out()
returns trigger language plpgsql security definer set search_path=''
as $$ begin if new.units_remaining=0 and old.units_remaining>0 and new.status='ready' then new.status:='sold_out';end if;return new;end $$;
revoke all on function private.mark_merchandise_batch_sold_out() from public,anon,authenticated,service_role;
drop trigger if exists trg_mark_merchandise_batch_sold_out on public.caleris_merchandise_production_batches;
create trigger trg_mark_merchandise_batch_sold_out before update of units_remaining on public.caleris_merchandise_production_batches
for each row execute function private.mark_merchandise_batch_sold_out();

create or replace function public.member_produce_merchandise(p_product_id uuid,p_quantity integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid();v_member public.members%rowtype;v_product public.caleris_merchandise_products%rowtype;
  v_wallet public.economy_wallet_accounts%rowtype;v_supplier public.economy_wallet_accounts%rowtype;
  v_config public.caleris_merchandise_engine_config%rowtype;v_existing public.caleris_merchandise_production_batches%rowtype;
  v_effects jsonb;v_capacity_bonus numeric:=0;v_max_quantity integer;v_batch_id uuid;v_transaction_id uuid;
  v_total_cost numeric(18,2);v_ledger_key text;v_unit_cost numeric(18,2);v_division_key text;
  v_duration_hours integer;v_completes_at timestamptz;
begin
  if v_user is null then raise exception 'Login diperlukan.';end if;
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
  if not found or v_member.role<>'Owner' or v_member.team_id is null then raise exception 'Hanya Team Owner yang dapat memproduksi merchandise.';end if;
  if p_quantity is null or p_quantity<1 then raise exception 'Jumlah produksi minimal satu unit.';end if;
  if p_idempotency_key is null or length(p_idempotency_key)<16 or length(p_idempotency_key)>100 or p_idempotency_key !~ '^[A-Za-z0-9_-]+$' then raise exception 'Production idempotency key tidak valid.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_member.team_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.caleris_merchandise_production_batches where team_id=v_member.team_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.product_id<>p_product_id or v_existing.units_produced<>p_quantity then raise exception 'Production idempotency key sudah digunakan untuk payload yang berbeda.';end if;
    return jsonb_build_object('status',v_existing.status,'batch_id',v_existing.id,'product_id',v_existing.product_id,
      'units_produced',v_existing.units_produced,'total_cost',v_existing.total_cost,
      'stock_quantity',(select stock_quantity from public.caleris_merchandise_products where id=v_existing.product_id),
      'completes_at',v_existing.completes_at,'transaction_id',v_existing.transaction_id);
  end if;
  select * into v_product from public.caleris_merchandise_products where id=p_product_id and team_id=v_member.team_id and catalog_enabled and is_active for update;
  if not found then raise exception 'Aktifkan produk sebelum memulai produksi.';end if;
  if v_product.reference_price<=0 or v_product.unit_price<=0 then raise exception 'Harga jual dan harga acuan produk belum valid.';end if;
  select division_key into v_division_key from public.teams where id=v_member.team_id;
  perform private.ensure_merchandise_division_costs(v_division_key);
  select unit_cost into v_unit_cost from public.caleris_merchandise_division_costs where division_key=v_division_key and product_key=v_product.product_key;
  v_unit_cost:=coalesce(v_unit_cost,v_product.unit_cost);
  if v_unit_cost is null or v_unit_cost<=0 then raise exception 'Biaya produksi divisi belum tersedia.';end if;
  select * into v_config from public.caleris_merchandise_engine_config where singleton=true;
  v_effects:=private.team_hq_effects_for_team(v_member.team_id);
  v_capacity_bonus:=least(100,coalesce((v_effects->>'merchandise_capacity_bonus_percent')::numeric,0)*coalesce(v_config.hq_capacity_bonus_per_level,3)/3);
  v_max_quantity:=greatest(1,round(v_product.production_capacity_per_order*(1+v_capacity_bonus/100))::integer);
  if p_quantity>v_max_quantity then raise exception 'Jumlah produksi melebihi kapasitas batch saat ini (% unit).',v_max_quantity;end if;
  select * into v_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_member.team_id and is_active for update;
  if not found then raise exception 'Team Wallet tidak tersedia.';end if;
  select * into v_supplier from public.economy_wallet_accounts where account_kind='merchandise_supplier' and is_active limit 1;
  if not found then raise exception 'Wallet pemasok merchandise belum tersedia.';end if;
  v_total_cost:=round(v_unit_cost*p_quantity,2);
  if v_wallet.balance<v_total_cost then raise exception 'Saldo Team Wallet tidak cukup untuk produksi. Dibutuhkan €%.',v_total_cost;end if;
  v_batch_id:=pg_catalog.gen_random_uuid();
  v_ledger_key:='merchandise:production:'||v_member.team_id::text||':'||p_idempotency_key;
  v_transaction_id:=private.post_merchandise_ledger_transaction(v_wallet.id,v_supplier.id,v_total_cost,'merchandise_production',v_ledger_key,
    'Merchandise production: '||v_product.product_name,jsonb_build_object('team_id',v_member.team_id,'product_id',v_product.id,
    'product_name',v_product.product_name,'units',p_quantity,'production_batch_id',v_batch_id,'division_key',v_division_key,'idempotency_key',p_idempotency_key));
  v_duration_hours:=greatest(1,least(72,ceil(p_quantity::numeric/1000)::integer));
  v_completes_at:=now()+make_interval(hours=>v_duration_hours);
  insert into public.caleris_merchandise_production_batches(id,team_id,product_id,product_name,units_produced,units_remaining,unit_cost,total_cost,
    transaction_id,created_by,idempotency_key,status,completes_at)
  values(v_batch_id,v_member.team_id,v_product.id,v_product.product_name,p_quantity,0,v_unit_cost,v_total_cost,v_transaction_id,v_member.id,
    p_idempotency_key,'producing',v_completes_at);
  update public.caleris_merchandise_products set unit_cost=v_unit_cost,updated_at=now() where id=v_product.id;
  return jsonb_build_object('status','producing','batch_id',v_batch_id,'product_id',v_product.id,'units_produced',p_quantity,
    'unit_cost',v_unit_cost,'total_cost',v_total_cost,'stock_quantity',v_product.stock_quantity,'completes_at',v_completes_at,
    'duration_hours',v_duration_hours,'transaction_id',v_transaction_id);
end $$;
revoke all on function public.member_produce_merchandise(uuid,integer,text) from public,anon,service_role;
grant execute on function public.member_produce_merchandise(uuid,integer,text) to authenticated;

create table if not exists public.caleris_merchandise_review_templates(
  id text primary key,sentiment text not null check(sentiment in ('positive','neutral','negative')),
  rating integer not null check(rating between 0 and 5),comment text not null
);
insert into public.caleris_merchandise_review_templates(id,sentiment,rating,comment) values
('pos_01','positive',5,'Desainnya keren, kualitasnya sesuai ekspektasi.'),
('pos_02','positive',4,'Bahan terasa nyaman dan finishing-nya rapi.'),
('pos_03','positive',5,'Bangga pakai merchandise tim ini.'),
('pos_04','positive',4,'Harga terasa sepadan dengan kualitasnya.'),
('pos_05','positive',5,'Pengemasan bagus dan produk tiba dalam kondisi baik.'),
('pos_06','positive',4,'Desainnya menarik bahkan untuk yang bukan fans.'),
('neu_01','neutral',3,'Desain oke, tetapi pilihan warnanya bisa lebih banyak.'),
('neu_02','neutral',3,'Kualitas cukup baik, sesuai harga standar.'),
('neu_03','neutral',3,'Produk sesuai foto, tidak ada kejutan khusus.'),
('neu_04','neutral',3,'Pengiriman cukup wajar, tetapi bisa lebih cepat.'),
('neu_05','neutral',3,'Bahan lumayan, semoga ada peningkatan di edisi berikutnya.'),
('neu_06','neutral',3,'Menarik untuk koleksi, tetapi harganya terasa biasa saja.'),
('neg_01','negative',1,'Harga terlalu tinggi dibanding kualitas yang diterima.'),
('neg_02','negative',2,'Bahan terasa kurang sesuai dengan ekspektasi.'),
('neg_03','negative',0,'Desain terlihat bagus, tetapi hasil akhirnya mengecewakan.'),
('neg_04','negative',2,'Distribusi lambat dan informasi pengiriman kurang jelas.'),
('neg_05','negative',1,'Produk belum terasa sepadan dengan uang yang dikeluarkan.'),
('neg_06','negative',2,'Ukuran atau detail produk tidak sesuai harapan.')
on conflict(id) do update set sentiment=excluded.sentiment,rating=excluded.rating,comment=excluded.comment;

create table if not exists public.caleris_merchandise_reviews(
  id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,
  product_id uuid not null references public.caleris_merchandise_products(id) on delete cascade,
  sales_run_id uuid not null references public.caleris_merchandise_sales_runs(id) on delete cascade,
  round_id uuid not null,sentiment text not null check(sentiment in ('positive','neutral','negative')),
  rating integer not null check(rating between 0 and 5),comment text not null,created_at timestamptz not null default now(),
  unique(sales_run_id,product_id)
);
create index if not exists idx_caleris_merch_reviews_team_product on public.caleris_merchandise_reviews(team_id,product_id,created_at desc);
alter table public.caleris_merchandise_reviews enable row level security;
drop policy if exists caleris_merch_reviews_team_read on public.caleris_merchandise_reviews;
create policy caleris_merch_reviews_team_read on public.caleris_merchandise_reviews for select to authenticated using(
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and m.team_id=caleris_merchandise_reviews.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=auth.uid())
);
grant select on public.caleris_merchandise_reviews to authenticated;

create or replace function private.create_merchandise_fan_review()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_run public.caleris_merchandise_sales_runs%rowtype;v_product public.caleris_merchandise_products%rowtype;
  v_sentiment text;v_template public.caleris_merchandise_review_templates%rowtype;v_price_ratio numeric;
begin
  select * into v_run from public.caleris_merchandise_sales_runs where id=new.sales_run_id;
  select * into v_product from public.caleris_merchandise_products where id=new.product_id;
  v_price_ratio:=case when v_product.reference_price>0 then v_product.unit_price/v_product.reference_price else 1 end;
  if new.units_sold=0 or v_price_ratio>=2.25 then v_sentiment:='negative';
  elsif v_price_ratio>=1.55 or new.units_sold<10 then v_sentiment:=case when random()<0.55 then 'negative' else 'neutral' end;
  elsif v_price_ratio<=0.65 then v_sentiment:=case when random()<0.55 then 'positive' else 'neutral' end;
  else v_sentiment:=case when random()<0.65 then 'positive' when random()<0.7 then 'neutral' else 'negative' end; end if;
  select * into v_template from public.caleris_merchandise_review_templates where sentiment=v_sentiment order by random() limit 1;
  if v_template.id is not null then
    insert into public.caleris_merchandise_reviews(team_id,product_id,sales_run_id,round_id,sentiment,rating,comment)
    values(v_run.team_id,new.product_id,new.sales_run_id,v_run.round_id,v_template.sentiment,v_template.rating,v_template.comment)
    on conflict(sales_run_id,product_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.create_merchandise_fan_review() from public,anon,authenticated,service_role;
drop trigger if exists trg_create_merchandise_fan_review on public.caleris_merchandise_sales_items;
create trigger trg_create_merchandise_fan_review after insert on public.caleris_merchandise_sales_items
for each row execute function private.create_merchandise_fan_review();

create or replace function private.process_merchandise_sales_for_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_team record;v_product public.caleris_merchandise_products%rowtype;v_batch public.caleris_merchandise_production_batches%rowtype;
  v_config public.caleris_merchandise_engine_config%rowtype;v_market public.economy_wallet_accounts%rowtype;v_wallet public.economy_wallet_accounts%rowtype;
  v_run_id uuid;v_fans bigint;v_rep integer;v_rep_factor numeric;v_quality numeric;v_conversion numeric;v_effects jsonb;
  v_share_total numeric;v_capacity_bonus numeric;v_price_factor numeric;v_desired_units integer;v_units integer;v_remaining integer;v_take integer;
  v_product_cogs numeric;v_average_cost numeric;v_gross numeric;v_cost numeric;v_total_units integer;v_total_gross numeric:=0;
  v_processed integer:=0;v_sale_tx uuid;v_fan_demand numeric;v_public_market_reach numeric;v_public_demand numeric;v_rep_score_factor numeric;
begin
  select * into v_config from public.caleris_merchandise_engine_config where singleton=true;
  if not found or not v_config.is_enabled then return jsonb_build_object('status','disabled'); end if;
  if not exists(select 1 from public.caleris_race_results where round_id=p_round_id and published_at is not null) then return jsonb_build_object('status','round_not_published'); end if;
  select * into v_market from public.economy_wallet_accounts where account_kind='merchandise_market' and is_active limit 1;
  if v_market.id is null then raise exception 'Wallet merchandise market belum tersedia.'; end if;
  for v_team in select distinct e.team_id from public.caleris_race_result_entries e where e.round_id=p_round_id and e.team_id is not null order by e.team_id loop
    if exists(select 1 from public.caleris_merchandise_sales_runs where team_id=v_team.team_id and round_id=p_round_id) then continue; end if;
    select coalesce(sum(population),0),coalesce(avg(loyalty),50),coalesce(avg(engagement),50),coalesce(avg(sentiment),50)
    into v_fans,v_quality,v_conversion,v_capacity_bonus from public.caleris_fan_populations where entity_kind='team' and team_id=v_team.team_id;
    select coalesce(score,0) into v_rep from public.caleris_team_reputation where team_id=v_team.team_id;
    v_rep_factor:=v_config.reputation_factor_min+(v_config.reputation_factor_max-v_config.reputation_factor_min)*(least(10000::numeric,greatest(0,v_rep)::numeric)/10000);
    v_quality:=1+(((coalesce(v_quality,50)+coalesce(v_conversion,50)+coalesce(v_capacity_bonus,50))/3)-50)/100*0.5;
    v_effects:=private.team_hq_effects_for_team(v_team.team_id);
    v_capacity_bonus:=least(100,coalesce((v_effects->>'merchandise_capacity_bonus_percent')::numeric,0)*v_config.hq_capacity_bonus_per_level/3);
    v_conversion:=least(v_config.max_conversion_rate,greatest(0,v_config.base_conversion_rate*v_rep_factor*v_quality*
      (1+least(100,coalesce((v_effects->>'merchandise_demand_bonus_percent')::numeric,0)*v_config.hq_demand_bonus_per_level/2.5)/100)));
    v_rep_score_factor:=power(least(1::numeric,greatest(0,v_rep::numeric/10000)),1.7);
    v_fan_demand:=v_fans*v_conversion*v_quality;
    v_public_market_reach:=greatest(10000::numeric,v_fans*4::numeric)*v_rep_score_factor;
    v_public_demand:=v_public_market_reach*0.005;
    select coalesce(sum(demand_share),0) into v_share_total from public.caleris_merchandise_products
    where team_id=v_team.team_id and catalog_enabled and is_active and unit_price>0 and reference_price>0 and unit_cost>0;
    if v_share_total<=0 then continue; end if;
    select * into v_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_team.team_id and is_active for update;
    if not found then continue; end if;
    v_gross:=0;v_cost:=0;v_total_units:=0;v_sale_tx:=null;
    insert into public.caleris_merchandise_sales_runs(team_id,round_id,fan_population,reputation_score,conversion_rate,metadata)
    values(v_team.team_id,p_round_id,v_fans,v_rep,v_conversion,jsonb_build_object('hq_effects',v_effects,'fan_quality_factor',v_quality,
      'reputation_factor',v_rep_factor,'fan_demand',round(v_fan_demand),'general_public_market_reach',round(v_public_market_reach),
      'general_public_demand',round(v_public_demand),'pricing_model','fanbase_plus_reputation_gated_public_market_v2')) returning id into v_run_id;
    for v_product in select * from public.caleris_merchandise_products where team_id=v_team.team_id and catalog_enabled and is_active
      and unit_price>0 and reference_price>0 and unit_cost>0 order by product_key for update loop
      v_price_factor:=private.calculate_merchandise_price_factor(v_product.reference_price,v_product.unit_price,v_product.price_elasticity);
      v_desired_units:=greatest(0,round((v_fan_demand+v_public_demand)*(v_product.demand_share/v_share_total)*v_price_factor)::integer);
      v_units:=least(round(v_product.capacity_per_round*(1+v_capacity_bonus/100))::integer,v_product.stock_quantity,v_desired_units);
      v_remaining:=v_units;v_product_cogs:=0;
      if v_remaining>0 then
        for v_batch in select * from public.caleris_merchandise_production_batches where product_id=v_product.id and units_remaining>0 and status='ready' order by created_at,id for update loop
          exit when v_remaining<=0;v_take:=least(v_remaining,v_batch.units_remaining);
          update public.caleris_merchandise_production_batches set units_remaining=units_remaining-v_take where id=v_batch.id;
          v_product_cogs:=v_product_cogs+(v_take*v_batch.unit_cost);v_remaining:=v_remaining-v_take;
        end loop;
      end if;
      v_units:=v_units-v_remaining;
      if v_units>0 then update public.caleris_merchandise_products set stock_quantity=greatest(0,stock_quantity-v_units),updated_at=now() where id=v_product.id;end if;
      v_average_cost:=case when v_units>0 then v_product_cogs/v_units else 0 end;
      v_gross:=v_gross+(v_units*v_product.unit_price);v_cost:=v_cost+v_product_cogs;v_total_units:=v_total_units+v_units;
      insert into public.caleris_merchandise_sales_items(sales_run_id,product_id,product_name,units_sold,unit_price,unit_cost,gross_revenue,production_cost)
      values(v_run_id,v_product.id,v_product.product_name,v_units,v_product.unit_price,v_average_cost,v_units*v_product.unit_price,v_product_cogs);
    end loop;
    if v_gross>0 then
      v_sale_tx:=private.post_merchandise_ledger_transaction(v_market.id,v_wallet.id,v_gross,'merchandise_sale',
        'merchandise:sale:'||p_round_id::text||':'||v_team.team_id::text,'Merchandise sales round '||p_round_id::text,
        jsonb_build_object('team_id',v_team.team_id,'round_id',p_round_id,'sales_run_id',v_run_id));
    end if;
    update public.caleris_merchandise_sales_runs set units_sold=v_total_units,gross_revenue=v_gross,production_cost=v_cost,
      net_revenue=v_gross-v_cost,sale_transaction_id=v_sale_tx,production_transaction_id=null where id=v_run_id;
    v_total_gross:=v_total_gross+v_gross;v_processed:=v_processed+1;
  end loop;
  return jsonb_build_object('status','processed','teams',v_processed,'gross_revenue',v_total_gross);
end $$;
revoke all on function private.process_merchandise_sales_for_round(uuid) from public,anon,authenticated,service_role;
