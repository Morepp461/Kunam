alter table public.caleris_team_development_parts
  add column if not exists base_value numeric,
  add column if not exists hq_bonus numeric not null default 0;
update public.caleris_team_development_parts
set base_value=current_value where base_value is null;
alter table public.caleris_team_development_parts
  alter column base_value set not null,
  alter column base_value set default 50;

create or replace function private.apply_team_hq_attribute_bonus()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if tg_op='INSERT' then
    new.base_value:=coalesce(new.base_value,new.current_value);
    new.hq_bonus:=coalesce(new.hq_bonus,0);
    new.current_value:=least(100,new.base_value+new.hq_bonus);
  else
    if new.base_value is distinct from old.base_value then
      new.current_value:=least(100,new.base_value+new.hq_bonus);
    elsif new.hq_bonus is distinct from old.hq_bonus then
      new.current_value:=least(100,new.base_value+new.hq_bonus);
    elsif new.current_value is distinct from old.current_value then
      new.base_value:=greatest(0,new.current_value-old.hq_bonus);
      new.current_value:=least(100,new.base_value+new.hq_bonus);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists caleris_apply_team_hq_attribute_bonus on public.caleris_team_development_parts;
create trigger caleris_apply_team_hq_attribute_bonus
before insert or update of current_value,base_value,hq_bonus
on public.caleris_team_development_parts
for each row execute function private.apply_team_hq_attribute_bonus();

update public.caleris_team_hq_facility_configs
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object('pit_stop_efficiency_bonus',level::numeric))
  from generate_series(1,8) level
)
where facility_key='pit_crew_training_center' and effects_by_level='{}'::jsonb;
update public.caleris_team_hq_facility_configs
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object('qualifying_pace_bonus',level::numeric*0.5,'race_pace_bonus',level::numeric*0.25))
  from generate_series(1,8) level
)
where facility_key='simulator_facility' and effects_by_level='{}'::jsonb;
update public.caleris_team_hq_facility_configs
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object('reliability_bonus',level::numeric*0.5))
  from generate_series(1,8) level
)
where facility_key='engineering_department' and effects_by_level='{}'::jsonb;
update public.caleris_team_hq_facility_configs
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object('aero_power_bonus',level::numeric*0.5,'research_efficiency_bonus_percent',level::numeric*1.5))
  from generate_series(1,8) level
)
where facility_key='rd_center' and effects_by_level='{}'::jsonb;
update public.caleris_team_hq_facility_configs
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object('factory_capacity_bonus_percent',level::numeric*2))
  from generate_series(1,8) level
)
where facility_key='factory' and effects_by_level='{}'::jsonb;
update public.caleris_team_hq_facility_configs
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object('driver_development_efficiency_bonus_percent',level::numeric*2))
  from generate_series(1,8) level
)
where facility_key='driver_development_center' and effects_by_level='{}'::jsonb;
update public.caleris_team_hq_facility_configs
set effects_by_level=(
  select jsonb_object_agg(level::text,jsonb_build_object('analytics_round_window',level*3,'strategy_analysis_depth',level))
  from generate_series(1,8) level
)
where facility_key='data_analytics_center' and effects_by_level='{}'::jsonb;

create or replace function private.team_hq_effects_for_team(p_team_id uuid)
returns jsonb
language sql
stable security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'fan_growth_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'fan_growth_bonus_percent')::numeric,0)*f.condition/100),0),
    'fanbase_reputation_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'fanbase_reputation_bonus')::numeric,0)*f.condition/100),0),
    'commercial_credibility_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'commercial_credibility_bonus')::numeric,0)*f.condition/100),0),
    'merchandise_demand_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'merchandise_demand_bonus_percent')::numeric,0)*f.condition/100),0),
    'merchandise_capacity_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'merchandise_capacity_bonus_percent')::numeric,0)*f.condition/100),0),
    'sponsor_attraction_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'sponsor_attraction_bonus_percent')::numeric,0)*f.condition/100),0),
    'pit_stop_efficiency_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'pit_stop_efficiency_bonus')::numeric,0)*f.condition/100),0),
    'qualifying_pace_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'qualifying_pace_bonus')::numeric,0)*f.condition/100),0),
    'race_pace_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'race_pace_bonus')::numeric,0)*f.condition/100),0),
    'reliability_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'reliability_bonus')::numeric,0)*f.condition/100),0),
    'aero_power_bonus',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'aero_power_bonus')::numeric,0)*f.condition/100),0),
    'factory_capacity_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'factory_capacity_bonus_percent')::numeric,0)*f.condition/100),0),
    'driver_development_efficiency_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'driver_development_efficiency_bonus_percent')::numeric,0)*f.condition/100),0),
    'research_efficiency_bonus_percent',coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'research_efficiency_bonus_percent')::numeric,0)*f.condition/100),0),
    'analytics_round_window',coalesce(max((c.effects_by_level->f.level::text->>'analytics_round_window')::integer*f.condition/100),0),
    'strategy_analysis_depth',coalesce(max((c.effects_by_level->f.level::text->>'strategy_analysis_depth')::integer*f.condition/100),0)
  )
  from public.caleris_team_hq_facilities f
  join public.caleris_team_hq_facility_configs c on c.facility_key=f.facility_key
  where f.team_id=p_team_id and f.level>0;
