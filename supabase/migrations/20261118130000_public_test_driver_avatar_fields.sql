-- Expose demo-only remote avatar URLs and hometowns through the public member directory.
-- Real members continue using the existing storage-backed avatar_path flow.
create or replace view public.caleris_member_directory as
select
  m.id,
  m.character_name,
  m.role,
  m.team_id,
  m.license,
  p.public_member_id,
  p.nationality,
  p.avatar_path,
  case when m.character_name like 'TEST · %' then p.avatar_url else null end as avatar_url,
  case when m.character_name like 'TEST · %' then p.hometown else null end as hometown
from public.members m
left join public.profiles p on p.member_id = m.id;
