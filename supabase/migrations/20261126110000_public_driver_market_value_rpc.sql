begin;

-- The market-value tables intentionally deny direct table access to service_role.
-- Expose only the single public Driver value needed by the public member-directory Edge Function.
create or replace function public.caleris_get_public_driver_market_value(p_member_id uuid)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select mv.market_value_eur
  from public.members m
  join public.profiles p on p.member_id=m.id
  left join public.caleris_driver_market_values mv on mv.member_id=m.id
  where m.id=p_member_id
    and m.role='Driver'
    and p.account_status in ('public','active','admin')
  limit 1;
$function$;

revoke all on function public.caleris_get_public_driver_market_value(uuid) from public,anon,authenticated;
grant execute on function public.caleris_get_public_driver_market_value(uuid) to service_role;

comment on function public.caleris_get_public_driver_market_value(uuid) is
  'Returns only one Driver market value for an already-public member profile; used by the member-directory Edge Function.';

commit;