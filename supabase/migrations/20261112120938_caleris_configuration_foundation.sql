-- CALERIS Masters configurable administration foundation.
-- Configuration values are intentionally data-driven; no economy or license figures are seeded.

create table if not exists public.caleris_configurations (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('license', 'economy', 'roles', 'regulations')),
  config_key text not null check (length(trim(config_key)) between 1 and 100),
  title text not null check (length(trim(title)) between 1 and 160),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caleris_configurations_category_key_unique unique (category, config_key)
);

create index if not exists caleris_configurations_category_order_idx
  on public.caleris_configurations (category, sort_order, title);

create table if not exists public.caleris_configuration_revisions (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null,
  category text not null check (category in ('license', 'economy', 'roles', 'regulations')),
  config_key text not null,
  title text not null,
  payload jsonb not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists caleris_configuration_revisions_lookup_idx
  on public.caleris_configuration_revisions (configuration_id, changed_at desc);

alter table public.caleris_configurations enable row level security;
alter table public.caleris_configuration_revisions enable row level security;

grant select, insert, update, delete on public.caleris_configurations to authenticated;
grant select, insert on public.caleris_configuration_revisions to authenticated;

drop policy if exists "Admins manage Caleris configurations" on public.caleris_configurations;
create policy "Admins manage Caleris configurations"
on public.caleris_configurations
for all
to authenticated
using (exists (
  select 1 from public.site_admins a where a.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.site_admins a where a.user_id = (select auth.uid())
));

drop policy if exists "Admins read Caleris configuration revisions" on public.caleris_configuration_revisions;
create policy "Admins read Caleris configuration revisions"
on public.caleris_configuration_revisions
for select
to authenticated
using (exists (
  select 1 from public.site_admins a where a.user_id = (select auth.uid())
));

drop policy if exists "Admins append Caleris configuration revisions" on public.caleris_configuration_revisions;
create policy "Admins append Caleris configuration revisions"
on public.caleris_configuration_revisions
for insert
to authenticated
with check (exists (
  select 1 from public.site_admins a where a.user_id = (select auth.uid())
));

create or replace function public.capture_caleris_configuration_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.caleris_configuration_revisions (
      configuration_id, category, config_key, title, payload, action, changed_by
    ) values (
      old.id, old.category, old.config_key, old.title, old.payload, 'DELETE', auth.uid()
    );
    return old;
  end if;

  insert into public.caleris_configuration_revisions (
    configuration_id, category, config_key, title, payload, action, changed_by
  ) values (
    new.id, new.category, new.config_key, new.title, new.payload, tg_op, auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists caleris_configuration_revision_audit on public.caleris_configurations;
create trigger caleris_configuration_revision_audit
after insert or update or delete on public.caleris_configurations
for each row execute function public.capture_caleris_configuration_revision();

-- Journalist is a legacy role and is not part of the current CALERIS role set.
alter table public.members drop constraint if exists members_role_check;
alter table public.members
  add constraint members_role_check
  check (role is null or role = any (array['Driver', 'Principal', 'Owner', 'Agent', 'FIA']::text[]));
