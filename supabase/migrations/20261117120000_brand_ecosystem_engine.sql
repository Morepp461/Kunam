-- CALERIS Brand Ecosystem v1: team sponsorship, reputation and regional fan population.
-- Existing driver sponsorship records remain readable; all new offers are team-only.
alter table public.caleris_sponsors
  add column if not exists tier_key text,
  add column if not exists industry_category text,
  add column if not exists region_scope text not null default 'regional',
  add column if not exists flexibility_percent numeric(5,2) not null default 10
    check (flexibility_percent between 0 and 100);

alter table public.caleris_sponsorship_offers
  add column if not exists counter_count integer not null default 0,
  add column if not exists generated_by_engine boolean not null default false;

alter table public.caleris_sponsorship_contracts
  add column if not exists duration_seasons integer not null default 1
    check (duration_seasons between 1 and 5),
  add column if not exists annual_contract_amount numeric(20,2),
  add column if not exists bonus_pool_total numeric(20,2) not null default 0
    check (bonus_pool_total >= 0),
  add column if not exists bonus_pool_paid numeric(20,2) not null default 0
    check (bonus_pool_paid >= 0 and bonus_pool_paid <= bonus_pool_total),
  add column if not exists renewal_status text not null default 'new'
    check (renewal_status in ('new','proposed','renewed','conditional','terminated'));

update public.caleris_sponsorship_contracts
set annual_contract_amount=contract_amount
where annual_contract_amount is null;

