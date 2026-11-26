-- CALERIS Driver Market Value + Pre-contract engine
-- Defaults are locked to the approved decision log. All scoring controls remain Admin-editable.

begin;

create table if not exists public.caleris_driver_market_config (
  id boolean primary key default true check (id),
  weights jsonb not null default '{"license":10,"contract":10,"performance":20,"skill":20,"achievement":10,"activity":10,"reputation":20}'::jsonb,
  base_value_eur numeric(20,2) not null default 10000000 check (base_value_eur > 0),
  growth_factor numeric(8,6) not null default 0.25 check (growth_factor between 0 and 1),
  tier_multipliers jsonb not null default '{"1":1.00,"2":0.85,"3":0.70,"4":0.60}'::jsonb,
  tier_order jsonb not null default '{"premio":1,"zwei":2}'::jsonb,
  initial_license_scores jsonb not null default '{"Bronze":25,"Silver":50,"Gold":75,"Super License":100}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.caleris_driver_market_config(id) values(true) on conflict(id) do nothing;

create table if not exists public.caleris_driver_market_values (
  member_id uuid primary key references public.members(id) on delete cascade,
  market_value_eur numeric(20,2) not null default 0,
  mv_score numeric(8,4) not null default 0,
  target_value_eur numeric(20,2) not null default 0,
  tier_number integer not null default 1,
  division_key text,
  last_calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists caleris_driver_market_values_rank_idx
  on public.caleris_driver_market_values(market_value_eur desc);

create table if not exists public.caleris_driver_market_value_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  season_id uuid references public.license_seasons(id) on delete set null,
  previous_value_eur numeric(20,2) not null,
  new_value_eur numeric(20,2) not null,
  mv_score numeric(8,4) not null,
  tier_number integer not null,
  breakdown jsonb not null default '{}'::jsonb,
  reason text not null default 'recalculation',
  created_at timestamptz not null default now()
);
create index if not exists caleris_driver_market_history_member_idx
  on public.caleris_driver_market_value_history(member_id,created_at desc);

alter table public.caleris_driver_market_config enable row level security;
alter table public.caleris_driver_market_values enable row level security;
alter table public.caleris_driver_market_value_history enable row level security;
revoke all on public.caleris_driver_market_config,public.caleris_driver_market_values,public.caleris_driver_market_value_history from public,anon,authenticated;
drop policy if exists "Driver market config admin read" on public.caleris_driver_market_config;
create policy "Driver market config admin read" on public.caleris_driver_market_config
  for select to authenticated using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Driver market values admin read" on public.caleris_driver_market_values;
create policy "Driver market values admin read" on public.caleris_driver_market_values
  for select to authenticated using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Driver market history admin read" on public.caleris_driver_market_value_history;
create policy "Driver market history admin read" on public.caleris_driver_market_value_history
  for select to authenticated using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));

create or replace function public.member_get_driver_market_values()
returns table(member_id uuid, market_value_eur numeric)
language sql stable security definer set search_path=''
as $$
  select v.member_id,v.market_value_eur
  from public.caleris_driver_market_values v
  join public.members m on m.id=v.member_id and m.role='Driver'
  order by v.market_value_eur desc
$$;

create or replace function public.admin_get_driver_market_config()
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_config public.caleris_driver_market_config%rowtype;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Admin access required.';
  end if;
  select * into v_config from public.caleris_driver_market_config where id=true;
  return jsonb_build_object(
    'weights',v_config.weights,
    'base_value_eur',v_config.base_value_eur,
    'growth_factor',v_config.growth_factor,
    'tier_multipliers',v_config.tier_multipliers,
    'tier_order',v_config.tier_order,
    'initial_license_scores',v_config.initial_license_scores,
    'updated_at',v_config.updated_at
  );
end;
$$;

create or replace function public.admin_configure_driver_market(
  p_weights jsonb,
  p_base_value_eur numeric,
  p_growth_factor numeric,
  p_tier_multipliers jsonb,
  p_tier_order jsonb,
  p_initial_license_scores jsonb
) returns void
language plpgsql security definer set search_path=''
as $$
declare v_total numeric;
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Admin access required.';
  end if;
  if p_base_value_eur is null or p_base_value_eur<=0
    or p_growth_factor is null or p_growth_factor<0 or p_growth_factor>1 then
    raise exception 'Base Value atau Growth Factor tidak valid.';
  end if;
  if jsonb_typeof(p_weights)<>'object' or jsonb_typeof(p_tier_multipliers)<>'object'
    or jsonb_typeof(p_tier_order)<>'object' or jsonb_typeof(p_initial_license_scores)<>'object' then
    raise exception 'Format konfigurasi tidak valid.';
  end if;
  select sum(value::numeric) into v_total from jsonb_each_text(p_weights);
  if v_total<>100 or (select count(*) from jsonb_object_keys(p_weights))<>7 then
    raise exception 'Bobot tujuh komponen harus berjumlah tepat 100 persen.';
  end if;
  if exists(select 1 from jsonb_each_text(p_weights) x where x.value::numeric<0 or x.value::numeric>100) then
    raise exception 'Bobot komponen harus berada pada rentang 0–100.';
  end if;
  if (p_tier_multipliers->>'1')::numeric is distinct from 1.0 then
    raise exception 'Tier 1 harus menggunakan multiplier 1,00.';
  end if;
  if exists(select 1 from jsonb_each_text(p_tier_multipliers) x where x.value::numeric<=0 or x.value::numeric>1) then
    raise exception 'Tier multiplier harus lebih dari 0 dan maksimal 1.';
  end if;
  if exists(select 1 from jsonb_each_text(p_tier_order) x where x.value::integer<1) then
    raise exception 'Urutan tier harus berupa bilangan bulat positif.';
  end if;
  if exists(select 1 from jsonb_each_text(p_initial_license_scores) x where x.value::numeric<0 or x.value::numeric>100) then
    raise exception 'License Score harus berada pada rentang 0–100.';
  end if;
  insert into public.caleris_driver_market_config(
    id,weights,base_value_eur,growth_factor,tier_multipliers,tier_order,initial_license_scores,updated_at,updated_by
  ) values(true,p_weights,p_base_value_eur,p_growth_factor,p_tier_multipliers,p_tier_order,p_initial_license_scores,now(),auth.uid())
  on conflict(id) do update set
    weights=excluded.weights,
    base_value_eur=excluded.base_value_eur,
    growth_factor=excluded.growth_factor,
    tier_multipliers=excluded.tier_multipliers,
    tier_order=excluded.tier_order,
    initial_license_scores=excluded.initial_license_scores,
    updated_at=now(),
    updated_by=auth.uid();
end;
$$;

