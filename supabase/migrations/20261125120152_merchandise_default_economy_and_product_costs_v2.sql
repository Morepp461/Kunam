-- Default economy values are seeded by the system. No Admin catalog setup is required.
update public.caleris_merchandise_catalog c
set unit_cost=case c.product_key when 'sticker' then 1 when 'fan_card' then 2 when 'flag' then 5 when 'cap' then 8
  when 't_shirt' then 12 when 'scarf' then 9 when 'polo_shirt' then 18 when 'jacket' then 30 else c.unit_cost end,
  reference_price=case c.product_key when 'sticker' then 1.60 when 'fan_card' then 3.20 when 'flag' then 8.00 when 'cap' then 12.80
  when 't_shirt' then 19.20 when 'scarf' then 14.40 when 'polo_shirt' then 28.80 when 'jacket' then 48.00 else c.reference_price end,
  price_elasticity=case c.product_key when 'sticker' then 1.45 when 'fan_card' then 1.30 when 'flag' then 1.15 when 'cap' then 1.10
  when 't_shirt' then 1.20 when 'scarf' then 1.10 when 'polo_shirt' then 1.00 when 'jacket' then 0.90 else c.price_elasticity end,
  demand_share=case c.product_key when 'sticker' then 0.18 when 'fan_card' then 0.15 when 't_shirt' then 0.18 when 'cap' then 0.12
  when 'flag' then 0.08 when 'scarf' then 0.09 when 'polo_shirt' then 0.12 when 'jacket' then 0.08 else c.demand_share end;

create or replace function private.apply_merchandise_division_cost_to_product()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_division_key text;v_cost numeric;
begin
  select division_key into v_division_key from public.teams where id=new.team_id;
  if v_division_key is not null then
    perform private.ensure_merchandise_division_costs(v_division_key);
    select unit_cost into v_cost from public.caleris_merchandise_division_costs where division_key=v_division_key and product_key=new.product_key;
    if v_cost is not null then new.unit_cost:=v_cost;end if;
  end if;
  return new;
end $$;
revoke all on function private.apply_merchandise_division_cost_to_product() from public,anon,authenticated,service_role;
drop trigger if exists trg_apply_merchandise_division_cost_to_product on public.caleris_merchandise_products;
create trigger trg_apply_merchandise_division_cost_to_product before insert or update of team_id,product_key on public.caleris_merchandise_products
for each row execute function private.apply_merchandise_division_cost_to_product();

update public.caleris_merchandise_products p
set reference_price=(select round(c.reference_price*case when lower(coalesce(t.division_key,''))='premio' then 1.15 else 1 end,2)
  from public.caleris_merchandise_catalog c left join public.teams t on t.id=p.team_id where c.product_key=p.product_key),
  unit_cost=coalesce((select d.unit_cost from public.caleris_merchandise_division_costs d join public.teams t on t.division_key=d.division_key
    where t.id=p.team_id and d.product_key=p.product_key),(select c.unit_cost from public.caleris_merchandise_catalog c where c.product_key=p.product_key)),
  price_elasticity=(select c.price_elasticity from public.caleris_merchandise_catalog c where c.product_key=p.product_key),
  demand_share=(select c.demand_share from public.caleris_merchandise_catalog c where c.product_key=p.product_key),
  capacity_per_round=1000000,production_capacity_per_order=100000
where exists(select 1 from public.caleris_merchandise_catalog c where c.product_key=p.product_key);
update public.caleris_merchandise_catalog set is_enabled=true;
