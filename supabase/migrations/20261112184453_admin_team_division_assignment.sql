create or replace function public.admin_set_team_division(p_team_id uuid,p_division_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat menetapkan tier tim.'; end if;
 if not exists(select 1 from public.teams where id=p_team_id) then raise exception 'Tim tidak ditemukan.'; end if;
 if p_division_key is not null and not exists(select 1 from public.license_season_divisions where division_key=p_division_key) then
  raise exception 'Tier harus berasal dari division key yang sudah terdaftar di License Scoring Engine.';
 end if;
 update public.teams set division_key=p_division_key where id=p_team_id;
 return jsonb_build_object('team_id',p_team_id,'division_key',p_division_key);
end;
$$;
revoke all on function public.admin_set_team_division(uuid,text) from public,anon,service_role;
grant execute on function public.admin_set_team_division(uuid,text) to authenticated;