create or replace function private.recalculate_driver_market_values(
  p_member_id uuid default null,
  p_reason text default 'recalculation'
) returns integer
language plpgsql security definer set search_path=''
as $$
declare
  c public.caleris_driver_market_config%rowtype;
  d record;
  v_season_id uuid;
  v_division_id uuid;
  v_division_key text;
  v_tier integer;
  v_multiplier numeric;
  v_license_key text;
  v_license numeric;
  v_contract numeric;
  v_performance numeric;
  v_skill numeric;
  v_achievement numeric;
  v_activity numeric;
  v_reputation numeric;
  v_score numeric;
  v_target numeric;
  v_old numeric;
  v_new numeric;
  v_points numeric;
  v_max_points numeric;
  v_round_count integer;
  v_checkins integer;
  v_achievement_points numeric;
  v_achievement_max numeric;
  v_attributes jsonb;
  v_breakdown jsonb;
  v_count integer:=0;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
  select * into c from public.caleris_driver_market_config where id=true;
  if not found then raise exception 'Driver Market Value config belum tersedia.'; end if;
  select id into v_season_id from public.license_seasons where status='active'
    order by starts_on desc,created_at desc limit 1;

  for d in
    select m.* from public.members m
    where m.role='Driver' and (p_member_id is null or m.id=p_member_id)
  loop
    v_division_id:=null;
    v_division_key:=null;
    if v_season_id is not null then
      select sm.season_division_id,sd.division_key
        into v_division_id,v_division_key
      from public.license_season_members sm
      join public.license_season_divisions sd on sd.id=sm.season_division_id
      where sm.season_id=v_season_id and sm.member_id=d.id
      order by sm.created_at desc limit 1;
    end if;
    if v_division_key is null and d.team_id is not null then
      select t.division_key into v_division_key from public.teams t where t.id=d.team_id;
      select sd.id into v_division_id
      from public.license_season_divisions sd
      where sd.season_id=v_season_id and lower(sd.division_key)=lower(v_division_key)
      order by sd.created_at limit 1;
    end if;

    v_tier:=nullif(c.tier_order->>coalesce(v_division_key,''),'')::integer;
    if v_tier is null and v_division_id is not null then
      select count(*)+1 into v_tier
      from public.license_season_divisions sd
      where sd.season_id=v_season_id
        and (sd.created_at,sd.division_name) < (
          select x.created_at,x.division_name from public.license_season_divisions x where x.id=v_division_id
        );
    end if;
    v_tier:=greatest(1,coalesce(v_tier,1));
    v_multiplier:=coalesce(nullif(c.tier_multipliers->>v_tier::text,'')::numeric,1.0);

    v_license_key:=case when upper(coalesce(d.license,''))='A' then 'Super License'
      else coalesce(nullif(trim(d.license),''),'Bronze') end;
    v_license:=coalesce(nullif(c.initial_license_scores->>v_license_key,'')::numeric,25);
    v_license:=greatest(0,least(100,v_license));

    v_contract:=case when exists(
      select 1 from public.contracts ct
      where ct.member_id=d.id and ct.status='active' and ct.ends_on>=v_today
        and (ct.team_id=d.team_id or d.team_id is null)
    ) or exists(
      select 1 from public.economy_driver_contracts ec
      where ec.member_id=d.id and ec.status='active'
        and (ec.team_id=d.team_id or d.team_id is null)
    ) then 100 else 0 end;

    select coalesce(sum(s.points_total),0) into v_points
    from public.license_round_standings s
    join public.license_rounds r on r.id=s.round_id
    join public.license_season_divisions sd on sd.id=r.season_division_id
    where s.member_id=d.id and sd.season_id=v_season_id
      and (v_division_id is null or sd.id=v_division_id);

    select coalesce(sum(coalesce(rule.max_points,0)+coalesce(rule.max_pole,0)),0)
      into v_max_points
    from public.license_rounds r
    join public.license_season_divisions sd on sd.id=r.season_division_id
    left join lateral (
      select max(pr.points) as max_points,max(pr.pole_bonus) as max_pole
      from public.caleris_race_points_rules pr
      where pr.session_type=r.session_type and pr.is_active
    ) rule on true
    where sd.season_id=v_season_id and (v_division_id is null or sd.id=v_division_id);
    v_performance:=case when v_max_points>0 then least(100,greatest(0,v_points/v_max_points*100)) else 0 end;

    select a.attributes into v_attributes from public.caleris_driver_attributes a where a.member_id=d.id;
    select coalesce(avg(attr.raw_value::numeric),50) into v_skill
    from jsonb_each_text(coalesce(v_attributes,'{}'::jsonb)) as attr(key,raw_value)
    where attr.raw_value ~ '^-?[0-9]+([.][0-9]+)?';

    select coalesce(sum(case e.finishing_position when 1 then 5 when 2 then 3 when 3 then 1 else 0 end),0)
      + count(*) filter(where rr.driver_of_day_member_id=d.id)
      into v_achievement_points
    from public.caleris_race_result_entries e
    join public.license_rounds r on r.id=e.round_id
    join public.license_season_divisions sd on sd.id=r.season_division_id
    join public.caleris_race_results rr on rr.round_id=r.id and rr.published_at is not null
    where e.member_id=d.id and sd.season_id=v_season_id
      and (v_division_id is null or sd.id=v_division_id);
    select count(*) into v_round_count
    from public.license_rounds r
    join public.license_season_divisions sd on sd.id=r.season_division_id
    where sd.season_id=v_season_id and (v_division_id is null or sd.id=v_division_id)
      and exists(select 1 from public.caleris_race_results rr where rr.round_id=r.id and rr.published_at is not null);
    v_achievement_max:=v_round_count*6;
    v_achievement:=case when v_achievement_max>0 then least(100,v_achievement_points/v_achievement_max*100) else 0 end;

    select count(distinct dc.round_id) into v_checkins
    from public.license_daily_checkins dc
    join public.license_rounds r on r.id=dc.round_id
    join public.license_season_divisions sd on sd.id=r.season_division_id
    where dc.member_id=d.id and sd.season_id=v_season_id
      and (v_division_id is null or sd.id=v_division_id);
    v_activity:=least(100,greatest(0,coalesce(v_checkins,0)*4));

    select coalesce(rep.score,0) into v_reputation
    from public.caleris_driver_reputation rep where rep.member_id=d.id;
    v_reputation:=greatest(0,least(100,coalesce(v_reputation,0)));

    v_score:=round(
      v_license*(c.weights->>'license')::numeric/100
      +v_contract*(c.weights->>'contract')::numeric/100
      +v_performance*(c.weights->>'performance')::numeric/100
      +v_skill*(c.weights->>'skill')::numeric/100
      +v_achievement*(c.weights->>'achievement')::numeric/100
      +v_activity*(c.weights->>'activity')::numeric/100
      +v_reputation*(c.weights->>'reputation')::numeric/100,4
    );
    v_target:=round(c.base_value_eur*v_score/100*v_multiplier,2);
    select market_value_eur into v_old from public.caleris_driver_market_values where member_id=d.id;
    if not found then
      -- First value is seeded from License + home Division Tier only.
      v_new:=round(c.base_value_eur*v_license/100*v_multiplier,2);
      v_old:=0;
    else
      v_new:=round(v_old+(v_target-v_old)*c.growth_factor,2);
    end if;

    v_breakdown:=jsonb_build_object(
      'license',v_license,'contract',v_contract,'performance',v_performance,
      'skill',v_skill,'achievement',v_achievement,'activity',v_activity,
      'reputation',v_reputation,'tier_multiplier',v_multiplier,'tier_number',v_tier
    );
    insert into public.caleris_driver_market_values(
      member_id,market_value_eur,mv_score,target_value_eur,tier_number,division_key,last_calculated_at,updated_at
    ) values(d.id,v_new,v_score,v_target,v_tier,v_division_key,now(),now())
    on conflict(member_id) do update set
      market_value_eur=excluded.market_value_eur,mv_score=excluded.mv_score,
      target_value_eur=excluded.target_value_eur,tier_number=excluded.tier_number,
      division_key=excluded.division_key,last_calculated_at=now(),updated_at=now();

    if v_old=0 or v_new is distinct from v_old then
      insert into public.caleris_driver_market_value_history(
        member_id,season_id,previous_value_eur,new_value_eur,mv_score,tier_number,breakdown,reason
      ) values(d.id,v_season_id,v_old,v_new,v_score,v_tier,v_breakdown,p_reason);
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.recalculate_driver_market_values(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.admin_recalculate_driver_market_values(
  p_member_id uuid default null,
  p_reason text default 'manual'
) returns integer
language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Admin access required.';
  end if;
  return private.recalculate_driver_market_values(p_member_id,coalesce(p_reason,'manual'));
end;
$$;

revoke all on function public.member_get_driver_market_values() from public,anon;
grant execute on function public.member_get_driver_market_values() to authenticated;
revoke all on function public.admin_get_driver_market_config() from public,anon;
grant execute on function public.admin_get_driver_market_config() to authenticated;
revoke all on function public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.admin_recalculate_driver_market_values(uuid,text) from public,anon;
grant execute on function public.admin_recalculate_driver_market_values(uuid,text) to authenticated;

-- Separate lifecycle for Pre-contract: never relax the existing transfer/loan constraints.
create table if not exists public.caleris_driver_precontract_negotiations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  driver_member_id uuid not null references public.members(id) on delete restrict,
  origin_team_id uuid not null references public.teams(id) on delete restrict,
  destination_team_id uuid not null references public.teams(id) on delete restrict,
  origin_contract_id uuid not null references public.contracts(id) on delete restrict,
  contract_ends_on date not null,
  annual_salary numeric(20,2) not null check(annual_salary>0),
  duration_seasons integer not null check(duration_seasons between 1 and 5),
  status text not null default 'offered'
    check(status in ('offered','negotiating','signed','rejected','cancelled','activated')),
  initiated_by uuid not null references public.members(id) on delete restrict,
  signed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(origin_team_id<>destination_team_id)
);
create index if not exists caleris_driver_precontract_driver_status_idx
  on public.caleris_driver_precontract_negotiations(driver_member_id,status,created_at desc);
