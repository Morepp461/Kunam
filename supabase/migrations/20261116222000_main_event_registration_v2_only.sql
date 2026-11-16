-- Force all Main Event registration and approval calls through the validated v2 RPCs.
begin;

revoke all on function public.submit_main_event_registration(jsonb)
  from public,anon,authenticated;
revoke all on function public.admin_review_member_registration(uuid,text,text)
  from public,anon,authenticated;

grant execute on function public.submit_main_event_registration_v2(jsonb)
  to authenticated;
grant execute on function public.admin_review_main_event_registration_v2(uuid,text,text)
  to authenticated;

commit;
