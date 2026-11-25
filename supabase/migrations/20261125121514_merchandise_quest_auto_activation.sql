-- Activate the existing Team Owner merchandise quest automatically when system defaults are available.
create or replace function private.sync_merchandise_production_quest()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 update public.caleris_quest_catalog
 set is_active=exists(select 1 from public.caleris_merchandise_catalog where is_enabled and unit_cost>0 and reference_price>0),
     updated_at=now()
 where quest_key='team_merchandise_production_daily';
 return new;
end $$;
revoke all on function private.sync_merchandise_production_quest() from public,anon,authenticated,service_role;
drop trigger if exists trg_sync_merchandise_production_quest on public.caleris_merchandise_catalog;
create trigger trg_sync_merchandise_production_quest
after insert or update of is_enabled,unit_cost,reference_price on public.caleris_merchandise_catalog
for each statement execute function private.sync_merchandise_production_quest();
update public.caleris_quest_catalog
set is_active=exists(select 1 from public.caleris_merchandise_catalog where is_enabled and unit_cost>0 and reference_price>0),
    updated_at=now()
where quest_key='team_merchandise_production_daily';
