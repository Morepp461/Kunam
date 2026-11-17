begin;

-- Team Owner Quest rewards and every team income continue to use the existing
-- member/team wallet accounts. This settlement is a separate 10% share of the
-- team's positive season net cashflow, paid only after End Season and prizes.

create table if not exists public.caleris_team_owner_profit_shares (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.license_seasons(id) on delete restrict,
 team_id uuid not null references public.teams(id) on delete restrict,
 owner_member_id uuid references public.members(id) on delete set null,
 profit_amount numeric(20,2) not null default 0 check(profit_amount>=0),
 share_rate numeric(6,3) not null default 10 check(share_rate=10),
 share_amount numeric(20,2) not null default 0 check(share_amount>=0),
 status text not null default 'pending' check(status in ('pending','paid','no_profit')),
 transaction_id uuid references public.economy_transactions(id) on delete restrict,
 processed_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(season_id,team_id)
);

create index if not exists caleris_team_owner_profit_shares_season_status_idx
 on public.caleris_team_owner_profit_shares(season_id,status);

alter table public.caleris_team_owner_profit_shares enable row level security;
revoke all on public.caleris_team_owner_profit_shares from public,anon,authenticated,service_role;

create or replace function private.process_team_owner_profit_shares()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
 v_actor_id uuid;
 v_season record;
 v_team record;
 v_share public.caleris_team_owner_profit_shares%rowtype;
 v_bank_id uuid;
 v_owner_wallet_id uuid;
 v_profit numeric(20,2);
 v_share_amount numeric(20,2);
 v_tx jsonb;
 v_paid integer:=0;
 v_no_profit integer:=0;
 v_pending integer:=0;
 v_error text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('caleris-team-owner-profit-share',0)) then
  return jsonb_build_object('status','already_running');
 end if;

 select user_id into v_actor_id from public.site_admins order by user_id limit 1;
 if v_actor_id is null then
  return jsonb_build_object('status','no_admin_context');
 end if;
 perform set_config('request.jwt.claim.sub',v_actor_id::text,true);

 select id into v_bank_id from public.economy_wallet_accounts
 where account_kind='vreeo_bank' and is_active order by created_at limit 1;

 -- A season becomes eligible only after its configured End Season period has
 -- ended, every division is finalized, and each division's prizepool was paid.
 for v_season in
  select s.id,s.title,s.starts_on,s.ends_on
  from public.license_seasons s
  where exists(
    select 1 from public.season_calendar_periods ep
    where ep.season_id=s.id and ep.period_type='end_season'
      and ep.ends_on<=current_date
  )
  and exists(select 1 from public.license_season_divisions d where d.season_id=s.id)
  and not exists(select 1 from public.license_season_divisions d where d.season_id=s.id and d.status<>'completed')
  and not exists(
    select 1 from public.license_season_divisions d
    where d.season_id=s.id
      and not exists(select 1 from public.caleris_prizepool_payouts p where p.season_division_id=d.id)
  )
  order by s.created_at,s.id
 loop
  for v_team in
   select distinct t.id team_id,t.name,
     owner.id owner_member_id,owner.character_name owner_name
   from public.license_season_divisions d
   join public.license_team_final_standings fs on fs.season_division_id=d.id
   join public.teams t on t.id=fs.team_id
   left join public.members owner on owner.team_id=t.id and owner.role='Owner'
   where d.season_id=v_season.id
   order by t.id
  loop
   perform pg_advisory_xact_lock(hashtextextended(v_season.id::text||':'||v_team.team_id::text,0));

   select * into v_share
   from public.caleris_team_owner_profit_shares
   where season_id=v_season.id and team_id=v_team.team_id
   for update;

   if found and v_share.status in ('paid','no_profit') then
    continue;
   end if;

   -- Profit is the season's net operating cashflow in the Team Wallet.
   -- Loan principal movements are financing, not income or operating expense.
   select round(coalesce(sum(
     case when e.entry_side='inflow' then e.amount else -e.amount end
   ),0),2)
   into v_profit
   from public.economy_wallet_accounts w
   join public.economy_entries e on e.account_id=w.id
   join public.economy_transactions tx on tx.id=e.transaction_id
   where w.account_kind='team' and w.team_id=v_team.team_id
     and tx.created_at>=v_season.starts_on::timestamptz
     and tx.created_at<(v_season.ends_on+1)::timestamptz
     and tx.event_type not in ('loan_disbursement','loan_repayment')
     and coalesce(tx.metadata->>'source','')<>'team_owner_profit_share';

   if coalesce(v_profit,0)<=0 then
    insert into public.caleris_team_owner_profit_shares(
      season_id,team_id,owner_member_id,profit_amount,share_rate,share_amount,status,processed_at
    ) values(v_season.id,v_team.team_id,v_team.owner_member_id,0,10,0,'no_profit',now())
    on conflict(season_id,team_id) do update
      set owner_member_id=excluded.owner_member_id,profit_amount=0,share_amount=0,
          status='no_profit',processed_at=now(),last_error=null,updated_at=now()
      where public.caleris_team_owner_profit_shares.status='pending';
    v_no_profit:=v_no_profit+1;
    continue;
   end if;

   v_share_amount:=round(v_profit*0.10,2);
   if v_team.owner_member_id is null or v_bank_id is null then
    insert into public.caleris_team_owner_profit_shares(
      season_id,team_id,owner_member_id,profit_amount,share_rate,share_amount,status,last_error
    ) values(v_season.id,v_team.team_id,v_team.owner_member_id,v_profit,10,v_share_amount,'pending',
      case when v_team.owner_member_id is null then 'Team Owner tidak ditemukan.' else 'VreeoBank tidak tersedia.' end)
    on conflict(season_id,team_id) do update
      set owner_member_id=excluded.owner_member_id,profit_amount=excluded.profit_amount,
          share_amount=excluded.share_amount,status='pending',
          last_error=excluded.last_error,updated_at=now()
      where public.caleris_team_owner_profit_shares.status='pending';
    v_pending:=v_pending+1;
    continue;
   end if;

   select id into v_owner_wallet_id
   from public.economy_wallet_accounts
   where account_kind='team_owner' and member_id=v_team.owner_member_id and is_active
   for update;

   if v_owner_wallet_id is null then
    insert into public.caleris_team_owner_profit_shares(
      season_id,team_id,owner_member_id,profit_amount,share_rate,share_amount,status,last_error
    ) values(v_season.id,v_team.team_id,v_team.owner_member_id,v_profit,10,v_share_amount,'pending','Team Owner Wallet tidak tersedia.')
    on conflict(season_id,team_id) do update
      set owner_member_id=excluded.owner_member_id,profit_amount=excluded.profit_amount,
          share_amount=excluded.share_amount,status='pending',
          last_error=excluded.last_error,updated_at=now()
      where public.caleris_team_owner_profit_shares.status='pending';
    v_pending:=v_pending+1;
    continue;
   end if;

   v_tx:=private.post_economy_transaction(
    v_bank_id,v_owner_wallet_id,v_share_amount,'bank_reward',
    'Team Owner Profit Share · '||v_season.title,
    'team-owner-profit-share:'||v_season.id::text||':'||v_team.team_id::text,
    v_actor_id,
    jsonb_build_object('source','team_owner_profit_share','season_id',v_season.id,
      'team_id',v_team.team_id,'owner_member_id',v_team.owner_member_id,
      'profit_amount',v_profit,'share_rate',10,'share_amount',v_share_amount),
    null,true
   );

   if v_tx is null then
    insert into public.caleris_team_owner_profit_shares(
      season_id,team_id,owner_member_id,profit_amount,share_rate,share_amount,status,last_error
    ) values(v_season.id,v_team.team_id,v_team.owner_member_id,v_profit,10,v_share_amount,'pending','Saldo VreeoBank belum mencukupi.')
    on conflict(season_id,team_id) do update
      set owner_member_id=excluded.owner_member_id,profit_amount=excluded.profit_amount,
          share_amount=excluded.share_amount,status='pending',
          last_error=excluded.last_error,updated_at=now()
      where public.caleris_team_owner_profit_shares.status='pending';
    v_pending:=v_pending+1;
    continue;
   end if;

   insert into public.caleris_team_owner_profit_shares(
    season_id,team_id,owner_member_id,profit_amount,share_rate,share_amount,status,transaction_id,processed_at
   ) values(v_season.id,v_team.team_id,v_team.owner_member_id,v_profit,10,v_share_amount,'paid',
     (v_tx->>'transaction_id')::uuid,now())
   on conflict(season_id,team_id) do update
    set owner_member_id=excluded.owner_member_id,profit_amount=excluded.profit_amount,
        share_amount=excluded.share_amount,status='paid',
        transaction_id=excluded.transaction_id,processed_at=now(),last_error=null,updated_at=now()
    where public.caleris_team_owner_profit_shares.status='pending';
   v_paid:=v_paid+1;
  end loop;
 end loop;

 return jsonb_build_object('status','completed','paid',v_paid,'no_profit',v_no_profit,'pending',v_pending);
exception when others then
 get stacked diagnostics v_error=message_text;
 raise;
end;
$function$;

revoke all on function private.process_team_owner_profit_shares() from public,anon,authenticated,service_role;

do $schedule$
declare v_job bigint;
begin
 select jobid into v_job from cron.job where jobname='caleris-team-owner-profit-share';
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule(
  'caleris-team-owner-profit-share','*/5 * * * *',
  'select private.process_team_owner_profit_shares();'
 );
end;
$schedule$;

commit;
