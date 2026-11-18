-- Idempotent visual/demo data for the TEST team and driver personas only.
-- This seed intentionally does not modify production data or non-TEST members.
with team_seed(name, main_color, secondary_color, nation, hometown, founded_year, logo_seed, description) as (
  values
    ('TEST · Apex GP','#173B5E','#E6B84B','Indonesia','Jakarta, Indonesia',2012,'Apex GP','Precision-led Grand Prix outfit built around measured development.'),
    ('TEST · Vortex Motorsport','#123B45','#52B7C5','Indonesia','Surabaya, Indonesia',2014,'Vortex Motorsport','An engineering-first team with a bold coastal identity.'),
    ('TEST · Northstar Racing','#14263F','#C8D4E2','United Kingdom','Oxford, United Kingdom',2008,'Northstar Racing','A disciplined racing operation focused on consistency.'),
    ('TEST · Solstice Racing','#244A37','#D5B65A','Italy','Modena, Italy',2011,'Solstice Racing','A heritage-minded team with a modern technical philosophy.'),
    ('TEST · Titan Motorsport','#30343B','#B94B42','Germany','Stuttgart, Germany',2006,'Titan Motorsport','A durable, high-performance motorsport organisation.'),
    ('TEST · Velocity Works','#1D3F78','#E58A3A','Japan','Osaka, Japan',2016,'Velocity Works','A fast-moving constructor built around innovation.'),
    ('TEST · Aurora Motorsport','#39285F','#D88EBB','Japan','Tokyo, Japan',2017,'Aurora Motorsport','A progressive team with a distinctive night-sky identity.'),
    ('TEST · Cobalt Motorsport','#164A78','#8AC6E8','Canada','Montreal, Canada',2015,'Cobalt Motorsport','A technical team known for cool-headed execution.'),
    ('TEST · Falcon GP','#34302A','#D77B32','Italy','Milan, Italy',2009,'Falcon GP','An ambitious outfit with a sharp competitive edge.'),
    ('TEST · Orion Racing','#252B57','#D1B76A','Australia','Melbourne, Australia',2013,'Orion Racing','A forward-looking team with a strong race operations culture.'),
    ('TEST · Summit GP','#245247','#D9DED4','Switzerland','Zurich, Switzerland',2018,'Summit GP','A precision-focused team aiming for steady progress.'),
    ('TEST · Vertex Racing','#762C36','#E5E1D8','France','Lyon, France',2010,'Vertex Racing','A focused racing team built around detail and teamwork.'),
    ('TEST · Admin Test Team','#35383D','#A6A9AE','Indonesia','Malang, Indonesia',2020,'Admin Test Team','Administrative test team for visual and workflow checks.')
)
insert into public.caleris_team_profiles
  (team_id,logo_url,country_of_origin,base_location,founded_year,description,history,vision,long_term_target,main_color,secondary_color,updated_at)
select t.id,
  'https://api.dicebear.com/9.x/shapes/svg?seed='||replace(s.logo_seed,' ','%20')||'&backgroundColor='||substr(replace(s.main_color,'#',''),1,6),
  s.nation,s.hometown,s.founded_year,s.description,
  s.description,
  'Build a competitive and sustainable team identity.',
  'Compete consistently at the front of the division.',
  s.main_color,s.secondary_color,now()
from team_seed s
join public.teams t on t.name=s.name
on conflict (team_id) do update set
  logo_url=excluded.logo_url,
  country_of_origin=excluded.country_of_origin,
  base_location=excluded.base_location,
  founded_year=excluded.founded_year,
  description=excluded.description,
  history=excluded.history,
  vision=excluded.vision,
  long_term_target=excluded.long_term_target,
  main_color=excluded.main_color,
  secondary_color=excluded.secondary_color,
  updated_at=now();

with driver_seed(character_name,nationality,hometown) as (
  values
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
)
update public.profiles p
set avatar_url='https://api.dicebear.com/9.x/personas/svg?seed='||replace(regexp_replace(m.character_name,'^TEST · ',''),' ','%20')||'&backgroundColor=b6e3f4,c0aede,d1d4f9',
    avatar_path=null,
    nationality=d.nationality,
    hometown=d.hometown,
    updated_at=now()
from public.members m
join driver_seed d on d.character_name=m.character_name
where p.member_id=m.id and m.role='Driver';

-- Keep the admin-created test team visually distinct without touching real teams.
