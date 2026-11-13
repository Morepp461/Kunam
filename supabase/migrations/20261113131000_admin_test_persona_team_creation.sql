drop function if exists public.admin_create_test_persona_pair(uuid,text,text);
create or replace function public.admin_create_test_persona_pair(p_team_name text,p_owner_name text,p_driver_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_team uuid; v_owner uuid; v_driver uuid; v_env text;
begin
 if v_user is null or not exists(select 1 from public.site_admins where user_id=v_user) then raise exception 'Admin access required'; end if;
 select environment into v_env from public.caleris_runtime_environment where singleton=true;
 if v_env is distinct from 'testing' then raise exception 'Test personas can only be created in Testing database'; end if;
 if length(trim(coalesce(p_team_name,''))) not between 3 and 80 or length(trim(coalesce(p_owner_name,''))) not between 2 and 80 or length(trim(coalesce(p_driver_name,''))) not between 2 and 80 then raise exception 'Nama tim 3-80 karakter dan nama persona 2-80 karakter wajib diisi'; end if;
 if left(upper(trim(p_team_name)),6)<>'TEST ·' then raise exception 'Nama tim persona wajib diawali TEST ·'; end if;
 if exists(select 1 from public.caleris_admin_test_personas where user_id=v_user) then raise exception 'Admin already has test personas'; end if;
 insert into public.teams(name) values(trim(p_team_name)) returning id into v_team;
 insert into public.members(character_name,role,team_id) values(trim(p_owner_name),'Owner',v_team) returning id into v_owner;
 insert into public.members(character_name,role,team_id) values(trim(p_driver_name),'Driver',v_team) returning id into v_driver;
 insert into public.caleris_admin_test_personas(user_id,member_id,persona_label) values(v_user,v_owner,'Owner'),(v_user,v_driver,'Driver');
 return jsonb_build_object('team_id',v_team,'owner_member_id',v_owner,'driver_member_id',v_driver);
end; $$;
revoke all on function public.admin_create_test_persona_pair(text,text,text) from public;
grant execute on function public.admin_create_test_persona_pair(text,text,text) to authenticated;