-- Seasonal bonus pools, source-driven contract terms, and division-aware sponsor matching.
alter table public.caleris_sponsorship_targets
 add column if not exists season_id uuid references public.license_seasons(id) on delete restrict;
create index if not exists caleris_sponsorship_targets_season_idx on public.caleris_sponsorship_targets(contract_id,season_id,status);

create table if not exists public.caleris_sponsorship_season_bonus_pools (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.caleris_sponsorship_contracts(id) on delete restrict,
 season_id uuid not null references public.license_seasons(id) on delete restrict,
 pool_total numeric(20,2) not null check(pool_total>=0),
 pool_paid numeric(20,2) not null default 0 check(pool_paid>=0 and pool_paid<=pool_total),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(contract_id,season_id)
);
alter table public.caleris_sponsorship_season_bonus_pools enable row level security;
revoke all on public.caleris_sponsorship_season_bonus_pools from public,anon,authenticated;
grant select on public.caleris_sponsorship_season_bonus_pools to authenticated;
create policy sponsorship_season_bonus_pool_participants on public.caleris_sponsorship_season_bonus_pools for select to authenticated using(
 public.is_caleris_fia_or_admin() or exists(
  select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid())
  join public.members m on m.id=p.member_id
  where c.id=contract_id and c.target_kind='team' and m.team_id=c.target_team_id
 ));

create or replace function public.owner_respond_sponsorship_offer(p_offer_id uuid,p_action text,p_amount numeric default null,p_terms jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.members%rowtype;v_offer public.caleris_sponsorship_offers%rowtype;v_last public.caleris_sponsorship_offer_revisions%rowtype;
 v_count integer;v_contract uuid;v_duration integer;v_season record;v_index integer:=0;v_bonus numeric;
 v_sponsor public.caleris_sponsors%rowtype;v_focus text;v_metric text;v_target_value numeric;v_targets jsonb;v_tier text;
begin
 select m.* into v_member from public.profiles p join public.members m on m.id=p.member_id where p.user_id=(select auth.uid());
 if not found or v_member.role<>'Owner' then raise exception 'Hanya Team Owner yang dapat bernegosiasi.'; end if;
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
 if not found or v_offer.target_kind<>'team' or v_offer.target_team_id is distinct from v_member.team_id
   or v_offer.status not in ('offered','negotiating') then raise exception 'Offer tidak tersedia untuk tim ini.'; end if;
 if v_offer.expires_at is not null and now()>v_offer.expires_at then update public.caleris_sponsorship_offers set status='expired' where id=v_offer.id;return jsonb_build_object('status','expired');end if;
 select count(*) into v_count from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id and actor_kind='member';
 if p_action='counter' then
   if v_count>=3 then raise exception 'Batas tiga counter-offer telah tercapai.'; end if;
   if p_amount is null or p_amount<0 or p_amount<>round(p_amount,2) then raise exception 'Nominal counter tidak valid.'; end if;
   select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
   if v_last.actor_kind<>'admin' then raise exception 'Menunggu respons sponsor.'; end if;
   update public.caleris_sponsorship_offer_revisions set response='countered' where id=v_last.id;
   insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,actor_member_id,amount,terms)
   values(v_offer.id,'member',v_member.id,p_amount,coalesce(p_terms,'{}'::jsonb));
   update public.caleris_sponsorship_offers set status='negotiating',counter_count=v_count+1 where id=v_offer.id;
   return jsonb_build_object('status','negotiating','counter_count',v_count+1);
 elsif p_action='accept' then
   select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
   if v_last.actor_kind<>'admin' then raise exception 'Sponsor belum memberikan penawaran final.'; end if;
   v_contract:=private.create_sponsorship_contract_from_offer(v_offer.id);
   select * into v_sponsor from public.caleris_sponsors where id=v_offer.sponsor_id;
   v_duration:=greatest(1,least(5,coalesce(nullif(v_last.terms->>'duration_seasons','')::integer,v_sponsor.default_duration_seasons,1)));
   v_bonus:=round(v_last.amount*coalesce((select (config_value->>'value')::numeric from public.caleris_brand_ecosystem_config where config_key='bonus_pool_percent'),50)/100,2);
   update public.caleris_sponsorship_contracts set duration_seasons=v_duration,annual_contract_amount=v_last.amount,
    bonus_pool_total=v_bonus*v_duration,bonus_pool_paid=0 where id=v_contract;
   v_tier:=coalesce(v_sponsor.tier_key,'T5');v_focus:=coalesce(v_sponsor.focus_key,'Finish');
   v_metric:=case v_focus when 'Poin' then 'points_round_rate' when 'Podium' then 'podium_round_rate'
    when 'Menang' then 'win_round_rate' when 'Finish' then 'finish_rate' else 'driver_popularity' end;
   select config_value into v_targets from public.caleris_brand_ecosystem_config where config_key='sponsor_focus_targets';
   v_target_value:=coalesce((v_targets->v_tier->>case v_metric when 'points_round_rate' then 'points' when 'podium_round_rate' then 'podium' when 'win_round_rate' then 'win' when 'finish_rate' then 'finish' else 'popularity' end)::numeric,0);
   for v_season in select id,starts_on,ends_on from public.license_seasons
     where starts_on >= (select starts_on from public.license_seasons where id=v_offer.season_id)
     order by starts_on asc limit v_duration
   loop
     v_index:=v_index+1;
     insert into public.caleris_sponsorship_payment_schedule(contract_id,season_id,amount,due_at)
     values(v_contract,v_season.id,v_last.amount,case when v_index=1 then now() else (v_season.starts_on::timestamp at time zone 'UTC') end)
     on conflict(contract_id,season_id) do nothing;
     insert into public.caleris_sponsorship_season_bonus_pools(contract_id,season_id,pool_total)
     values(v_contract,v_season.id,v_bonus) on conflict(contract_id,season_id) do nothing;
     insert into public.caleris_sponsorship_targets(contract_id,season_id,title,description,metric_key,target_value,current_value,bonus_amount,due_at,status)
     values(v_contract,v_season.id,'Sponsor target · '||v_focus,
      'Target performa berdasarkan Pool Sponsor v1.1 · '||v_tier,v_metric,v_target_value,0,v_bonus,
      (v_season.ends_on::timestamp at time zone 'UTC'),'in_progress');
   end loop;
   return jsonb_build_object('status','accepted','contract_id',v_contract,'duration_seasons',v_duration,'seasonal_bonus_pool',v_bonus);
 elsif p_action='reject' then
   select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
   if v_last.actor_kind<>'admin' then raise exception 'Menunggu respons sponsor.'; end if;
   update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
   update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
   return jsonb_build_object('status','rejected');
 else raise exception 'Action tidak dikenal.'; end if;