$function$;

create or replace function private.refresh_team_hq_operational_bonuses(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare v_effects jsonb;
begin
  if p_team_id is null then return; end if;
  v_effects:=private.team_hq_effects_for_team(p_team_id);
  update public.caleris_team_development_parts
  set hq_bonus=case part_key
    when 'pit_stop_efficiency' then coalesce((v_effects->>'pit_stop_efficiency_bonus')::numeric,0)
    when 'qualifying_pace' then coalesce((v_effects->>'qualifying_pace_bonus')::numeric,0)
    when 'race_pace' then coalesce((v_effects->>'race_pace_bonus')::numeric,0)
    when 'reliability' then coalesce((v_effects->>'reliability_bonus')::numeric,0)
    when 'aero_power' then coalesce((v_effects->>'aero_power_bonus')::numeric,0)
    else 0 end,
    updated_at=now()
  where team_id=p_team_id;
end;
$function$;

create or replace function private.refresh_team_hq_operational_bonuses_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.refresh_team_hq_operational_bonuses(coalesce(new.team_id,old.team_id));
  return coalesce(new,old);
end;
$function$;

drop trigger if exists caleris_team_hq_operational_effects on public.caleris_team_hq_facilities;
create trigger caleris_team_hq_operational_effects
after insert or update of level,condition on public.caleris_team_hq_facilities
for each row execute function private.refresh_team_hq_operational_bonuses_trigger();

create or replace function private.refresh_team_hq_config_effects_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_team record;
begin
  for v_team in select distinct team_id from public.caleris_team_hq_facilities loop
    perform private.refresh_team_hq_operational_bonuses(v_team.team_id);
  end loop;
  return new;
end;
$function$;
drop trigger if exists caleris_team_hq_config_effects on public.caleris_team_hq_facility_configs;
create trigger caleris_team_hq_config_effects
after update of effects_by_level,is_enabled on public.caleris_team_hq_facility_configs
for each row execute function private.refresh_team_hq_config_effects_trigger();

create or replace function public.team_owner_get_hq_analytics_report()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_level integer;
  v_condition numeric;
  v_window integer;
  v_effects jsonb;
  v_metrics jsonb;
begin
  select m.* into v_member from public.profiles p
  join public.members m on m.id=p.member_id
  where p.user_id=(select auth.uid());
  if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then
    raise exception 'Akses Team Owner diperlukan untuk Data Analytics Center.';
  end if;
  select level,condition into v_level,v_condition from public.caleris_team_hq_facilities
  where team_id=v_member.team_id and facility_key='data_analytics_center';
  if coalesce(v_level,0)=0 then
    return jsonb_build_object('unlocked',false,'message','Upgrade Data Analytics Center untuk membuka laporan performa tim.');
  end if;
  v_effects:=private.team_hq_effects_for_team(v_member.team_id);
  v_window:=greatest(3,coalesce((v_effects->>'analytics_round_window')::integer,3));
  select jsonb_build_object(
    'sample_rounds',count(*),
    'average_grid',round(avg(grid_position)::numeric,2),
    'average_finish',round(avg(finishing_position)::numeric,2),
    'positions_gained',round(avg(grid_position-finishing_position)::numeric,2),
    'finish_rate_percent',round(100.0*count(*) filter(where lower(coalesce(finish_status,'')) in ('finished','classified','completed'))/greatest(count(*),1),2),
    'wins',count(*) filter(where finishing_position=1),
    'fastest_laps',count(*) filter(where fastest_lap_ms is not null),
    'dnf_count',count(*) filter(where lower(coalesce(finish_status,'')) not in ('finished','classified','completed'))
  ) into v_metrics
  from (
    select e.grid_position,e.finishing_position,e.finish_status,e.fastest_lap_ms
    from public.caleris_race_result_entries e
    join public.caleris_race_results r on r.round_id=e.round_id and r.published_at is not null
    where e.team_id=v_member.team_id
    order by r.published_at desc,e.recorded_at desc
    limit v_window
  ) recent;
  return jsonb_build_object('unlocked',true,'facility_level',v_level,'condition',v_condition,
    'analysis_window',v_window,'metrics',coalesce(v_metrics,'{}'::jsonb),
    'effects',v_effects);
end;
$function$;

revoke all on function public.team_owner_get_hq_analytics_report() from public;
grant execute on function public.team_owner_get_hq_analytics_report() to authenticated;

do $function$
declare v_team record;
begin
  for v_team in select distinct team_id from public.caleris_team_hq_facilities loop
    perform private.refresh_team_hq_operational_bonuses(v_team.team_id);
  end loop;
end;
$function$;
