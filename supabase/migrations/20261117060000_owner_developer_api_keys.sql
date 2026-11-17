create table if not exists public.caleris_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text not null check (length(key_prefix) between 12 and 32),
  scopes text[] not null check (
    cardinality(scopes) > 0
    and scopes <@ array['circuits:read','seasons:read','teams:read','drivers:read','rounds:read']::text[]
  ),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists caleris_api_keys_owner_created_idx
  on public.caleris_api_keys (owner_user_id, created_at desc);
create index if not exists caleris_api_keys_active_hash_idx
  on public.caleris_api_keys (key_hash)
  where revoked_at is null;

alter table public.caleris_api_keys enable row level security;
revoke all on public.caleris_api_keys from anon, authenticated;
grant select, insert, update (revoked_at) on public.caleris_api_keys to authenticated;

create policy "Caleris API owner can read own keys"
  on public.caleris_api_keys for select to authenticated
  using (auth.uid() = owner_user_id and owner_user_id = 'cf35c0be-f660-49ab-a56f-9a3080b8252d'::uuid);

create policy "Caleris API owner can create own keys"
  on public.caleris_api_keys for insert to authenticated
  with check (auth.uid() = owner_user_id and owner_user_id = 'cf35c0be-f660-49ab-a56f-9a3080b8252d'::uuid);

create policy "Caleris API owner can revoke own keys"
  on public.caleris_api_keys for update to authenticated
  using (auth.uid() = owner_user_id and owner_user_id = 'cf35c0be-f660-49ab-a56f-9a3080b8252d'::uuid)
  with check (auth.uid() = owner_user_id and owner_user_id = 'cf35c0be-f660-49ab-a56f-9a3080b8252d'::uuid);