end $$;

create or replace function public.generate_team_sponsorship_offers(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_team record;v_sponsor record;v_created integer:=0;v_offer uuid;v_amount numeric;v_probs jsonb;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if not exists(select 1 from public.license_seasons where id=p_season_id) then raise exception 'Season tidak ditemukan.'; end if;
 select config_value into v_probs from public.caleris_brand_ecosystem_config where config_key='sponsor_division_probabilities';
 for v_team in
  select t.id,t.division_key,coalesce(r.score,0) score,
   coalesce((select sum(f.population) from public.caleris_fan_populations f where f.entity_kind='team' and f.team_id=t.id),0) fans
  from public.teams t left join public.caleris_team_reputation r on r.team_id=t.id
 loop
  for v_sponsor in
   select s.*,tr.minimum_season_performance
   from public.caleris_sponsors s join public.caleris_sponsor_tier_rules tr on tr.tier_key=s.tier_key and tr.is_active
   where s.is_active and s.source_code is not null and s.available_budget is not null
    and s.available_budget>=coalesce((s.target_audience->>'offer_amount_min')::numeric,0)
    and v_team.score>=tr.minimum_team_reputation
    and v_team.fans>=tr.minimum_fan_population
    and coalesce((select (r.metrics->>'season_performance')::numeric from public.caleris_team_reputation r where r.team_id=v_team.id),0)>=tr.minimum_season_performance
    and coalesce((v_probs->v_team.division_key->>s.tier_key)::numeric,0)>0
    and random() < coalesce((v_probs->v_team.division_key->>s.tier_key)::numeric,0)/100
    and not exists(select 1 from public.caleris_sponsorship_offers o where o.sponsor_id=s.id and o.target_team_id=v_team.id and o.season_id=p_season_id and o.status in ('offered','negotiating','accepted'))
    and not exists(select 1 from public.caleris_sponsorship_contracts c where c.sponsor_id=s.id and c.target_team_id=v_team.id and c.season_id=p_season_id and c.status='active')
  loop
   v_amount:=(v_sponsor.target_audience->>'base_amount')::numeric;
   if v_amount<=0 or v_amount<>round(v_amount,2) then continue; end if;
   insert into public.caleris_sponsorship_offers(sponsor_id,target_kind,target_team_id,season_id,proposed_amount,terms,status,expires_at,created_by,generated_by_engine)
   values(v_sponsor.id,'team',v_team.id,p_season_id,v_amount,
    jsonb_build_object('tier',v_sponsor.tier_key,'duration_seasons',v_sponsor.default_duration_seasons,
     'focus',v_sponsor.focus_key,'source_code',v_sponsor.source_code,'origin',case when v_sponsor.is_indonesian then 'Indonesia' else 'Global' end),
    'offered',now()+interval '7 days',(select auth.uid()),true)
   returning id into v_offer;
   insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
   values(v_offer,'admin',v_amount,jsonb_build_object('tier',v_sponsor.tier_key,'duration_seasons',v_sponsor.default_duration_seasons,
     'focus',v_sponsor.focus_key,'source_code',v_sponsor.source_code));
   v_created:=v_created+1;
  end loop;
 end loop;
 return jsonb_build_object('created',v_created);
end $$;

create or replace function public.admin_process_sponsorship_bonuses()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record;v_source uuid;v_destination uuid;v_result jsonb;v_paid integer:=0;v_skipped integer:=0;v_budget numeric;v_pool_paid numeric;v_pool_total numeric;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 select id into v_source from public.economy_wallet_accounts where account_kind='sponsor_source' and is_active order by created_at limit 1;
 if v_source is null then raise exception 'Sponsor Source tidak tersedia.'; end if;
 for v_item in
  select t.id target_id,t.bonus_amount,t.season_id,c.id contract_id,c.target_team_id,c.sponsor_id,s.id sponsor_row_id
  from public.caleris_sponsorship_targets t join public.caleris_sponsorship_contracts c on c.id=t.contract_id and c.status='active' and c.target_kind='team'
  join public.caleris_sponsors s on s.id=c.sponsor_id and s.is_active
  where t.status='achieved' and t.bonus_amount>0
   and not exists(select 1 from public.caleris_sponsorship_payouts p where p.target_id=t.id)
  order by t.created_at,t.id for update of t,c,s
 loop
  select available_budget into v_budget from public.caleris_sponsors where id=v_item.sponsor_id for update;
  select pool_total,pool_paid into v_pool_total,v_pool_paid from public.caleris_sponsorship_season_bonus_pools
   where contract_id=v_item.contract_id and season_id=v_item.season_id for update;
  if v_pool_total is null or v_pool_paid+v_item.bonus_amount>v_pool_total or v_budget is null or v_budget<v_item.bonus_amount then v_skipped:=v_skipped+1;continue;end if;
  select id into v_destination from public.economy_wallet_accounts where account_kind='team' and team_id=v_item.target_team_id and is_active;
  if v_destination is null then v_skipped:=v_skipped+1;continue;end if;
  v_result:=private.post_economy_transaction(v_source,v_destination,v_item.bonus_amount,'sponsor_payout',
   'Sponsorship target bonus','sponsor-bonus:'||v_item.target_id::text,(select auth.uid()),
   jsonb_build_object('contract_id',v_item.contract_id,'target_id',v_item.target_id,'season_id',v_item.season_id),null,false);
  update public.caleris_sponsors set available_budget=available_budget-v_item.bonus_amount,updated_at=now() where id=v_item.sponsor_id;
  update public.caleris_sponsorship_season_bonus_pools set pool_paid=pool_paid+v_item.bonus_amount,updated_at=now()
   where contract_id=v_item.contract_id and season_id=v_item.season_id;
  update public.caleris_sponsorship_contracts set bonus_pool_paid=bonus_pool_paid+v_item.bonus_amount where id=v_item.contract_id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,v_item.target_id,v_item.bonus_amount,'Sponsorship achievement bonus',(v_result->>'transaction_id')::uuid,(select auth.uid()));
  v_paid:=v_paid+1;
 end loop;
 return jsonb_build_object('paid',v_paid,'skipped',v_skipped);
