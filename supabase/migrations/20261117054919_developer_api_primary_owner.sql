create table if not exists public.caleris_developer_api_owner (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
insert into public.caleris_developer_api_owner (singleton, owner_user_id)
select true, admin.user_id
from public.site_admins admin
order by admin.created_at asc, admin.user_id asc
limit 1
on conflict (singleton) do nothing;
alter table public.caleris_developer_api_owner enable row level security;
revoke all on public.caleris_developer_api_owner from anon, authenticated;
grant select on public.caleris_developer_api_owner to authenticated;
drop policy if exists "Caleris API owner can read owner identity" on public.caleris_developer_api_owner;
create policy "Caleris API owner can read owner identity"
  on public.caleris_developer_api_owner for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists "Caleris API owner can read own keys" on public.caleris_api_keys;
drop policy if exists "Caleris API owner can create own keys" on public.caleris_api_keys;
drop policy if exists "Caleris API owner can revoke own keys" on public.caleris_api_keys;
create policy "Caleris API owner can read own keys"
  on public.caleris_api_keys for select to authenticated
  using (auth.uid() = owner_user_id and owner_user_id = (select owner_user_id from public.caleris_developer_api_owner where singleton = true));
create policy "Caleris API owner can create own keys"
  on public.caleris_api_keys for insert to authenticated
  with check (auth.uid() = owner_user_id and owner_user_id = (select owner_user_id from public.caleris_developer_api_owner where singleton = true));
create policy "Caleris API owner can revoke own keys"
  on public.caleris_api_keys for update to authenticated
  using (auth.uid() = owner_user_id and owner_user_id = (select owner_user_id from public.caleris_developer_api_owner where singleton = true))
  with check (auth.uid() = owner_user_id and owner_user_id = (select owner_user_id from public.caleris_developer_api_owner where singleton = true));