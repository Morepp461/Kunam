-- Sponsor capacity and VreeoBank-funded sponsorship settlement.
-- The sponsor's available_budget column is retained for compatibility only.
begin;
alter table public.caleris_sponsors alter column available_budget drop not null;
update public.caleris_sponsors set available_budget=null;

create or replace function public.admin_upsert_brand_sponsor(
 p_id uuid,p_name text,p_industry text,p_tier_key text,p_budget numeric,p_flexibility numeric default 10,
 p_region_scope text default 'regional',p_logo_url text default null,p_description text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 120 then raise exception 'Nama sponsor tidak valid.'; end if;
 if p_flexibility is null or p_flexibility not between 0 and 100 then raise exception 'Fleksibilitas sponsor tidak valid.'; end if;
 if p_tier_key is not null and not exists(select 1 from public.caleris_sponsor_tier_rules where tier_key=p_tier_key) then raise exception 'Tier sponsor belum dikonfigurasi.'; end if;
 if p_id is null then
  insert into public.caleris_sponsors(name,industry,industry_category,tier_key,available_budget,flexibility_percent,region_scope,logo_url,description,is_active,created_by)
  values(trim(p_name),nullif(trim(p_industry),''),nullif(trim(p_industry),''),p_tier_key,null,p_flexibility,coalesce(p_region_scope,'regional'),nullif(trim(p_logo_url),''),nullif(trim(p_description),''),true,(select auth.uid()))
  returning id into v_id;
 else
  update public.caleris_sponsors set name=trim(p_name),industry=nullif(trim(p_industry),''),industry_category=nullif(trim(p_industry),''),
   tier_key=p_tier_key,available_budget=null,flexibility_percent=p_flexibility,region_scope=coalesce(p_region_scope,'regional'),
   logo_url=nullif(trim(p_logo_url),''),description=nullif(trim(p_description),''),updated_at=now()
  where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Sponsor tidak ditemukan.'; end if;
 end if;
 return v_id;
end $$;
revoke all on function public.admin_upsert_brand_sponsor(uuid,text,text,text,numeric,numeric,text,text,text) from public,anon;
grant execute on function public.admin_upsert_brand_sponsor(uuid,text,text,text,numeric,numeric,text,text,text) to authenticated;
revoke all on function public.admin_set_sponsor_budget(uuid,numeric) from public,anon,authenticated;

-- Sponsorship uses VreeoBank, with unlimited funding restricted to this payout event.
do $$
declare v_def text; v_old text; v_new text;
begin
 v_def:=pg_get_functiondef('private.post_economy_transaction(uuid,uuid,numeric,text,text,text,uuid,jsonb,uuid,boolean)'::regprocedure);
 v_old:='elsif p_event_type=''sponsor_payout'' and (v_source.account_kind<>''sponsor_source'' or v_destination.account_kind in (''vreeo_bank'',''sponsor_source'')) then';
 v_new:='elsif p_event_type=''sponsor_payout'' and (v_source.account_kind<>''vreeo_bank'' or v_destination.account_kind in (''vreeo_bank'',''sponsor_source'')) then';
 if position(v_old in v_def)=0 then raise exception 'Sponsor payout route guard changed.'; end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:='if v_source.balance<p_amount and v_source.account_kind<>''sponsor_source'' and p_event_type not in (''tax'',''fine'') then';
 v_new:='if v_source.balance<p_amount and v_source.account_kind<>''sponsor_source'' and not (p_event_type=''sponsor_payout'' and v_source.account_kind=''vreeo_bank'') and p_event_type not in (''tax'',''fine'') then';
 if position(v_old in v_def)=0 then raise exception 'Economy balance guard changed.'; end if;
 execute replace(v_def,v_old,v_new);
end $$;

-- Matching reserves capacity per brand and season: T1 = 2 teams, all other tiers = 3.
-- Outstanding offers reserve a slot so parallel matching cannot overbook a sponsor.
do $$
declare v_def text; v_old text; v_new text;
begin
 v_def:=pg_get_functiondef('private.auto_generate_team_sponsorship_offers(uuid)'::regprocedure);
 v_old:='  v_open_count integer;';
 v_new:='  v_open_count integer; v_sponsor_count integer; v_sponsor_limit integer;';
 if position(v_old in v_def)=0 then raise exception 'Private matcher declaration changed.'; end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:='        and s.available_budget is not null
        and s.available_budget>=coalesce((s.target_audience->>''offer_amount_min'')::numeric,0)
';
 if position(v_old in v_def)=0 then raise exception 'Private matcher budget predicate changed.'; end if;
 v_def:=replace(v_def,v_old,'');
 v_old:='      v_amount:=(v_sponsor.target_audience->>''base_amount'')::numeric;';
 v_new:='      perform pg_advisory_xact_lock(hashtextextended(v_sponsor.id::text||'':''||p_season_id::text,0));
      select count(distinct reserved.team_id) into v_sponsor_count from (
        select c.target_team_id team_id from public.caleris_sponsorship_contracts c
        where c.sponsor_id=v_sponsor.id and c.status=''active''
          and (c.season_id=p_season_id or exists(select 1 from public.caleris_sponsorship_payment_schedule ps where ps.contract_id=c.id and ps.season_id=p_season_id))
        union
        select o.target_team_id from public.caleris_sponsorship_offers o
        where o.sponsor_id=v_sponsor.id and o.season_id=p_season_id and o.status in (''offered'',''negotiating'',''accepted'')
      ) reserved;
      v_sponsor_limit:=case when upper(coalesce(v_sponsor.tier_key,'''')) in (''T1'',''TIER 1'') then 2 else 3 end;
      if v_sponsor_count>=v_sponsor_limit then continue; end if;
      v_amount:=(v_sponsor.target_audience->>''base_amount'')::numeric;';
 if position(v_old in v_def)=0 then raise exception 'Private matcher offer insertion point changed.'; end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:='      if v_amount<=0 or v_amount<>round(v_amount,2) or v_sponsor.available_budget<v_amount then';
 if position(v_old in v_def)=0 then raise exception 'Private matcher amount guard changed.'; end if;
 v_def:=replace(v_def,v_old,'      if v_amount<=0 or v_amount<>round(v_amount,2) then');
 execute v_def;

 v_def:=pg_get_functiondef('public.generate_team_sponsorship_offers(uuid)'::regprocedure);
 v_old:='declare v_team record;v_sponsor record;v_created integer:=0;v_offer uuid;v_amount numeric;v_probs jsonb;';
 v_new:='declare v_team record;v_sponsor record;v_created integer:=0;v_offer uuid;v_amount numeric;v_probs jsonb;v_sponsor_count integer;v_sponsor_limit integer;';
 if position(v_old in v_def)=0 then raise exception 'Public matcher declaration changed.'; end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:='where s.is_active and s.available_budget is not null and s.available_budget>=coalesce((s.target_audience->>''offer_amount_min'')::numeric,0)
    and nullif(s.target_audience->>''base_amount'','''') is not null';
 v_new:='where s.is_active and nullif(s.target_audience->>''base_amount'','''') is not null';
 if position(v_old in v_def)=0 then raise exception 'Public matcher budget predicate changed.'; end if;
 v_def:=replace(v_def,v_old,v_new);
 v_old:='   v_amount:=(v_sponsor.target_audience->>''base_amount'')::numeric;';
 v_new:='   perform pg_advisory_xact_lock(hashtextextended(v_sponsor.id::text||'':''||p_season_id::text,0));
   select count(distinct reserved.team_id) into v_sponsor_count from (
    select c.target_team_id team_id from public.caleris_sponsorship_contracts c
    where c.sponsor_id=v_sponsor.id and c.status=''active''
      and (c.season_id=p_season_id or exists(select 1 from public.caleris_sponsorship_payment_schedule ps where ps.contract_id=c.id and ps.season_id=p_season_id))
    union
    select o.target_team_id from public.caleris_sponsorship_offers o
    where o.sponsor_id=v_sponsor.id and o.season_id=p_season_id and o.status in (''offered'',''negotiating'',''accepted'')
   ) reserved;
   v_sponsor_limit:=case when upper(coalesce(v_sponsor.tier_key,'''')) in (''T1'',''TIER 1'') then 2 else 3 end;
   if v_sponsor_count>=v_sponsor_limit then continue; end if;
   v_amount:=(v_sponsor.target_audience->>''base_amount'')::numeric;';
 if position(v_old in v_def)=0 then raise exception 'Public matcher insertion point changed.'; end if;
 execute replace(v_def,v_old,v_new);
end $$;

-- Remove sponsor-specific budget checks from automated counter responses.
do $$
declare v_def text; v_old text;
begin
 v_def:=pg_get_functiondef('private.sponsor_engine_respond(uuid)'::regprocedure);
 v_old:='or (v_sponsor.available_budget is not null and v_sponsor.available_budget<v_last.amount)';
 if position(v_old in v_def)=0 then raise exception 'Sponsor counter budget guard changed.'; end if;
 v_def:=replace(v_def,v_old,'');
 v_def:=replace(v_def,'case when v_last.amount>v_limit then ''flexibility_limit'' else ''insufficient_budget'' end','''flexibility_limit''');
 execute v_def;
end $$;

-- Scheduled contract and bonus payouts are sourced directly from VreeoBank.
create or replace function private.process_brand_ecosystem_scheduled_settlements()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record;v_source uuid;v_destination uuid;v_result jsonb;v_paid integer:=0;v_bonus_paid integer:=0;v_skipped integer:=0;v_pool_paid numeric;v_pool_total numeric;
begin
 select id into v_source from public.economy_wallet_accounts where account_kind='vreeo_bank' and is_active order by created_at limit 1;
 if v_source is null then return jsonb_build_object('status','no_vreeo_bank'); end if;
 for v_item in
  select ps.*,c.target_team_id,c.sponsor_id from public.caleris_sponsorship_payment_schedule ps
  join public.caleris_sponsorship_contracts c on c.id=ps.contract_id and c.status='active' and c.target_kind='team'
  join public.caleris_sponsors s on s.id=c.sponsor_id and s.is_active
  where ps.status='scheduled' and ps.due_at<=now() order by ps.due_at,ps.id for update of ps
 loop
  select id into v_destination from public.economy_wallet_accounts where account_kind='team' and team_id=v_item.target_team_id and is_active;
  if v_destination is null then v_skipped:=v_skipped+1;continue;end if;
  v_result:=private.post_economy_transaction(v_source,v_destination,v_item.amount,'sponsor_payout','Sponsorship seasonal payment','sponsor-schedule:'||v_item.id::text,null,
   jsonb_build_object('contract_id',v_item.contract_id,'season_id',v_item.season_id,'schedule_id',v_item.id),null,false);
  update public.caleris_sponsorship_payment_schedule set status='paid',transaction_id=(v_result->>'transaction_id')::uuid,paid_at=now() where id=v_item.id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,null,v_item.amount,'Seasonal sponsorship payment',(v_result->>'transaction_id')::uuid,null);
  v_paid:=v_paid+1;
 end loop;
 for v_item in
  select t.id target_id,t.bonus_amount,t.season_id,c.id contract_id,c.target_team_id from public.caleris_sponsorship_targets t
  join public.caleris_sponsorship_contracts c on c.id=t.contract_id and c.status='active' and c.target_kind='team'
  join public.caleris_sponsors s on s.id=c.sponsor_id and s.is_active
  where t.status='achieved' and t.bonus_amount>0 and t.season_id is not null
   and not exists(select 1 from public.caleris_sponsorship_payouts p where p.target_id=t.id)
  order by t.created_at,t.id for update of t
 loop
  select pool_total,pool_paid into v_pool_total,v_pool_paid from public.caleris_sponsorship_season_bonus_pools
   where contract_id=v_item.contract_id and season_id=v_item.season_id for update;
  if v_pool_total is null or v_pool_paid+v_item.bonus_amount>v_pool_total then v_skipped:=v_skipped+1;continue;end if;
  select id into v_destination from public.economy_wallet_accounts where account_kind='team' and team_id=v_item.target_team_id and is_active;
  if v_destination is null then v_skipped:=v_skipped+1;continue;end if;
  v_result:=private.post_economy_transaction(v_source,v_destination,v_item.bonus_amount,'sponsor_payout','Sponsorship target bonus','sponsor-bonus:'||v_item.target_id::text,null,
   jsonb_build_object('contract_id',v_item.contract_id,'target_id',v_item.target_id,'season_id',v_item.season_id),null,false);
  update public.caleris_sponsorship_season_bonus_pools set pool_paid=pool_paid+v_item.bonus_amount,updated_at=now() where contract_id=v_item.contract_id and season_id=v_item.season_id;
  update public.caleris_sponsorship_contracts set bonus_pool_paid=bonus_pool_paid+v_item.bonus_amount where id=v_item.contract_id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,v_item.target_id,v_item.bonus_amount,'Sponsorship achievement bonus',(v_result->>'transaction_id')::uuid,null);
  v_bonus_paid:=v_bonus_paid+1;
 end loop;
 return jsonb_build_object('seasonal_payments',v_paid,'bonuses',v_bonus_paid,'skipped',v_skipped,'funding_source','vreeo_bank');
end $$;
revoke all on function private.process_brand_ecosystem_scheduled_settlements() from public,anon,authenticated;
create policy "Authenticated read prizepool rules" on public.caleris_prizepool_rules for select to authenticated using(true);
commit;
