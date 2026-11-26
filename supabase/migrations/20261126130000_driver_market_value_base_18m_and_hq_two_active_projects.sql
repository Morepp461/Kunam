begin;

-- Allow two concurrent Team HQ projects, while still preventing two active projects
-- for the same facility. The RPC/trigger retains the global two-project limit.
drop index if exists public.caleris_team_hq_one_active_project_per_team;
create unique index if not exists caleris_team_hq_one_active_project_per_facility
  on public.caleris_team_hq_projects(team_id, facility_key)
  where status in ('queued','in_progress');

comment on index public.caleris_team_hq_one_active_project_per_facility is
  'Prevents duplicate active projects per facility; the HQ lifecycle trigger enforces a maximum of two active projects per team.';

-- Raise the immutable Driver Market Value Tier 1 base to the approved €18m.
drop trigger if exists caleris_driver_market_config_immutable on public.caleris_driver_market_config;
update public.caleris_driver_market_config
set base_value_eur=18000000
where base_value_eur is distinct from 18000000;

create trigger caleris_driver_market_config_immutable
before insert or update or delete on public.caleris_driver_market_config
for each row execute function private.guard_driver_market_config_immutable();

comment on column public.caleris_driver_market_config.base_value_eur is
  'Immutable Tier 1 Driver Market Value base, fixed at EUR 18,000,000 by product decision.';

commit;