end $$;

create or replace function private.process_brand_ecosystem_scheduled_settlements()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record;v_source uuid;v_destination uuid;v_result jsonb;v_paid integer:=0;v_bonus_paid integer:=0;v_skipped integer:=0;v_budget numeric;v_pool_paid numeric;v_pool_total numeric;
begin
 select id into v_source from public.economy_wallet_accounts where account_kind='sponsor_source' and is_active order by created_at limit 1;
 if v_source is null then return jsonb_build_object('status','no_sponsor_source'); end if;
 for v_item in
  select ps.*,c.target_team_id,c.sponsor_id
  from public.caleris_sponsorship_payment_schedule ps
  join public.caleris_sponsorship_contracts c on c.id=ps.contract_id and c.status='active' and c.target_kind='team'
  join public.caleris_sponsors s on s.id=c.sponsor_id and s.is_active
  where ps.status='scheduled' and ps.due_at<=now()
  order by ps.due_at,ps.id for update of ps
 loop
  select available_budget into v_budget from public.caleris_sponsors where id=v_item.sponsor_id for update;
  if v_budget is null or v_budget<v_item.amount then v_skipped:=v_skipped+1;continue;end if;
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
  select t.id target_id,t.bonus_amount,t.season_id,c.id contract_id,c.target_team_id,c.sponsor_id
  from public.caleris_sponsorship_targets t join public.caleris_sponsorship_contracts c on c.id=t.contract_id and c.status='active' and c.target_kind='team'
  join public.caleris_sponsors s on s.id=c.sponsor_id and s.is_active
  where t.status='achieved' and t.bonus_amount>0 and t.season_id is not null
   and not exists(select 1 from public.caleris_sponsorship_payouts p where p.target_id=t.id)
  order by t.created_at,t.id for update of t
 loop
  select available_budget into v_budget from public.caleris_sponsors where id=v_item.sponsor_id for update;
  select pool_total,pool_paid into v_pool_total,v_pool_paid from public.caleris_sponsorship_season_bonus_pools
   where contract_id=v_item.contract_id and season_id=v_item.season_id for update;
  if v_pool_total is null or v_pool_paid+v_item.bonus_amount>v_pool_total or v_budget is null or v_budget<v_item.bonus_amount then v_skipped:=v_skipped+1;continue;end if;
  select id into v_destination from public.economy_wallet_accounts where account_kind='team' and team_id=v_item.target_team_id and is_active;
  if v_destination is null then v_skipped:=v_skipped+1;continue;end if;
  v_result:=private.post_economy_transaction(v_source,v_destination,v_item.bonus_amount,'sponsor_payout',
   'Sponsorship target bonus','sponsor-bonus:'||v_item.target_id::text,null,
   jsonb_build_object('contract_id',v_item.contract_id,'target_id',v_item.target_id,'season_id',v_item.season_id),null,false);
  update public.caleris_sponsors set available_budget=available_budget-v_item.bonus_amount,updated_at=now() where id=v_item.sponsor_id;
  update public.caleris_sponsorship_season_bonus_pools set pool_paid=pool_paid+v_item.bonus_amount,updated_at=now()
   where contract_id=v_item.contract_id and season_id=v_item.season_id;
  update public.caleris_sponsorship_contracts set bonus_pool_paid=bonus_pool_paid+v_item.bonus_amount where id=v_item.contract_id;
  insert into public.caleris_sponsorship_payouts(contract_id,target_id,amount,description,transaction_id,paid_by)
  values(v_item.contract_id,v_item.target_id,v_item.bonus_amount,'Sponsorship achievement bonus',(v_result->>'transaction_id')::uuid,null);
  v_bonus_paid:=v_bonus_paid+1;
 end loop;
 return jsonb_build_object('seasonal_payments',v_paid,'bonuses',v_bonus_paid,'skipped',v_skipped);
end $$;
