-- Keep selling reference prices aligned with the division-specific manufacturing cost after reassignment.
create or replace function private.sync_team_merchandise_division_costs()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 perform private.ensure_merchandise_division_costs(new.division_key);
 update public.caleris_merchandise_products p
 set unit_cost=d.unit_cost,reference_price=round(d.unit_cost*1.6,2),updated_at=now()
 from public.caleris_merchandise_division_costs d
 where p.team_id=new.id and d.division_key=new.division_key and d.product_key=p.product_key;
 return new;
end $$;
revoke all on function private.sync_team_merchandise_division_costs() from public,anon,authenticated,service_role;
