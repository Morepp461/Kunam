-- Add the public Member ID to the safe directory read model for profile actions.
create or replace view public.caleris_member_directory
with (security_barrier=true) as
select m.id,p.public_member_id,m.character_name,m.role,m.team_id,m.license
from public.members m
left join public.profiles p on p.member_id=m.id;

revoke all on public.caleris_member_directory from public,anon,authenticated,service_role;
grant select on public.caleris_member_directory to authenticated;
