begin;

-- Remove VreeoBank Cash Loan from team valuation inputs while preserving Driver Loan.
do $$
declare
  v_def text;
  v_old text;
begin
  v_def:=pg_get_functiondef('public.admin_assess_team_valuation(uuid,numeric,text)'::regprocedure);
  v_old:=$old$select coalesce(sum(l.total_due-l.amount_repaid),0),
         coalesce(sum(case when l.status='overdue' then l.total_due-l.amount_repaid else 0 end),0)
  into v_debt,v_overdue from public.economy_cash_loans l
  where l.loan_type='team' and l.team_id=p_team_id and l.status in ('active','overdue');$old$;
  if position(v_old in v_def)=0 then raise exception 'Cash-loan valuation block changed; migration aborted safely.'; end if;
  v_def:=replace(v_def,v_old,'v_debt:=0; v_overdue:=0;');
  v_def:=replace(v_def,
    'v_debt_penalty := case when v_debt+v_wallet>0 then least(30,(v_debt/(v_debt+v_wallet))*30) else 0 end;',
    'v_debt_penalty := 0;');
  v_def:=replace(v_def,
    'v_overdue_penalty := case when v_debt>0 then least(30,(v_overdue/v_debt)*30) else 0 end;',
    'v_overdue_penalty := 0;');
  v_def:=replace(v_def,
    'v_score := greatest(0,least(100,v_score-v_debt_penalty-v_overdue_penalty));',
    'v_score := greatest(0,least(100,v_score));');
  execute v_def;
end $$;

-- Admin can no longer set the valuation base manually. The trusted valuation engine
-- retains service-role execution; public/team takeover flows remain unchanged.
revoke all on function public.admin_assess_team_valuation(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.admin_assess_team_valuation(uuid,numeric,text) to service_role;

-- Base valuation tiers are ordered by the first creation of each division key.
-- Existing teams are deliberately not rewritten.
create or replace function private.set_team_default_base_valuation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_tier integer;
begin
  if new.base_valuation is null then
    select tier_no into v_tier from (
      select division_key,row_number() over(order by first_created,division_key)::integer tier_no
      from (
        select lower(division_key) division_key,min(created_at) first_created
        from public.license_season_divisions group by lower(division_key)
      ) d
    ) ranked where ranked.division_key=lower(coalesce(new.division_key,''));
    if v_tier is null then
      select count(distinct lower(division_key))+1 into v_tier from public.license_season_divisions;
    end if;
    new.base_valuation:=140000000-(20000000*greatest(v_tier,1));
  end if;
  return new;
end $$;

commit;
