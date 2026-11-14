create or replace function public.admin_update_user_roles(
  p_target_user_id uuid,
  p_preferred_role text,
  p_assigned_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_member public.members%rowtype;
begin
  if v_actor is null or not exists (
    select 1 from public.site_admins a where a.user_id = v_actor
  ) then
    raise exception 'Akses administrator diperlukan.';
  end if;

  if p_target_user_id is null then
    raise exception 'Target akun tidak valid.';
  end if;

  if p_preferred_role is not null
    and p_preferred_role not in ('FIA', 'Team Owner', 'Driver') then
    raise exception 'Preferensi role tidak valid.';
  end if;

  if p_assigned_role is not null
    and p_assigned_role not in ('Driver', 'Principal', 'Owner', 'Agent', 'FIA') then
    raise exception 'Role aktif tidak valid.';
  end if;

  select * into v_profile
  from public.profiles
  where user_id = p_target_user_id
  for update;

  if not found then
    insert into public.profiles(user_id, preferred_role, updated_at)
    values (p_target_user_id, p_preferred_role, now())
    returning * into v_profile;
  else
    update public.profiles
    set preferred_role = p_preferred_role, updated_at = now()
    where user_id = p_target_user_id
    returning * into v_profile;
  end if;

  if v_profile.member_id is null then
    if p_assigned_role is not null then
      raise exception 'Akun belum memiliki karakter/member. Hubungkan member melalui proses onboarding terlebih dahulu.';
    end if;
    return jsonb_build_object(
      'ok', true,
      'target_user_id', p_target_user_id,
      'preferred_role', p_preferred_role,
      'assigned_role', null
    );
  end if;

  select * into v_member
  from public.members
  where id = v_profile.member_id
  for update;

  if not found then
    raise exception 'Record member yang terhubung tidak ditemukan.';
  end if;

  if v_member.role = 'Owner'
    and p_assigned_role is distinct from 'Owner'
    and v_member.team_id is not null then
    raise exception 'Role Owner tidak dapat dilepas selama member masih menjadi pemilik tim. Selesaikan proses Take Over/perpindahan kepemilikan terlebih dahulu.';
  end if;

  if p_assigned_role = 'Owner' and v_member.team_id is null then
    raise exception 'Role Owner memerlukan tim yang sudah terhubung.';
  end if;

  update public.members
  set role = p_assigned_role
  where id = v_member.id;

  return jsonb_build_object(
    'ok', true,
    'target_user_id', p_target_user_id,
    'preferred_role', p_preferred_role,
    'assigned_role', p_assigned_role,
    'member_id', v_member.id
  );
end;
$$;

revoke all on function public.admin_update_user_roles(uuid, text, text) from public, anon;
grant execute on function public.admin_update_user_roles(uuid, text, text) to authenticated;