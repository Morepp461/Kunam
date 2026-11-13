create table if not exists public.caleris_runtime_environment (
  singleton boolean primary key default true check (singleton),
  environment text not null check (environment in ('unconfigured','testing','production')),
  updated_at timestamptz not null default now()
);
insert into public.caleris_runtime_environment(singleton,environment)
values (true,'unconfigured') on conflict(singleton) do nothing;
alter table public.caleris_runtime_environment enable row level security;
revoke all on public.caleris_runtime_environment from anon, authenticated;

create table if not exists public.caleris_admin_test_personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null unique references public.members(id) on delete cascade,
  persona_label text not null check (persona_label in ('Owner','Driver')),
  created_at timestamptz not null default now(),
  unique(user_id,persona_label)
);
create index if not exists caleris_admin_test_personas_user_idx on public.caleris_admin_test_personas(user_id);
alter table public.caleris_admin_test_personas enable row level security;
revoke all on public.caleris_admin_test_personas from anon, authenticated;

create or replace function public.admin_create_test_persona_pair(p_team_id uuid,p_owner_name text,p_driver_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_owner uuid; v_driver uuid; v_env text;
begin
 if v_user is null or not exists(select 1 from public.site_admins where user_id=v_user) then raise exception 'Admin access required'; end if;
 select environment into v_env from public.caleris_runtime_environment where singleton=true;
 if v_env is distinct from 'testing' then raise exception 'Test personas can only be created in Testing database'; end if;
 if not exists(select 1 from public.teams where id=p_team_id) then raise exception 'Team not found'; end if;
 if exists(select 1 from public.members where team_id=p_team_id and role='Owner') then raise exception 'Team already has an Owner'; end if;
 if length(trim(coalesce(p_owner_name,''))) not between 2 and 80 or length(trim(coalesce(p_driver_name,''))) not between 2 and 80 then raise exception 'Nama persona wajib 2-80 karakter'; end if;
 if exists(select 1 from public.caleris_admin_test_personas where user_id=v_user) then raise exception 'Admin already has test personas'; end if;
 insert into public.members(character_name,role,team_id) values(trim(p_owner_name),'Owner',p_team_id) returning id into v_owner;
 insert into public.members(character_name,role,team_id) values(trim(p_driver_name),'Driver',p_team_id) returning id into v_driver;
 insert into public.caleris_admin_test_personas(user_id,member_id,persona_label) values(v_user,v_owner,'Owner'),(v_user,v_driver,'Driver');
 return jsonb_build_object('owner_member_id',v_owner,'driver_member_id',v_driver,'team_id',p_team_id);
end; $$;

create or replace function public.admin_list_test_personas()
returns table(member_id uuid,persona_label text,character_name text,team_id uuid,team_name text,is_active boolean)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or not exists(select 1 from public.site_admins where user_id=v_user) then raise exception 'Admin access required'; end if;
 return query select m.id,p.persona_label,m.character_name,m.team_id,t.name,(pr.member_id=m.id)
 from public.caleris_admin_test_personas p join public.members m on m.id=p.member_id
 left join public.teams t on t.id=m.team_id join public.profiles pr on pr.user_id=v_user
 where p.user_id=v_user order by case p.persona_label when 'Owner' then 1 else 2 end;
end; $$;

create or replace function public.admin_switch_test_persona(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_label text; v_env text;
begin
 if v_user is null or not exists(select 1 from public.site_admins where user_id=v_user) then raise exception 'Admin access required'; end if;
 select environment into v_env from public.caleris_runtime_environment where singleton=true;
 if v_env is distinct from 'testing' then raise exception 'Persona switching is only enabled in Testing database'; end if;
 select persona_label into v_label from public.caleris_admin_test_personas where user_id=v_user and member_id=p_member_id;
 if v_label is null then raise exception 'Persona does not belong to this Admin account'; end if;
 update public.profiles set member_id=p_member_id,updated_at=now() where user_id=v_user;
 if not found then raise exception 'Admin profile not found'; end if;
 return jsonb_build_object('member_id',p_member_id,'persona',v_label);
end; $$;

revoke all on function public.admin_create_test_persona_pair(uuid,text,text) from public;
revoke all on function public.admin_list_test_personas() from public;
revoke all on function public.admin_switch_test_persona(uuid) from public;
grant execute on function public.admin_create_test_persona_pair(uuid,text,text) to authenticated;
grant execute on function public.admin_list_test_personas() to authenticated;
grant execute on function public.admin_switch_test_persona(uuid) to authenticated;