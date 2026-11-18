-- Team HQ foundation. Economic values and effects are intentionally FIA-configurable.
create table if not exists public.caleris_team_hq_facility_configs (
  facility_key text primary key,
  title text not null,
  description text not null default '',
  is_enabled boolean not null default true,
  max_level_premio integer not null default 8 check (max_level_premio between 1 and 8),
  max_level_zwei integer not null default 6 check (max_level_zwei between 1 and 6),
  construction_cost_by_level jsonb not null default '{}'::jsonb,
  construction_days_by_level jsonb not null default '{}'::jsonb,
  maintenance_by_level jsonb not null default '{}'::jsonb,
  effects_by_level jsonb not null default '{}'::jsonb,
  maintenance_required boolean not null default false,
  unlock_rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint caleris_team_hq_facility_key_format check (facility_key ~ '^[a-z][a-z0-9_]*$')
);

create table if not exists public.caleris_team_hq_facilities (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  facility_key text not null references public.caleris_team_hq_facility_configs(facility_key) on update cascade,
  level integer not null default 0 check (level between 0 and 8),
  condition numeric(5,2) not null default 100 check (condition between 0 and 100),
  asset_value numeric(18,2) not null default 0 check (asset_value >= 0),
  last_maintenance_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(team_id, facility_key)
);

create table if not exists public.caleris_team_hq_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  facility_key text not null references public.caleris_team_hq_facility_configs(facility_key),
  target_level integer not null check (target_level between 1 and 8),
  status text not null default 'queued' check (status in ('queued','in_progress','completed','cancelled')),
  cost numeric(18,2) not null check (cost >= 0),
  started_at timestamptz,
  completes_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint caleris_team_hq_project_schedule check (
    (status = 'queued' and started_at is null and completes_at is null)
    or (status = 'in_progress' and started_at is not null and completes_at is not null)
    or status in ('completed','cancelled')
  )
);

create unique index if not exists caleris_team_hq_one_active_project_per_team
  on public.caleris_team_hq_projects(team_id)
  where status in ('queued','in_progress');
create index if not exists caleris_team_hq_facilities_team_idx
  on public.caleris_team_hq_facilities(team_id);
create index if not exists caleris_team_hq_projects_team_created_idx
  on public.caleris_team_hq_projects(team_id, created_at desc);

insert into public.caleris_team_hq_facility_configs
  (facility_key, title, description, maintenance_required)
values
  ('driver_development_center','Driver Development Center','Mendukung efektivitas program Development pembalap.',false),
  ('simulator_facility','Simulator Facility','Mendukung persiapan dan evaluasi program Development.',false),
  ('engineering_department','Engineering Department','Mendukung proyek Development komponen mobil.',false),
  ('rd_center','R&D Center','Mendukung riset dan kapabilitas Development.',false),
  ('factory','Factory','Mendukung kapasitas proyek Development komponen.',false),
  ('marketing_department','Marketing Department','Mendukung reputasi dan daya tarik komersial tim.',false),
  ('commercial_department','Commercial Department','Mendukung pengelolaan sponsorship dan komersial.',false),
  ('data_analytics_center','Data Analytics Center','Mendukung analisis dan evaluasi Development.',false),
  ('pit_crew_training_center','Pit Crew Training Center','Mendukung kapabilitas operasional tim.',false)
on conflict (facility_key) do update
set title = excluded.title,
    description = excluded.description,
    maintenance_required = excluded.maintenance_required;

insert into public.caleris_team_hq_facilities (team_id, facility_key)
select t.id, c.facility_key
from public.teams t
cross join public.caleris_team_hq_facility_configs c
on conflict (team_id, facility_key) do nothing;

create or replace function public.caleris_seed_team_hq_facilities()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $caleris$
begin
  insert into public.caleris_team_hq_facilities (team_id, facility_key)
  select new.id, facility_key
  from public.caleris_team_hq_facility_configs
  on conflict (team_id, facility_key) do nothing;
  return new;
end;
$caleris$;

drop trigger if exists caleris_seed_team_hq_facilities_after_team_insert on public.teams;
create trigger caleris_seed_team_hq_facilities_after_team_insert
after insert on public.teams
for each row execute function public.caleris_seed_team_hq_facilities();

revoke all on function public.caleris_seed_team_hq_facilities() from public, anon, authenticated;

alter table public.caleris_team_hq_facility_configs enable row level security;
alter table public.caleris_team_hq_facilities enable row level security;
alter table public.caleris_team_hq_projects enable row level security;

drop policy if exists "Team HQ configs readable by authenticated" on public.caleris_team_hq_facility_configs;
create policy "Team HQ configs readable by authenticated"
  on public.caleris_team_hq_facility_configs for select to authenticated
  using (true);

drop policy if exists "FIA manages Team HQ configs" on public.caleris_team_hq_facility_configs;
create policy "FIA manages Team HQ configs"
  on public.caleris_team_hq_facility_configs for all to authenticated
  using (
    exists (select 1 from public.site_admins a where a.user_id = auth.uid())
    or exists (select 1 from public.profiles p join public.members m on m.id = p.member_id
      where p.user_id = auth.uid() and m.role = 'FIA')
  )
  with check (
    exists (select 1 from public.site_admins a where a.user_id = auth.uid())
    or exists (select 1 from public.profiles p join public.members m on m.id = p.member_id
      where p.user_id = auth.uid() and m.role = 'FIA')
  );

drop policy if exists "Team members read own HQ facilities" on public.caleris_team_hq_facilities;
create policy "Team members read own HQ facilities"
  on public.caleris_team_hq_facilities for select to authenticated
  using (exists (
    select 1 from public.profiles p join public.members m on m.id = p.member_id
    where p.user_id = auth.uid() and m.team_id = caleris_team_hq_facilities.team_id
  ));

drop policy if exists "Team members read own HQ projects" on public.caleris_team_hq_projects;
create policy "Team members read own HQ projects"
  on public.caleris_team_hq_projects for select to authenticated
  using (exists (
    select 1 from public.profiles p join public.members m on m.id = p.member_id
    where p.user_id = auth.uid() and m.team_id = caleris_team_hq_projects.team_id
  ));

revoke all on public.caleris_team_hq_facility_configs from anon;
revoke all on public.caleris_team_hq_facilities from anon;
revoke all on public.caleris_team_hq_projects from anon;
grant select on public.caleris_team_hq_facility_configs to authenticated;
grant select on public.caleris_team_hq_facilities to authenticated;
grant select on public.caleris_team_hq_projects to authenticated;
grant select, insert, update, delete on public.caleris_team_hq_facility_configs to authenticated;
grant all on public.caleris_team_hq_facility_configs to service_role;
