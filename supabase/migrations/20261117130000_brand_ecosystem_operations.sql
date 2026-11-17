-- CALERIS Brand Ecosystem operations: sponsor administration, settlement and season evaluation.
create or replace function public.admin_upsert_brand_sponsor(
 p_id uuid,p_name text,p_industry text,p_tier_key text,p_budget numeric,p_flexibility numeric default 10,
 p_region_scope text default 'regional',p_logo_url text default null,p_description text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 120 then raise exception 'Nama sponsor tidak valid.'; end if;
 if p_budget is null or p_budget<0 or p_budget<>round(p_budget,2) then raise exception 'Budget sponsor tidak valid.'; end if;
 if p_flexibility not between 0 and 100 then raise exception 'Fleksibilitas sponsor tidak valid.'; end if;
 if p_tier_key is not null and not exists(select 1 from public.caleris_sponsor_tier_rules where tier_key=p_tier_key) then raise exception 'Tier sponsor belum dikonfigurasi.'; end if;
 if p_id is null then
  insert into public.caleris_sponsors(name,industry,industry_category,tier_key,available_budget,flexibility_percent,region_scope,logo_url,description,is_active,created_by)
  values(trim(p_name),nullif(trim(p_industry),''),nullif(trim(p_industry),''),p_tier_key,p_budget,p_flexibility,coalesce(p_region_scope,'regional'),nullif(trim(p_logo_url),''),nullif(trim(p_description),''),true,(select auth.uid()))
  returning id into v_id;
 else
  update public.caleris_sponsors set name=trim(p_name),industry=nullif(trim(p_industry),''),industry_category=nullif(trim(p_industry),''),
   tier_key=p_tier_key,available_budget=p_budget,flexibility_percent=p_flexibility,region_scope=coalesce(p_region_scope,'regional'),
   logo_url=nullif(trim(p_logo_url),''),description=nullif(trim(p_description),''),updated_at=now()
  where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Sponsor tidak ditemukan.'; end if;
 end if;
 return v_id;
end $$;

create or replace function public.admin_upsert_sponsor_tier_rule(
 p_tier_key text,p_label text,p_minimum_team_reputation integer,p_minimum_fan_population bigint,
 p_minimum_season_performance numeric,p_minimum_budget numeric,p_maximum_budget numeric,p_is_active boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_tier_key is null or length(trim(p_tier_key)) not between 1 and 16 or p_minimum_team_reputation not between 0 and 9999
  or p_minimum_fan_population<0 or p_minimum_season_performance<0 or p_minimum_budget<0
  or (p_maximum_budget is not null and p_maximum_budget<p_minimum_budget) then raise exception 'Aturan tier tidak valid.'; end if;
 insert into public.caleris_sponsor_tier_rules(tier_key,label,minimum_team_reputation,minimum_fan_population,minimum_season_performance,minimum_budget,maximum_budget,is_active,updated_by)
 values(trim(p_tier_key),trim(p_label),p_minimum_team_reputation,p_minimum_fan_population,p_minimum_season_performance,p_minimum_budget,p_maximum_budget,p_is_active,(select auth.uid()))
 on conflict(tier_key) do update set label=excluded.label,minimum_team_reputation=excluded.minimum_team_reputation,
 minimum_fan_population=excluded.minimum_fan_population,minimum_season_performance=excluded.minimum_season_performance,
 minimum_budget=excluded.minimum_budget,maximum_budget=excluded.maximum_budget,is_active=excluded.is_active,updated_by=excluded.updated_by,updated_at=now();
end $$;

create or replace function public.admin_process_sponsorship_payments()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record;v_source uuid;v_destination uuid;v_result jsonb;v_paid integer:=0;v_skipped integer:=0;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 select id into v_source from public.economy_wallet_accounts where account_kind='sponsor_source' and is_active order by created_at limit 1;
 if v_source is null then raise exception 'Sponsor Source tidak tersedia.'; end if;
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
   'Sponsorship seasonal payment','sponsor-schedule:'||v_item.id::text,(select auth.uid()),
   jsonb_build_object('contract_id',v_item.contract_id,'season_id',v_item.season_id,'schedule_id',v_item.id),null,false);
  update public.caleris_sponsors set available_budget=available_budget-v_item.amount,updated_at=now() where id=v_item.sponsor_id;
  update public.caleris_sponsorship_payment_schedule set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now() where id=v_item.id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,null,v_item.amount,'Seasonal sponsorship payment',(v_result->>'transaction_id')::uuid,(select auth.uid()));
  v_paid:=v_paid+1;
 end loop;
 return jsonb_build_object('paid',v_paid,'skipped',v_skipped);
end $$;

