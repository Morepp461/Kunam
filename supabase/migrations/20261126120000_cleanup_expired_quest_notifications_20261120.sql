begin;

-- The November 20 quest assignments have expired. Remove only their obsolete
-- "Quest baru tersedia" notifications and retain tombstones so they cannot return.
insert into public.caleris_notification_deletion_tombstones(idempotency_key,member_id)
select n.idempotency_key,n.member_id
from public.caleris_notifications n
join public.caleris_quest_assignments a
  on a.id::text=n.metadata->>'assignment_id'
where n.category='quest'
  and n.created_at::date='2026-11-20'
  and a.status='expired'
  and a.ends_at<now()
on conflict(idempotency_key) do nothing;

delete from public.caleris_notifications n
using public.caleris_quest_assignments a
where n.category='quest'
  and n.created_at::date='2026-11-20'
  and a.id::text=n.metadata->>'assignment_id'
  and a.status='expired'
  and a.ends_at<now();

commit;