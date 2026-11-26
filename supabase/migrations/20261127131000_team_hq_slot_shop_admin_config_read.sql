create or replace function public.admin_get_team_hq_slot_shop_config()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare c public.caleris_team_hq_slot_shop_config%rowtype;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Admin only.'; end if;
 select * into c from public.caleris_team_hq_slot_shop_config where singleton=true;
 return jsonb_build_object('price_eur',c.price_eur,'is_active',coalesce(c.is_active,false));
end;$function$;
revoke all on function public.admin_get_team_hq_slot_shop_config() from public,anon;
grant execute on function public.admin_get_team_hq_slot_shop_config() to authenticated;