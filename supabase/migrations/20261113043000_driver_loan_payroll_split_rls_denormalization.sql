begin;

alter table public.economy_payroll_claim_splits
  add column if not exists member_id uuid references public.members(id) on delete restrict,
  add column if not exists season_id uuid references public.license_seasons(id) on delete restrict,
  add column if not exists period_id uuid references public.season_calendar_periods(id) on delete restrict,
  add column if not exists origin_team_id uuid references public.teams(id) on delete restrict;

update public.economy_payroll_claim_splits s
set member_id=c.member_id,
    season_id=c.season_id,
    period_id=c.period_id,
    origin_team_id=c.team_id
from public.economy_payroll_claims c
where c.id=s.claim_id
  and (s.member_id is null or s.season_id is null or s.period_id is null or s.origin_team_id is null);

alter table public.economy_payroll_claim_splits
  alter column member_id set not null,
  alter column season_id set not null,
  alter column period_id set not null,
  alter column origin_team_id set not null;

create index if not exists economy_payroll_claim_splits_member_idx
  on public.economy_payroll_claim_splits(member_id,season_id,period_id);
create index if not exists economy_payroll_claim_splits_origin_team_idx
  on public.economy_payroll_claim_splits(origin_team_id,created_at desc);

drop policy if exists "Members and teams read payroll claims" on public.economy_payroll_claims;
create policy "Members read own payroll and team payroll"
on public.economy_payroll_claims
for select to authenticated
using (
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=economy_payroll_claims.member_id)
  or exists(
    select 1 from public.profiles p
    join public.members owner on owner.id=p.member_id
    where p.user_id=(select auth.uid())
      and owner.role='Owner'
      and owner.team_id=economy_payroll_claims.team_id
  )
);

drop policy if exists "Members and teams read payroll claim splits" on public.economy_payroll_claim_splits;
create policy "Members and teams read payroll claim splits"
on public.economy_payroll_claim_splits
for select to authenticated
using (
  exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.member_id=economy_payroll_claim_splits.member_id
  )
  or exists(
    select 1 from public.profiles p
    join public.members owner on owner.id=p.member_id
    where p.user_id=(select auth.uid())
      and owner.role='Owner'
      and owner.team_id in (
        economy_payroll_claim_splits.payer_team_id,
        economy_payroll_claim_splits.origin_team_id
      )
  )
);

drop function if exists public.economy_can_read_payroll_claim(uuid,uuid);

