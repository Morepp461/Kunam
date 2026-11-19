-- Reputation-only Driver Form, Morale and Confidence signals.
-- These values update the reputation profile after published race results; they never enter race simulation.
insert into public.caleris_brand_ecosystem_config(config_key,config_value,description)
values(
 'driver_reputation_weights',
 '{"form":5,"morale":5,"confidence":5}'::jsonb,
 'Driver reputation weights including form, morale and confidence signals'
)
on conflict(config_key) do update
set config_value=public.caleris_brand_ecosystem_config.config_value||excluded.config_value,
    description=excluded.description,
    updated_at=now();

CREATE OR REPLACE FUNCTION private.refresh_brand_reputation_for_division(p_division_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season uuid;
  v_driver record;
  v_team record;
  v_weights jsonb;
  v_metrics jsonb;
  v_score integer;
  v_old integer;
  v_total integer;
  v_better integer;
  v_rounds integer;
  v_max_points numeric;
  v_points numeric;
  v_entries integer;
  v_finishes integer;
  v_dnfs integer;
  v_appearances integer;
  v_fans bigint;
  v_driver_rep numeric;
  v_recent_form numeric;
  v_prior_form numeric;
  v_morale numeric;
  v_confidence numeric;
  v_active_contracts integer;
  v_updated_drivers integer:=0;
  v_updated_teams integer:=0;
begin
  select season_id into v_season
  from public.license_season_divisions where id=p_division_id;
  if v_season is null then return jsonb_build_object('status','division_not_found'); end if;

  select count(*) into v_rounds
  from public.license_rounds lr
  join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
  where lr.season_division_id=p_division_id;
  if v_rounds=0 then return jsonb_build_object('status','no_published_results'); end if;

  select coalesce(sum(coalesce((
    select max(pr.points+pr.pole_bonus)
    from public.caleris_race_points_rules pr
    where pr.session_type=lr.session_type and pr.is_active
  ),0)),0) into v_max_points
  from public.license_rounds lr
  join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
  where lr.season_division_id=p_division_id;

  select config_value into v_weights
  from public.caleris_brand_ecosystem_config where config_key='driver_reputation_weights';
  if v_weights is null then
    v_weights:='{"championship":25,"race_performance":25,"consistency":15,"experience":10,"fan_popularity":15,"professional_record":10}'::jsonb;
  end if;

  select count(*) into v_total
  from public.license_season_members lsm
  join public.members m on m.id=lsm.member_id and m.role='Driver'
  where lsm.season_division_id=p_division_id and coalesce(lsm.is_hiatus,false)=false;

  for v_driver in
    select m.id member_id,m.team_id,
      coalesce((select sum(s.points_total) from public.license_round_standings s
        join public.license_rounds lr on lr.id=s.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        where lr.season_division_id=p_division_id and s.member_id=m.id),0) points,
      coalesce((select count(*) from public.caleris_race_result_entries e
        join public.license_rounds lr on lr.id=e.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        where lr.season_division_id=p_division_id and e.member_id=m.id),0) entries,
      coalesce((select count(*) from public.caleris_race_result_entries e
        join public.license_rounds lr on lr.id=e.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        where lr.season_division_id=p_division_id and e.member_id=m.id and e.finish_status='finished'),0) finishes,
      coalesce((select count(*) from public.caleris_race_result_entries e
        join public.license_rounds lr on lr.id=e.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        where lr.season_division_id=p_division_id and e.member_id=m.id and e.finish_status='dnf'),0) dnfs,
      coalesce((select count(distinct e.round_id) from public.caleris_race_result_entries e
        join public.license_rounds lr on lr.id=e.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        where lr.season_division_id=p_division_id and e.member_id=m.id),0) appearances,
      coalesce((select sum(f.population) from public.caleris_fan_populations f
        where f.entity_kind='driver' and f.member_id=m.id),0) fans
    from public.license_season_members lsm
    join public.members m on m.id=lsm.member_id and m.role='Driver'
    where lsm.season_division_id=p_division_id and coalesce(lsm.is_hiatus,false)=false
  loop
    select count(*) into v_better
    from (
      select lsm2.member_id,coalesce(sum(s.points_total),0) points
      from public.license_season_members lsm2
      join public.members m2 on m2.id=lsm2.member_id and m2.role='Driver'
      left join public.license_round_standings s on s.member_id=m2.id
      left join public.license_rounds lr on lr.id=s.round_id and lr.season_division_id=p_division_id
      left join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
      where lsm2.season_division_id=p_division_id and coalesce(lsm2.is_hiatus,false)=false
      group by lsm2.member_id
    ) standings where standings.points>v_driver.points;

    v_metrics:=jsonb_build_object(
      'championship',case when v_total<=1 then 100 else greatest(0,100*(v_total-1-v_better)::numeric/(v_total-1)) end,
      'race_performance',case when v_max_points<=0 then 0 else least(100,v_driver.points/v_max_points*100) end,
      'consistency',case when v_driver.entries=0 then 0 else v_driver.finishes::numeric/v_driver.entries*100 end,
      'experience',least(100,v_driver.appearances::numeric/25*100),
      'fan_popularity',least(100,sqrt(v_driver.fans::numeric/5000)*100),
      'professional_record',case when v_driver.entries=0 then 0 else 100-v_driver.dnfs::numeric/v_driver.entries*100 end
    );

    with recent_rounds as (
      select lr.id round_id
      from public.license_rounds lr
      join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
      where lr.season_division_id=p_division_id
      order by lr.round_number desc,lr.id desc
      limit 5
    ), scored as (
      select case
        when e.finish_status='finished' and e.finishing_position is not null then
          case when field.field_size<=1 then 100
            else greatest(0,least(100,100*(field.field_size-e.finishing_position)::numeric/(field.field_size-1))) end
        else 0 end score
      from recent_rounds r
      join public.caleris_race_result_entries e on e.round_id=r.round_id and e.member_id=v_driver.member_id
      cross join lateral (select count(*)::integer field_size from public.caleris_race_result_entries all_entries where all_entries.round_id=r.round_id) field
    )
    select avg(score) into v_recent_form from scored;

    with prior_rounds as (
      select lr.id round_id
      from public.license_rounds lr
      join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
      where lr.season_division_id=p_division_id
      order by lr.round_number desc,lr.id desc
      limit 5 offset 5
    ), scored as (
      select case
        when e.finish_status='finished' and e.finishing_position is not null then
          case when field.field_size<=1 then 100
            else greatest(0,least(100,100*(field.field_size-e.finishing_position)::numeric/(field.field_size-1))) end
        else 0 end score
      from prior_rounds r
      join public.caleris_race_result_entries e on e.round_id=r.round_id and e.member_id=v_driver.member_id
      cross join lateral (select count(*)::integer field_size from public.caleris_race_result_entries all_entries where all_entries.round_id=r.round_id) field
    )
    select avg(score) into v_prior_form from scored;

    v_recent_form:=coalesce(v_recent_form,50);
    select case
      when exists(select 1 from public.economy_driver_contracts c where c.member_id=v_driver.member_id and c.season_id=v_season and c.status='active') then 100
      when v_driver.team_id is not null then 65
      else 40 end into v_morale;
    v_confidence:=greatest(0,least(100,v_recent_form+case when v_prior_form is null then 0 else (v_recent_form-v_prior_form)*0.5 end));
    v_metrics:=v_metrics||jsonb_build_object('form',v_recent_form,'morale',v_morale,'confidence',v_confidence);
    v_score:=private.calculate_brand_weighted_score(v_metrics,v_weights);
    select score into v_old from public.caleris_driver_reputation where member_id=v_driver.member_id;
    insert into public.caleris_driver_reputation(member_id,score,band,metrics,calculated_at)
    values(v_driver.member_id,v_score,
      case when v_score>=7000 then 'elite' when v_score>=4500 then 'top'
        when v_score>=2500 then 'competitive' when v_score>=1000 then 'established' else 'developing' end,
      v_metrics,now())
    on conflict(member_id) do update set score=excluded.score,band=excluded.band,metrics=excluded.metrics,calculated_at=now();
    insert into public.caleris_reputation_history(entity_kind,member_id,previous_score,new_score,metrics,source_event)
    values('driver',v_driver.member_id,v_old,v_score,v_metrics,'published_race_automation');
    v_updated_drivers:=v_updated_drivers+1;
  end loop;

  select config_value into v_weights
  from public.caleris_brand_ecosystem_config where config_key='team_reputation_weights';
  if v_weights is null then
    v_weights:='{"championship":25,"race_performance":25,"consistency":15,"driver_reputation":15,"fanbase":10,"commercial_credibility":10}'::jsonb;
  end if;

  select count(*) into v_total
  from public.teams t
  where exists(select 1 from public.members m join public.license_season_members lsm on lsm.member_id=m.id
    where m.team_id=t.id and m.role='Driver' and lsm.season_division_id=p_division_id);

  for v_team in
    select t.id team_id,
      coalesce((select sum(s.points_total) from public.license_round_standings s
        join public.license_rounds lr on lr.id=s.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        join public.members m on m.id=s.member_id
        where lr.season_division_id=p_division_id and m.team_id=t.id),0) points,
      coalesce((select count(*) from public.caleris_race_result_entries e
        join public.license_rounds lr on lr.id=e.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        where lr.season_division_id=p_division_id and e.team_id=t.id),0) entries,
      coalesce((select count(*) from public.caleris_race_result_entries e
        join public.license_rounds lr on lr.id=e.round_id
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        where lr.season_division_id=p_division_id and e.team_id=t.id and e.finish_status='finished'),0) finishes,
      coalesce((select sum(f.population) from public.caleris_fan_populations f
        where f.entity_kind='team' and f.team_id=t.id),0) fans,
      coalesce((select avg(r.score) from public.caleris_driver_reputation r
        join public.members m on m.id=r.member_id where m.team_id=t.id and m.role='Driver'),0) driver_score,
      coalesce((select count(*) from public.caleris_sponsorship_contracts c
        where c.target_team_id=t.id and c.status='active'),0) active_contracts,
      coalesce((select sum(mp.max_points*mp.entries) from (
        select lr.id,coalesce((select max(pr.points+pr.pole_bonus) from public.caleris_race_points_rules pr
          where pr.session_type=lr.session_type and pr.is_active),0) max_points,
          count(e.id) entries
        from public.license_rounds lr
        join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
        left join public.caleris_race_result_entries e on e.round_id=lr.id and e.team_id=t.id
        where lr.season_division_id=p_division_id group by lr.id,lr.session_type
      ) mp),0) max_possible
    from public.teams t
    where exists(select 1 from public.members m join public.license_season_members lsm on lsm.member_id=m.id
      where m.team_id=t.id and m.role='Driver' and lsm.season_division_id=p_division_id)
  loop
    select count(*) into v_better
    from (
      select t2.id team_id,coalesce(sum(s.points_total),0) points
      from public.teams t2
      join public.members m2 on m2.team_id=t2.id and m2.role='Driver'
      join public.license_season_members lsm2 on lsm2.member_id=m2.id and lsm2.season_division_id=p_division_id
      left join public.license_round_standings s on s.member_id=m2.id
      left join public.license_rounds lr on lr.id=s.round_id and lr.season_division_id=p_division_id
      left join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
      group by t2.id
    ) standings where standings.points>v_team.points;

    v_metrics:=jsonb_build_object(
      'championship',case when v_total<=1 then 100 else greatest(0,100*(v_total-1-v_better)::numeric/(v_total-1)) end,
      'race_performance',case when v_team.max_possible<=0 then 0 else least(100,v_team.points/v_team.max_possible*100) end,
      'season_performance',case when v_team.max_possible<=0 then 0 else least(100,v_team.points/v_team.max_possible*100) end,
      'consistency',case when v_team.entries=0 then 0 else v_team.finishes::numeric/v_team.entries*100 end,
      'driver_reputation',least(100,v_team.driver_score/99.99),
      'fanbase',least(100,sqrt(v_team.fans::numeric/20000)*100),
      'commercial_credibility',least(100,50+v_team.active_contracts*12.5)
    );
    v_score:=private.calculate_brand_weighted_score(v_metrics,v_weights);
    select score into v_old from public.caleris_team_reputation where team_id=v_team.team_id;
    insert into public.caleris_team_reputation(team_id,score,band,metrics,calculated_at)
    values(v_team.team_id,v_score,
      case when v_score>=7000 then 'elite' when v_score>=4500 then 'top'
        when v_score>=2500 then 'competitive' when v_score>=1000 then 'established' else 'developing' end,
      v_metrics,now())
    on conflict(team_id) do update set score=excluded.score,band=excluded.band,metrics=excluded.metrics,calculated_at=now();
    insert into public.caleris_reputation_history(entity_kind,team_id,previous_score,new_score,metrics,source_event)
    values('team',v_team.team_id,v_old,v_score,v_metrics,'published_race_automation');
    v_updated_teams:=v_updated_teams+1;
  end loop;

  return jsonb_build_object('status','processed','drivers',v_updated_drivers,'teams',v_updated_teams,'published_rounds',v_rounds);
end;
$function$

