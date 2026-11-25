begin;

create or replace view public.public_economy_transaction_feed
with (security_barrier = true)
as
select
  transaction_row.id,
  transaction_row.event_type,
  transaction_row.amount,
  transaction_row.description,
  transaction_row.created_at,
  source_wallet.display_name as source_name,
  destination_wallet.display_name as destination_name,
  exists (
    select 1 from public.economy_transactions reversal
    where reversal.reversal_of = transaction_row.id
  ) as is_reversed,
  transaction_row.reversal_of
from public.economy_transactions transaction_row
join public.economy_wallet_directory source_wallet
  on source_wallet.id = transaction_row.source_account_id
join public.economy_wallet_directory destination_wallet
  on destination_wallet.id = transaction_row.destination_account_id;

revoke all on public.public_economy_transaction_feed from public, anon;
grant select on public.public_economy_transaction_feed to authenticated;

commit;