create or replace function public.admin_process_sponsorship_bonuses()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record;v_source uuid;v_destination uuid;v_result jsonb;v_paid integer:=0;v_skipped integer:=0;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 select id into v_source from public.economy_wallet_accounts where account_kind='sponsor_source' and is_active order by created_at limit 1;
 if v_source is null then raise exception 'Sponsor Source tidak tersedia.'; end if;
 for v_item in
  select t.id target_id,t.bonus_amount,c.id contract_id,c.target_team_id,c.bonus_pool_total,c.bonus_pool_paid,
   s.id sponsor_id,s.available_budget
  from public.caleris_sponsorship_targets t join public.caleris_sponsorship_contracts c on c.id=t.contract_id and c.status='active' and c.target_kind='team'
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
   'Sponsorship target bonus','sponsor-bonus:'||v_item.target_id::text,(select auth.uid()),
   jsonb_build_object('contract_id',v_item.contract_id,'target_id',v_item.target_id),null,false);
  update public.caleris_sponsors set available_budget=available_budget-v_item.bonus_amount,updated_at=now() where id=v_item.sponsor_id;
  update public.caleris_sponsorship_contracts set bonus_pool_paid=bonus_pool_paid+v_item.bonus_amount where id=v_item.contract_id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,v_item.target_id,v_item.bonus_amount,'Sponsorship achievement bonus',(v_result->>'transaction_id')::uuid,(select auth.uid()));
  v_paid:=v_paid+1;
 end loop;
 return jsonb_build_object('paid',v_paid,'skipped',v_skipped);
end $$;

create or replace function public.admin_evaluate_sponsorship_trust(p_contract_id uuid,p_season_id uuid,p_metrics jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contract public.caleris_sponsorship_contracts%rowtype;v_weights jsonb;v_score numeric;v_band text;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if jsonb_typeof(p_metrics)<>'object' then raise exception 'Metrics evaluasi tidak valid.'; end if;
 select * into v_contract from public.caleris_sponsorship_contracts where id=p_contract_id and status='active' for update;
 if not found then raise exception 'Kontrak aktif tidak ditemukan.'; end if;
 select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='sponsor_trust_weights';
 v_score:=(
  coalesce((p_metrics->>'target_achievement')::numeric,0)*coalesce((v_weights->>'target_achievement')::numeric,45)+
  coalesce((p_metrics->>'consistency')::numeric,0)*coalesce((v_weights->>'consistency')::numeric,20)+
  coalesce((p_metrics->>'fanbase_growth')::numeric,0)*coalesce((v_weights->>'fanbase_growth')::numeric,15)+
  coalesce((p_metrics->>'commercial_exposure')::numeric,0)*coalesce((v_weights->>'commercial_exposure')::numeric,10)+
  coalesce((p_metrics->>'partnership_conduct')::numeric,0)*coalesce((v_weights->>'partnership_conduct')::numeric,10)
 )/100;
 if v_score<0 or v_score>100 then raise exception 'Setiap metrik harus berada pada rentang 0 sampai 100.'; end if;
 v_band:=case when v_score>=90 then 'premium' when v_score>=80 then 'standard' when v_score>=60 then 'conditional' else 'terminated' end;
 insert into public.caleris_sponsorship_season_evaluations(contract_id,season_id,trust_score,renewal_band,metrics)
 values(p_contract_id,p_season_id,round(v_score)::integer,v_band,p_metrics)
 on conflict(contract_id,season_id) do update set trust_score=excluded.trust_score,renewal_band=excluded.renewal_band,metrics=excluded.metrics,evaluated_at=now();
 update public.caleris_sponsorship_contracts set renewal_status=case v_band when 'premium' then 'proposed' when 'standard' then 'proposed' when 'conditional' then 'conditional' else 'terminated' end,
  status=case when v_band='terminated' then 'terminated' else status end,
  ended_at=case when v_band='terminated' then now() else ended_at end
 where id=p_contract_id;
 return jsonb_build_object('trust_score',round(v_score)::integer,'renewal_band',v_band);
end $$;

revoke all on function public.admin_upsert_brand_sponsor(uuid,text,text,text,numeric,numeric,text,text,text) from public,anon;
revoke all on function public.admin_upsert_sponsor_tier_rule(text,text,integer,bigint,numeric,numeric,numeric,boolean) from public,anon;
revoke all on function public.admin_process_sponsorship_payments() from public,anon;
revoke all on function public.admin_process_sponsorship_bonuses() from public,anon;
revoke all on function public.admin_evaluate_sponsorship_trust(uuid,uuid,jsonb) from public,anon;
grant execute on function public.admin_upsert_brand_sponsor(uuid,text,text,text,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.admin_upsert_sponsor_tier_rule(text,text,integer,bigint,numeric,numeric,numeric,boolean) to authenticated;
grant execute on function public.admin_process_sponsorship_payments() to authenticated;
grant execute on function public.admin_process_sponsorship_bonuses() to authenticated;
grant execute on function public.admin_evaluate_sponsorship_trust(uuid,uuid,jsonb) to authenticated;
