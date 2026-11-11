-- CALERIS MASTERS schema foundation. NOT applied to any database by this change.
-- Execute only after creating the dedicated Caleris Supabase project.
-- First Discord user must be added to site_admins manually from SQL Editor after first login.
create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  content jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
alter table public.site_content enable row level security;
alter table public.site_settings enable row level security;
drop policy if exists "Admins can verify own admin record" on public.site_admins;
create policy "Admins can verify own admin record" on public.site_admins
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Public can read published site content" on public.site_content;
create policy "Public can read published site content" on public.site_content
  for select to anon, authenticated using (published = true);
drop policy if exists "Admins manage site content" on public.site_content;
create policy "Admins manage site content" on public.site_content
  for all to authenticated
  using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
drop policy if exists "Public can read community invite setting" on public.site_settings;
create policy "Public can read community invite setting" on public.site_settings
  for select to anon, authenticated using (key = 'community_invite_url');
drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Admins manage site settings" on public.site_settings
  for all to authenticated
  using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
grant select on public.site_admins to authenticated;
grant select on public.site_content, public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_content, public.site_settings to authenticated;

-- After the first admin signs in with Discord, copy that auth.users.id from Supabase
-- Authentication > Users, then seed the trusted admin record:
-- insert into public.site_admins (user_id) values ('<AUTH_USER_UUID>');
-- Do not expose any client-side path that can insert into site_admins.
-- Discord callback: https://<PROJECT_REF>.supabase.co/auth/v1/callback
-- Configure Discord Client ID/Secret in Supabase Dashboard > Authentication > Providers.
