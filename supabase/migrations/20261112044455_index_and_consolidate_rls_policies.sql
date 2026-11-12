create index if not exists contracts_member_id_idx on public.contracts(member_id);
create index if not exists contracts_team_id_idx on public.contracts(team_id);
create index if not exists members_team_id_idx on public.members(team_id);
create index if not exists site_content_updated_by_idx on public.site_content(updated_by);
create index if not exists site_settings_updated_by_idx on public.site_settings(updated_by);

drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Users and admins read profiles" on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

drop policy if exists "Public can read published site content" on public.site_content;
drop policy if exists "Admins manage site content" on public.site_content;
create policy "Read published content or admin" on public.site_content for select to anon, authenticated
using (published = true or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
create policy "Admins insert site content" on public.site_content for insert to authenticated
with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
create policy "Admins update site content" on public.site_content for update to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
create policy "Admins delete site content" on public.site_content for delete to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

drop policy if exists "Public can read community invite setting" on public.site_settings;
drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Read community setting or admin" on public.site_settings for select to anon, authenticated
using (key = 'community_invite_url' or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
create policy "Admins insert site settings" on public.site_settings for insert to authenticated
with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
create policy "Admins update site settings" on public.site_settings for update to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
create policy "Admins delete site settings" on public.site_settings for delete to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));