create table if not exists public.caleris_brand_ecosystem_config (
  config_key text primary key,
  config_value jsonb not null default '{}'::jsonb,
  description text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.caleris_brand_ecosystem_config(config_key,config_value,description)
values
 ('team_reputation_weights','{"championship":25,"race_performance":25,"consistency":15,"driver_reputation":15,"fanbase":10,"commercial_credibility":10}'::jsonb,'Draft weights; editable by Admin.'),
 ('driver_reputation_weights','{"championship":25,"race_performance":25,"consistency":15,"experience":10,"fan_popularity":15,"professional_record":10}'::jsonb,'Draft weights; editable by Admin.'),
 ('sponsor_trust_weights','{"target_achievement":45,"consistency":20,"fanbase_growth":15,"commercial_exposure":10,"partnership_conduct":10}'::jsonb,'Draft weights; editable by Admin.'),
 ('bonus_pool_percent','{"value":50}'::jsonb,'Aggregate seasonal bonus pool as percentage of contract value.'),
 ('fan_growth_config','{"base_growth_percent":0,"regional_scope":"regional"}'::jsonb,'Regional fan population configuration.')
on conflict(config_key) do nothing;

create table if not exists public.caleris_sponsor_tier_rules (
  tier_key text primary key,
  label text not null,
  minimum_team_reputation integer not null default 0 check (minimum_team_reputation between 0 and 9999),
  minimum_fan_population bigint not null default 0 check (minimum_fan_population >= 0),
  minimum_season_performance numeric(8,2) not null default 0,
  minimum_budget numeric(20,2) not null default 0 check (minimum_budget >= 0),
  maximum_budget numeric(20,2),
  is_active boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check(maximum_budget is null or maximum_budget >= minimum_budget)
);

create table if not exists public.caleris_team_reputation (
  team_id uuid primary key references public.teams(id) on delete cascade,
  score integer not null default 0 check(score between 0 and 9999),
  band text not null default 'unrated',
  metrics jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);
create table if not exists public.caleris_driver_reputation (
  member_id uuid primary key references public.members(id) on delete cascade,
  score integer not null default 0 check(score between 0 and 9999),
  band text not null default 'unrated',
  metrics jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);
create table if not exists public.caleris_reputation_history (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null check(entity_kind in ('team','driver')),
  team_id uuid references public.teams(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  previous_score integer,
  new_score integer not null,
  metrics jsonb not null default '{}'::jsonb,
  source_event text not null,
  created_at timestamptz not null default now(),
  check((entity_kind='team' and team_id is not null and member_id is null)
     or (entity_kind='driver' and member_id is not null and team_id is null))
);
create index if not exists caleris_reputation_history_team_idx on public.caleris_reputation_history(team_id,created_at desc);
create index if not exists caleris_reputation_history_driver_idx on public.caleris_reputation_history(member_id,created_at desc);

create table if not exists public.caleris_fan_populations (
  entity_kind text not null check(entity_kind in ('team','driver','neutral')),
  team_id uuid references public.teams(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  region_key text not null,
  population bigint not null default 0 check(population >= 0),
  loyalty numeric(5,2) not null default 50 check(loyalty between 0 and 100),
  engagement numeric(5,2) not null default 50 check(engagement between 0 and 100),
  sentiment numeric(5,2) not null default 50 check(sentiment between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key(entity_kind,team_id,member_id,region_key),
  check((entity_kind='team' and team_id is not null and member_id is null)
     or (entity_kind='driver' and member_id is not null and team_id is null)
     or (entity_kind='neutral' and team_id is null and member_id is null))
);
create table if not exists public.caleris_fan_population_history (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null check(entity_kind in ('team','driver','neutral')),
  team_id uuid references public.teams(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  region_key text not null,
  population_delta bigint not null,
  source_event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists caleris_fan_population_history_idx on public.caleris_fan_population_history(entity_kind,team_id,member_id,created_at desc);

create table if not exists public.caleris_sponsorship_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.caleris_sponsorship_contracts(id) on delete restrict,
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  amount numeric(20,2) not null check(amount > 0),
  due_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','paid','cancelled')),
  transaction_id uuid unique references public.economy_transactions(id) on delete restrict,
  paid_at timestamptz,
  unique(contract_id,season_id)
);
create table if not exists public.caleris_sponsorship_season_evaluations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.caleris_sponsorship_contracts(id) on delete restrict,
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  trust_score integer not null check(trust_score between 0 and 100),
  renewal_band text not null check(renewal_band in ('premium','standard','conditional','terminated')),
  metrics jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique(contract_id,season_id)
);

alter table public.caleris_brand_ecosystem_config enable row level security;
alter table public.caleris_sponsor_tier_rules enable row level security;
alter table public.caleris_team_reputation enable row level security;
alter table public.caleris_driver_reputation enable row level security;
alter table public.caleris_reputation_history enable row level security;
alter table public.caleris_fan_populations enable row level security;
alter table public.caleris_fan_population_history enable row level security;
alter table public.caleris_sponsorship_payment_schedule enable row level security;
alter table public.caleris_sponsorship_season_evaluations enable row level security;
revoke all on public.caleris_brand_ecosystem_config,public.caleris_sponsor_tier_rules,public.caleris_team_reputation,
 public.caleris_driver_reputation,public.caleris_reputation_history,public.caleris_fan_populations,
 public.caleris_fan_population_history,public.caleris_sponsorship_payment_schedule,
 public.caleris_sponsorship_season_evaluations from public,anon,authenticated;
grant select on public.caleris_brand_ecosystem_config,public.caleris_sponsor_tier_rules,
 public.caleris_team_reputation,public.caleris_driver_reputation,public.caleris_reputation_history,
 public.caleris_fan_populations,public.caleris_fan_population_history,
 public.caleris_sponsorship_payment_schedule,public.caleris_sponsorship_season_evaluations to authenticated;
create policy brand_config_admin_read on public.caleris_brand_ecosystem_config for select to authenticated using(public.is_caleris_fia_or_admin());
create policy sponsor_tier_admin_read on public.caleris_sponsor_tier_rules for select to authenticated using(public.is_caleris_fia_or_admin());
create policy team_reputation_read on public.caleris_team_reputation for select to authenticated using(true);
create policy driver_reputation_read on public.caleris_driver_reputation for select to authenticated using(true);
create policy reputation_history_read on public.caleris_reputation_history for select to authenticated using(true);
create policy fan_population_read on public.caleris_fan_populations for select to authenticated using(true);
create policy fan_population_history_read on public.caleris_fan_population_history for select to authenticated using(true);
create policy sponsorship_schedule_participants on public.caleris_sponsorship_payment_schedule for select to authenticated using(
 public.is_caleris_fia_or_admin() or exists(
  select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid())
  join public.members m on m.id=p.member_id
  where c.id=contract_id and c.target_kind='team' and m.team_id=c.target_team_id
 ));
create policy sponsorship_eval_participants on public.caleris_sponsorship_season_evaluations for select to authenticated using(
 public.is_caleris_fia_or_admin() or exists(
  select 1 from public.caleris_sponsorship_contracts c join public.profiles p on p.user_id=(select auth.uid())
  join public.members m on m.id=p.member_id
  where c.id=contract_id and c.target_kind='team' and m.team_id=c.target_team_id
 ));

create or replace function public.owner_respond_sponsorship_offer(
 p_offer_id uuid,p_action text,p_amount numeric default null,p_terms jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.members%rowtype;v_offer public.caleris_sponsorship_offers%rowtype;v_last public.caleris_sponsorship_offer_revisions%rowtype;
 v_count integer;v_contract uuid;v_duration integer;v_season record;v_index integer:=0;v_bonus numeric;
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
   v_duration:=greatest(1,least(5,coalesce(nullif(v_last.terms->>'duration_seasons','')::integer,1)));
   v_bonus:=round(v_last.amount*coalesce((select (config_value->>'value')::numeric from public.caleris_brand_ecosystem_config where config_key='bonus_pool_percent'),50)/100,2);
   update public.caleris_sponsorship_contracts set duration_seasons=v_duration,
    annual_contract_amount=v_last.amount,bonus_pool_total=v_bonus where id=v_contract;
   for v_season in select id,starts_on from public.license_seasons
     where starts_on >= (select starts_on from public.license_seasons where id=v_offer.season_id)
     order by starts_on asc limit v_duration
   loop
     v_index:=v_index+1;
     insert into public.caleris_sponsorship_payment_schedule(contract_id,season_id,amount,due_at)
     values(v_contract,v_season.id,v_last.amount,case when v_index=1 then now() else (v_season.starts_on::timestamp at time zone 'UTC') end)
     on conflict(contract_id,season_id) do nothing;
   end loop;
   return jsonb_build_object('status','accepted','contract_id',v_contract,'duration_seasons',v_duration,'bonus_pool',v_bonus);
 elsif p_action='reject' then
   select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
   if v_last.actor_kind<>'admin' then raise exception 'Menunggu respons sponsor.'; end if;
   update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
   update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
   return jsonb_build_object('status','rejected');
 else raise exception 'Action tidak dikenal.'; end if;
end $$;

create or replace function public.sponsor_engine_respond(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_offer public.caleris_sponsorship_offers%rowtype;v_sponsor public.caleris_sponsors%rowtype;
 v_last public.caleris_sponsorship_offer_revisions%rowtype;v_initial numeric;v_limit numeric;v_amount numeric;v_response text;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan untuk menjalankan engine sponsor.'; end if;
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
 if not found or v_offer.target_kind<>'team' or v_offer.status<>'negotiating' then raise exception 'Offer tidak menunggu respons sponsor.'; end if;
 select * into v_sponsor from public.caleris_sponsors where id=v_offer.sponsor_id for update;
 select * into v_last from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at desc,id desc limit 1;
 if v_last.actor_kind<>'member' then raise exception 'Belum ada counter dari Team Owner.'; end if;
 select amount into v_initial from public.caleris_sponsorship_offer_revisions where offer_id=v_offer.id order by created_at,id limit 1;
 v_limit:=v_initial*(1+v_sponsor.flexibility_percent/100);
 if v_last.amount<=v_limit and (v_sponsor.available_budget is null or v_sponsor.available_budget>=v_last.amount) then
   v_amount:=v_last.amount;v_response:='accepted';
 elsif v_offer.counter_count<3 and (v_sponsor.available_budget is null or v_sponsor.available_budget>=v_initial) then
   v_amount:=least(v_limit,greatest(v_initial,v_last.amount*0.95));v_response:='countered';
 else
   update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
   update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
   return jsonb_build_object('status','rejected');
 end if;
 update public.caleris_sponsorship_offer_revisions set response=v_response where id=v_last.id;
 insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
 values(v_offer.id,'admin',v_amount,v_last.terms||jsonb_build_object('duration_seasons',coalesce(nullif(v_last.terms->>'duration_seasons','')::integer,1)));
 update public.caleris_sponsorship_offers set status='offered',proposed_amount=v_amount where id=v_offer.id;
 return jsonb_build_object('status',v_response,'amount',v_amount);
end $$;

create or replace function public.generate_team_sponsorship_offers(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_team record;v_sponsor record;v_created integer:=0;v_offer uuid;v_amount numeric;v_threshold integer;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if not exists(select 1 from public.license_seasons where id=p_season_id) then raise exception 'Season tidak ditemukan.'; end if;
 for v_team in
  select t.id,coalesce(r.score,0) score,coalesce((select sum(f.population) from public.caleris_fan_populations f where f.entity_kind='team' and f.team_id=t.id),0) fans
  from public.teams t left join public.caleris_team_reputation r on r.team_id=t.id
  where not exists(select 1 from public.caleris_sponsorship_contracts c where c.target_kind='team' and c.target_team_id=t.id and c.status='active' and c.season_id=p_season_id)
 loop
  for v_sponsor in
   select s.*,tr.minimum_budget as tier_minimum_budget from public.caleris_sponsors s join public.caleris_sponsor_tier_rules tr on tr.tier_key=s.tier_key and tr.is_active
   where s.is_active and s.available_budget is not null and s.available_budget>=tr.minimum_budget
    and v_team.score>=tr.minimum_team_reputation and v_team.fans>=tr.minimum_fan_population
    and (tr.maximum_budget is null or s.available_budget<=tr.maximum_budget)
    and not exists(select 1 from public.caleris_sponsorship_offers o where o.sponsor_id=s.id and o.target_team_id=v_team.id and o.season_id=p_season_id and o.status in ('offered','negotiating','accepted'))
    and not exists(select 1 from public.caleris_sponsorship_contracts c where c.sponsor_id=s.id and c.target_team_id=v_team.id and c.season_id=p_season_id and c.status='active')
  loop
   v_amount:=least(v_sponsor.available_budget,v_sponsor.tier_minimum_budget);
   insert into public.caleris_sponsorship_offers(sponsor_id,target_kind,target_team_id,season_id,proposed_amount,terms,status,expires_at,created_by,generated_by_engine)
   values(v_sponsor.id,'team',v_team.id,p_season_id,v_amount,jsonb_build_object('tier',v_sponsor.tier_key,'duration_seasons',1),'offered',now()+interval '7 days',(select auth.uid()),true)
   returning id into v_offer;
   insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
   values(v_offer,'admin',v_amount,jsonb_build_object('tier',v_sponsor.tier_key,'duration_seasons',1));
   v_created:=v_created+1;
  end loop;
 end loop;
 return jsonb_build_object('created',v_created);
end $$;

create or replace function public.admin_set_team_reputation(p_team_id uuid,p_score integer,p_metrics jsonb,p_source_event text default 'admin_adjustment')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_old integer;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_score not between 0 and 9999 or jsonb_typeof(p_metrics)<>'object' then raise exception 'Skor atau metrics tidak valid.'; end if;
 select score into v_old from public.caleris_team_reputation where team_id=p_team_id for update;
 insert into public.caleris_team_reputation(team_id,score,band,metrics,calculated_at)
 values(p_team_id,p_score,case when p_score>=7000 then 'elite' when p_score>=4500 then 'top' when p_score>=2500 then 'competitive' when p_score>=1000 then 'established' else 'developing' end,p_metrics,now())
 on conflict(team_id) do update set score=excluded.score,band=excluded.band,metrics=excluded.metrics,calculated_at=now();
 insert into public.caleris_reputation_history(entity_kind,team_id,previous_score,new_score,metrics,source_event)
 values('team',p_team_id,v_old,p_score,p_metrics,p_source_event);
 return jsonb_build_object('team_id',p_team_id,'score',p_score);
end $$;

create or replace function public.admin_set_driver_reputation(p_member_id uuid,p_score integer,p_metrics jsonb,p_source_event text default 'admin_adjustment')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_old integer;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_score not between 0 and 9999 or jsonb_typeof(p_metrics)<>'object' then raise exception 'Skor atau metrics tidak valid.'; end if;
 if not exists(select 1 from public.members where id=p_member_id and role='Driver') then raise exception 'Driver tidak ditemukan.'; end if;
 select score into v_old from public.caleris_driver_reputation where member_id=p_member_id for update;
 insert into public.caleris_driver_reputation(member_id,score,band,metrics,calculated_at)
 values(p_member_id,p_score,case when p_score>=7000 then 'elite' when p_score>=4500 then 'top' when p_score>=2500 then 'competitive' when p_score>=1000 then 'established' else 'developing' end,p_metrics,now())
 on conflict(member_id) do update set score=excluded.score,band=excluded.band,metrics=excluded.metrics,calculated_at=now();
 insert into public.caleris_reputation_history(entity_kind,member_id,previous_score,new_score,metrics,source_event)
 values('driver',p_member_id,v_old,p_score,p_metrics,p_source_event);
 return jsonb_build_object('member_id',p_member_id,'score',p_score);
end $$;

create or replace function public.admin_adjust_fan_population(p_entity_kind text,p_team_id uuid,p_member_id uuid,p_region_key text,p_delta bigint,p_source_event text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_current bigint;v_next bigint;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_delta=0 or p_region_key is null or length(trim(p_region_key)) not between 2 and 64 then raise exception 'Perubahan populasi tidak valid.'; end if;
 if p_entity_kind='team' and (p_team_id is null or p_member_id is not null) then raise exception 'Target tim tidak valid.'; end if;
 if p_entity_kind='driver' and (p_member_id is null or p_team_id is not null or not exists(select 1 from public.members where id=p_member_id and role='Driver')) then raise exception 'Target driver tidak valid.'; end if;
 if p_entity_kind='neutral' and (p_team_id is not null or p_member_id is not null) then raise exception 'Target neutral tidak valid.'; end if;
 insert into public.caleris_fan_populations(entity_kind,team_id,member_id,region_key,population)
 values(p_entity_kind,p_team_id,p_member_id,trim(p_region_key),greatest(0,p_delta))
 on conflict(entity_kind,team_id,member_id,region_key) do nothing;
 select population into v_current from public.caleris_fan_populations where entity_kind=p_entity_kind
  and team_id is not distinct from p_team_id and member_id is not distinct from p_member_id and region_key=trim(p_region_key) for update;
 v_next:=v_current+p_delta;
 if v_next<0 then raise exception 'Populasi fans tidak boleh negatif.'; end if;
 update public.caleris_fan_populations set population=v_next,updated_at=now()
 where entity_kind=p_entity_kind and team_id is not distinct from p_team_id and member_id is not distinct from p_member_id and region_key=trim(p_region_key);
 insert into public.caleris_fan_population_history(entity_kind,team_id,member_id,region_key,population_delta,source_event,metadata)
 values(p_entity_kind,p_team_id,p_member_id,trim(p_region_key),p_delta,p_source_event,coalesce(p_metadata,'{}'::jsonb));
 return jsonb_build_object('population',v_next);
end $$;

create or replace function public.admin_set_brand_ecosystem_config(p_key text,p_value jsonb,p_description text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_key is null or length(trim(p_key)) not between 2 and 80 or jsonb_typeof(p_value)<>'object' then raise exception 'Konfigurasi tidak valid.'; end if;
 insert into public.caleris_brand_ecosystem_config(config_key,config_value,description,updated_by)
 values(trim(p_key),p_value,coalesce(nullif(trim(p_description),''),'Brand ecosystem configuration'),(select auth.uid()))
 on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=excluded.updated_by,updated_at=now();
end $$;

revoke all on function public.owner_respond_sponsorship_offer(uuid,text,numeric,jsonb) from public,anon;
revoke all on function public.sponsor_engine_respond(uuid) from public,anon;
revoke all on function public.generate_team_sponsorship_offers(uuid) from public,anon;
revoke all on function public.admin_set_team_reputation(uuid,integer,jsonb,text) from public,anon;
revoke all on function public.admin_set_driver_reputation(uuid,integer,jsonb,text) from public,anon;
revoke all on function public.admin_adjust_fan_population(text,uuid,uuid,text,bigint,text,jsonb) from public,anon;
revoke all on function public.admin_set_brand_ecosystem_config(text,jsonb,text) from public,anon;
grant execute on function public.owner_respond_sponsorship_offer(uuid,text,numeric,jsonb) to authenticated;
grant execute on function public.sponsor_engine_respond(uuid) to authenticated;
grant execute on function public.generate_team_sponsorship_offers(uuid) to authenticated;
grant execute on function public.admin_set_team_reputation(uuid,integer,jsonb,text) to authenticated;
grant execute on function public.admin_set_driver_reputation(uuid,integer,jsonb,text) to authenticated;
grant execute on function public.admin_adjust_fan_population(text,uuid,uuid,text,bigint,text,jsonb) to authenticated;
grant execute on function public.admin_set_brand_ecosystem_config(text,jsonb,text) to authenticated;

-- Existing driver offers remain historical only; all newly created offers go through team-only RPCs.