create index if not exists caleris_driver_precontract_destination_idx
  on public.caleris_driver_precontract_negotiations(destination_team_id,status,created_at desc);
create unique index if not exists caleris_driver_precontract_one_open_per_destination
  on public.caleris_driver_precontract_negotiations(driver_member_id,destination_team_id)
  where status in ('offered','negotiating');
create unique index if not exists caleris_driver_precontract_one_signed
  on public.caleris_driver_precontract_negotiations(driver_member_id)
  where status in ('signed','activated');

create table if not exists public.caleris_driver_precontract_offers (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.caleris_driver_precontract_negotiations(id) on delete cascade,
  offered_by_member_id uuid not null references public.members(id) on delete restrict,
  annual_salary numeric(20,2) not null check(annual_salary>0),
  duration_seasons integer not null check(duration_seasons between 1 and 5),
  note text,
  response text not null default 'pending'
    check(response in ('pending','accepted','rejected','countered','superseded')),
  created_at timestamptz not null default now()
);
create index if not exists caleris_driver_precontract_offers_negotiation_idx
  on public.caleris_driver_precontract_offers(negotiation_id,created_at desc);

alter table public.caleris_driver_precontract_negotiations enable row level security;
alter table public.caleris_driver_precontract_offers enable row level security;
revoke all on public.caleris_driver_precontract_negotiations,public.caleris_driver_precontract_offers from public,anon,authenticated;
drop policy if exists "Precontract parties read negotiations" on public.caleris_driver_precontract_negotiations;
create policy "Precontract parties read negotiations" on public.caleris_driver_precontract_negotiations
  for select to authenticated using (
    exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=driver_member_id)
    or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
      where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=destination_team_id)
    or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  );
drop policy if exists "Precontract parties read offers" on public.caleris_driver_precontract_offers;
create policy "Precontract parties read offers" on public.caleris_driver_precontract_offers
  for select to authenticated using (
    exists(select 1 from public.caleris_driver_precontract_negotiations n
      join public.profiles p on p.member_id=n.driver_member_id
      where n.id=negotiation_id and p.user_id=(select auth.uid()))
    or exists(select 1 from public.caleris_driver_precontract_negotiations n
      join public.profiles p on true join public.members m on m.id=p.member_id
      where n.id=negotiation_id and p.user_id=(select auth.uid())
        and m.role='Owner' and m.team_id=n.destination_team_id)
    or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  );
grant select on public.caleris_driver_precontract_negotiations,public.caleris_driver_precontract_offers to authenticated;

