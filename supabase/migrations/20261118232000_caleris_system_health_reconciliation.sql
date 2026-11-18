-- Operational health and forward-looking wallet reconciliation.
-- The baseline is captured once so historical opening balances are not guessed.

create table if not exists public.caleris_wallet_reconciliation_baselines(
 wallet_account_id uuid primary key references public.economy_wallet_accounts(id) on delete cascade,
 baseline_balance numeric(20,2) not null,
 baseline_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
revoke all on public.caleris_wallet_reconciliation_baselines from public,anon,authenticated,service_role;

insert into public.caleris_wallet_reconciliation_baselines(wallet_account_id,baseline_balance,baseline_at)
select id,balance,now() from public.economy_wallet_accounts
on conflict(wallet_account_id) do nothing;

create or replace function private.capture_wallet_reconciliation_baseline()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 insert into public.caleris_wallet_reconciliation_baselines(wallet_account_id,baseline_balance,baseline_at)
 values(new.id,new.balance,now()) on conflict(wallet_account_id) do nothing;
 return new;
end;
$function$;
revoke all on function private.capture_wallet_reconciliation_baseline() from public,anon,authenticated,service_role;
drop trigger if exists caleris_wallet_reconciliation_baseline_trigger on public.economy_wallet_accounts;
create trigger caleris_wallet_reconciliation_baseline_trigger after insert on public.economy_wallet_accounts
for each row execute function private.capture_wallet_reconciliation_baseline();

create table if not exists public.caleris_system_health_runs(
 id uuid primary key default gen_random_uuid(),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'running' check(status in ('running','healthy','attention','failed')),
 wallet_mismatches integer not null default 0,
 cron_failures_24h integer not null default 0,
 pending_payroll integer not null default 0,
 races_awaiting_result integer not null default 0,
 seasons_missing_calendar integer not null default 0,
 snapshot jsonb not null default '{}'::jsonb,
 error text
);
alter table public.caleris_system_health_runs enable row level security;
revoke all on public.caleris_system_health_runs from public,anon,authenticated,service_role;
grant select on public.caleris_system_health_runs to authenticated;
drop policy if exists "Admins read system health runs" on public.caleris_system_health_runs;
create policy "Admins read system health runs" on public.caleris_system_health_runs
for select to authenticated using(exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

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
 where s.status in ('draft','active')
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
revoke all on function private.run_system_health_reconciliation() from public,anon,authenticated,service_role;

create or replace function public.admin_get_system_health_snapshot()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_run public.caleris_system_health_runs%rowtype;
begin
 if (select auth.uid()) is null or not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
  raise exception 'Hanya Admin yang dapat melihat System Health.';
 end if;
 select * into v_run from public.caleris_system_health_runs order by started_at desc limit 1;
 if not found then return jsonb_build_object('status','not_run','snapshot','{}'::jsonb); end if;
 return jsonb_build_object('id',v_run.id,'started_at',v_run.started_at,'finished_at',v_run.finished_at,
  'status',v_run.status,'wallet_mismatches',v_run.wallet_mismatches,'cron_failures_24h',v_run.cron_failures_24h,
  'pending_payroll',v_run.pending_payroll,'races_awaiting_result',v_run.races_awaiting_result,
  'seasons_missing_calendar',v_run.seasons_missing_calendar,'snapshot',v_run.snapshot,'error',v_run.error);
end;
$function$;
revoke all on function public.admin_get_system_health_snapshot() from public,anon;
grant execute on function public.admin_get_system_health_snapshot() to authenticated;

do $block$
declare v_job bigint;
begin
 select jobid into v_job from cron.job where jobname='caleris-system-health-reconciliation';
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule('caleris-system-health-reconciliation','*/15 * * * *','select private.run_system_health_reconciliation();');
end
$block$;

select private.run_system_health_reconciliation();
