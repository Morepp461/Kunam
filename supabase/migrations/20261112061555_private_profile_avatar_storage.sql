alter table public.profiles add column if not exists avatar_path text;
grant insert (user_id, avatar_url, avatar_path, web_nickname, driver_nickname, updated_at) on public.profiles to authenticated;
grant update (avatar_url, avatar_path, web_nickname, driver_nickname, updated_at) on public.profiles to authenticated;

update storage.buckets set public = false where id = 'profile-avatars';

drop policy if exists "Public can view profile avatars" on storage.objects;
drop policy if exists "Users read own profile avatars" on storage.objects;
create policy "Users read own profile avatars" on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
  )
);
