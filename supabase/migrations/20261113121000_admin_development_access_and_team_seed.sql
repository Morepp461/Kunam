-- Keep development attributes initialized for teams created after the initial migration.
create or replace function public.seed_team_development_parts()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.caleris_team_development_parts(team_id,part_key)
 select new.id,k from unnest(array[
 'race_pace','qualifying_pace','engine_power','aero_power','low_speed_corners','high_speed_corners',
 'traction','mechanical_grip','team_tyre_management','strategy_quality','team_morale','reliability',
 'car_tyre_wear','pit_stop_efficiency','drs_efficiency','ers_efficiency'
 ]) k on conflict(team_id,part_key) do nothing;
 return new;
end;
$$;
drop trigger if exists seed_team_development_parts_after_insert on public.teams;
create trigger seed_team_development_parts_after_insert after insert on public.teams
for each row execute function public.seed_team_development_parts();

-- Admin identity is stored in site_admins, not in members.role.
drop policy if exists team_development_parts_read on public.caleris_team_development_parts;
create policy team_development_parts_read on public.caleris_team_development_parts for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=auth.uid())
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
   where p.user_id=auth.uid() and m.team_id=caleris_team_development_parts.team_id)
);
drop policy if exists team_development_history_read on public.caleris_team_development_part_history;
create policy team_development_history_read on public.caleris_team_development_part_history for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=auth.uid())
 or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
   where p.user_id=auth.uid() and m.team_id=caleris_team_development_part_history.team_id)
);
drop policy if exists driver_development_attributes_read on public.caleris_driver_development_attributes;
create policy driver_development_attributes_read on public.caleris_driver_development_attributes for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=auth.uid())
 or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.member_id=caleris_driver_development_attributes.member_id)
);
drop policy if exists driver_development_history_read on public.caleris_driver_development_history;
create policy driver_development_history_read on public.caleris_driver_development_history for select to authenticated using (
 exists(select 1 from public.site_admins a where a.user_id=auth.uid())
 or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.member_id=caleris_driver_development_history.member_id)
);