create or replace function public.member_start_driver_precontract(
  p_driver_member_id uuid,
  p_annual_salary numeric,
  p_duration_seasons integer,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_driver public.members%rowtype;
  v_season public.license_seasons%rowtype;
  v_contract public.contracts%rowtype;
  v_band public.caleris_driver_salary_bands%rowtype;
  v_negotiation_id uuid;
  v_origin_owner uuid;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid());
  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
    raise exception 'Hanya Team Owner yang dapat memulai Pre-contract.';
  end if;
  select * into v_driver from public.members where id=p_driver_member_id and role='Driver' for update;
  if not found or v_driver.team_id is null or v_driver.team_id=v_actor.team_id then
    raise exception 'Driver tidak memenuhi syarat Pre-contract.';
  end if;
  select * into v_season from public.license_seasons where status='active'
    order by starts_on desc,created_at desc limit 1;
  if not found then raise exception 'Tidak ada Season aktif.'; end if;
  if v_today < v_season.starts_on + ceil((v_season.ends_on-v_season.starts_on+1)::numeric/2)::integer then
    raise exception 'Pre-contract baru terbuka setelah 50 persen durasi kalender Season berlalu.';
  end if;
  select * into v_contract from public.contracts
    where member_id=v_driver.id and team_id=v_driver.team_id and status='active'
      and ends_on>=v_today
    order by ends_on desc,created_at desc limit 1 for update;
  if not found then raise exception 'Driver tidak memiliki kontrak aktif yang dapat dituju melalui Pre-contract.'; end if;
  select * into v_band from public.caleris_driver_salary_bands
    where lower(license_label)=lower(case when upper(coalesce(v_driver.license,''))='A' then 'Super License' else v_driver.license end);
  if not found or p_annual_salary is null or p_annual_salary<v_band.salary_min_eur
    or p_annual_salary>v_band.salary_max_eur or p_annual_salary<>round(p_annual_salary,2) then
    raise exception 'Gaji tahunan harus mengikuti salary band lisensi Driver.';
  end if;
  if p_duration_seasons not between 1 and 5 then raise exception 'Durasi kontrak harus 1–5 Season.'; end if;
  if exists(select 1 from public.caleris_driver_precontract_negotiations n
    where n.driver_member_id=v_driver.id and n.status in ('signed','activated')) then
    raise exception 'Driver sudah menandatangani Pre-contract dengan tim lain.';
  end if;
  if exists(select 1 from public.caleris_driver_precontract_negotiations n
    where n.driver_member_id=v_driver.id and n.destination_team_id=v_actor.team_id
      and n.status in ('offered','negotiating')) then
    raise exception 'Tim kamu sudah memiliki negosiasi Pre-contract aktif dengan Driver ini.';
  end if;
  insert into public.caleris_driver_precontract_negotiations(
    season_id,driver_member_id,origin_team_id,destination_team_id,origin_contract_id,
    contract_ends_on,annual_salary,duration_seasons,initiated_by,status
  ) values(
    v_season.id,v_driver.id,v_driver.team_id,v_actor.team_id,v_contract.id,
    v_contract.ends_on,round(p_annual_salary,2),p_duration_seasons,v_actor.id,'offered'
  ) returning id into v_negotiation_id;
  insert into public.caleris_driver_precontract_offers(
    negotiation_id,offered_by_member_id,annual_salary,duration_seasons,note
  ) values(v_negotiation_id,v_actor.id,round(p_annual_salary,2),p_duration_seasons,nullif(trim(p_note),'')); 
  select m.id into v_origin_owner from public.members m
    where m.team_id=v_driver.team_id and m.role='Owner' order by m.created_at limit 1;
  insert into public.caleris_notifications(member_id,actor_member_id,category,title,body,href,metadata,idempotency_key)
  values(v_driver.id,v_actor.id,'driver_precontract','Penawaran Pre-contract',
    'Tim lain mengajukan Pre-contract. Buka Transfer Market untuk meninjau penawaran.',
    '/transfer-market',jsonb_build_object('negotiation_id',v_negotiation_id),'precontract:'||v_negotiation_id||':driver')
  on conflict do nothing;
  if v_origin_owner is not null then
    insert into public.caleris_notifications(member_id,actor_member_id,category,title,body,href,metadata,idempotency_key)
    values(v_origin_owner,v_actor.id,'driver_precontract','Pendekatan Pre-contract',
      'Kontrak driver '||coalesce(v_driver.character_name,'Driver')||' segera berakhir, dia sedang bernegosiasi dengan tim lain saat ini, segera ajukan kontrak baru atau biarkan dia pergi secara gratis',
      '/transfer-market',jsonb_build_object('negotiation_id',v_negotiation_id,'driver_member_id',v_driver.id),
      'precontract:'||v_negotiation_id||':origin-owner')
    on conflict do nothing;
  end if;
  return v_negotiation_id;
end;
$$;

create or replace function public.member_respond_driver_precontract(
  p_negotiation_id uuid,
  p_action text,
  p_annual_salary numeric default null,
  p_duration_seasons integer default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_neg public.caleris_driver_precontract_negotiations%rowtype;
  v_driver public.members%rowtype;
  v_last public.caleris_driver_precontract_offers%rowtype;
  v_band public.caleris_driver_salary_bands%rowtype;
  v_actor_is_driver boolean;
  v_salary numeric(20,2);
  v_duration integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid());
  if not found then raise exception 'Profil karakter tidak ditemukan.'; end if;
  select * into v_neg from public.caleris_driver_precontract_negotiations
    where id=p_negotiation_id for update;
  if not found or v_neg.status not in ('offered','negotiating') then
    raise exception 'Negosiasi Pre-contract tidak lagi aktif.';
  end if;
  select * into v_driver from public.members where id=v_neg.driver_member_id for update;
  v_actor_is_driver:=v_actor.id=v_neg.driver_member_id and v_actor.role='Driver';
  if not v_actor_is_driver and not (v_actor.role='Owner' and v_actor.team_id=v_neg.destination_team_id) then
    raise exception 'Hanya Driver dan Team Owner tim tujuan yang dapat bernegosiasi.';
  end if;
  select * into v_last from public.caleris_driver_precontract_offers
    where negotiation_id=v_neg.id order by created_at desc,id desc limit 1 for update;
  if v_last.id is null or v_last.offered_by_member_id=v_actor.id then
    raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.';
  end if;
  if p_action='reject' then
    update public.caleris_driver_precontract_offers set response='rejected' where id=v_last.id;
    update public.caleris_driver_precontract_negotiations set status='rejected',updated_at=now() where id=v_neg.id;
    return jsonb_build_object('status','rejected');
  elsif p_action='accept' then
    update public.caleris_driver_precontract_offers set response='accepted' where id=v_last.id;
    update public.caleris_driver_precontract_negotiations
      set status='signed',annual_salary=v_last.annual_salary,duration_seasons=v_last.duration_seasons,
          signed_at=now(),updated_at=now() where id=v_neg.id;
    update public.caleris_driver_precontract_negotiations
      set status='cancelled',updated_at=now()
      where driver_member_id=v_neg.driver_member_id and id<>v_neg.id and status in ('offered','negotiating');
    insert into public.caleris_notifications(member_id,actor_member_id,category,title,body,href,metadata,idempotency_key)
    select m.id,v_actor.id,'driver_precontract','Pre-contract ditandatangani',
      'Driver '||coalesce(v_driver.character_name,'Driver')||' telah menandatangani Pre-contract dengan tim baru. Perpindahan berlaku setelah kontrak lama berakhir.',
      '/transfer-market',jsonb_build_object('negotiation_id',v_neg.id),'precontract:'||v_neg.id||':signed:'||m.id
    from public.members m where m.team_id=v_neg.destination_team_id and m.role='Owner'
    on conflict do nothing;
    return jsonb_build_object('status','signed','annual_salary',v_last.annual_salary,'duration_seasons',v_last.duration_seasons);
  elsif p_action='counter' then
    if p_annual_salary is null or p_duration_seasons not between 1 and 5 then
      raise exception 'Gaji dan durasi kontrak counter-offer wajib diisi.';
    end if;
    select * into v_band from public.caleris_driver_salary_bands
      where lower(license_label)=lower(case when upper(coalesce(v_driver.license,''))='A' then 'Super License' else v_driver.license end);
    if not found or p_annual_salary<v_band.salary_min_eur or p_annual_salary>v_band.salary_max_eur
      or p_annual_salary<>round(p_annual_salary,2) then
      raise exception 'Gaji counter-offer harus mengikuti salary band lisensi Driver.';
    end if;
    update public.caleris_driver_precontract_offers set response='countered' where id=v_last.id;
    insert into public.caleris_driver_precontract_offers(
      negotiation_id,offered_by_member_id,annual_salary,duration_seasons,note
    ) values(v_neg.id,v_actor.id,round(p_annual_salary,2),p_duration_seasons,nullif(trim(p_note),'')); 
    update public.caleris_driver_precontract_negotiations set status='negotiating',
      annual_salary=round(p_annual_salary,2),duration_seasons=p_duration_seasons,updated_at=now()
      where id=v_neg.id;
    return jsonb_build_object('status','negotiating');
  else
    raise exception 'Action Pre-contract tidak dikenal.';
  end if;
end;
$$;

create or replace function private.process_driver_precontracts()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  n record;
  v_next_season public.license_seasons%rowtype;
  v_done integer:=0;
