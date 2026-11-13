begin;

create or replace view public.caleris_driver_market_directory
with (security_barrier=true) as
select m.id,m.character_name,m.role,m.team_id,m.license,p.nationality,
 p.public_member_id,coalesce(a.attributes,'{}'::jsonb) as attributes,
 c.ends_on as contract_ends_on,
 case
  when m.team_id is null then 'Free Agent'
  when n.move_type='loan' and n.status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved','loan_active') then 'Loan List'
  when n.move_type='transfer' and n.status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved') then 'Transfer List'
  else 'Under Contract'
 end as market_status
from public.members m
left join public.profiles p on p.member_id=m.id
left join public.caleris_driver_attributes a on a.member_id=m.id
left join lateral (
 select ends_on from public.contracts
 where member_id=m.id and status='active'
 order by ends_on desc nulls last,created_at desc limit 1
) c on true
left join lateral (
 select move_type,status from public.caleris_driver_move_negotiations
 where driver_member_id=m.id and status in ('offered','negotiating','seller_accepted','pending_fia','approved_waiting_window','approved','loan_active')
 order by created_at desc limit 1
) n on true
where m.role='Driver' or (m.role in ('Public') and m.team_id is null) or (m.role is null and m.team_id is null);
revoke all on public.caleris_driver_market_directory from public,anon,authenticated,service_role;
grant select on public.caleris_driver_market_directory to authenticated;

commit;