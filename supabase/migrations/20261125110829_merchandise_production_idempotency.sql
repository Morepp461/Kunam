-- Prevent duplicate production batches and duplicate Team Wallet debits on retries.

alter table public.caleris_merchandise_production_batches
  add column if not exists idempotency_key text;

update public.caleris_merchandise_production_batches
set idempotency_key='legacy-'||id::text
where idempotency_key is null;

alter table public.caleris_merchandise_production_batches
  alter column idempotency_key set not null;

create unique index if not exists idx_caleris_merch_production_idempotency
  on public.caleris_merchandise_production_batches(team_id,idempotency_key);

drop function if exists public.member_produce_merchandise(uuid,integer);

create or replace function public.member_produce_merchandise(
  p_product_id uuid,p_quantity integer,p_idempotency_key text
)
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
  v_existing public.caleris_merchandise_production_batches%rowtype;
  v_effects jsonb;
  v_capacity_bonus numeric:=0;
  v_max_quantity integer;
  v_current_stock integer:=0;
  v_batch_id uuid;
  v_transaction_id uuid;
  v_total_cost numeric(18,2);
  v_ledger_key text;
begin
  if v_user is null then raise exception 'Login diperlukan.'; end if;
  select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=v_user;
  if not found or v_member.role<>'Owner' or v_member.team_id is null then
    raise exception 'Hanya Team Owner yang dapat memproduksi merchandise.';
  end if;
  if p_quantity is null or p_quantity<1 then raise exception 'Jumlah produksi minimal satu unit.'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<16 or length(p_idempotency_key)>100
    or p_idempotency_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Production idempotency key tidak valid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_member.team_id::text||':'||p_idempotency_key,0)
  );
  select * into v_existing from public.caleris_merchandise_production_batches
  where team_id=v_member.team_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.product_id<>p_product_id or v_existing.units_produced<>p_quantity then
      raise exception 'Production idempotency key sudah digunakan untuk payload yang berbeda.';
    end if;
    select stock_quantity into v_current_stock from public.caleris_merchandise_products
    where id=v_existing.product_id;
    return jsonb_build_object('status','already_produced','batch_id',v_existing.id,
      'product_id',v_existing.product_id,'units_produced',v_existing.units_produced,
      'total_cost',v_existing.total_cost,'stock_quantity',coalesce(v_current_stock,0),
      'transaction_id',v_existing.transaction_id);
  end if;

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

  v_batch_id:=pg_catalog.gen_random_uuid();
  v_ledger_key:='merchandise:production:'||v_member.team_id::text||':'||p_idempotency_key;
  v_transaction_id:=private.post_merchandise_ledger_transaction(
    v_wallet.id,v_supplier.id,v_total_cost,'merchandise_production',v_ledger_key,
    'Merchandise production: '||v_product.product_name,
    jsonb_build_object('team_id',v_member.team_id,'product_id',v_product.id,
      'product_name',v_product.product_name,'units',p_quantity,'production_batch_id',v_batch_id,
      'idempotency_key',p_idempotency_key)
  );

  insert into public.caleris_merchandise_production_batches(
    id,team_id,product_id,product_name,units_produced,units_remaining,unit_cost,total_cost,
    transaction_id,created_by,idempotency_key
  ) values (
    v_batch_id,v_member.team_id,v_product.id,v_product.product_name,p_quantity,p_quantity,
    v_product.unit_cost,v_total_cost,v_transaction_id,v_member.id,p_idempotency_key
  );

  update public.caleris_merchandise_products
  set stock_quantity=stock_quantity+p_quantity,updated_at=now()
  where id=v_product.id;

  return jsonb_build_object('status','produced','batch_id',v_batch_id,'product_id',v_product.id,
    'units_produced',p_quantity,'unit_cost',v_product.unit_cost,'total_cost',v_total_cost,
    'stock_quantity',v_product.stock_quantity+p_quantity,'transaction_id',v_transaction_id);
end
$$;
revoke all on function public.member_produce_merchandise(uuid,integer,text) from public,anon,service_role;
grant execute on function public.member_produce_merchandise(uuid,integer,text) to authenticated;