create or replace function private.process_economy_payroll_claim(p_claim_id uuid,p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claim public.economy_payroll_claims%rowtype;
  v_period public.season_calendar_periods%rowtype;
  v_loan public.caleris_driver_move_negotiations%rowtype;
  v_origin_wallet uuid;
  v_borrower_wallet uuid;
  v_driver_wallet uuid;
  v_origin_amount numeric(20,2);
  v_borrower_amount numeric(20,2);
  v_share numeric(5,2);
  v_origin_transaction jsonb;
  v_borrower_transaction jsonb;
  v_primary_transaction jsonb;
  v_borrower_team_id uuid;
begin
  select * into v_claim from public.economy_payroll_claims
  where id=p_claim_id for update;
  if not found or v_claim.status='paid' then
    return jsonb_build_object('paid',false,'reason','claim_not_pending');
  end if;

  select * into v_period from public.season_calendar_periods where id=v_claim.period_id;
  if not found then raise exception 'Race Period payroll tidak ditemukan.'; end if;

  select * into v_loan
  from public.caleris_driver_move_negotiations n
  where n.driver_member_id=v_claim.member_id
    and n.move_type='loan'
    and n.loan_season_id=v_claim.season_id
    and n.status in ('loan_active','loan_returned')
    and n.loan_starts_on<=v_period.ends_on
    and n.loan_ends_on>=v_period.starts_on
  order by n.loan_started_at desc nulls last
  limit 1;

  select id into v_origin_wallet from public.economy_wallet_accounts
  where account_kind='team' and team_id=v_claim.team_id and is_active;
  select id into v_driver_wallet from public.economy_wallet_accounts
  where account_kind='driver' and member_id=v_claim.member_id and is_active;

  if v_loan.id is not null then
    v_borrower_team_id:=v_loan.buyer_team_id;
    v_share:=v_loan.loan_salary_share_percent;
    v_borrower_amount:=round(v_claim.amount*v_share/100,2);
    v_origin_amount:=v_claim.amount-v_borrower_amount;
    select id into v_borrower_wallet from public.economy_wallet_accounts
    where account_kind='team' and team_id=v_borrower_team_id and is_active;

    if 100-v_share>0 then
      insert into public.economy_payroll_claim_splits(claim_id,payer_team_id,member_id,season_id,period_id,origin_team_id,amount,share_percent)
      values(v_claim.id,v_claim.team_id,v_claim.member_id,v_claim.season_id,v_claim.period_id,v_claim.team_id,v_origin_amount,100-v_share)
      on conflict(claim_id,payer_team_id) do nothing;
    end if;
    if v_share>0 then
      insert into public.economy_payroll_claim_splits(claim_id,payer_team_id,member_id,season_id,period_id,origin_team_id,amount,share_percent)
      values(v_claim.id,v_borrower_team_id,v_claim.member_id,v_claim.season_id,v_claim.period_id,v_claim.team_id,v_borrower_amount,v_share)
      on conflict(claim_id,payer_team_id) do nothing;
    end if;

    if v_origin_wallet is null or v_borrower_wallet is null or v_driver_wallet is null then
      return jsonb_build_object('paid',false,'reason','wallet_missing');
    end if;

    perform 1 from public.economy_wallet_accounts
    where id in (v_origin_wallet,v_borrower_wallet,v_driver_wallet)
    order by id for update;

    if (select balance from public.economy_wallet_accounts where id=v_borrower_wallet)<v_borrower_amount
      or (select balance from public.economy_wallet_accounts where id=v_origin_wallet)<v_origin_amount then
      return jsonb_build_object('paid',false,'reason','insufficient_team_balances');
    end if;

    if v_origin_amount>0 then
      v_origin_transaction:=private.post_economy_transaction(
        v_origin_wallet,v_driver_wallet,v_origin_amount,'payroll',
        'Driver Loan salary · '||v_period.title,
        'payroll:'||v_claim.period_id::text||':'||v_claim.member_id::text||':origin',
        p_actor_id,
        jsonb_build_object('season_id',v_claim.season_id,'period_id',v_claim.period_id,
          'member_id',v_claim.member_id,'team_id',v_claim.team_id,
          'annual_salary',v_claim.annual_salary,'period_count',v_claim.period_count,
          'loan_negotiation_id',v_loan.id,'loan_payer','origin',
          'loan_share_percent',100-v_share),
        null,false
      );
    end if;

    if v_borrower_amount>0 then
      v_borrower_transaction:=private.post_economy_transaction(
        v_borrower_wallet,v_driver_wallet,v_borrower_amount,'payroll',
        'Driver Loan salary · '||v_period.title,
        'payroll:'||v_claim.period_id::text||':'||v_claim.member_id::text||':borrower',
        p_actor_id,
        jsonb_build_object('season_id',v_claim.season_id,'period_id',v_claim.period_id,
          'member_id',v_claim.member_id,'team_id',v_borrower_team_id,
          'origin_team_id',v_claim.team_id,'annual_salary',v_claim.annual_salary,
          'period_count',v_claim.period_count,'loan_negotiation_id',v_loan.id,
          'loan_payer','borrower','loan_share_percent',v_share),
        null,false
      );
    end if;

    update public.economy_payroll_claim_splits
    set status='paid',
        transaction_id=case when payer_team_id=v_claim.team_id
          then (v_origin_transaction->>'transaction_id')::uuid
          else (v_borrower_transaction->>'transaction_id')::uuid end,
        paid_at=now()
    where claim_id=v_claim.id;

    v_primary_transaction:=coalesce(v_borrower_transaction,v_origin_transaction);
  else
    if v_origin_wallet is null or v_driver_wallet is null then
      return jsonb_build_object('paid',false,'reason','wallet_missing');
    end if;

    insert into public.economy_payroll_claim_splits(claim_id,payer_team_id,member_id,season_id,period_id,origin_team_id,amount,share_percent)
    values(v_claim.id,v_claim.team_id,v_claim.member_id,v_claim.season_id,v_claim.period_id,v_claim.team_id,v_claim.amount,100)
    on conflict(claim_id,payer_team_id) do nothing;

    perform 1 from public.economy_wallet_accounts
    where id in (v_origin_wallet,v_driver_wallet) order by id for update;
    if (select balance from public.economy_wallet_accounts where id=v_origin_wallet)<v_claim.amount then
      return jsonb_build_object('paid',false,'reason','insufficient_team_balance');
    end if;

    v_primary_transaction:=private.post_economy_transaction(
      v_origin_wallet,v_driver_wallet,v_claim.amount,'payroll',
      'Annual salary · '||v_period.title,
      'payroll:'||v_claim.period_id::text||':'||v_claim.member_id::text,
      p_actor_id,
      jsonb_build_object('season_id',v_claim.season_id,'period_id',v_claim.period_id,
        'member_id',v_claim.member_id,'team_id',v_claim.team_id,
        'annual_salary',v_claim.annual_salary,'period_count',v_claim.period_count),
      null,false
    );

    update public.economy_payroll_claim_splits
    set status='paid',transaction_id=(v_primary_transaction->>'transaction_id')::uuid,paid_at=now()
    where claim_id=v_claim.id;
  end if;

  update public.economy_payroll_claims
  set status='paid',
      transaction_id=(v_primary_transaction->>'transaction_id')::uuid,
      paid_at=now()
  where id=v_claim.id;

  return jsonb_build_object('paid',true,'transaction_id',v_primary_transaction->>'transaction_id');
end;
$$;
revoke all on function private.process_economy_payroll_claim(uuid,uuid) from public,anon,authenticated,service_role;


commit;