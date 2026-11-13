begin;

-- Master circuit catalogue. Lap record can be seeded manually, then is superseded
-- only by a lower fastest-lap time entered in an official race classification.
create table if not exists public.caleris_circuits (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 160),
 country_code text not null check(country_code ~ '^[A-Z]{2}$'),
 total_laps integer not null check(total_laps > 0),
 avg_track_temp_c numeric(5,2) not null,
 drs_zones integer not null check(drs_zones >= 0),
 straights integer not null check(straights >= 0),
 low_speed_corners integer not null check(low_speed_corners >= 0),
 high_speed_corners integer not null check(high_speed_corners >= 0),
 grip_level numeric(5,2) not null check(grip_level between 0 and 100),
 initial_lap_record_ms integer check(initial_lap_record_ms > 0),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(lower(name),country_code)
);

alter table public.caleris_race_result_entries
 add column if not exists fastest_lap_ms integer;
alter table public.caleris_race_result_entries
 drop constraint if exists caleris_race_result_entries_fastest_lap_ms_check;
alter table public.caleris_race_result_entries
 add constraint caleris_race_result_entries_fastest_lap_ms_check
 check(fastest_lap_ms is null or fastest_lap_ms > 0);

alter table public.caleris_job_adverts
 add column if not exists position_kind text not null default 'Driver',
 add column if not exists minimum_license text,
 add column if not exists salary_min numeric(14,2),
 add column if not exists salary_max numeric(14,2);
alter table public.caleris_job_adverts
 drop constraint if exists caleris_job_adverts_position_kind_check;
alter table public.caleris_job_adverts
 add constraint caleris_job_adverts_position_kind_check
 check(position_kind in ('Driver','Team Owner'));
alter table public.caleris_job_adverts
 drop constraint if exists caleris_job_adverts_salary_range_check;
alter table public.caleris_job_adverts
 add constraint caleris_job_adverts_salary_range_check
 check((salary_min is null or salary_min >= 0) and (salary_max is null or salary_max >= 0)
   and (salary_min is null or salary_max is null or salary_max >= salary_min));

-- Extend the public marketplace directory only with nationality; keep private
-- profile fields, member codes and balances out of this view.
create or replace view public.caleris_member_directory
with (security_barrier=true) as
select m.id,m.character_name,m.role,m.team_id,m.license,p.nationality
from public.members m
left join public.profiles p on p.member_id=m.id;
revoke all on public.caleris_member_directory from public,anon,authenticated,service_role;
grant select on public.caleris_member_directory to authenticated;

alter table public.caleris_circuits enable row level security;
drop policy if exists "Authenticated users read circuit pool" on public.caleris_circuits;
create policy "Authenticated users read circuit pool" on public.caleris_circuits
 for select to authenticated using(true);
drop policy if exists "FIA and Admin manage circuit pool" on public.caleris_circuits;
create policy "FIA and Admin manage circuit pool" on public.caleris_circuits
 for all to authenticated using(public.is_caleris_fia_or_admin())
 with check(public.is_caleris_fia_or_admin());
grant select,insert,update,delete on public.caleris_circuits to authenticated;

-- Admin can manage vacancies from any team, while normal members remain limited
-- to their own team's adverts.
drop policy if exists "Team owners publish job adverts" on public.caleris_job_adverts;
create policy "Team owners publish job adverts" on public.caleris_job_adverts
 for insert to authenticated with check(
  (status in ('draft','published') and exists(
    select 1 from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_job_adverts.team_id
  )) or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 );
drop policy if exists "Team owners update own job adverts" on public.caleris_job_adverts;
create policy "Team owners update own job adverts" on public.caleris_job_adverts
 for update to authenticated using(
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
   where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_job_adverts.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 ) with check(
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
   where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_job_adverts.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 );
drop policy if exists "Team owners delete own job adverts" on public.caleris_job_adverts;
create policy "Team owners delete own job adverts" on public.caleris_job_adverts
 for delete to authenticated using(
  exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
   where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=caleris_job_adverts.team_id)
  or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
 );

-- Circuit record view: lowest valid lap time across all rounds/seasons wins.
create or replace view public.caleris_circuit_pool
with (security_barrier=true) as
select c.id,c.name,c.country_code,c.total_laps,c.avg_track_temp_c,c.drs_zones,
 c.straights,c.low_speed_corners,c.high_speed_corners,c.grip_level,
 least(c.initial_lap_record_ms,(
   select min(e.fastest_lap_ms)
   from public.license_rounds r
   join public.caleris_race_result_entries e on e.round_id=r.id
   where lower(trim(r.circuit_name))=lower(trim(c.name))
     and r.circuit_country_code=c.country_code
     and e.fastest_lap_ms is not null
 )) as lap_record_ms
from public.caleris_circuits c;
revoke all on public.caleris_circuit_pool from public,anon,authenticated,service_role;
grant select on public.caleris_circuit_pool to authenticated;

commit;
