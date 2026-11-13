drop policy if exists team_development_parts_read on public.caleris_team_development_parts;
create policy team_development_parts_read on public.caleris_team_development_parts for select to authenticated using (
 exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and (m.team_id=caleris_team_development_parts.team_id or m.role='Admin'))
);
drop policy if exists team_development_history_read on public.caleris_team_development_part_history;
create policy team_development_history_read on public.caleris_team_development_part_history for select to authenticated using (
 exists(select 1 from public.profiles p join public.members m on m.id=p.member_id where p.user_id=auth.uid() and (m.team_id=caleris_team_development_part_history.team_id or m.role='Admin'))
);