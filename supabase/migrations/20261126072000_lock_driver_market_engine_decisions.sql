-- Lock Driver Market Value to the approved CALERIS decision log.
-- No manual Admin configuration is exposed or permitted.

begin;

update public.caleris_driver_market_config
set weights='{"license":10,"contract":10,"performance":20,"skill":20,"achievement":10,"activity":10,"reputation":20}'::jsonb,
    base_value_eur=10000000,
    growth_factor=0.25,
    tier_multipliers='{"1":1.00,"2":0.85,"3":0.70,"4":0.60}'::jsonb,
    tier_order='{"premio":1,"zwei":2}'::jsonb,
    initial_license_scores='{"Bronze":25,"Silver":50,"Gold":75,"Super License":100}'::jsonb,
    updated_at=now(),
    updated_by=null
where id=true;

create or replace function private.guard_driver_market_config_immutable()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Driver Market Value configuration is fixed by the approved CALERIS engine decisions.';
end;
$$;
revoke all on function private.guard_driver_market_config_immutable() from public,anon,authenticated,service_role;

drop trigger if exists caleris_driver_market_config_immutable on public.caleris_driver_market_config;
create trigger caleris_driver_market_config_immutable
before insert or update or delete on public.caleris_driver_market_config
for each row execute function private.guard_driver_market_config_immutable();

revoke all on public.caleris_driver_market_config from public,anon,authenticated,service_role;
revoke all on function public.admin_configure_driver_market(jsonb,numeric,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
drop function if exists public.admin_configure_driver_market(jsonb,numeric,jsonb,jsonb,jsonb,jsonb);
revoke all on function public.admin_get_driver_market_config() from public,anon,authenticated,service_role;
drop function if exists public.admin_get_driver_market_config();

comment on table public.caleris_driver_market_config is
  'Immutable Driver Market Value engine constants. Values are fixed by the CALERIS approved decision log; no manual Admin configuration is supported.';

commit;
