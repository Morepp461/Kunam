create table if not exists public.caleris_user_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_member_id uuid references public.members(id) on delete set null,
  action_type text not null check (action_type in ('warning','temporary_ban','permanent_ban','unban','team_assignment')),
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  duration_days integer,
  expires_at timestamptz,
  previous_account_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint caleris_user_moderation_duration_check check (
    (action_type='temporary_ban' and duration_days between 1 and 365 and expires_at is not null)
    or (action_type<>'temporary_ban' and duration_days is null)
  )
);
create index if not exists caleris_user_moderation_target_idx
  on public.caleris_user_moderation_actions(target_user_id,created_at desc);
create index if not exists caleris_user_moderation_expiry_idx
  on public.caleris_user_moderation_actions(expires_at) where action_type='temporary_ban';

alter table public.caleris_user_moderation_actions enable row level security;
revoke all on public.caleris_user_moderation_actions from anon,authenticated;
grant select on public.caleris_user_moderation_actions to authenticated;
grant all on public.caleris_user_moderation_actions to service_role;

drop policy if exists "Users and admins read moderation history" on public.caleris_user_moderation_actions;
create policy "Users and admins read moderation history"
on public.caleris_user_moderation_actions for select to authenticated
using (
  target_user_id=(select auth.uid())
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
);

create or replace function public.admin_assign_member_team(
  p_member_id uuid,
  p_team_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=(select auth.uid());
  v_member public.members%rowtype;
  v_previous_team uuid;
  v_target_user uuid;
begin
  if v_actor is null or not exists(select 1 from public.site_admins a where a.user_id=v_actor) then
    raise exception 'Akses administrator diperlukan.';
  end if;
  if p_member_id is null or length(btrim(coalesce(p_reason,'')))<3 or length(p_reason)>2000 then
    raise exception 'Member dan alasan penyesuaian wajib diisi.';
  end if;
  select * into v_member from public.members where id=p_member_id for update;
  if not found then raise exception 'Member tidak ditemukan.'; end if;
  if p_team_id is not null and not exists(select 1 from public.teams where id=p_team_id) then
    raise exception 'Tim tujuan tidak ditemukan.';
  end if;
  if v_member.role='FIA' and p_team_id is not null then
    raise exception 'Role FIA tidak dapat ditempatkan pada tim.';
  end if;
  if v_member.role='Owner' and v_member.team_id is not null and p_team_id is distinct from v_member.team_id then
    raise exception 'Perpindahan Team Owner wajib melalui workflow Take Over.';
  end if;
  if v_member.role='Owner' and p_team_id is not null and exists(
    select 1 from public.members m where m.team_id=p_team_id and m.role='Owner' and m.id<>v_member.id
  ) then raise exception 'Tim sudah memiliki Team Owner.'; end if;
  if v_member.role='Driver' and exists(
    select 1 from public.economy_driver_contracts c
    where c.member_id=v_member.id and c.status='active'
      and c.team_id is distinct from p_team_id
  ) then raise exception 'Kontrak aktif Driver harus diselesaikan melalui workflow kontrak/transfer sebelum pindah tim.'; end if;

  v_previous_team:=v_member.team_id;
  update public.members set team_id=p_team_id where id=v_member.id;
  select p.user_id into v_target_user from public.profiles p where p.member_id=v_member.id order by p.created_at limit 1;
  if v_target_user is not null then
    insert into public.caleris_user_moderation_actions(target_user_id,target_member_id,action_type,reason,metadata,created_by)
    values(v_target_user,v_member.id,'team_assignment',btrim(p_reason),
      jsonb_build_object('previous_team_id',v_previous_team,'new_team_id',p_team_id),v_actor);
  end if;
  return jsonb_build_object('ok',true,'member_id',v_member.id,'previous_team_id',v_previous_team,'team_id',p_team_id);
end;
$function$;
revoke all on function public.admin_assign_member_team(uuid,uuid,text) from public,anon;
grant execute on function public.admin_assign_member_team(uuid,uuid,text) to authenticated;