begin
  for n in
    select pc.*,ct.duration_label,ct.starts_on,ct.ends_on
    from public.caleris_driver_precontract_negotiations pc
    join public.contracts ct on ct.id=pc.origin_contract_id
    where pc.status='signed' and ct.status='active'
      and pc.contract_ends_on < (now() at time zone 'Asia/Jakarta')::date
    order by pc.contract_ends_on,pc.created_at
    for update of pc skip locked
  loop
    select * into v_next_season from public.license_seasons s
      where s.starts_on>n.contract_ends_on and s.status in ('draft','active')
      order by s.starts_on limit 1;
    if not found then continue; end if;
    if exists(select 1 from public.caleris_driver_contract_terms t
      where t.member_id=n.driver_member_id and t.first_season_id=v_next_season.id) then
      update public.caleris_driver_precontract_negotiations set status='activated',activated_at=now(),updated_at=now()
        where id=n.id;
      continue;
    end if;
    insert into public.caleris_driver_contract_terms(
      first_season_id,team_id,member_id,annual_salary,duration_seasons,status,created_by
    ) values(v_next_season.id,n.destination_team_id,n.driver_member_id,n.annual_salary,n.duration_seasons,'active',null)
    on conflict(member_id,first_season_id) do nothing;
    update public.contracts set status='ended' where id=n.origin_contract_id and status='active';
    update public.members set team_id=n.destination_team_id where id=n.driver_member_id
      and role='Driver' and team_id=n.origin_team_id;
    update public.caleris_driver_precontract_negotiations
      set status='activated',activated_at=now(),updated_at=now() where id=n.id;
    insert into public.caleris_notifications(member_id,category,title,body,href,metadata,idempotency_key)
    select m.id,'driver_precontract','Pre-contract aktif',
      'Perpindahan Driver '||coalesce(d.character_name,'Driver')||' telah berlaku. Kontrak baru tercatat untuk Season berikutnya.',
      '/transfer-market',jsonb_build_object('negotiation_id',n.id,'season_id',v_next_season.id),
      'precontract:'||n.id||':activated:'||m.id
    from public.members m join public.members d on d.id=n.driver_member_id
    where m.team_id=n.destination_team_id and m.role='Owner'
    on conflict do nothing;
    v_done:=v_done+1;
  end loop;
  return jsonb_build_object('activated',v_done);
end;
$$;
revoke all on function private.process_driver_precontracts() from public,anon,authenticated,service_role;
revoke all on function public.member_start_driver_precontract(uuid,numeric,integer,text) from public,anon;
grant execute on function public.member_start_driver_precontract(uuid,numeric,integer,text) to authenticated;
revoke all on function public.member_respond_driver_precontract(uuid,text,numeric,integer,text) from public,anon;
grant execute on function public.member_respond_driver_precontract(uuid,text,numeric,integer,text) to authenticated;

-- Keep the market current after authoritative data changes.
create or replace function private.refresh_driver_market_after_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_member_id uuid;
begin
  if tg_table_name='caleris_race_results' then
    perform private.recalculate_driver_market_values(null,'race_result');
  elsif tg_table_name='members' then
    v_member_id:=coalesce(new.id,old.id);
    perform private.recalculate_driver_market_values(v_member_id,'member_profile');
  elsif tg_table_name='license_rounds' then
    perform private.recalculate_driver_market_values(null,'round_calendar');
  else
    v_member_id:=coalesce(new.member_id,old.member_id);
    if v_member_id is not null then perform private.recalculate_driver_market_values(v_member_id,tg_table_name); end if;
  end if;
  return null;
end;
$$;
revoke all on function private.refresh_driver_market_after_change() from public,anon,authenticated,service_role;

drop trigger if exists caleris_mv_attributes_refresh on public.caleris_driver_attributes;
create trigger caleris_mv_attributes_refresh after insert or update on public.caleris_driver_attributes
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_reputation_refresh on public.caleris_driver_reputation;
create trigger caleris_mv_reputation_refresh after insert or update on public.caleris_driver_reputation
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_checkin_refresh on public.license_daily_checkins;
create trigger caleris_mv_checkin_refresh after insert or update on public.license_daily_checkins
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_standings_refresh on public.license_round_standings;
create trigger caleris_mv_standings_refresh after insert or update on public.license_round_standings
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_race_results_refresh on public.caleris_race_results;
create trigger caleris_mv_race_results_refresh after insert or update on public.caleris_race_results
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_contracts_refresh on public.contracts;
create trigger caleris_mv_contracts_refresh after insert or update on public.contracts
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_economy_contracts_refresh on public.economy_driver_contracts;
create trigger caleris_mv_economy_contracts_refresh after insert or update on public.economy_driver_contracts
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_members_refresh on public.members;
create trigger caleris_mv_members_refresh after update of team_id,license on public.members
  for each row execute function private.refresh_driver_market_after_change();

-- The scheduled processors are idempotent and isolated from the existing transfer/loan worker.
select cron.unschedule(jobid) from cron.job where jobname='caleris-driver-precontract-lifecycle';
select cron.schedule('caleris-driver-precontract-lifecycle','*/5 * * * *',
  'select private.process_driver_precontracts();');
select cron.unschedule(jobid) from cron.job where jobname='caleris-driver-market-daily';
select cron.schedule('caleris-driver-market-daily','10 0 * * *',
  'select private.recalculate_driver_market_values(null,''daily'');');

-- Seed current Driver records without exposing scoring breakdown to members.
select private.recalculate_driver_market_values(null,'initial_seed');

