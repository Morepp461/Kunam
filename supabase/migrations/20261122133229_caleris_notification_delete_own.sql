begin;

-- Allow members to clear only their own notification inbox.
grant delete on table public.caleris_notifications to authenticated;

drop policy if exists "Members delete own Caleris notifications" on public.caleris_notifications;
create policy "Members delete own Caleris notifications"
on public.caleris_notifications
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.member_id = caleris_notifications.member_id
  )
);

commit;
