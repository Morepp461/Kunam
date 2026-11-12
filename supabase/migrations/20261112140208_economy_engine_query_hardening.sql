-- Cover economy foreign keys and consolidate wallet SELECT policy predicates.

create index if not exists economy_transactions_created_by_idx
  on public.economy_transactions(created_by) where created_by is not null;
create index if not exists economy_reward_claims_member_idx
  on public.economy_reward_claims(member_id);
create index if not exists economy_reward_claims_source_idx
  on public.economy_reward_claims(source_id);

drop policy if exists "Admins read all economy wallets" on public.economy_wallet_accounts;
drop policy if exists "Members read their economy wallets" on public.economy_wallet_accounts;
drop policy if exists "Members and admins read economy wallets" on public.economy_wallet_accounts;
create policy "Members and admins read economy wallets" on public.economy_wallet_accounts
for select to authenticated using (
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or (account_kind='public_member' and profile_user_id=(select auth.uid()))
  or (member_id is not null and exists(
    select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=economy_wallet_accounts.member_id
  ))
  or (team_id is not null and exists(
    select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.team_id=economy_wallet_accounts.team_id
  ))
);
