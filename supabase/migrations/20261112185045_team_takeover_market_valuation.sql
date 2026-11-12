-- Expose the latest valuation only for teams that have opted into the Take Over market.
create or replace view public.caleris_team_directory
with (security_barrier=true) as
select t.id,t.name,t.division_key,t.takeover_listed,
 case when t.takeover_listed then (
  select v.total_valuation from public.caleris_team_valuations v
  where v.team_id=t.id order by v.assessed_at desc,v.id desc limit 1
 ) else null::numeric end as latest_valuation
from public.teams t;

revoke all on public.caleris_team_directory from public,anon,authenticated,service_role;
grant select on public.caleris_team_directory to authenticated;
