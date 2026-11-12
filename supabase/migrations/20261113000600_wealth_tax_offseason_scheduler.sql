-- Schedule automatic Wealth Tax collection at the beginning of each configured Off Season.
create extension if not exists pg_cron;

create or replace function private.process_wealth_tax_offseason()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_season_id uuid;v_assessment public.caleris_wealth_tax_assessments%rowtype;
 v_bank uuid;v_result jsonb;v_paid integer:=0;v_seasons integer:=0;
begin
 select id into v_bank from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active;
 if v_bank is null then raise exception 'Wallet VreeoBank tidak tersedia.'; end if;
 for v_season_id in
  select distinct p.season_id from public.season_calendar_periods p
  where p.period_type='off_season' and current_date between p.starts_on and p.ends_on
 loop
  v_seasons:=v_seasons+1;
  for v_assessment in
   select * from public.caleris_wealth_tax_assessments
   where season_id=v_season_id and status='assessed'
   order by id for update
  loop
   if v_assessment.tax_amount<=0 then
    update public.caleris_wealth_tax_assessments set status='paid',paid_at=now() where id=v_assessment.id;
    v_paid:=v_paid+1;continue;
   end if;
   v_result:=private.post_economy_transaction(v_assessment.wallet_id,v_bank,v_assessment.tax_amount,'tax',
    'Annual Wealth Tax · '||v_season_id::text,'wealth-tax:'||v_season_id::text||':'||v_assessment.wallet_id::text,
    null,jsonb_build_object('assessment_id',v_assessment.id,'season_id',v_season_id,'wallet_balance_snapshot',v_assessment.wallet_balance_snapshot,'rate_percent',v_assessment.applied_rate,'collection','off_season_automatic'),null,false);
   update public.caleris_wealth_tax_assessments
    set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now()
    where id=v_assessment.id;
   v_paid:=v_paid+1;
  end loop;
 end loop;
 return jsonb_build_object('seasons_processed',v_seasons,'assessments_paid',v_paid);
end;
$$;
revoke all on function private.process_wealth_tax_offseason() from public,anon,authenticated,service_role;

do $schedule$
declare v_job_id bigint;
begin
 select jobid into v_job_id from cron.job where jobname='caleris-wealth-tax-offseason' limit 1;
 if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
 perform cron.schedule('caleris-wealth-tax-offseason','* * * * *',
  'select private.process_wealth_tax_offseason();');
end;
$schedule$;
