drop policy if exists fan_transfer_history_participants on public.caleris_fan_transfer_history;
create policy fan_transfer_history_participants on public.caleris_fan_transfer_history for select to authenticated using(
 public.is_caleris_fia_or_admin() or exists(
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.member_id=caleris_fan_transfer_history.member_id
 ));
