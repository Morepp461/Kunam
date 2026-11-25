begin;

create or replace function public.get_public_economy_transactions(
  p_limit integer default 25,
  p_offset integer default 0,
  p_event_type text default null
)
returns table (
  id uuid,
  event_type text,
  amount numeric,
  description text,
  created_at timestamptz,
  source_name text,
  destination_name text,
  is_reversed boolean,
  reversal_of uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path=''
as $function$
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
    transaction_row.reversal_of,
    count(*) over() as total_count
  from public.economy_transactions transaction_row
  join public.economy_wallet_directory source_wallet
    on source_wallet.id = transaction_row.source_account_id
  join public.economy_wallet_directory destination_wallet
    on destination_wallet.id = transaction_row.destination_account_id
  where (select auth.uid()) is not null
    and (p_event_type is null or transaction_row.event_type = p_event_type)
  order by transaction_row.created_at desc, transaction_row.id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.get_public_economy_transactions(integer,integer,text) from public, anon;
grant execute on function public.get_public_economy_transactions(integer,integer,text) to authenticated;

commit;
