begin;

-- Retry overdue installments in their original Race Period. The previous
-- implementation skipped every existing installment, which made an
-- insufficient-balance installment permanently uncollectable in that period.
create or replace function private.process_cash_loan_repayments(p_period_id uuid,p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
 v_period public.season_calendar_periods%rowtype;
 v_current public.license_seasons%rowtype;
 v_origin public.license_seasons%rowtype;
 v_loan public.economy_cash_loans%rowtype;
 v_existing_installment public.economy_cash_loan_installments%rowtype;
 v_bank uuid;
 v_balance numeric(20,2);
 v_remaining numeric(20,2);
 v_origin_periods integer;
 v_seasons_elapsed integer;
 v_installments_left integer;
 v_due numeric(20,2);
 v_tx jsonb;
 v_installment uuid;
 v_paid integer:=0;
 v_overdue integer:=0;
begin
 select * into v_period
 from public.season_calendar_periods
 where id=p_period_id and period_type='race_period';
 if not found then return jsonb_build_object('paid',0,'overdue',0,'status','not_a_race_period'); end if;

 select * into v_current from public.license_seasons where id=v_period.season_id;
 select id into v_bank from public.economy_wallet_accounts
 where account_kind='vreeo_bank' and is_active order by created_at limit 1;

 for v_loan in
  select * from public.economy_cash_loans
  where status in ('active','overdue')
  order by created_at,id
  for update skip locked
 loop
  select * into v_existing_installment
  from public.economy_cash_loan_installments
  where loan_id=v_loan.id and period_id=p_period_id
  for update;

  -- A paid installment is immutable and must never be charged again.
  if found and v_existing_installment.status='paid' then
   continue;
  end if;

  v_remaining:=v_loan.total_due-v_loan.amount_repaid;
  if v_remaining<=0 then
   update public.economy_cash_loans
   set status='paid',paid_at=coalesce(paid_at,now())
   where id=v_loan.id;
   continue;
  end if;

  if found then
   -- Reuse the original amount and idempotency identity for overdue retry.
   v_installment:=v_existing_installment.id;
   v_due:=v_existing_installment.due_amount;
  else
   select * into v_origin from public.license_seasons where id=v_loan.origin_season_id;
   select count(*)-1 into v_seasons_elapsed
   from public.license_seasons s
   where s.created_at>=v_origin.created_at and s.created_at<=v_current.created_at;
   select count(*) into v_origin_periods
   from public.season_calendar_periods p
   where p.season_id=v_loan.origin_season_id and p.period_type='race_period';

   v_installments_left:=greatest(
    v_origin_periods*v_loan.tenor_seasons-
    (select count(*) from public.economy_cash_loan_installments i where i.loan_id=v_loan.id),
    1
   );

   if coalesce(v_seasons_elapsed,0)>=v_loan.tenor_seasons-1
      and v_period.sort_order=(
       select max(p.sort_order) from public.season_calendar_periods p
       where p.season_id=v_period.season_id and p.period_type='race_period'
      ) then
    v_due:=v_remaining;
   else
    v_due:=greatest(0.01,least(v_remaining,round(v_remaining/v_installments_left,2)));
   end if;

   insert into public.economy_cash_loan_installments(
    loan_id,season_id,period_id,due_amount,status,attempted_at
   ) values (
    v_loan.id,v_period.season_id,p_period_id,v_due,'overdue',now()
   ) returning id into v_installment;
  end if;

  if v_bank is null then
   update public.economy_cash_loan_installments
   set attempted_at=now()
   where id=v_installment;
   update public.economy_cash_loans set status='overdue' where id=v_loan.id;
   v_overdue:=v_overdue+1;
   continue;
  end if;

  select balance into v_balance
  from public.economy_wallet_accounts
  where id=v_loan.wallet_id
  for update;

  if coalesce(v_balance,0)<v_due then
   update public.economy_cash_loan_installments
   set status='overdue',attempted_at=now()
   where id=v_installment;
   update public.economy_cash_loans set status='overdue' where id=v_loan.id;
   v_overdue:=v_overdue+1;
   continue;
  end if;

  v_tx:=private.post_cash_loan_transaction(
   v_loan.wallet_id,v_bank,v_due,'loan_repayment',
   'Cash Loan installment · '||v_period.title,
   'cash-loan-repayment:'||v_loan.id::text||':'||v_period.id::text,
   p_actor_id,
   jsonb_build_object(
    'loan_id',v_loan.id,'period_id',v_period.id,
    'season_id',v_period.season_id,'installment_id',v_installment,
    'retry_of_overdue_installment',v_existing_installment.id is not null
   )
  );

  update public.economy_cash_loan_installments
  set status='paid',transaction_id=(v_tx->>'transaction_id')::uuid,
      paid_at=now(),attempted_at=now()
  where id=v_installment;

  update public.economy_cash_loans
  set amount_repaid=amount_repaid+v_due,
      status=case when amount_repaid+v_due>=total_due then 'paid' else 'active' end,
      paid_at=case when amount_repaid+v_due>=total_due then now() else null end
  where id=v_loan.id;

  v_paid:=v_paid+1;
 end loop;

 return jsonb_build_object('paid',v_paid,'overdue',v_overdue,'period_id',p_period_id);
end;
$function$;

create table if not exists public.caleris_economy_automation_runs (
 id uuid primary key default gen_random_uuid(),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'running' check(status in ('running','completed','partial','failed')),
 repayment_periods_attempted integer not null default 0,
 repayments_paid integer not null default 0,
 repayments_overdue integer not null default 0,
 repayment_periods_waiting integer not null default 0,
 divisions_finalized integer not null default 0,
 prizepool_divisions_paid integer not null default 0,
 wealth_tax_seasons_processed integer not null default 0,
 wealth_tax_assessments_paid integer not null default 0,
 pending_items integer not null default 0,
 details jsonb not null default '[]'::jsonb,
 error text,
 created_at timestamptz not null default now()
);

create index if not exists caleris_economy_automation_runs_started_idx
 on public.caleris_economy_automation_runs(started_at desc);
alter table public.caleris_economy_automation_runs enable row level security;
revoke all on public.caleris_economy_automation_runs from public,anon,authenticated,service_role;
grant select on public.caleris_economy_automation_runs to authenticated;
drop policy if exists "Admins can read economy automation runs" on public.caleris_economy_automation_runs;
create policy "Admins can read economy automation runs"
 on public.caleris_economy_automation_runs for select to authenticated
 using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.run_economy_settlement_automation()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
 v_run_id uuid;
 v_actor_id uuid;
 v_period record;
 v_division record;
 v_season record;
 v_result jsonb;
 v_tax_result jsonb;
 v_error text;
 v_repayment_periods integer:=0;
 v_repayments_paid integer:=0;
 v_repayments_overdue integer:=0;
 v_repayment_waiting integer:=0;
 v_divisions_finalized integer:=0;
 v_prizepool_paid integer:=0;
 v_tax_seasons integer:=0;
 v_tax_paid integer:=0;
 v_pending integer:=0;
 v_details jsonb:='[]'::jsonb;
 v_has_wdc boolean;
 v_has_prize_rules boolean;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('caleris-economy-settlement-automation',0)) then
  return jsonb_build_object('status','already_running');
 end if;

 insert into public.caleris_economy_automation_runs default values returning id into v_run_id;
 select user_id into v_actor_id from public.site_admins order by user_id limit 1;
 if v_actor_id is null then
  raise exception 'Tidak ada Admin terdaftar untuk konteks settlement otomatis.';
 end if;
 perform set_config('request.jwt.claim.sub',v_actor_id::text,true);

 -- Cash-loan repayment only runs after every mapped division round is closed
 -- and all payroll claims for that Race Period have already been settled.
 for v_period in
  select p.id,p.title,p.season_id,p.sort_order
  from public.season_calendar_periods p
  where p.period_type='race_period'
    and not exists(
      select 1 from public.economy_payroll_claims pc
      where pc.period_id=p.id and pc.status='pending'
    )
    and exists(
      select 1 from public.economy_cash_loans l
      where l.status in ('active','overdue')
    )
  order by p.season_id,p.sort_order,p.id
 loop
  begin
   v_result:=private.try_process_cash_loan_repayments(v_period.id,v_actor_id);
   if coalesce(v_result->>'status','') in ('waiting_for_complete_division_mapping','waiting_for_all_divisions','waiting_for_payroll') then
    v_repayment_waiting:=v_repayment_waiting+1;
    v_details:=v_details||jsonb_build_array(jsonb_build_object(
      'kind','loan_repayment','period_id',v_period.id,'status',v_result->>'status'
    ));
   else
    v_repayment_periods:=v_repayment_periods+1;
    v_repayments_paid:=v_repayments_paid+coalesce((v_result->>'paid')::integer,0);
    v_repayments_overdue:=v_repayments_overdue+coalesce((v_result->>'overdue')::integer,0);
   end if;
  exception when others then
   get stacked diagnostics v_error=message_text;
   v_pending:=v_pending+1;
   v_details:=v_details||jsonb_build_array(jsonb_build_object(
    'kind','loan_repayment','period_id',v_period.id,'status','error','error',left(v_error,1000)
   ));
  end;
 end loop;

 -- Finalize completed divisions and retry prizepool payouts after Admin fixes
 -- any missing WDC or prize configuration. The existing payout RPC remains the
 -- sole authority for standings, wallets, ledger entries and idempotency.
 for v_division in
  select sd.id,sd.season_id,sd.division_key,sd.status,sd.division_name
  from public.license_season_divisions sd
  where (
    sd.status='active'
    and exists(select 1 from public.license_rounds r where r.season_division_id=sd.id)
    and not exists(select 1 from public.license_rounds r where r.season_division_id=sd.id and r.status<>'closed')
  ) or (
    sd.status='completed'
    and not exists(select 1 from public.caleris_prizepool_payouts pp where pp.season_division_id=sd.id)
  )
  order by sd.season_id,sd.id
 loop
  begin
   if v_division.status='active' then
    select exists(
      select 1 from public.caleris_configurations c
      where c.category='license'
        and c.config_key='scoring-wdc-'||v_division.division_key
        and c.is_active
        and coalesce(nullif(c.payload->>'points','')::numeric,0)>0
        and coalesce(nullif(c.payload->>'tier_priority','')::integer,0)>0
    ) into v_has_wdc;
    if not v_has_wdc then
     v_pending:=v_pending+1;
     v_details:=v_details||jsonb_build_array(jsonb_build_object(
      'kind','division_finalization','division_id',v_division.id,
      'status','waiting_for_wdc_configuration'
     ));
     continue;
    end if;
    v_result:=public.finalize_license_division(v_division.id);
    v_divisions_finalized:=v_divisions_finalized+1;
   end if;

   if not exists(select 1 from public.caleris_prizepool_payouts pp where pp.season_division_id=v_division.id) then
    select exists(
      select 1 from public.caleris_prizepool_rules pr
      where pr.division_key=v_division.division_key and pr.is_active
    ) into v_has_prize_rules;
    if not v_has_prize_rules then
     v_pending:=v_pending+1;
     v_details:=v_details||jsonb_build_array(jsonb_build_object(
      'kind','prizepool','division_id',v_division.id,'status','waiting_for_prizepool_configuration'
     ));
     continue;
    end if;
    v_result:=public.payout_season_prizepool(v_division.id);
    v_prizepool_paid:=v_prizepool_paid+coalesce((v_result->>'payout_count')::integer,0);
   end if;
  exception when others then
   get stacked diagnostics v_error=message_text;
   v_pending:=v_pending+1;
   v_details:=v_details||jsonb_build_array(jsonb_build_object(
    'kind','division_settlement','division_id',v_division.id,
    'status','error','error',left(v_error,1000)
   ));
  end;
 end loop;

 -- Wealth Tax is assessed and collected only after every division in a season
 -- is completed. Insufficient balances remain assessed and are retried later.
 for v_season in
  select s.id,s.title
  from public.license_seasons s
  where exists(select 1 from public.license_season_divisions sd where sd.season_id=s.id)
    and not exists(select 1 from public.license_season_divisions sd where sd.season_id=s.id and sd.status<>'completed')
  order by s.created_at,s.id
 loop
  begin
   v_tax_result:=public.admin_generate_wealth_tax_assessments(v_season.id,v_actor_id);
   v_result:=public.admin_collect_wealth_tax(v_season.id,v_actor_id);
   v_tax_seasons:=v_tax_seasons+1;
   v_tax_paid:=v_tax_paid+coalesce((v_result->>'paid')::integer,0);
   if coalesce((v_result->>'insufficient_balance')::integer,0)>0 then
    v_pending:=v_pending+(v_result->>'insufficient_balance')::integer;
    v_details:=v_details||jsonb_build_array(jsonb_build_object(
     'kind','wealth_tax','season_id',v_season.id,
     'status','waiting_for_balance','insufficient_balance',v_result->>'insufficient_balance'
    ));
   end if;
  exception when others then
   get stacked diagnostics v_error=message_text;
   v_pending:=v_pending+1;
   v_details:=v_details||jsonb_build_array(jsonb_build_object(
    'kind','wealth_tax','season_id',v_season.id,'status','pending_configuration',
    'error',left(v_error,1000)
   ));
  end;
 end loop;

 update public.caleris_economy_automation_runs
 set finished_at=now(),
     status=case when v_pending=0 then 'completed' else 'partial' end,
     repayment_periods_attempted=v_repayment_periods,
     repayments_paid=v_repayments_paid,
     repayments_overdue=v_repayments_overdue,
     repayment_periods_waiting=v_repayment_waiting,
     divisions_finalized=v_divisions_finalized,
     prizepool_divisions_paid=v_prizepool_paid,
     wealth_tax_seasons_processed=v_tax_seasons,
     wealth_tax_assessments_paid=v_tax_paid,
     pending_items=v_pending,
     details=v_details
 where id=v_run_id;

 return jsonb_build_object(
  'run_id',v_run_id,'status',case when v_pending=0 then 'completed' else 'partial' end,
  'repayment_periods_attempted',v_repayment_periods,'repayments_paid',v_repayments_paid,
  'repayments_overdue',v_repayments_overdue,'repayment_periods_waiting',v_repayment_waiting,
  'divisions_finalized',v_divisions_finalized,'prizepool_divisions_paid',v_prizepool_paid,
  'wealth_tax_seasons_processed',v_tax_seasons,'wealth_tax_assessments_paid',v_tax_paid,
  'pending_items',v_pending
 );
