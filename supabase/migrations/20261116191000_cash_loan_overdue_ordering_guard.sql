begin;

-- Preserve chronological debt settlement: an older overdue installment must
-- be retried before a later Race Period can create or collect another one.
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
   -- Never charge a newer Race Period while an older installment is overdue.
   if exists(
    select 1
    from public.economy_cash_loan_installments i
    join public.season_calendar_periods overdue_period on overdue_period.id=i.period_id
    join public.license_seasons overdue_season on overdue_season.id=overdue_period.season_id
    join public.license_seasons current_season on current_season.id=v_period.season_id
    where i.loan_id=v_loan.id and i.status='overdue'
      and (
       overdue_season.created_at<current_season.created_at
       or (overdue_season.id=current_season.id and overdue_period.sort_order<v_period.sort_order)
      )
   ) then
    continue;
   end if;
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

revoke all on function private.process_cash_loan_repayments(uuid,uuid) from public,anon,authenticated,service_role;

commit;
