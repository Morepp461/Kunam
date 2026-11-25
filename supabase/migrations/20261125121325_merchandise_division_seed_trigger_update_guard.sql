-- Keep division cost profiles and existing product prices synchronized when a new division is registered.
create or replace function private.seed_merchandise_division_from_season()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 perform private.ensure_merchandise_division_costs(new.division_key);
 update public.caleris_merchandise_products p
 set unit_cost=d.unit_cost,reference_price=round(d.unit_cost*1.6,2),updated_at=now()
 from public.caleris_merchandise_division_costs d,public.teams t
 where t.id=p.team_id and t.division_key=new.division_key
   and d.division_key=new.division_key and d.product_key=p.product_key;
 return new;
end $$;
revoke all on function private.seed_merchandise_division_from_season() from public,anon,authenticated,service_role;