exception when others then
 get stacked diagnostics v_error=message_text;
 if v_run_id is not null then
  update public.caleris_economy_automation_runs
  set finished_at=now(),status='failed',error=left(v_error,1000)
  where id=v_run_id;
 end if;
 raise;
end;
$function$;

revoke all on function private.run_economy_settlement_automation() from public,anon,authenticated,service_role;
revoke all on function private.process_cash_loan_repayments(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.admin_get_economy_audit_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
 v_result jsonb;
begin
 if (select auth.uid()) is null or not exists(
  select 1 from public.site_admins where user_id=(select auth.uid())
 ) then raise exception 'Hanya Admin yang dapat membuka Economy Audit Center.'; end if;

 select jsonb_build_object(
  'pending_rewards',(select count(*) from public.economy_reward_claims where status='pending'),
  'pending_member_checkins',(select count(*) from public.caleris_member_race_checkins where reward_status='pending'),
  'pending_payroll',(select count(*) from public.economy_payroll_claims where status='pending'),
  'pending_cash_loan_installments',(select count(*) from public.economy_cash_loan_installments where status='overdue'),
  'failed_retry_runs',(select count(*) from public.caleris_economy_retry_runs where status='failed'),
  'failed_automation_runs',(select count(*) from public.caleris_economy_automation_runs where status='failed'),
  'recent_runs',coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc)
   from (select id,started_at,finished_at,status,reward_attempted,reward_paid,reward_pending,
    checkin_attempted,checkin_paid,checkin_pending,error
    from public.caleris_economy_retry_runs order by started_at desc limit 12) r),'[]'::jsonb),
  'recent_automation_runs',coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc)
   from (select id,started_at,finished_at,status,repayment_periods_attempted,
    repayments_paid,repayments_overdue,repayment_periods_waiting,divisions_finalized,
    prizepool_divisions_paid,wealth_tax_seasons_processed,wealth_tax_assessments_paid,
    pending_items,details,error
    from public.caleris_economy_automation_runs order by started_at desc limit 12) r),'[]'::jsonb),
  'pending_items',coalesce((
   select jsonb_agg(item order by created_at desc) from (
    select jsonb_build_object('kind','daily_reward','id',id,'member_id',member_id,
     'amount',amount,'status',status,'attempts',retry_attempts,'last_attempt_at',last_attempt_at,
     'last_error',last_error,'created_at',created_at) item,created_at
    from public.economy_reward_claims where status='pending'
    union all
    select jsonb_build_object('kind','race_checkin','id',id,'member_id',member_id,
     'amount',reward_amount,'status',reward_status,'attempts',reward_retry_attempts,
     'last_attempt_at',reward_last_attempt_at,'last_error',reward_last_error,
     'created_at',checkin_at) item,checkin_at created_at
    from public.caleris_member_race_checkins where reward_status='pending'
    union all
    select jsonb_build_object('kind','payroll','id',id,'member_id',member_id,
     'amount',amount,'status',status,'attempts',0,'last_attempt_at',null,
     'last_error','Payroll menunggu pemrosesan manual oleh Admin.',
     'created_at',created_at) item,created_at
    from public.economy_payroll_claims where status='pending'
   ) pending
  ),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$function$;

revoke all on function public.admin_get_economy_audit_snapshot() from public,anon;
grant execute on function public.admin_get_economy_audit_snapshot() to authenticated;

do $schedule$
declare v_job bigint;
begin
 select jobid into v_job from cron.job where jobname='caleris-economy-settlement-automation';
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule(
  'caleris-economy-settlement-automation','*/5 * * * *',
  'select private.run_economy_settlement_automation();'
 );
end;
$schedule$;

commit;
