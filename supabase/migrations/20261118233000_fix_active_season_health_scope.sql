create or replace function private.run_system_health_reconciliation()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_run_id uuid;v_wallet_mismatches integer:=0;v_cron_failures integer:=0;
 v_pending_payroll integer:=0;v_awaiting_result integer:=0;v_missing_calendar integer:=0;
 v_snapshot jsonb;v_error text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('caleris-system-health-reconciliation',0)) then
  return jsonb_build_object('status','already_running');
 end if;
 insert into public.caleris_system_health_runs default values returning id into v_run_id;

 select count(*) into v_wallet_mismatches
 from public.caleris_wallet_reconciliation_baselines b
 join public.economy_wallet_accounts a on a.id=b.wallet_account_id
 cross join lateral(
  select coalesce(sum(case when t.destination_account_id=a.id then t.amount else -t.amount end),0) as net_change
  from public.economy_transactions t
  where (t.source_account_id=a.id or t.destination_account_id=a.id)
    and t.created_at>=b.baseline_at
 ) tx
 where abs(a.balance-(b.baseline_balance+tx.net_change))>0.01;

 select count(*) into v_cron_failures from cron.job_run_details d
 where d.status='failed' and d.start_time>=now()-interval '24 hours';

 select count(*) into v_pending_payroll from public.economy_payroll_claims where status='pending';

 select count(*) into v_awaiting_result from public.license_rounds
 where race_lifecycle_status='awaiting_result' and status<>'closed';

 select count(*) into v_missing_calendar from public.license_seasons s
 where s.status='active'
 and (select count(*) from public.season_calendar_periods p where p.season_id=s.id)<>12;

 v_snapshot:=jsonb_build_object(
  'wallet_mismatches',v_wallet_mismatches,
  'cron_failures_24h',v_cron_failures,
  'pending_payroll',v_pending_payroll,
  'races_awaiting_result',v_awaiting_result,
  'seasons_missing_calendar',v_missing_calendar,
  'baseline_scope','Wallet movement since baseline capture; historical balances are not retroactively inferred.',
  'checked_at',now()
 );

 update public.caleris_system_health_runs
 set finished_at=now(),
  status=case when v_wallet_mismatches+v_cron_failures+v_pending_payroll+v_awaiting_result+v_missing_calendar=0 then 'healthy' else 'attention' end,
  wallet_mismatches=v_wallet_mismatches,cron_failures_24h=v_cron_failures,pending_payroll=v_pending_payroll,
  races_awaiting_result=v_awaiting_result,seasons_missing_calendar=v_missing_calendar,snapshot=v_snapshot
 where id=v_run_id;

 return jsonb_build_object('run_id',v_run_id,'status',case when v_wallet_mismatches+v_cron_failures+v_pending_payroll+v_awaiting_result+v_missing_calendar=0 then 'healthy' else 'attention' end)||v_snapshot;
exception when others then
 get stacked diagnostics v_error=message_text;
 if v_run_id is not null then update public.caleris_system_health_runs set finished_at=now(),status='failed',error=left(v_error,1000) where id=v_run_id; end if;
 raise;
end;
$function$;
select private.run_system_health_reconciliation();