commit;
;
    v_skill:=greatest(0,least(100,coalesce(v_skill,50)));

    select coalesce(sum(case e.finishing_position when 1 then 5 when 2 then 3 when 3 then 1 else 0 end),0)
      + count(*) filter(where rr.driver_of_day_member_id=d.id)
      into v_achievement_points
    from public.caleris_race_result_entries e
    join public.license_rounds r on r.id=e.round_id
    join public.license_season_divisions sd on sd.id=r.season_division_id
    join public.caleris_race_results rr on rr.round_id=r.id and rr.published_at is not null
    where e.member_id=d.id and sd.season_id=v_season_id
      and (v_division_id is null or sd.id=v_division_id);
    select count(*) into v_round_count
    from public.license_rounds r
    join public.license_season_divisions sd on sd.id=r.season_division_id
    where sd.season_id=v_season_id and (v_division_id is null or sd.id=v_division_id)
      and exists(select 1 from public.caleris_race_results rr where rr.round_id=r.id and rr.published_at is not null);
    v_achievement_max:=v_round_count*6;
    v_achievement:=case when v_achievement_max>0 then least(100,v_achievement_points/v_achievement_max*100) else 0 end;

    select count(distinct dc.round_id) into v_checkins
    from public.license_daily_checkins dc
    join public.license_rounds r on r.id=dc.round_id
    join public.license_season_divisions sd on sd.id=r.season_division_id
    where dc.member_id=d.id and sd.season_id=v_season_id
      and (v_division_id is null or sd.id=v_division_id);
    v_activity:=least(100,greatest(0,coalesce(v_checkins,0)*4));

    select coalesce(rep.score,0) into v_reputation
    from public.caleris_driver_reputation rep where rep.member_id=d.id;
    v_reputation:=greatest(0,least(100,coalesce(v_reputation,0)));

    v_score:=round(
      v_license*(c.weights->>'license')::numeric/100
      +v_contract*(c.weights->>'contract')::numeric/100
      +v_performance*(c.weights->>'performance')::numeric/100
      +v_skill*(c.weights->>'skill')::numeric/100
      +v_achievement*(c.weights->>'achievement')::numeric/100
      +v_activity*(c.weights->>'activity')::numeric/100
      +v_reputation*(c.weights->>'reputation')::numeric/100,4
    );
    v_target:=round(c.base_value_eur*v_score/100*v_multiplier,2);
    select market_value_eur into v_old from public.caleris_driver_market_values where member_id=d.id;
    if not found then
      -- First value is seeded from License + home Division Tier only.
      v_new:=round(c.base_value_eur*v_license/100*v_multiplier,2);
      v_old:=0;
    else
      v_new:=round(v_old+(v_target-v_old)*c.growth_factor,2);
    end if;

    v_breakdown:=jsonb_build_object(
      'license',v_license,'contract',v_contract,'performance',v_performance,
      'skill',v_skill,'achievement',v_achievement,'activity',v_activity,
      'reputation',v_reputation,'tier_multiplier',v_multiplier,'tier_number',v_tier
    );
    insert into public.caleris_driver_market_values(
      member_id,market_value_eur,mv_score,target_value_eur,tier_number,division_key,last_calculated_at,updated_at
    ) values(d.id,v_new,v_score,v_target,v_tier,v_division_key,now(),now())
    on conflict(member_id) do update set
      market_value_eur=excluded.market_value_eur,mv_score=excluded.mv_score,
      target_value_eur=excluded.target_value_eur,tier_number=excluded.tier_number,
      division_key=excluded.division_key,last_calculated_at=now(),updated_at=now();

    if v_old=0 or v_new is distinct from v_old then
      insert into public.caleris_driver_market_value_history(
        member_id,season_id,previous_value_eur,new_value_eur,mv_score,tier_number,breakdown,reason
      ) values(d.id,v_season_id,v_old,v_new,v_score,v_tier,v_breakdown,p_reason);
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.recalculate_driver_market_values(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.admin_recalculate_driver_market_values(
  p_member_id uuid default null,
  p_reason text default 'manual'
) returns integer
language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())) then
    raise exception 'Admin access required.';
  end if;
  return private.recalculate_driver_market_values(p_member_id,coalesce(p_reason,'manual'));
end;
$$;

revoke all on function public.member_get_driver_market_values() from public,anon;
grant execute on function public.member_get_driver_market_values() to authenticated;
revoke all on function public.admin_get_driver_market_config() from public,anon;
grant execute on function public.admin_get_driver_market_config() to authenticated;
revoke all on function public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.admin_recalculate_driver_market_values(uuid,text) from public,anon;
grant execute on function public.admin_recalculate_driver_market_values(uuid,text) to authenticated;

-- Separate lifecycle for Pre-contract: never relax the existing transfer/loan constraints.
create table if not exists public.caleris_driver_precontract_negotiations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.license_seasons(id) on delete restrict,
  driver_member_id uuid not null references public.members(id) on delete restrict,
  origin_team_id uuid not null references public.teams(id) on delete restrict,
  destination_team_id uuid not null references public.teams(id) on delete restrict,
  origin_contract_id uuid not null references public.contracts(id) on delete restrict,
  contract_ends_on date not null,
  annual_salary numeric(20,2) not null check(annual_salary>0),
  duration_seasons integer not null check(duration_seasons between 1 and 5),
  status text not null default 'offered'
    check(status in ('offered','negotiating','signed','rejected','cancelled','activated')),
  initiated_by uuid not null references public.members(id) on delete restrict,
  signed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(origin_team_id<>destination_team_id)
);
create index if not exists caleris_driver_precontract_driver_status_idx
  on public.caleris_driver_precontract_negotiations(driver_member_id,status,created_at desc);
create index if not exists caleris_driver_precontract_destination_idx
  on public.caleris_driver_precontract_negotiations(destination_team_id,status,created_at desc);
create unique index if not exists caleris_driver_precontract_one_open_per_destination
  on public.caleris_driver_precontract_negotiations(driver_member_id,destination_team_id)
  where status in ('offered','negotiating');
create unique index if not exists caleris_driver_precontract_one_signed
  on public.caleris_driver_precontract_negotiations(driver_member_id)
  where status in ('signed','activated');

create table if not exists public.caleris_driver_precontract_offers (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.caleris_driver_precontract_negotiations(id) on delete cascade,
  offered_by_member_id uuid not null references public.members(id) on delete restrict,
  annual_salary numeric(20,2) not null check(annual_salary>0),
  duration_seasons integer not null check(duration_seasons between 1 and 5),
  note text,
  response text not null default 'pending'
    check(response in ('pending','accepted','rejected','countered','superseded')),
  created_at timestamptz not null default now()
);
create index if not exists caleris_driver_precontract_offers_negotiation_idx
  on public.caleris_driver_precontract_offers(negotiation_id,created_at desc);

alter table public.caleris_driver_precontract_negotiations enable row level security;
alter table public.caleris_driver_precontract_offers enable row level security;
revoke all on public.caleris_driver_precontract_negotiations,public.caleris_driver_precontract_offers from public,anon,authenticated;
drop policy if exists "Precontract parties read negotiations" on public.caleris_driver_precontract_negotiations;
create policy "Precontract parties read negotiations" on public.caleris_driver_precontract_negotiations
  for select to authenticated using (
    exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.member_id=driver_member_id)
    or exists(select 1 from public.profiles p join public.members m on m.id=p.member_id
      where p.user_id=(select auth.uid()) and m.role='Owner' and m.team_id=destination_team_id)
    or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  );
drop policy if exists "Precontract parties read offers" on public.caleris_driver_precontract_offers;
create policy "Precontract parties read offers" on public.caleris_driver_precontract_offers
  for select to authenticated using (
    exists(select 1 from public.caleris_driver_precontract_negotiations n
      join public.profiles p on p.member_id=n.driver_member_id
      where n.id=negotiation_id and p.user_id=(select auth.uid()))
    or exists(select 1 from public.caleris_driver_precontract_negotiations n
      join public.profiles p on true join public.members m on m.id=p.member_id
      where n.id=negotiation_id and p.user_id=(select auth.uid())
        and m.role='Owner' and m.team_id=n.destination_team_id)
    or exists(select 1 from public.site_admins a where a.user_id=(select auth.uid()))
  );
grant select on public.caleris_driver_precontract_negotiations,public.caleris_driver_precontract_offers to authenticated;

