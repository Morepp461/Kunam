-- Respect the explicit Admin-only visibility level for sponsorship story events.
drop policy if exists "Sponsorship story events visible by visibility and participant"
 on public.caleris_sponsorship_story_events;

create policy "Sponsorship story events visible by visibility and participant"
on public.caleris_sponsorship_story_events for select to authenticated using (
 public.is_caleris_fia_or_admin()
 or visibility='public'
 or (visibility='participants' and (
  exists(select 1 from public.caleris_sponsorship_contracts c
   join public.profiles p on p.user_id=(select auth.uid()) and p.member_id=c.target_member_id
   where c.id=contract_id)
  or exists(select 1 from public.caleris_sponsorship_contracts c
   join public.profiles p on p.user_id=(select auth.uid())
   join public.members m on m.id=p.member_id and m.team_id=c.target_team_id
   where c.id=contract_id)
 ))
);
