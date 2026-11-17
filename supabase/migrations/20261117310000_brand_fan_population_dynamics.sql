-- Fan Population Dynamics: positive growth, performance-driven decline and loyalty protection.
alter table public.caleris_fan_growth_events
  drop constraint if exists caleris_fan_growth_events_population_delta_check;
alter table public.caleris_fan_growth_events
  add constraint caleris_fan_growth_events_population_delta_check check(population_delta <> 0);

create or replace function private.apply_fan_growth_for_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_config jsonb;
 v_base numeric;
 v_rate numeric;
 v_multiplier numeric;
 v_team record;
 v_driver record;
 v_fan record;
 v_delta bigint;
 v_event uuid;
 v_previous_poor integer;
 v_is_poor boolean;
 v_teams_up integer:=0;
 v_teams_down integer:=0;
 v_drivers_up integer:=0;
 v_drivers_down integer:=0;
begin
 select config_value into v_config
 from public.caleris_brand_ecosystem_config
 where config_key='fan_growth_config';

 v_base:=greatest(0,coalesce((v_config->>'base_growth_percent')::numeric,0));
 if v_base<=0
  and coalesce((v_config->>'bad_finish_decline_percent')::numeric,0)<=0
  and coalesce((v_config->>'dnf_decline_percent')::numeric,0)<=0 then
  return jsonb_build_object('status','disabled','team_growth',0,'team_decline',0,'driver_growth',0,'driver_decline',0);
 end if;

 -- Team result: best classified driver determines the sporting outcome.
 for v_team in
  select e.team_id,min(e.finishing_position) best_position,
   bool_or(e.finish_status='finished') has_finisher,
   bool_and(e.finish_status='dnf') all_dnf
  from public.caleris_race_result_entries e
  where e.round_id=p_round_id and e.team_id is not null
  group by e.team_id
 loop
  v_is_poor:=v_team.all_dnf or (v_team.best_position is not null and v_team.best_position>10);
  if v_team.all_dnf then
   v_rate:=-coalesce((v_config->>'dnf_decline_percent')::numeric,0.15);
  elsif v_is_poor then
   v_rate:=-coalesce((v_config->>'bad_finish_decline_percent')::numeric,0.05);
  else
   v_multiplier:=case when v_team.best_position=1 then coalesce((v_config->>'win_multiplier')::numeric,2)
    when v_team.best_position between 2 and 3 then coalesce((v_config->>'podium_multiplier')::numeric,1.5)
    when v_team.best_position between 4 and 10 then coalesce((v_config->>'points_multiplier')::numeric,1)
    when v_team.has_finisher then coalesce((v_config->>'finish_multiplier')::numeric,0.5) else 0 end;
   v_rate:=v_base*v_multiplier;
  end if;

  -- Three consecutive poor rounds add a configurable decline penalty.
  if v_is_poor then
   select count(*) into v_previous_poor from (
    select case when bool_and(e2.finish_status='dnf') or min(e2.finishing_position)>10 then 1 else 0 end poor
    from public.caleris_race_results rr2
    join public.license_rounds lr2 on lr2.id=rr2.round_id
    join public.caleris_race_result_entries e2 on e2.round_id=rr2.round_id
    where e2.team_id=v_team.team_id
     and lr2.season_division_id=(select season_division_id from public.license_rounds where id=p_round_id)
     and lr2.round_number<(select round_number from public.license_rounds where id=p_round_id)
     and rr2.published_at is not null
    group by rr2.round_id,lr2.round_number
    order by lr2.round_number desc limit 2
   ) prior where poor=1;
   if v_previous_poor=2 then
    v_rate:=v_rate-coalesce((v_config->>'poor_streak_decline_percent')::numeric,0.05);
   end if;
  end if;

  for v_fan in
   select * from public.caleris_fan_populations
   where entity_kind='team' and team_id=v_team.team_id
   for update
  loop
   if v_rate<0 then
    -- Loyal communities are more resilient: loyalty 0 = full decline, 100 = half decline.
    v_rate:=v_rate*(1-(least(100,greatest(0,v_fan.loyalty))/200));
   else
    -- Engagement and sentiment influence the effective positive growth, within +/-25%.
    v_rate:=v_rate*(0.75+least(100,greatest(0,v_fan.engagement))/200)
      *(0.75+least(100,greatest(0,v_fan.sentiment))/200);
   end if;
   v_delta:=round(v_fan.population*v_rate/100)::bigint;
   if v_delta=0 then continue; end if;
   if v_delta<0 then v_delta:=greatest(v_delta,-v_fan.population); end if;

   insert into public.caleris_fan_growth_events(round_id,entity_kind,team_id,region_key,population_delta,growth_rate_percent)
   values(p_round_id,'team',v_team.team_id,v_fan.region_key,v_delta,v_rate)
   on conflict do nothing returning id into v_event;
   if v_event is not null then
    update public.caleris_fan_populations
    set population=greatest(0,population+v_delta),
     loyalty=least(100,greatest(0,loyalty+case when v_rate<0 then -0.5 else 0.25 end)),
     sentiment=least(100,greatest(0,sentiment+case when v_rate<0 then -1 else 0.5 end)),
     engagement=least(100,greatest(0,engagement+case when v_rate<0 then -0.5 else 0.5 end)),
     updated_at=now()
    where id=v_fan.id;
    insert into public.caleris_fan_population_history(entity_kind,team_id,region_key,population_delta,source_event,metadata)
    values('team',v_team.team_id,v_fan.region_key,v_delta,
     case when v_delta<0 then 'race_result_decline' else 'race_result_growth' end,
     jsonb_build_object('round_id',p_round_id,'rate',v_rate,'loyalty_before',v_fan.loyalty,'engagement_before',v_fan.engagement,'sentiment_before',v_fan.sentiment));
    if v_delta<0 then v_teams_down:=v_teams_down+1; else v_teams_up:=v_teams_up+1; end if;
   end if;
   v_event:=null;
   -- Reset rate before evaluating the next region.
   if v_team.all_dnf then v_rate:=-coalesce((v_config->>'dnf_decline_percent')::numeric,0.15);
   elsif v_is_poor then v_rate:=-coalesce((v_config->>'bad_finish_decline_percent')::numeric,0.05);
   else v_rate:=v_base*v_multiplier; end if;
   if v_is_poor and v_previous_poor=2 then v_rate:=v_rate-coalesce((v_config->>'poor_streak_decline_percent')::numeric,0.05); end if;
  end loop;
 end loop;

 -- Driver result is evaluated independently, regardless of the team's result.
 for v_driver in
  select e.member_id,e.finishing_position,e.finish_status
  from public.caleris_race_result_entries e
  where e.round_id=p_round_id and e.member_id is not null
 loop
  v_is_poor:=v_driver.finish_status='dnf' or coalesce(v_driver.finishing_position,99)>10;
  if v_driver.finish_status='dnf' then
   v_rate:=-coalesce((v_config->>'dnf_decline_percent')::numeric,0.15);
  elsif v_is_poor then
   v_rate:=-coalesce((v_config->>'bad_finish_decline_percent')::numeric,0.05);
  else
   v_multiplier:=case when v_driver.finishing_position=1 then coalesce((v_config->>'win_multiplier')::numeric,2)
    when v_driver.finishing_position between 2 and 3 then coalesce((v_config->>'podium_multiplier')::numeric,1.5)
    when v_driver.finishing_position between 4 and 10 then coalesce((v_config->>'points_multiplier')::numeric,1)
    when v_driver.finish_status='finished' then coalesce((v_config->>'finish_multiplier')::numeric,0.5) else 0 end;
   v_rate:=v_base*v_multiplier;
  end if;
  if v_is_poor then
   select count(*) into v_previous_poor from (
    select case when e2.finish_status='dnf' or coalesce(e2.finishing_position,99)>10 then 1 else 0 end poor
    from public.caleris_race_results rr2
    join public.license_rounds lr2 on lr2.id=rr2.round_id
    join public.caleris_race_result_entries e2 on e2.round_id=rr2.round_id
    where e2.member_id=v_driver.member_id
     and lr2.season_division_id=(select season_division_id from public.license_rounds where id=p_round_id)
     and lr2.round_number<(select round_number from public.license_rounds where id=p_round_id)
     and rr2.published_at is not null
    order by lr2.round_number desc limit 2
   ) prior where poor=1;
   if v_previous_poor=2 then v_rate:=v_rate-coalesce((v_config->>'poor_streak_decline_percent')::numeric,0.05); end if;
  end if;

  for v_fan in
   select * from public.caleris_fan_populations
   where entity_kind='driver' and member_id=v_driver.member_id
   for update
  loop
   if v_rate<0 then
    v_rate:=v_rate*(1-(least(100,greatest(0,v_fan.loyalty))/200));
   else
    v_rate:=v_rate*(0.75+least(100,greatest(0,v_fan.engagement))/200)
      *(0.75+least(100,greatest(0,v_fan.sentiment))/200);
   end if;
   v_delta:=round(v_fan.population*v_rate/100)::bigint;
   if v_delta=0 then continue; end if;
   if v_delta<0 then v_delta:=greatest(v_delta,-v_fan.population); end if;

   insert into public.caleris_fan_growth_events(round_id,entity_kind,member_id,region_key,population_delta,growth_rate_percent)
   values(p_round_id,'driver',v_driver.member_id,v_fan.region_key,v_delta,v_rate)
   on conflict do nothing returning id into v_event;
   if v_event is not null then
    update public.caleris_fan_populations
    set population=greatest(0,population+v_delta),
     loyalty=least(100,greatest(0,loyalty+case when v_rate<0 then -0.5 else 0.25 end)),
     sentiment=least(100,greatest(0,sentiment+case when v_rate<0 then -1 else 0.5 end)),
     engagement=least(100,greatest(0,engagement+case when v_rate<0 then -0.5 else 0.5 end)),
     updated_at=now()
    where id=v_fan.id;
    insert into public.caleris_fan_population_history(entity_kind,member_id,region_key,population_delta,source_event,metadata)
    values('driver',v_driver.member_id,v_fan.region_key,v_delta,
     case when v_delta<0 then 'race_result_decline' else 'race_result_growth' end,
     jsonb_build_object('round_id',p_round_id,'rate',v_rate,'loyalty_before',v_fan.loyalty,'engagement_before',v_fan.engagement,'sentiment_before',v_fan.sentiment));
    if v_delta<0 then v_drivers_down:=v_drivers_down+1; else v_drivers_up:=v_drivers_up+1; end if;
   end if;
   v_event:=null;
   if v_driver.finish_status='dnf' then v_rate:=-coalesce((v_config->>'dnf_decline_percent')::numeric,0.15);
   elsif v_is_poor then v_rate:=-coalesce((v_config->>'bad_finish_decline_percent')::numeric,0.05);
   else v_rate:=v_base*v_multiplier; end if;
   if v_is_poor and v_previous_poor=2 then v_rate:=v_rate-coalesce((v_config->>'poor_streak_decline_percent')::numeric,0.05); end if;
  end loop;
 end loop;

 return jsonb_build_object('status','processed','team_growth_regions',v_teams_up,'team_decline_regions',v_teams_down,
  'driver_growth_regions',v_drivers_up,'driver_decline_regions',v_drivers_down);
end $$;

revoke all on function private.apply_fan_growth_for_round(uuid) from public,anon,authenticated;

-- Conservative defaults: 0.2% base growth; 0.05% poor finish decline; 0.15% DNF decline.
update public.caleris_brand_ecosystem_config
set config_value=config_value||'{"base_growth_percent":0.2,"win_multiplier":2,"podium_multiplier":1.5,"points_multiplier":1,"finish_multiplier":0.5,"bad_finish_decline_percent":0.05,"dnf_decline_percent":0.15,"poor_streak_decline_percent":0.05,"regional_scope":"regional"}'::jsonb,
 description='Regional fan growth and performance-driven decline; editable by Admin.',updated_at=now()
where config_key='fan_growth_config';
