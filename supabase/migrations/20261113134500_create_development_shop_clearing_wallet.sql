alter table public.economy_wallet_accounts drop constraint if exists economy_wallet_accounts_account_kind_check;
alter table public.economy_wallet_accounts add constraint economy_wallet_accounts_account_kind_check check(account_kind = any(array['public_member','driver','team_owner','team','vreeo_bank','sponsor_source','development_shop']::text[]));
alter table public.economy_wallet_accounts drop constraint if exists economy_wallet_owner_shape;
alter table public.economy_wallet_accounts add constraint economy_wallet_owner_shape check (
 ((account_kind='public_member') and profile_user_id is not null and member_id is null and team_id is null)
 or ((account_kind in ('driver','team_owner')) and profile_user_id is null and member_id is not null and team_id is null)
 or ((account_kind='team') and profile_user_id is null and member_id is null and team_id is not null)
 or ((account_kind in ('vreeo_bank','sponsor_source','development_shop')) and profile_user_id is null and member_id is null and team_id is null)
);
create unique index if not exists economy_wallet_development_shop_unique on public.economy_wallet_accounts(account_kind) where account_kind='development_shop';
insert into public.economy_wallet_accounts(account_kind,balance,is_active) values('development_shop',0,true) on conflict do nothing;