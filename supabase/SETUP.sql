-- CALERIS MASTERS schema foundation. NOT applied to any database by this change.
-- Execute only after creating the dedicated Caleris Supabase project and verifying public.is_admin().
create table if not exists public.site_content (id uuid primary key default gen_random_uuid(), slug text not null unique, content jsonb not null default '{}'::jsonb, published boolean not null default false, updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now());
create table if not exists public.site_settings (key text primary key, value jsonb not null, updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now());
alter table public.site_content enable row level security;
alter table public.site_settings enable row level security;
drop policy if exists "Public can read published site content" on public.site_content;
create policy "Public can read published site content" on public.site_content for select to anon, authenticated using (published = true);
drop policy if exists "Admins manage site content" on public.site_content;
create policy "Admins manage site content" on public.site_content for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Public can read community invite setting" on public.site_settings;
create policy "Public can read community invite setting" on public.site_settings for select to anon, authenticated using (key = 'community_invite_url');
drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Admins manage site settings" on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.site_content, public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_content, public.site_settings to authenticated;
-- Discord callback: https://<PROJECT_REF>.supabase.co/auth/v1/callback
-- Configure Discord Client ID/Secret in Supabase Dashboard > Authentication > Providers.
