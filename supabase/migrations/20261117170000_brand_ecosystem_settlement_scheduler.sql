-- Run due sponsor settlements automatically. All payouts still pass through the Economy Ledger.
create or replace function private.process_brand_ecosystem_scheduled_settlements()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record;v_source uuid;v_destination uuid;v_result jsonb;v_paid integer:=0;v_bonus_paid integer:=0;v_skipped integer:=0;
begin
 select id into v_source from public.economy_wallet_accounts where account_kind='sponsor_source' and is_active order by created_at limit 1;
 if v_source is null then return jsonb_build_object('status','no_sponsor_source'); end if;
 for v_item in
  select ps.*,c.target_team_id,c.sponsor_id,s.available_budget
  from public.caleris_sponsorship_payment_schedule ps
  join public.caleris_sponsorship_contracts c on c.id=ps.contract_id and c.status='active' and c.target_kind='team'
  join public.caleris_sponsors s on s.id=c.sponsor_id and s.is_active
  where ps.status='scheduled' and ps.due_at<=now()
  order by ps.due_at,ps.id for update of ps,s
 loop
  if v_item.available_budget is null or v_item.available_budget<v_item.amount then v_skipped:=v_skipped+1;continue;end if;
  select id into v_destination from public.economy_wallet_accounts where account_kind='team' and team_id=v_item.target_team_id and is_active;
  if v_destination is null then v_skipped:=v_skipped+1;continue;end if;
  v_result:=private.post_economy_transaction(v_source,v_destination,v_item.amount,'sponsor_payout',
   'Sponsorship seasonal payment','sponsor-schedule:'||v_item.id::text,null,
   jsonb_build_object('contract_id',v_item.contract_id,'season_id',v_item.season_id,'schedule_id',v_item.id),null,false);
  update public.caleris_sponsors set available_budget=available_budget-v_item.amount,updated_at=now() where id=v_item.sponsor_id;
  update public.caleris_sponsorship_payment_schedule set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now() where id=v_item.id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,null,v_item.amount,'Seasonal sponsorship payment',(v_result->>'transaction_id')::uuid,null);
  v_paid:=v_paid+1;
 end loop;
 for v_item in
  select t.id target_id,t.bonus_amount,c.id contract_id,c.target_team_id,c.bonus_pool_total,c.bonus_pool_paid,
   s.id sponsor_id,s.available_budget
  from public.caleris_sponsorship_targets t
  join public.caleris_sponsorship_contracts c on c.id=t.contract_id and c.status='active' and c.target_kind='team'
  join public.caleris_sponsors s on s.id=c.sponsor_id and s.is_active
  where t.status='achieved' and t.bonus_amount>0
   and not exists(select 1 from public.caleris_sponsorship_payouts p where p.target_id=t.id)
  order by t.created_at,t.id for update of t,c,s
 loop
  if v_item.bonus_pool_paid+v_item.bonus_amount>v_item.bonus_pool_total
   or v_item.available_budget is null or v_item.available_budget<v_item.bonus_amount then v_skipped:=v_skipped+1;continue;end if;
  select id into v_destination from public.economy_wallet_accounts where account_kind='team' and team_id=v_item.target_team_id and is_active;
  if v_destination is null then v_skipped:=v_skipped+1;continue;end if;
  v_result:=private.post_economy_transaction(v_source,v_destination,v_item.bonus_amount,'sponsor_payout',
   'Sponsorship target bonus','sponsor-bonus:'||v_item.target_id::text,null,
   jsonb_build_object('contract_id',v_item.contract_id,'target_id',v_item.target_id),null,false);
  update public.caleris_sponsors set available_budget=available_budget-v_item.bonus_amount,updated_at=now() where id=v_item.sponsor_id;
  update public.caleris_sponsorship_contracts set bonus_pool_paid=bonus_pool_paid+v_item.bonus_amount where id=v_item.contract_id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,v_item.target_id,v_item.bonus_amount,'Sponsorship achievement bonus',(v_result->>'transaction_id')::uuid,null);
  v_bonus_paid:=v_bonus_paid+1;
 end loop;
 return jsonb_build_object('seasonal_payments',v_paid,'bonuses',v_bonus_paid,'skipped',v_skipped);
end $$;

revoke all on function private.process_brand_ecosystem_scheduled_settlements() from public,anon,authenticated;
do $$
declare v_job bigint;
begin
 for v_job in select jobid from cron.job where jobname='caleris-brand-ecosystem-settlements'
 loop perform cron.unschedule(v_job); end loop;
 perform cron.schedule('caleris-brand-ecosystem-settlements','*/15 * * * *',
  'select private.process_brand_ecosystem_scheduled_settlements();');
end $$;
