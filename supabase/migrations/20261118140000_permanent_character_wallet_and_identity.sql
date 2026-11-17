begin;

-- One account owns one permanent member/character record. Once linked, a
-- profile cannot silently detach from or be reassigned to another character.
create or replace function private.guard_permanent_profile_character()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.member_id is not null and new.member_id is distinct from old.member_id then
    raise exception 'Karakter akun bersifat permanen dan tidak dapat diganti atau dilepas.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_permanent_character_link on public.profiles;
create trigger profiles_permanent_character_link
before update of member_id on public.profiles
for each row
execute function private.guard_permanent_profile_character();

-- Keep one canonical personal balance for the current character role:
-- Driver -> Driver wallet; Owner -> Team Owner wallet; FIA/no active role ->
-- Public Member wallet. Legacy wallet rows remain intact and are zeroed only
-- through immutable double-entry transfers, preserving their ledger history.
create or replace function private.consolidate_member_character_wallets(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_user_id uuid;
  v_target_kind text;
  v_target_wallet uuid;
  v_source record;
  v_result jsonb;
begin
  if p_member_id is null then return; end if;

  select m.role,p.user_id
  into v_role,v_user_id
  from public.members m
  left join public.profiles p on p.member_id=m.id
  where m.id=p_member_id
  for update of m;

  if not found or v_user_id is null then
    return;
  end if;

  v_target_kind:=case
    when v_role='Driver' then 'driver'
    when v_role='Owner' then 'team_owner'
    else 'public_member'
  end;

  if v_target_kind='public_member' then
    insert into public.economy_wallet_accounts(account_kind,profile_user_id,is_active)
    values('public_member',v_user_id,true)
    on conflict(profile_user_id) where account_kind='public_member'
    do update set is_active=true,updated_at=now();
    select id into v_target_wallet
    from public.economy_wallet_accounts
    where account_kind='public_member' and profile_user_id=v_user_id and is_active;
  else
    insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
    values(v_target_kind,p_member_id,true)
    on conflict(member_id) where account_kind=v_target_kind
    do update set is_active=true,updated_at=now();
    select id into v_target_wallet
    from public.economy_wallet_accounts
    where account_kind=v_target_kind and member_id=p_member_id and is_active;
  end if;

  if v_target_wallet is null then
    raise exception 'Wallet karakter canonical tidak tersedia untuk member %.',p_member_id;
  end if;

  -- Lock all personal wallet rows in a deterministic order before moving funds.
  perform 1
  from public.economy_wallet_accounts w
  where (w.account_kind='public_member' and w.profile_user_id=v_user_id)
     or (w.account_kind in ('driver','team_owner') and w.member_id=p_member_id)
  order by w.id
  for update;

  for v_source in
    select w.id,w.account_kind,w.balance
    from public.economy_wallet_accounts w
    where ((w.account_kind='public_member' and w.profile_user_id=v_user_id)
       or (w.account_kind in ('driver','team_owner') and w.member_id=p_member_id))
      and w.id<>v_target_wallet
    order by w.id
  loop
    if v_source.balance<0 then
      raise exception 'Saldo wallet karakter negatif pada member %. Konsolidasi dibatalkan.',p_member_id;
    end if;
    if v_source.balance=0 then
      continue;
    end if;

    v_result:=private.post_economy_transaction(
      v_source.id,
      v_target_wallet,
      v_source.balance,
      'transfer',
      'Konsolidasi saldo karakter permanen · '||p_member_id::text,
      'character-wallet-consolidation:'||p_member_id::text||':'||v_source.id::text||':'||gen_random_uuid()::text,
      null,
      jsonb_build_object(
        'reason','permanent_character_wallet',
        'member_id',p_member_id,
        'from_account_kind',v_source.account_kind,
        'to_account_kind',v_target_kind
      ),
      null,
      false
    );

    if coalesce(v_result->>'status','') not in ('posted','duplicate') then
      raise exception 'Konsolidasi saldo karakter gagal untuk member %.',p_member_id;
    end if;
  end loop;
end;
$$;

create or replace function private.sync_member_character_wallet()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.consolidate_member_character_wallets(new.id);
  return new;
end;
$$;

create or replace function private.sync_profile_character_wallet()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.member_id is not null then
    perform private.consolidate_member_character_wallets(new.member_id);
  end if;
  return new;
end;
$$;

drop trigger if exists zz_members_character_wallet_sync on public.members;
create trigger zz_members_character_wallet_sync
after insert or update of role on public.members
for each row
execute function private.sync_member_character_wallet();

drop trigger if exists zz_profiles_character_wallet_sync on public.profiles;
create trigger zz_profiles_character_wallet_sync
after insert or update of member_id on public.profiles
for each row
execute function private.sync_profile_character_wallet();

-- Backfill all linked accounts. Each member ends with one non-zero personal
-- wallet according to the current role. Team wallets are never touched.
do $$
declare
  v_member record;
begin
  for v_member in
    select p.member_id
    from public.profiles p
    where p.member_id is not null
    order by p.member_id
  loop
    perform private.consolidate_member_character_wallets(v_member.member_id);
  end loop;
end;
$$;

revoke all on function private.guard_permanent_profile_character() from public,anon,authenticated,service_role;
revoke all on function private.consolidate_member_character_wallets(uuid) from public,anon,authenticated,service_role;
revoke all on function private.sync_member_character_wallet() from public,anon,authenticated,service_role;
revoke all on function private.sync_profile_character_wallet() from public,anon,authenticated,service_role;

commit;
