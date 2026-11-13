-- Member role wallets are permanent financial records.
-- A role change must never disable a wallet that may still hold balance or
-- be referenced by an outstanding Cash Loan.

begin;

-- Restore any historical member role wallets that were disabled by the old
-- role-change trigger. This preserves their IDs, balances, and ledger links.
update public.economy_wallet_accounts
set is_active=true, updated_at=now()
where account_kind in ('driver','team_owner')
  and member_id is not null
  and is_active=false;

-- Create wallets when a member first receives the corresponding role, but
-- never deactivate an existing role wallet when the member leaves that role.
create or replace function private.ensure_member_economy_wallets()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.role='Driver' then
    insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
    values('driver',new.id,true)
    on conflict(member_id) where account_kind='driver'
    do update set is_active=true,updated_at=now();
  end if;

  if new.role='Owner' then
    insert into public.economy_wallet_accounts(account_kind,member_id,is_active)
    values('team_owner',new.id,true)
    on conflict(member_id) where account_kind='team_owner'
    do update set is_active=true,updated_at=now();
  end if;

  return new;
end;
$$;

-- Enforce the permanent-wallet rule at the table boundary as well, so a
-- future trigger or workflow cannot silently deactivate a role wallet.
create or replace function private.guard_member_economy_wallet_active()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.account_kind in ('driver','team_owner') and new.is_active is not true then
    raise exception 'Member role wallets are permanent and cannot be deactivated.';
  end if;
  return new;
end;
$$;

drop trigger if exists economy_member_wallet_permanent_active
  on public.economy_wallet_accounts;
create trigger economy_member_wallet_permanent_active
before insert or update on public.economy_wallet_accounts
for each row
execute function private.guard_member_economy_wallet_active();

revoke all on function private.ensure_member_economy_wallets()
  from public,anon,authenticated,service_role;
revoke all on function private.guard_member_economy_wallet_active()
  from public,anon,authenticated,service_role;

commit;
