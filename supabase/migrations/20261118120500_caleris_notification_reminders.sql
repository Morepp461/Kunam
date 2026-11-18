-- Scheduled reminders for races, check-in windows, quests, contracts and loan installments.
create table if not exists public.caleris_notification_reminder_runs(
 id uuid primary key default gen_random_uuid(),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'running' check(status in ('running','completed','failed')),
 notifications_created integer not null default 0,
 error text
);
alter table public.caleris_notification_reminder_runs enable row level security;
revoke all on public.caleris_notification_reminder_runs from public,anon,authenticated,service_role;
grant select on public.caleris_notification_reminder_runs to authenticated;
drop policy if exists "Admins read notification reminder runs" on public.caleris_notification_reminder_runs;
create policy "Admins read notification reminder runs" on public.caleris_notification_reminder_runs
for select to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.process_caleris_notification_reminders()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_run_id uuid;v_item record;v_created integer:=0;v_error text;v_title text;v_body text;v_key text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('caleris-notification-reminders',0)) then
  return jsonb_build_object('status','already_running','created',0);
 end if;
 insert into public.caleris_notification_reminder_runs default values returning id into v_run_id;

 -- Race H-24, H-1 and start reminders.
 for v_item in
  select r.id round_id,r.title,sm.member_id,d.division_name,
   case when r.race_starts_at between now()+interval '23 hours 55 minutes' and now()+interval '24 hours 5 minutes' then 'h24'
        when r.race_starts_at between now()+interval '55 minutes' and now()+interval '65 minutes' then 'h1'
        else 'start' end reminder_key
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  join public.license_season_members sm on sm.season_division_id=d.id and not sm.is_hiatus
  where r.status not in ('closed','cancelled')
   and ((r.race_starts_at between now()+interval '23 hours 55 minutes' and now()+interval '24 hours 5 minutes')
     or (r.race_starts_at between now()+interval '55 minutes' and now()+interval '65 minutes')
     or (r.race_starts_at between now()-interval '2 minutes' and now()+interval '3 minutes'))
 loop
  v_title:=case v_item.reminder_key when 'h24' then 'Race besok' when 'h1' then 'Race dimulai 1 jam lagi' else 'Race dimulai sekarang' end;
  v_body:=coalesce(v_item.division_name,'Divisi')||' · '||v_item.title||'. Periksa jadwal dan persiapan race.';
  v_key:='race-reminder:'||v_item.round_id::text||':'||v_item.reminder_key||':'||v_item.member_id::text;
  perform private.enqueue_caleris_notification(v_item.member_id,'race_reminder',v_title,v_body,'/dashboard',v_key,jsonb_build_object('round_id',v_item.round_id));
  v_created:=v_created+1;
 end loop;

 -- Check-in opens and one-hour closing reminders.
 for v_item in
  select r.id round_id,r.title,sm.member_id,d.division_name,
   case when r.checkin_opens_at between now()-interval '2 minutes' and now()+interval '3 minutes' then 'opened' else 'closing' end reminder_key
  from public.license_rounds r
  join public.license_season_divisions d on d.id=r.season_division_id
  join public.license_season_members sm on sm.season_division_id=d.id and not sm.is_hiatus
  where r.status not in ('closed','cancelled')
   and ((r.checkin_opens_at between now()-interval '2 minutes' and now()+interval '3 minutes')
     or (r.checkin_closes_at between now()+interval '55 minutes' and now()+interval '65 minutes'))
 loop
  v_title:=case v_item.reminder_key when 'opened' then 'Check-in race dibuka' else 'Check-in ditutup 1 jam lagi' end;
  v_body:=coalesce(v_item.division_name,'Divisi')||' · '||v_item.title||'.';
  v_key:='checkin-reminder:'||v_item.round_id::text||':'||v_item.reminder_key||':'||v_item.member_id::text;
  perform private.enqueue_caleris_notification(v_item.member_id,'race_checkin',v_title,v_body,'/race-checkin',v_key,jsonb_build_object('round_id',v_item.round_id));
  v_created:=v_created+1;
 end loop;

 -- Quest expiry H-24 and H-1 for incomplete assignments.
 for v_item in
  select a.id assignment_id,a.member_id,q.title,
   case when a.ends_at between now()+interval '23 hours 55 minutes' and now()+interval '24 hours 5 minutes' then 'h24' else 'h1' end reminder_key
  from public.caleris_quest_assignments a join public.caleris_quest_catalog q on q.id=a.quest_id
  where a.status not in ('completed','expired','cancelled')
   and ((a.ends_at between now()+interval '23 hours 55 minutes' and now()+interval '24 hours 5 minutes')
     or (a.ends_at between now()+interval '55 minutes' and now()+interval '65 minutes'))
 loop
  v_title:=case v_item.reminder_key when 'h24' then 'Quest berakhir besok' else 'Quest berakhir 1 jam lagi' end;
  perform private.enqueue_caleris_notification(v_item.member_id,'quest_reminder',v_title,
   coalesce(v_item.title,'Quest')||' segera berakhir.','/quests',
   'quest-expiry:'||v_item.assignment_id::text||':'||v_item.reminder_key,
   jsonb_build_object('assignment_id',v_item.assignment_id));
  v_created:=v_created+1;
 end loop;

 -- Contract expiry reminders at 7 days and 1 day before the end date (Jakarta time).
 for v_item in
  select c.id contract_id,c.member_id,c.ends_on,
   case when ((c.ends_on::timestamp at time zone 'Asia/Jakarta')-interval '7 days') between now()-interval '2 minutes' and now()+interval '5 minutes' then 'd7' else 'd1' end reminder_key
  from public.contracts c
  where c.status='active'
   and (((c.ends_on::timestamp at time zone 'Asia/Jakarta')-interval '7 days') between now()-interval '2 minutes' and now()+interval '5 minutes'
     or ((c.ends_on::timestamp at time zone 'Asia/Jakarta')-interval '1 day') between now()-interval '2 minutes' and now()+interval '5 minutes')
 loop
  v_title:=case v_item.reminder_key when 'd7' then 'Kontrak berakhir 7 hari lagi' else 'Kontrak berakhir besok' end;
  perform private.enqueue_caleris_notification(v_item.member_id,'contract_reminder',v_title,
   'Kontrak aktifmu berakhir pada '||v_item.ends_on::text||'.','/profile',
   'contract-expiry:'||v_item.contract_id::text||':'||v_item.reminder_key,
   jsonb_build_object('contract_id',v_item.contract_id,'ends_on',v_item.ends_on));
  v_created:=v_created+1;
 end loop;

 -- Loan installment reminders one day before the Race Period end date.
 for v_item in
  select i.id installment_id,l.member_id,i.due_amount,p.ends_on
  from public.economy_cash_loan_installments i
  join public.economy_cash_loans l on l.id=i.loan_id
  join public.season_calendar_periods p on p.id=i.period_id
  where i.status='pending' and l.status in ('active','repaying')
   and ((((p.ends_on+1)::timestamp at time zone 'Asia/Jakarta')-interval '1 second')-interval '1 day')
     between now()-interval '2 minutes' and now()+interval '5 minutes'
   and l.member_id is not null
 loop
  perform private.enqueue_caleris_notification(v_item.member_id,'loan_reminder','Angsuran Cash Loan besok jatuh tempo',
   'Angsuran sebesar € '||v_item.due_amount::text||' jatuh tempo pada akhir Race Period.','/financial-centre',
   'loan-installment-due:'||v_item.installment_id::text,
   jsonb_build_object('installment_id',v_item.installment_id,'due_amount',v_item.due_amount,'period_ends_on',v_item.ends_on));
  v_created:=v_created+1;
 end loop;

 update public.caleris_notification_reminder_runs set finished_at=now(),status='completed',notifications_created=v_created where id=v_run_id;
 return jsonb_build_object('status','completed','run_id',v_run_id,'notifications_created',v_created);
exception when others then
 get stacked diagnostics v_error=message_text;
 if v_run_id is not null then update public.caleris_notification_reminder_runs set finished_at=now(),status='failed',error=left(v_error,1000) where id=v_run_id; end if;
 raise;
end;
$function$;
revoke all on function private.process_caleris_notification_reminders() from public,anon,authenticated,service_role;

do $block$
declare v_job bigint;
begin
 select jobid into v_job from cron.job where jobname='caleris-notification-reminders';
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule('caleris-notification-reminders','*/5 * * * *','select private.process_caleris_notification_reminders();');
end
$block$;

select private.process_caleris_notification_reminders();
