-- Scale the reputation-gated general-public market and generate costs for future divisions.
create or replace function private.ensure_merchandise_division_costs(p_division_key text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_multiplier numeric;v_existing_divisions integer;
begin
 if nullif(trim(p_division_key),'') is null then return;end if;
 select count(distinct division_key)::integer into v_existing_divisions from(
  select division_key from public.license_season_divisions where lower(division_key)<>lower(trim(p_division_key))
  union select division_key from public.teams where division_key is not null and lower(division_key)<>lower(trim(p_division_key))
 ) existing_divisions;
 v_multiplier:=case lower(trim(p_division_key)) when 'premio' then 1.15 when 'zwei' then 1.00
  else least(2.00,1.00+(coalesce(v_existing_divisions,0)*0.15)) end;
 insert into public.caleris_merchandise_division_costs(division_key,product_key,unit_cost) values
  (trim(p_division_key),'t_shirt',round(12*v_multiplier,2)),(trim(p_division_key),'polo_shirt',round(18*v_multiplier,2)),
  (trim(p_division_key),'cap',round(8*v_multiplier,2)),(trim(p_division_key),'fan_card',round(2*v_multiplier,2)),
  (trim(p_division_key),'jacket',round(30*v_multiplier,2)),(trim(p_division_key),'sticker',round(1*v_multiplier,2)),
  (trim(p_division_key),'flag',round(5*v_multiplier,2)),(trim(p_division_key),'scarf',round(9*v_multiplier,2))
 on conflict(division_key,product_key) do nothing;
end $$;
revoke all on function private.ensure_merchandise_division_costs(text) from public,anon,authenticated,service_role;

create or replace function private.apply_merchandise_division_cost_to_product()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_division_key text;v_cost numeric;
begin
 select division_key into v_division_key from public.teams where id=new.team_id;
 if v_division_key is not null then
  perform private.ensure_merchandise_division_costs(v_division_key);
  select unit_cost into v_cost from public.caleris_merchandise_division_costs where division_key=v_division_key and product_key=new.product_key;
  if v_cost is not null then new.unit_cost:=v_cost;new.reference_price:=round(v_cost*1.6,2);end if;
 end if;
 return new;
end $$;
revoke all on function private.apply_merchandise_division_cost_to_product() from public,anon,authenticated,service_role;

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
 if not found or not v_config.is_enabled then return jsonb_build_object('status','disabled');end if;
 if not exists(select 1 from public.caleris_race_results where round_id=p_round_id and published_at is not null) then return jsonb_build_object('status','round_not_published');end if;
 select * into v_market from public.economy_wallet_accounts where account_kind='merchandise_market' and is_active limit 1;
 if v_market.id is null then raise exception 'Wallet merchandise market belum tersedia.';end if;
 for v_team in select distinct e.team_id from public.caleris_race_result_entries e where e.round_id=p_round_id and e.team_id is not null order by e.team_id loop
  if exists(select 1 from public.caleris_merchandise_sales_runs where team_id=v_team.team_id and round_id=p_round_id) then continue;end if;
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
  v_public_market_reach:=greatest(10000::numeric,v_fans*50::numeric)*v_rep_score_factor;
  v_public_demand:=v_public_market_reach*0.025;
  select coalesce(sum(demand_share),0) into v_share_total from public.caleris_merchandise_products
  where team_id=v_team.team_id and catalog_enabled and is_active and unit_price>0 and reference_price>0 and unit_cost>0;
  if v_share_total<=0 then continue;end if;
  select * into v_wallet from public.economy_wallet_accounts where account_kind='team' and team_id=v_team.team_id and is_active for update;
  if not found then continue;end if;
  v_gross:=0;v_cost:=0;v_total_units:=0;v_sale_tx:=null;
  insert into public.caleris_merchandise_sales_runs(team_id,round_id,fan_population,reputation_score,conversion_rate,metadata)
  values(v_team.team_id,p_round_id,v_fans,v_rep,v_conversion,jsonb_build_object('hq_effects',v_effects,'fan_quality_factor',v_quality,
   'reputation_factor',v_rep_factor,'fan_demand',round(v_fan_demand),'general_public_market_reach',round(v_public_market_reach),
   'general_public_demand',round(v_public_demand),'pricing_model','fanbase_plus_reputation_gated_public_market_v3')) returning id into v_run_id;
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
  if v_gross>0 then v_sale_tx:=private.post_merchandise_ledger_transaction(v_market.id,v_wallet.id,v_gross,'merchandise_sale',
   'merchandise:sale:'||p_round_id::text||':'||v_team.team_id::text,'Merchandise sales round '||p_round_id::text,
   jsonb_build_object('team_id',v_team.team_id,'round_id',p_round_id,'sales_run_id',v_run_id));end if;
  update public.caleris_merchandise_sales_runs set units_sold=v_total_units,gross_revenue=v_gross,production_cost=v_cost,
   net_revenue=v_gross-v_cost,sale_transaction_id=v_sale_tx,production_transaction_id=null where id=v_run_id;
  v_total_gross:=v_total_gross+v_gross;v_processed:=v_processed+1;
 end loop;
 return jsonb_build_object('status','processed','teams',v_processed,'gross_revenue',v_total_gross);
end $$;
revoke all on function private.process_merchandise_sales_for_round(uuid) from public,anon,authenticated,service_role;
update public.caleris_merchandise_catalog set capacity_per_round=1000000,production_capacity_per_order=100000;
