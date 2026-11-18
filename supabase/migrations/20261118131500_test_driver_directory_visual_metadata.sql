-- Provide visual identity metadata for the deliberately synthetic TEST driver personas only.
-- Real member avatar paths and profile privacy remain unchanged.
create or replace view public.caleris_member_directory as
select
  m.id,
  m.character_name,
  m.role,
  m.team_id,
  m.license,
  p.public_member_id,
  coalesce(p.nationality, demo.nationality) as nationality,
  p.avatar_path,
  case
    when m.character_name like 'TEST · %'
      then 'https://api.dicebear.com/9.x/personas/svg?seed=' ||
        replace(regexp_replace(m.character_name, '^TEST · ', ''), ' ', '%20') ||
        '&backgroundColor=b6e3f4,c0aede,d1d4f9'
    else null
  end as avatar_url,
  case when m.character_name like 'TEST · %' then coalesce(p.hometown, demo.hometown) else null end as hometown
from public.members m
left join public.profiles p on p.member_id = m.id
left join (values
  ('TEST · Aiden Mercer','United Kingdom','Bristol, United Kingdom'),
  ('TEST · Luca Bennett','Australia','Perth, Australia'),
  ('TEST · Mateo Silva','Brazil','São Paulo, Brazil'),
  ('TEST · Noah Fischer','Germany','Munich, Germany'),
  ('TEST · Ethan Laurent','France','Nice, France'),
  ('TEST · Kai Nakamura','Japan','Yokohama, Japan'),
  ('TEST · Theo Andersson','Sweden','Gothenburg, Sweden'),
  ('TEST · Rafael Costa','Portugal','Porto, Portugal'),
  ('TEST · Milan Petrov','Serbia','Belgrade, Serbia'),
  ('TEST · Oscar Lind','Denmark','Copenhagen, Denmark'),
  ('TEST · Enzo Moreau','France','Bordeaux, France'),
  ('TEST · Leon Hartmann','Germany','Hamburg, Germany'),
  ('TEST · Adrian Keller','Switzerland','Basel, Switzerland'),
  ('TEST · Arman Wijaya','Indonesia','Bandung, Indonesia'),
  ('TEST · Dario Novak','Croatia','Zagreb, Croatia'),
  ('TEST · Felix Romano','Italy','Rome, Italy'),
  ('TEST · Gabriel Santos','Brazil','Rio de Janeiro, Brazil'),
  ('TEST · Hugo Martin','Spain','Valencia, Spain'),
  ('TEST · Jasper Cole','United States','Austin, United States'),
  ('TEST · Mikael Rossi','Italy','Turin, Italy'),
  ('TEST · Nico Tanaka','Japan','Nagoya, Japan'),
  ('TEST · Ren Ito','Japan','Sapporo, Japan'),
  ('TEST · Soren Dahl','Norway','Oslo, Norway'),
  ('TEST · Tomas Varga','Hungary','Budapest, Hungary')
) as demo(character_name,nationality,hometown) on demo.character_name=m.character_name;