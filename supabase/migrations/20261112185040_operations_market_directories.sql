-- Safe authenticated read models for member/marketplace and FIA workflows.
-- Do not expose private members columns such as compatibility balance or member code.
create or replace view public.caleris_member_directory
with (security_barrier=true) as
select id,character_name,role,team_id,license
from public.members;

create or replace view public.caleris_team_directory
with (security_barrier=true) as
select id,name,division_key,takeover_listed
from public.teams;

revoke all on public.caleris_member_directory,public.caleris_team_directory
 from public,anon,authenticated,service_role;
grant select on public.caleris_member_directory,public.caleris_team_directory to authenticated;
