begin;

alter table public.economy_reward_claims
  add column if not exists retry_attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;

alter table public.caleris_member_race_checkins
  add column if not exists reward_retry_attempts integer not null default 0,
  add column if not exists reward_last_attempt_at timestamptz,
  add column if not exists reward_last_error text;

create table if not exists public.caleris_economy_retry_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed')),
  reward_attempted integer not null default 0,
  reward_paid integer not null default 0,
  reward_pending integer not null default 0,
  checkin_attempted integer not null default 0,
  checkin_paid integer not null default 0,
  checkin_pending integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists caleris_economy_retry_runs_started_idx
  on public.caleris_economy_retry_runs(started_at desc);
alter table public.caleris_economy_retry_runs enable row level security;
revoke all on public.caleris_economy_retry_runs from public, anon, authenticated;
grant select on public.caleris_economy_retry_runs to authenticated;
drop policy if exists "Admins can read economy retry runs" on public.caleris_economy_retry_runs;
create policy "Admins can read economy retry runs"
  on public.caleris_economy_retry_runs for select to authenticated
  using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function private.retry_pending_economy_rewards()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_run_id uuid;
  v_claim public.economy_reward_claims%rowtype;
  v_checkin public.caleris_member_race_checkins%rowtype;
  v_member public.members%rowtype;
  v_bank uuid;
  v_wallet uuid;
  v_result jsonb;
  v_reward_attempted integer:=0;
  v_reward_paid integer:=0;
  v_reward_pending integer:=0;
  v_checkin_attempted integer:=0;
  v_checkin_paid integer:=0;
  v_checkin_pending integer:=0;
  v_error text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('caleris-economy-pending-retry',0)) then
    return jsonb_build_object('status','already_running');
  end if;
  insert into public.caleris_economy_retry_runs default values returning id into v_run_id;
  select id into v_bank from public.economy_wallet_accounts
    where account_kind='vreeo_bank' and is_active order by created_at limit 1;

  for v_claim in
    select * from public.economy_reward_claims
    where status='pending' order by created_at,id for update skip locked
  loop
    v_reward_attempted:=v_reward_attempted+1;
    begin
      select id into v_wallet from public.economy_wallet_accounts
        where account_kind='driver' and member_id=v_claim.member_id and is_active;
      if v_bank is null or v_wallet is null then
        v_reward_pending:=v_reward_pending+1;
        update public.economy_reward_claims set retry_attempts=retry_attempts+1,
          last_attempt_at=now(),last_error=case when v_bank is null then 'VreeoBank tidak tersedia atau nonaktif.' else 'Driver Wallet tidak ditemukan atau nonaktif.' end
        where id=v_claim.id;
        continue;
      end if;
      v_result:=private.post_economy_transaction(
        v_bank,v_wallet,v_claim.amount,'checkin_reward','Daily check-in reward',
        v_claim.idempotency_key,null,
        jsonb_build_object('checkin_id',v_claim.source_id,'claim_id',v_claim.id,'retry_run_id',v_run_id),
        null,true
      );
      if v_result is null then
        v_reward_pending:=v_reward_pending+1;
        update public.economy_reward_claims set retry_attempts=retry_attempts+1,
          last_attempt_at=now(),last_error='Saldo VreeoBank belum mencukupi.'
        where id=v_claim.id;
      else
        update public.economy_reward_claims set status='paid',
          transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now(),
          retry_attempts=retry_attempts+1,last_attempt_at=now(),last_error=null
        where id=v_claim.id;
        v_reward_paid:=v_reward_paid+1;
      end if;
    exception when others then
      get stacked diagnostics v_error=message_text;
      update public.economy_reward_claims set retry_attempts=retry_attempts+1,
        last_attempt_at=now(),last_error=left(v_error,1000) where id=v_claim.id;
      v_reward_pending:=v_reward_pending+1;
    end;
  end loop;

  for v_checkin in
    select * from public.caleris_member_race_checkins
    where reward_status='pending' order by checkin_at,id for update skip locked
  loop
    v_checkin_attempted:=v_checkin_attempted+1;
    begin
      v_wallet:=null;
      select * into v_member from public.members where id=v_checkin.member_id;
      if v_member.role='Driver' then
        select id into v_wallet from public.economy_wallet_accounts
          where account_kind='driver' and member_id=v_member.id and is_active;
      elsif v_member.role='Owner' then
        select id into v_wallet from public.economy_wallet_accounts
          where account_kind='team_owner' and member_id=v_member.id and is_active;
      else
        select wa.id into v_wallet from public.profiles p
          join public.economy_wallet_accounts wa on wa.profile_user_id=p.user_id
            and wa.account_kind='public_member' and wa.is_active
          where p.member_id=v_member.id;
      end if;
      if v_bank is null or v_wallet is null then
        v_checkin_pending:=v_checkin_pending+1;
        update public.caleris_member_race_checkins
          set reward_retry_attempts=reward_retry_attempts+1,reward_last_attempt_at=now(),
          reward_last_error=case when v_bank is null then 'VreeoBank tidak tersedia atau nonaktif.' else 'Wallet penerima tidak ditemukan atau nonaktif.' end
          where id=v_checkin.id;
        continue;
      end if;
      v_result:=private.post_economy_transaction(
        v_bank,v_wallet,v_checkin.reward_amount,'checkin_reward',
        'Race check-in reward · pending','member-race-checkin:'||v_checkin.id::text,
        null,jsonb_build_object('checkin_id',v_checkin.id,'round_id',v_checkin.round_id,
          'member_id',v_checkin.member_id,'retry_run_id',v_run_id),null,true
      );
      if v_result is null then
        v_checkin_pending:=v_checkin_pending+1;
        update public.caleris_member_race_checkins set reward_retry_attempts=reward_retry_attempts+1,
          reward_last_attempt_at=now(),reward_last_error='Saldo VreeoBank belum mencukupi.'
          where id=v_checkin.id;
      else
        update public.caleris_member_race_checkins set reward_status='paid',
          reward_transaction_id=(v_result->>'transaction_id')::uuid,
          reward_retry_attempts=reward_retry_attempts+1,reward_last_attempt_at=now(),
          reward_last_error=null where id=v_checkin.id;
        v_checkin_paid:=v_checkin_paid+1;
      end if;
    exception when others then
      get stacked diagnostics v_error=message_text;
      update public.caleris_member_race_checkins set
        reward_retry_attempts=reward_retry_attempts+1,reward_last_attempt_at=now(),
        reward_last_error=left(v_error,1000) where id=v_checkin.id;
      v_checkin_pending:=v_checkin_pending+1;
    end;
  end loop;

  update public.caleris_economy_retry_runs set
    finished_at=now(),status='completed',
    reward_attempted=v_reward_attempted,reward_paid=v_reward_paid,reward_pending=v_reward_pending,
    checkin_attempted=v_checkin_attempted,checkin_paid=v_checkin_paid,checkin_pending=v_checkin_pending
  where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'status','completed',
    'reward_attempted',v_reward_attempted,'reward_paid',v_reward_paid,'reward_pending',v_reward_pending,
    'checkin_attempted',v_checkin_attempted,'checkin_paid',v_checkin_paid,'checkin_pending',v_checkin_pending);
exception when others then
  get stacked diagnostics v_error=message_text;
  if v_run_id is not null then
    update public.caleris_economy_retry_runs set finished_at=now(),status='failed',error=left(v_error,1000) where id=v_run_id;
  end if;
  raise;
end;
$function$;

revoke all on function private.retry_pending_economy_rewards() from public,anon,authenticated,service_role;

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
    'failed_retry_runs',(select count(*) from public.caleris_economy_retry_runs where status='failed'),
    'recent_runs',coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc)
      from (select id,started_at,finished_at,status,reward_attempted,reward_paid,reward_pending,
        checkin_attempted,checkin_paid,checkin_pending,error
        from public.caleris_economy_retry_runs order by started_at desc limit 12) r),'[]'::jsonb),
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
          'last_error','Payroll menunggu retry Admin atau pemrosesan round berikutnya.',
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
  select jobid into v_job from cron.job where jobname='caleris-economy-pending-retry';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('caleris-economy-pending-retry','*/5 * * * *',
    'select private.retry_pending_economy_rewards();');
end;
$schedule$;

commit;