create or replace function public.member_start_driver_precontract(
  p_driver_member_id uuid,
  p_annual_salary numeric,
  p_duration_seasons integer,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_driver public.members%rowtype;
  v_season public.license_seasons%rowtype;
  v_contract public.contracts%rowtype;
  v_band public.caleris_driver_salary_bands%rowtype;
  v_negotiation_id uuid;
  v_origin_owner uuid;
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid());
  if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
    raise exception 'Hanya Team Owner yang dapat memulai Pre-contract.';
  end if;
  select * into v_driver from public.members where id=p_driver_member_id and role='Driver' for update;
  if not found or v_driver.team_id is null or v_driver.team_id=v_actor.team_id then
    raise exception 'Driver tidak memenuhi syarat Pre-contract.';
  end if;
  select * into v_season from public.license_seasons where status='active'
    order by starts_on desc,created_at desc limit 1;
  if not found then raise exception 'Tidak ada Season aktif.'; end if;
  if v_today < v_season.starts_on + ceil((v_season.ends_on-v_season.starts_on+1)::numeric/2)::integer then
    raise exception 'Pre-contract baru terbuka setelah 50 persen durasi kalender Season berlalu.';
  end if;
  select * into v_contract from public.contracts
    where member_id=v_driver.id and team_id=v_driver.team_id and status='active'
      and ends_on>=v_today
    order by ends_on desc,created_at desc limit 1 for update;
  if not found then raise exception 'Driver tidak memiliki kontrak aktif yang dapat dituju melalui Pre-contract.'; end if;
  select * into v_band from public.caleris_driver_salary_bands
    where lower(license_label)=lower(case when upper(coalesce(v_driver.license,''))='A' then 'Super License' else v_driver.license end);
  if not found or p_annual_salary is null or p_annual_salary<v_band.salary_min_eur
    or p_annual_salary>v_band.salary_max_eur or p_annual_salary<>round(p_annual_salary,2) then
    raise exception 'Gaji tahunan harus mengikuti salary band lisensi Driver.';
  end if;
  if p_duration_seasons not between 1 and 5 then raise exception 'Durasi kontrak harus 1–5 Season.'; end if;
  if exists(select 1 from public.caleris_driver_precontract_negotiations n
    where n.driver_member_id=v_driver.id and n.status in ('signed','activated')) then
    raise exception 'Driver sudah menandatangani Pre-contract dengan tim lain.';
  end if;
  if exists(select 1 from public.caleris_driver_precontract_negotiations n
    where n.driver_member_id=v_driver.id and n.destination_team_id=v_actor.team_id
      and n.status in ('offered','negotiating')) then
    raise exception 'Tim kamu sudah memiliki negosiasi Pre-contract aktif dengan Driver ini.';
  end if;
  insert into public.caleris_driver_precontract_negotiations(
    season_id,driver_member_id,origin_team_id,destination_team_id,origin_contract_id,
    contract_ends_on,annual_salary,duration_seasons,initiated_by,status
  ) values(
    v_season.id,v_driver.id,v_driver.team_id,v_actor.team_id,v_contract.id,
    v_contract.ends_on,round(p_annual_salary,2),p_duration_seasons,v_actor.id,'offered'
  ) returning id into v_negotiation_id;
  insert into public.caleris_driver_precontract_offers(
    negotiation_id,offered_by_member_id,annual_salary,duration_seasons,note
  ) values(v_negotiation_id,v_actor.id,round(p_annual_salary,2),p_duration_seasons,nullif(trim(p_note),'')); 
  select m.id into v_origin_owner from public.members m
    where m.team_id=v_driver.team_id and m.role='Owner' order by m.created_at limit 1;
  insert into public.caleris_notifications(member_id,actor_member_id,category,title,body,href,metadata,idempotency_key)
  values(v_driver.id,v_actor.id,'driver_precontract','Penawaran Pre-contract',
    'Tim lain mengajukan Pre-contract. Buka Transfer Market untuk meninjau penawaran.',
    '/transfer-market',jsonb_build_object('negotiation_id',v_negotiation_id),'precontract:'||v_negotiation_id||':driver')
  on conflict do nothing;
  if v_origin_owner is not null then
    insert into public.caleris_notifications(member_id,actor_member_id,category,title,body,href,metadata,idempotency_key)
    values(v_origin_owner,v_actor.id,'driver_precontract','Pendekatan Pre-contract',
      'Kontrak driver '||coalesce(v_driver.character_name,'Driver')||' segera berakhir, dia sedang bernegosiasi dengan tim lain saat ini, segera ajukan kontrak baru atau biarkan dia pergi secara gratis',
      '/transfer-market',jsonb_build_object('negotiation_id',v_negotiation_id,'driver_member_id',v_driver.id),
      'precontract:'||v_negotiation_id||':origin-owner')
    on conflict do nothing;
  end if;
  return v_negotiation_id;
end;
$$;

