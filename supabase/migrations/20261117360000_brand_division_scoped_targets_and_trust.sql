create or replace function private.refresh_sponsorship_targets_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_season_id uuid;v_division_id uuid;v_division_key text;
  v_target record;v_numerator numeric;v_denominator numeric;v_value numeric;
begin
  select sd.season_id,sd.id,sd.division_key
  into v_season_id,v_division_id,v_division_key
  from public.license_rounds lr
  join public.license_season_divisions sd on sd.id=lr.season_division_id
  where lr.id=p_round_id;
  if v_season_id is null then return; end if;

  for v_target in
    select t.id,t.metric_key,c.target_team_id,t.target_value
    from public.caleris_sponsorship_targets t
    join public.caleris_sponsorship_contracts c on c.id=t.contract_id
      and c.status='active' and c.target_kind='team'
    join public.teams tm on tm.id=c.target_team_id
    where t.season_id=v_season_id
      and lower(coalesce(tm.division_key,''))=lower(coalesce(v_division_key,''))
      and t.status not in ('missed','cancelled')
  loop
    if v_target.metric_key='points_round_rate' then
      select count(*) filter(where exists(
        select 1 from public.license_round_standings s
        join public.members m on m.id=s.member_id
        where s.round_id=rr.round_id and m.team_id=v_target.target_team_id and s.points_total>0
      )),count(*) into v_numerator,v_denominator
      from public.caleris_race_results rr
      join public.license_rounds lr on lr.id=rr.round_id
      where rr.published_at is not null and lr.season_division_id=v_division_id;
    elsif v_target.metric_key='podium_round_rate' then
      select count(*) filter(where exists(
        select 1 from public.caleris_race_result_entries e
        where e.team_id=v_target.target_team_id and e.round_id=rr.round_id and e.finishing_position between 1 and 3
      )),count(*) into v_numerator,v_denominator
      from public.caleris_race_results rr
      join public.license_rounds lr on lr.id=rr.round_id
      where rr.published_at is not null and lr.season_division_id=v_division_id;
    elsif v_target.metric_key='win_round_rate' then
      select count(*) filter(where exists(
        select 1 from public.caleris_race_result_entries e
        where e.team_id=v_target.target_team_id and e.round_id=rr.round_id and e.finishing_position=1
      )),count(*) into v_numerator,v_denominator
      from public.caleris_race_results rr
      join public.license_rounds lr on lr.id=rr.round_id
      where rr.published_at is not null and lr.season_division_id=v_division_id;
    elsif v_target.metric_key='finish_rate' then
      select count(*) filter(where e.finish_status='finished'),count(*)
      into v_numerator,v_denominator
      from public.caleris_race_result_entries e
      join public.license_rounds lr on lr.id=e.round_id
      join public.caleris_race_results rr on rr.round_id=e.round_id and rr.published_at is not null
      where lr.season_division_id=v_division_id and e.team_id=v_target.target_team_id;
    elsif v_target.metric_key='driver_popularity' then
      select least(100,sqrt(coalesce(sum(f.population),0)::numeric/20000)*100)
      into v_value
      from public.caleris_fan_populations f
      where f.entity_kind='team' and f.team_id=v_target.target_team_id;
      v_numerator:=coalesce(v_value,0);v_denominator:=100;
    else
      continue;
    end if;

    if v_target.metric_key<>'driver_popularity' then
      v_value:=case when coalesce(v_denominator,0)=0 then 0 else round(v_numerator/v_denominator*100,2) end;
    end if;
    update public.caleris_sponsorship_targets
    set current_value=v_value,
      status=case when v_value>=target_value then 'achieved' else 'in_progress' end
    where id=v_target.id;
  end loop;
end;
$$;

