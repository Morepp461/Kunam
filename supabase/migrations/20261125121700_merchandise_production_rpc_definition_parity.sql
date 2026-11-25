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