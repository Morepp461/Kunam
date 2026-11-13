begin;
create or replace function public.admin_generate_wealth_tax_assessments(p_season_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if p_actor_id is null or not exists(select 1 from public.site_admins a where a.user_id=p_actor_id) then
    raise exception 'Hanya Admin yang dapat menghitung Wealth Tax.';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  return public.admin_generate_wealth_tax_assessments(p_season_id);
end;
$$;
create or replace function public.admin_collect_wealth_tax(p_season_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if p_actor_id is null or not exists(select 1 from public.site_admins a where a.user_id=p_actor_id) then
    raise exception 'Hanya Admin yang dapat menagih Wealth Tax.';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  return public.admin_collect_wealth_tax(p_season_id);
end;
$$;
revoke all on function public.admin_generate_wealth_tax_assessments(uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_collect_wealth_tax(uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_generate_wealth_tax_assessments(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_collect_wealth_tax(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_generate_wealth_tax_assessments(uuid,uuid) to service_role;
grant execute on function public.admin_collect_wealth_tax(uuid,uuid) to service_role;
commit;
