revoke all on function public.admin_set_development_shop_price(numeric,boolean) from public,anon;
revoke all on function public.member_purchase_development_tokens(numeric) from public,anon;
revoke all on function public.admin_snapshot_development_season(uuid) from public,anon;
grant execute on function public.admin_set_development_shop_price(numeric,boolean) to authenticated;
grant execute on function public.member_purchase_development_tokens(numeric) to authenticated;
grant execute on function public.admin_snapshot_development_season(uuid) to authenticated;