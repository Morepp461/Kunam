begin;
drop policy if exists "Authenticated members read team final standings"
  on public.license_team_final_standings;

create policy "Authenticated members read team final standings"
  on public.license_team_final_standings
  for select
  to authenticated
  using (true);
commit;
