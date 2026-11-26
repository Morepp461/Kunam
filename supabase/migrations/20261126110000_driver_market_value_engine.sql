-- Driver Market Value Engine + pre-contract recruitment
-- All financial/scoring settings are data-driven and editable by Admin.
create table if not exists public.caleris_driver_market_config (
  id boolean primary key default true check (id),
  weights jsonb not null default '{"license":10,"contract":10,"performance":20,"skill":20,"achievement":10,"activity":10,"reputation":20}'::jsonb,
  base_value_eur numeric(20,2) not null default 10000000,
  growth_factor numeric(8,6) not null default 0.25,
  tier_multipliers jsonb not null default '{"1":1.0,"2":0.85,"3":0.70,"4":0.60}'::jsonb,
  initial_license_scores jsonb not null default '{"Bronze":35,"Silver":50,"Gold":65,"Super License":80}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.caleris_driver_market_config(id) values(true) on conflict(id) do nothing;

create table if not exists public.caleris_driver_market_values (
  member_id uuid primary key references public.members(id) on delete cascade,
  market_value_eur numeric(20,2) not null default 0,
  mv_score numeric(8,4) not null default 0,
  target_value_eur numeric(20,2) not null default 0,
  tier_number integer not null default 1,
  division_key text,
  breakdown jsonb not null default '{}'::jsonb,
  last_calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.caleris_driver_market_value_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  season_id uuid references public.license_seasons(id) on delete set null,
  previous_value_eur numeric(20,2) not null,
  new_value_eur numeric(20,2) not null,
  mv_score numeric(8,4) not null,
  tier_number integer not null,
  breakdown jsonb not null,
  reason text not null default 'recalculation',
  created_at timestamptz not null default now()
);
alter table public.caleris_driver_market_config enable row level security;
alter table public.caleris_driver_market_values enable row level security;
alter table public.caleris_driver_market_value_history enable row level security;
drop policy if exists "driver market config read" on public.caleris_driver_market_config;
create policy "driver market config read" on public.caleris_driver_market_config for select to authenticated using (true);
drop policy if exists "driver market values read" on public.caleris_driver_market_values;
create policy "driver market values read" on public.caleris_driver_market_values for select to authenticated using (true);
drop policy if exists "driver market history read" on public.caleris_driver_market_value_history;
create policy "driver market history read" on public.caleris_driver_market_value_history for select to authenticated using (true);

create or replace function public.member_get_driver_market_values()
returns table(member_id uuid, market_value_eur numeric, mv_score numeric, tier_number integer, division_key text, breakdown jsonb, last_calculated_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select v.member_id,v.market_value_eur,v.mv_score,v.tier_number,v.division_key,v.breakdown,v.last_calculated_at
 from public.caleris_driver_market_values v
 join public.members m on m.id=v.member_id and m.role='Driver'
 order by v.market_value_eur desc
$$;

create or replace function public.admin_configure_driver_market(
 p_weights jsonb, p_base_value_eur numeric, p_growth_factor numeric,
 p_tier_multipliers jsonb, p_initial_license_scores jsonb
) returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_caleris_admin() then raise exception 'Admin access required.'; end if;
 if p_base_value_eur<=0 or p_growth_factor<0 or p_growth_factor>1 then raise exception 'Base Value atau Growth Factor tidak valid.'; end if;
 if (select sum(value::numeric) from jsonb_each_text(p_weights))<>100 then raise exception 'Total bobot scoring harus tepat 100%.'; end if;
 if exists(select 1 from jsonb_each_text(p_tier_multipliers) x where x.value::numeric<=0 or x.value::numeric>1) then raise exception 'Tier multiplier harus lebih dari 0 dan maksimal 1.'; end if;
 insert into public.caleris_driver_market_config(id,weights,base_value_eur,growth_factor,tier_multipliers,initial_license_scores,updated_at,updated_by)
 values(true,p_weights,p_base_value_eur,p_growth_factor,p_tier_multipliers,p_initial_license_scores,now(),auth.uid())
 on conflict(id) do update set weights=excluded.weights,base_value_eur=excluded.base_value_eur,growth_factor=excluded.growth_factor,tier_multipliers=excluded.tier_multipliers,initial_license_scores=excluded.initial_license_scores,updated_at=now(),updated_by=auth.uid();
end $$;

create or replace function public.admin_recalculate_driver_market_values(p_member_id uuid default null, p_reason text default 'manual')
returns integer language plpgsql security definer set search_path=''
as $$
declare
 c public.caleris_driver_market_config%rowtype; d record; s record;
 v_license numeric; v_contract numeric; v_perf numeric; v_skill numeric; v_achievement numeric; v_activity numeric; v_rep numeric;
 v_score numeric; v_tier integer; v_division text; v_mult numeric; v_target numeric; v_old numeric; v_new numeric; v_count integer:=0;
 v_points numeric; v_max_points numeric; v_rounds integer; v_checkins integer; v_attrs jsonb; v_season uuid;
begin
 if not public.is_caleris_admin() then raise exception 'Admin access required.'; end if;
 select * into c from public.caleris_driver_market_config where id=true;
 select id into v_season from public.license_seasons where status='active' order by starts_on desc limit 1;
 for d in select m.* from public.members m where m.role='Driver' and (p_member_id is null or m.id=p_member_id) loop
  select sm.season_division_id,sd.division_key into s
  from public.license_season_members sm join public.license_season_divisions sd on sd.id=sm.season_division_id
  where sm.member_id=d.id and sm.season_id=v_season limit 1;
  v_division:=coalesce(s.division_key,'');
  select count(*) into v_tier from public.license_season_divisions sd
  where sd.season_id=v_season and sd.status<>'archived';
  -- Tier order is derived from configured season divisions; names are not hardcoded.
  select count(*)+1 into v_tier from public.license_season_divisions sd
  where sd.season_id=v_season and sd.status<>'archived' and sd.id < coalesce(s.season_division_id,'00000000-0000-0000-0000-000000000000'::uuid);
  v_tier:=greatest(1,coalesce(v_tier,1));
  select coalesce((c.initial_license_scores->>coalesce(d.license,'Bronze'))::numeric,35) into v_license;
  select case when exists(select 1 from public.economy_driver_contracts ec where ec.member_id=d.id and ec.status='active') then 100 else 0 end into v_contract;
  select coalesce(sum(lrs.points_total),0) into v_points from public.license_round_standings lrs where lrs.member_id=d.id;
  select coalesce(sum(rr.points_total),0) into v_max_points from public.license_round_standings rr where rr.member_id=d.id;
  v_perf:=case when v_max_points>0 then least(100,v_points/v_max_points*100) else 0 end;
  select attributes into v_attrs from public.caleris_driver_attributes where member_id=d.id;
  select coalesce(avg(value::numeric),50) into v_skill from jsonb_each_text(coalesce(v_attrs,'{}'::jsonb));
  select score into v_rep from public.caleris_driver_reputation where member_id=d.id;
  v_rep:=least(100,coalesce(v_rep,0)/99.99);
  select count(*) into v_rounds from public.license_rounds r join public.license_season_divisions sd on sd.id=r.season_division_id where sd.season_id=v_season;
  select count(*) into v_checkins from public.license_daily_checkins dc join public.license_rounds r on r.id=dc.round_id join public.license_season_divisions sd on sd.id=r.season_division_id where sd.season_id=v_season and dc.member_id=d.id;
  v_activity:=case when v_rounds>0 then least(100,v_checkins::numeric/v_rounds*100) else 0 end;
  -- Achievement source is intentionally zero until an authoritative achievement ledger is available.
  v_achievement:=0;
  v_score:=round(
   v_license*(c.weights->>'license')::numeric/100+
   v_contract*(c.weights->>'contract')::numeric/100+
   v_perf*(c.weights->>'performance')::numeric/100+
   v_skill*(c.weights->>'skill')::numeric/100+
   v_achievement*(c.weights->>'achievement')::numeric/100+
   v_activity*(c.weights->>'activity')::numeric/100+
   v_rep*(c.weights->>'reputation')::numeric/100,4);
  v_mult:=coalesce((c.tier_multipliers->>v_tier::text)::numeric,1/power(1.15,v_tier-1));
  v_target:=round(c.base_value_eur*v_score/100*v_mult,2);
  select market_value_eur into v_old from public.caleris_driver_market_values where member_id=d.id;
  if not found then v_old:=round(c.base_value_eur*v_license/100*v_mult,2); end if;
  v_new:=round(v_old+(v_target-v_old)*c.growth_factor,2);
  insert into public.caleris_driver_market_values(member_id,market_value_eur,mv_score,target_value_eur,tier_number,division_key,breakdown,last_calculated_at,updated_at)
  values(d.id,v_new,v_score,v_target,v_tier,nullif(v_division,''),jsonb_build_object('license',v_license,'contract',v_contract,'performance',v_perf,'skill',v_skill,'achievement',v_achievement,'activity',v_activity,'reputation',v_rep,'tier_multiplier',v_mult),now(),now())
  on conflict(member_id) do update set market_value_eur=excluded.market_value_eur,mv_score=excluded.mv_score,target_value_eur=excluded.target_value_eur,tier_number=excluded.tier_number,division_key=excluded.division_key,breakdown=excluded.breakdown,last_calculated_at=now(),updated_at=now();
  insert into public.caleris_driver_market_value_history(member_id,season_id,previous_value_eur,new_value_eur,mv_score,tier_number,breakdown,reason)
  values(d.id,v_season,coalesce(v_old,0),v_new,v_score,v_tier,jsonb_build_object('license',v_license,'contract',v_contract,'performance',v_perf,'skill',v_skill,'achievement',v_achievement,'activity',v_activity,'reputation',v_rep,'tier_multiplier',v_mult),p_reason);
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

grant execute on function public.member_get_driver_market_values() to authenticated;
grant execute on function public.admin_configure_driver_market(jsonb,numeric,numeric,jsonb,jsonb) to authenticated;
grant execute on function public.admin_recalculate_driver_market_values(uuid,text) to authenticated;