create or replace function public.member_respond_driver_precontract(
  p_negotiation_id uuid,
  p_action text,
  p_annual_salary numeric default null,
  p_duration_seasons integer default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_actor public.members%rowtype;
  v_neg public.caleris_driver_precontract_negotiations%rowtype;
  v_driver public.members%rowtype;
  v_last public.caleris_driver_precontract_offers%rowtype;
  v_band public.caleris_driver_salary_bands%rowtype;
  v_actor_is_driver boolean;
  v_salary numeric(20,2);
  v_duration integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select m.* into v_actor from public.profiles p join public.members m on m.id=p.member_id
    where p.user_id=(select auth.uid());
  if not found then raise exception 'Profil karakter tidak ditemukan.'; end if;
  select * into v_neg from public.caleris_driver_precontract_negotiations
    where id=p_negotiation_id for update;
  if not found or v_neg.status not in ('offered','negotiating') then
    raise exception 'Negosiasi Pre-contract tidak lagi aktif.';
  end if;
  select * into v_driver from public.members where id=v_neg.driver_member_id for update;
  v_actor_is_driver:=v_actor.id=v_neg.driver_member_id and v_actor.role='Driver';
  if not v_actor_is_driver and not (v_actor.role='Owner' and v_actor.team_id=v_neg.destination_team_id) then
    raise exception 'Hanya Driver dan Team Owner tim tujuan yang dapat bernegosiasi.';
  end if;
  select * into v_last from public.caleris_driver_precontract_offers
    where negotiation_id=v_neg.id order by created_at desc,id desc limit 1 for update;
  if v_last.id is null or v_last.offered_by_member_id=v_actor.id then
    raise exception 'Pihak yang sama tidak dapat merespons penawarannya sendiri.';
  end if;
  if p_action='reject' then
    update public.caleris_driver_precontract_offers set response='rejected' where id=v_last.id;
    update public.caleris_driver_precontract_negotiations set status='rejected',updated_at=now() where id=v_neg.id;
    return jsonb_build_object('status','rejected');
  elsif p_action='accept' then
    update public.caleris_driver_precontract_offers set response='accepted' where id=v_last.id;
    update public.caleris_driver_precontract_negotiations
      set status='signed',annual_salary=v_last.annual_salary,duration_seasons=v_last.duration_seasons,
          signed_at=now(),updated_at=now() where id=v_neg.id;
    update public.caleris_driver_precontract_negotiations
      set status='cancelled',updated_at=now()
      where driver_member_id=v_neg.driver_member_id and id<>v_neg.id and status in ('offered','negotiating');
    insert into public.caleris_notifications(member_id,actor_member_id,category,title,body,href,metadata,idempotency_key)
    select m.id,v_actor.id,'driver_precontract','Pre-contract ditandatangani',
      'Driver '||coalesce(v_driver.character_name,'Driver')||' telah menandatangani Pre-contract dengan tim baru. Perpindahan berlaku setelah kontrak lama berakhir.',
      '/transfer-market',jsonb_build_object('negotiation_id',v_neg.id),'precontract:'||v_neg.id||':signed:'||m.id
    from public.members m where m.team_id=v_neg.destination_team_id and m.role='Owner'
    on conflict do nothing;
    return jsonb_build_object('status','signed','annual_salary',v_last.annual_salary,'duration_seasons',v_last.duration_seasons);
  elsif p_action='counter' then
    if p_annual_salary is null or p_duration_seasons not between 1 and 5 then
      raise exception 'Gaji dan durasi kontrak counter-offer wajib diisi.';
    end if;
    select * into v_band from public.caleris_driver_salary_bands
      where lower(license_label)=lower(case when upper(coalesce(v_driver.license,''))='A' then 'Super License' else v_driver.license end);
    if not found or p_annual_salary<v_band.salary_min_eur or p_annual_salary>v_band.salary_max_eur
      or p_annual_salary<>round(p_annual_salary,2) then
      raise exception 'Gaji counter-offer harus mengikuti salary band lisensi Driver.';
    end if;
    update public.caleris_driver_precontract_offers set response='countered' where id=v_last.id;
    insert into public.caleris_driver_precontract_offers(
      negotiation_id,offered_by_member_id,annual_salary,duration_seasons,note
    ) values(v_neg.id,v_actor.id,round(p_annual_salary,2),p_duration_seasons,nullif(trim(p_note),'')); 
    update public.caleris_driver_precontract_negotiations set status='negotiating',
      annual_salary=round(p_annual_salary,2),duration_seasons=p_duration_seasons,updated_at=now()
      where id=v_neg.id;
    return jsonb_build_object('status','negotiating');
  else
    raise exception 'Action Pre-contract tidak dikenal.';
  end if;
end;
$$;

create or replace function private.process_driver_precontracts()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  n record;
  v_next_season public.license_seasons%rowtype;
  v_done integer:=0;
begin
  for n in
    select pc.*,ct.duration_label,ct.starts_on,ct.ends_on
    from public.caleris_driver_precontract_negotiations pc
    join public.contracts ct on ct.id=pc.origin_contract_id
    where pc.status='signed' and ct.status='active'
      and pc.contract_ends_on < (now() at time zone 'Asia/Jakarta')::date
    order by pc.contract_ends_on,pc.created_at
    for update of pc skip locked
  loop
    select * into v_next_season from public.license_seasons s
      where s.starts_on>n.contract_ends_on and s.status in ('draft','active')
      order by s.starts_on limit 1;
    if not found then continue; end if;
    if exists(select 1 from public.caleris_driver_contract_terms t
      where t.member_id=n.driver_member_id and t.first_season_id=v_next_season.id) then
      update public.caleris_driver_precontract_negotiations set status='activated',activated_at=now(),updated_at=now()
        where id=n.id;
      continue;
    end if;
    insert into public.caleris_driver_contract_terms(
      first_season_id,team_id,member_id,annual_salary,duration_seasons,status,created_by
    ) values(v_next_season.id,n.destination_team_id,n.driver_member_id,n.annual_salary,n.duration_seasons,'active',null)
    on conflict(member_id,first_season_id) do nothing;
    update public.contracts set status='ended' where id=n.origin_contract_id and status='active';
    update public.members set team_id=n.destination_team_id where id=n.driver_member_id
      and role='Driver' and team_id=n.origin_team_id;
    update public.caleris_driver_precontract_negotiations
      set status='activated',activated_at=now(),updated_at=now() where id=n.id;
    insert into public.caleris_notifications(member_id,category,title,body,href,metadata,idempotency_key)
    select m.id,'driver_precontract','Pre-contract aktif',
      'Perpindahan Driver '||coalesce(d.character_name,'Driver')||' telah berlaku. Kontrak baru tercatat untuk Season berikutnya.',
      '/transfer-market',jsonb_build_object('negotiation_id',n.id,'season_id',v_next_season.id),
      'precontract:'||n.id||':activated:'||m.id
    from public.members m join public.members d on d.id=n.driver_member_id
    where m.team_id=n.destination_team_id and m.role='Owner'
    on conflict do nothing;
    v_done:=v_done+1;
  end loop;
  return jsonb_build_object('activated',v_done);
end;
$$;
revoke all on function private.process_driver_precontracts() from public,anon,authenticated,service_role;
revoke all on function public.member_start_driver_precontract(uuid,numeric,integer,text) from public,anon;
grant execute on function public.member_start_driver_precontract(uuid,numeric,integer,text) to authenticated;
revoke all on function public.member_respond_driver_precontract(uuid,text,numeric,integer,text) from public,anon;
grant execute on function public.member_respond_driver_precontract(uuid,text,numeric,integer,text) to authenticated;

-- Keep the market current after authoritative data changes.
create or replace function private.refresh_driver_market_after_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_member_id uuid;
begin
  if tg_table_name='caleris_race_results' then
    perform private.recalculate_driver_market_values(null,'race_result');
  elsif tg_table_name='members' then
    v_member_id:=coalesce(new.id,old.id);
    perform private.recalculate_driver_market_values(v_member_id,'member_profile');
  elsif tg_table_name='license_rounds' then
    perform private.recalculate_driver_market_values(null,'round_calendar');
  else
    v_member_id:=coalesce(new.member_id,old.member_id);
    if v_member_id is not null then perform private.recalculate_driver_market_values(v_member_id,tg_table_name); end if;
  end if;
  return null;
end;
$$;
revoke all on function private.refresh_driver_market_after_change() from public,anon,authenticated,service_role;

drop trigger if exists caleris_mv_attributes_refresh on public.caleris_driver_attributes;
create trigger caleris_mv_attributes_refresh after insert or update on public.caleris_driver_attributes
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_reputation_refresh on public.caleris_driver_reputation;
create trigger caleris_mv_reputation_refresh after insert or update on public.caleris_driver_reputation
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_checkin_refresh on public.license_daily_checkins;
create trigger caleris_mv_checkin_refresh after insert or update on public.license_daily_checkins
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_standings_refresh on public.license_round_standings;
create trigger caleris_mv_standings_refresh after insert or update on public.license_round_standings
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_race_results_refresh on public.caleris_race_results;
create trigger caleris_mv_race_results_refresh after insert or update on public.caleris_race_results
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_contracts_refresh on public.contracts;
create trigger caleris_mv_contracts_refresh after insert or update on public.contracts
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_economy_contracts_refresh on public.economy_driver_contracts;
create trigger caleris_mv_economy_contracts_refresh after insert or update on public.economy_driver_contracts
  for each row execute function private.refresh_driver_market_after_change();
drop trigger if exists caleris_mv_members_refresh on public.members;
create trigger caleris_mv_members_refresh after update of team_id,license on public.members
  for each row execute function private.refresh_driver_market_after_change();

-- The scheduled processors are idempotent and isolated from the existing transfer/loan worker.
select cron.unschedule(jobid) from cron.job where jobname='caleris-driver-precontract-lifecycle';
select cron.schedule('caleris-driver-precontract-lifecycle','*/5 * * * *',
  'select private.process_driver_precontracts();');
select cron.unschedule(jobid) from cron.job where jobname='caleris-driver-market-daily';
select cron.schedule('caleris-driver-market-daily','10 0 * * *',
  'select private.recalculate_driver_market_values(null,''daily'');');

-- Seed current Driver records without exposing scoring breakdown to members.
select private.recalculate_driver_market_values(null,'initial_seed');

commit;
