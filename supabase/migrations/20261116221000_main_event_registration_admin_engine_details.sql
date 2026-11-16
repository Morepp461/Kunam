-- Expand the Admin registration queue with Team Owner engine and division selections.
create or replace function public.admin_list_member_registrations_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_result jsonb;
  v_row jsonb;
begin
  if (select auth.uid()) is null or not exists(
    select 1 from public.site_admins where user_id=(select auth.uid())
  ) then raise exception 'Akses administrator diperlukan.'; end if;

  v_base:=public.admin_list_member_registrations();
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'initial_division',r.initial_division,
      'engine_choice',r.engine_choice,
      'requested_engine_name',r.requested_engine_name,
      'selected_engine_id',r.selected_engine_id,
      'selected_engine_name',e.name
    ) order by r.created_at desc
  ),'[]'::jsonb)
  into v_result
  from jsonb_array_elements(coalesce(v_base,'[]'::jsonb)) as items(item)
  join public.caleris_member_registrations r on r.id=(item->>'id')::uuid
  left join public.caleris_engines e on e.id=r.selected_engine_id;
  return coalesce(v_result,'[]'::jsonb);
end;
$function$;


revoke all on function public.admin_list_member_registrations_v2() from public,anon;
grant execute on function public.admin_list_member_registrations_v2() to authenticated;
