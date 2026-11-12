-- Prevent duplicate Driver check-in payouts and defer loan repayments until
-- every division's Race Period payroll has been processed.
begin;

-- The canonical all-role workflow in member_race_checkin() already pays the
-- configured reward. Keep the license scoring trigger; remove only the legacy
-- economy trigger that paid Drivers a second time.
drop trigger if exists economy_daily_checkin_reward on public.license_daily_checkins;

create or replace function private.try_process_cash_loan_repayments(
  p_period_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period public.season_calendar_periods%rowtype;
  v_expected_divisions integer;
  v_mapped_divisions integer;
begin
  select *
  into v_period
  from public.season_calendar_periods
  where id=p_period_id and period_type='race_period'
  for update;

  if not found then
    return jsonb_build_object('paid',0,'overdue',0,'status','not_a_race_period');
  end if;

  select count(*)
  into v_expected_divisions
  from public.license_season_divisions
  where season_id=v_period.season_id;

  select count(distinct season_division_id)
  into v_mapped_divisions
  from public.season_period_rounds
  where period_id=v_period.id;

  if v_expected_divisions=0 or v_mapped_divisions<>v_expected_divisions then
    return jsonb_build_object(
      'paid',0,'overdue',0,'period_id',v_period.id,
      'status','waiting_for_complete_division_mapping'
    );
  end if;

  if exists (
    select 1
    from public.season_period_rounds pr
    join public.license_rounds r on r.id=pr.round_id
    where pr.period_id=v_period.id
      and r.status<>'closed'
  ) then
    return jsonb_build_object(
      'paid',0,'overdue',0,'period_id',v_period.id,
      'status','waiting_for_all_divisions'
    );
  end if;

  -- Do not attempt an installment while any division's salary claim is still
  -- pending. Admin payroll recovery calls this function again after settlement.
  if exists (
    select 1
    from public.economy_payroll_claims pc
    where pc.period_id=v_period.id
      and pc.status='pending'
  ) then
    return jsonb_build_object(
      'paid',0,'overdue',0,'period_id',v_period.id,
      'status','waiting_for_payroll'
    );
  end if;

  return private.process_cash_loan_repayments(v_period.id,p_actor_id);
end;
$$;

revoke all on function private.try_process_cash_loan_repayments(uuid,uuid)
  from public,anon,authenticated,service_role;

-- Change only the repayment dispatch in the existing round processor. The
-- round scoring, validation, closure and payroll implementation stay intact.
do $round_dispatch$
declare
  v_definition text;
  v_original text;
  v_replacement text;
begin
  v_definition:=pg_get_functiondef('public.process_license_round(uuid)'::regprocedure);
  v_original:='v_repayments:=private.process_cash_loan_repayments(';
  v_replacement:='v_repayments:=private.try_process_cash_loan_repayments(';

  if position(v_original in v_definition)=0 then
    raise exception 'Expected cash-loan dispatch was not found in process_license_round().';
  end if;

  v_definition:=replace(v_definition,v_original,v_replacement);
  execute v_definition;
end;
$round_dispatch$;

-- When Admin recovers pending payroll, retry loan orchestration for the
-- affected periods. The helper itself still enforces the all-division barrier.
do $payroll_recovery$
declare
  v_definition text;
  v_original text;
  v_replacement text;
begin
  v_definition:=pg_get_functiondef(
    'public.admin_process_pending_economy_payroll(uuid)'::regprocedure
  );

  v_original:='  v_pending integer:=0;';
  v_replacement:=
    '  v_pending integer:=0;'||E'\n'||
    '  v_period_id uuid;'||E'\n'||
    '  v_processed_periods uuid[]:=array[]::uuid[];'||E'\n'||
    '  v_repayments jsonb;';

  if position(v_original in v_definition)=0 then
    raise exception 'Could not locate pending-payroll declaration.';
  end if;
  v_definition:=replace(v_definition,v_original,v_replacement);

  v_original:='      v_paid:=v_paid+1;';
  v_replacement:=
    '      v_paid:=v_paid+1;'||E'\n'||
    '      if not (v_claim.period_id=any(v_processed_periods)) then'||E'\n'||
    '        v_processed_periods:=array_append(v_processed_periods,v_claim.period_id);'||E'\n'||
    '      end if;';

  if position(v_original in v_definition)=0 then
    raise exception 'Could not locate successful payroll settlement branch.';
  end if;
  v_definition:=replace(v_definition,v_original,v_replacement);

  v_original:='  return jsonb_build_object(''paid'',v_paid,''pending'',v_pending);';
  v_replacement:=
    '  foreach v_period_id in array v_processed_periods loop'||E'\n'||
    '    v_repayments:=private.try_process_cash_loan_repayments(v_period_id,p_actor_id);'||E'\n'||
    '  end loop;'||E'\n'||
    '  return jsonb_build_object(''paid'',v_paid,''pending'',v_pending);';

  if position(v_original in v_definition)=0 then
    raise exception 'Could not locate pending-payroll return branch.';
  end if;
  v_definition:=replace(v_definition,v_original,v_replacement);

  execute v_definition;
end;
$payroll_recovery$;

commit;
