-- A team cannot open a Take Over listing until Admin has entered a valuation snapshot.
create or replace function public.member_set_team_takeover_listing(p_is_listed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.members%rowtype;v_valuation_id uuid;
begin
 if p_is_listed is null then raise exception 'Status listing tidak valid.'; end if;
 select m.* into v_member from public.profiles p
 join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then
  raise exception 'Akses Team Owner/Principal diperlukan.';
 end if;
 if p_is_listed then
  select id into v_valuation_id from public.caleris_team_valuations
   where team_id=v_member.team_id order by assessed_at desc,id desc limit 1;
  if v_valuation_id is null then raise exception 'Admin harus membuat valuation snapshot tim sebelum listing dibuka.'; end if;
 end if;
 update public.teams set takeover_listed=p_is_listed where id=v_member.team_id;
 return jsonb_build_object('team_id',v_member.team_id,'takeover_listed',p_is_listed,'valuation_id',v_valuation_id);
end;
$$;
revoke all on function public.member_set_team_takeover_listing(boolean) from public,anon,service_role;
grant execute on function public.member_set_team_takeover_listing(boolean) to authenticated;
