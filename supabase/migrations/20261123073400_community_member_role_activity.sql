begin;

create or replace function public.caleris_member_team_activity()
returns trigger
language plpgsql security definer set search_path=public
as $member_team_activity$
declare
  old_team_name text;
  new_team_name text;
  actor_id uuid;
begin
  actor_id:=coalesce(public.caleris_current_member_id(),new.id);

  if old.team_id is distinct from new.team_id
    and (old.role='Driver' or new.role='Driver') then
    select name into old_team_name from public.teams where id=old.team_id;
    select name into new_team_name from public.teams where id=new.team_id;
    perform public.caleris_log_activity(
      actor_id,new.team_id,'team_transfer','Perpindahan tim',
      coalesce(new.character_name,'Driver')||' berpindah dari '||
        coalesce(old_team_name,'Independent')||' ke '||coalesce(new_team_name,'Independent')||'.',
      jsonb_build_object('source_id','member-team:'||new.id::text||':'||gen_random_uuid()::text,
        'previous_team_id',old.team_id,'new_team_id',new.team_id)
    );
  end if;

  if old.role is distinct from new.role
    and old.role not in('Admin','FIA')
    and new.role not in('Admin','FIA') then
    perform public.caleris_log_activity(
      actor_id,new.team_id,'member_role_change','Perubahan role member',
      coalesce(new.character_name,'Member')||' berubah role dari '||
        coalesce(old.role,'Unknown')||' menjadi '||coalesce(new.role,'Unknown')||'.',
      jsonb_build_object('source_id','member-role:'||new.id::text||':'||gen_random_uuid()::text,
        'previous_role',old.role,'new_role',new.role)
    );
  end if;
  return new;
end;
$member_team_activity$;

drop trigger if exists caleris_community_member_team_activity on public.members;
create trigger caleris_community_member_team_activity
after update of team_id,role on public.members
for each row execute function public.caleris_member_team_activity();

revoke all on function public.caleris_member_team_activity() from public,anon,authenticated;

commit;
