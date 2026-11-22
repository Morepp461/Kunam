-- Persistent per-team custom UV livery designs. The JSON payload is bounded and scoped by team membership.
create table if not exists public.caleris_team_liveries (
  team_id uuid primary key references public.teams(id) on delete cascade,
  livery_data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caleris_team_liveries_object_check check (jsonb_typeof(livery_data) = 'object'),
  constraint caleris_team_liveries_size_check check (octet_length(livery_data::text) <= 250000),
  constraint caleris_team_liveries_schema_check check (
    coalesce((livery_data->>'schemaVersion')::integer, 0) = 1
  )
);

alter table public.caleris_team_liveries enable row level security;

drop policy if exists caleris_team_liveries_read on public.caleris_team_liveries;
create policy caleris_team_liveries_read on public.caleris_team_liveries
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    join public.members m on m.id = p.member_id
    where p.user_id = (select auth.uid()) and m.team_id = caleris_team_liveries.team_id
  )
  or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

drop policy if exists caleris_team_liveries_insert on public.caleris_team_liveries;
create policy caleris_team_liveries_insert on public.caleris_team_liveries
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    join public.members m on m.id = p.member_id
    where p.user_id = (select auth.uid())
      and m.team_id = caleris_team_liveries.team_id
      and m.role in ('Owner', 'Principal')
  )
  or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

drop policy if exists caleris_team_liveries_update on public.caleris_team_liveries;
create policy caleris_team_liveries_update on public.caleris_team_liveries
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    join public.members m on m.id = p.member_id
    where p.user_id = (select auth.uid())
      and m.team_id = caleris_team_liveries.team_id
      and m.role in ('Owner', 'Principal')
  )
  or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
)
with check (
  exists (
    select 1 from public.profiles p
    join public.members m on m.id = p.member_id
    where p.user_id = (select auth.uid())
      and m.team_id = caleris_team_liveries.team_id
      and m.role in ('Owner', 'Principal')
  )
  or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

grant select, insert, update on public.caleris_team_liveries to authenticated;