create or replace function private.evaluate_brand_sponsorship_trust_for_division(p_division_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_season uuid;v_division_key text;v_contract record;v_weights jsonb;v_metrics jsonb;
  v_score numeric;v_band text;v_updated integer:=0;
  v_target_total integer;v_target_achieved integer;v_target_missed integer;
  v_entries integer;v_finishes integer;v_fans bigint;v_net_fan_change bigint;v_start_fans bigint;
begin
  select season_id,division_key into v_season,v_division_key
  from public.license_season_divisions where id=p_division_id;
  if v_season is null then return jsonb_build_object('status','division_not_found'); end if;
  select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='sponsor_trust_weights';
  if v_weights is null then
    v_weights:='{"target_achievement":45,"consistency":20,"fanbase_growth":15,"commercial_exposure":10,"partnership_conduct":10}'::jsonb;
  end if;

  update public.caleris_sponsorship_targets t
  set status='missed'
  from public.caleris_sponsorship_contracts c
  join public.teams tm on tm.id=c.target_team_id
  where c.id=t.contract_id and c.status='active' and c.target_kind='team'
    and t.season_id=v_season and t.status='in_progress'
    and lower(coalesce(tm.division_key,''))=lower(coalesce(v_division_key,''));

  for v_contract in
    select c.id contract_id,c.target_team_id
    from public.caleris_sponsorship_contracts c
    join public.teams tm on tm.id=c.target_team_id
    where c.status='active' and c.target_kind='team' and c.season_id=v_season
      and lower(coalesce(tm.division_key,''))=lower(coalesce(v_division_key,''))
  loop
    select count(*),count(*) filter(where status='achieved'),count(*) filter(where status='missed')
    into v_target_total,v_target_achieved,v_target_missed
    from public.caleris_sponsorship_targets
    where contract_id=v_contract.contract_id and season_id=v_season;

    select count(*),count(*) filter(where e.finish_status='finished')
    into v_entries,v_finishes
    from public.caleris_race_result_entries e
    join public.license_rounds lr on lr.id=e.round_id
    join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
    where lr.season_division_id=p_division_id and e.team_id=v_contract.target_team_id;

    select coalesce(sum(population),0) into v_fans
    from public.caleris_fan_populations
    where entity_kind='team' and team_id=v_contract.target_team_id;

    select coalesce(sum(population_delta),0) into v_net_fan_change
    from public.caleris_fan_population_history h
    where h.entity_kind='team' and h.team_id=v_contract.target_team_id
      and h.metadata ? 'round_id'
      and exists(select 1 from public.license_rounds lr
        where lr.id=(h.metadata->>'round_id')::uuid and lr.season_division_id=p_division_id);

    v_start_fans:=greatest(1,v_fans-v_net_fan_change);
    v_metrics:=jsonb_build_object(
      'target_achievement',case when v_target_total=0 then 50 else v_target_achieved::numeric/v_target_total*100 end,
      'consistency',case when v_entries=0 then 50 else v_finishes::numeric/v_entries*100 end,
      'fanbase_growth',greatest(0,least(100,50+v_net_fan_change::numeric/v_start_fans*50)),
      'commercial_exposure',least(100,sqrt(v_fans::numeric/20000)*100),
      'partnership_conduct',case when v_target_total=0 then 100 else 100-v_target_missed::numeric/v_target_total*100 end
    );
    select sum((v_metrics->>w.key)::numeric*w.value::numeric)/nullif(sum(w.value::numeric),0)
    into v_score from jsonb_each_text(v_weights) w;
    v_score:=greatest(0,least(100,coalesce(v_score,0)));
    v_band:=case when v_score>=90 then 'premium' when v_score>=80 then 'standard'
      when v_score>=60 then 'conditional' else 'terminated' end;

    insert into public.caleris_sponsorship_season_evaluations(contract_id,season_id,trust_score,renewal_band,metrics)
    values(v_contract.contract_id,v_season,round(v_score)::integer,v_band,v_metrics)
    on conflict(contract_id,season_id) do update
      set trust_score=excluded.trust_score,renewal_band=excluded.renewal_band,
          metrics=excluded.metrics,evaluated_at=now();

    update public.caleris_sponsorship_contracts
    set renewal_status=case when v_band in ('premium','standard') then 'proposed'
      when v_band='conditional' then 'conditional' else 'terminated' end,
      status=case when v_band='terminated' then 'terminated' else status end,
      ended_at=case when v_band='terminated' then now() else ended_at end
    where id=v_contract.contract_id;
    v_updated:=v_updated+1;
  end loop;
  return jsonb_build_object('status','evaluated','contracts',v_updated,'season_id',v_season,'division',v_division_key);
end;
$$;
