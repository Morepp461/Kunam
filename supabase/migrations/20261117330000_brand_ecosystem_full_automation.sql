-- Make Brand Ecosystem event-driven: automatic reputation, fan bootstrap,
-- sponsor matching, negotiation responses and season-end trust evaluation.

create or replace function private.calculate_brand_weighted_score(p_metrics jsonb,p_weights jsonb)
returns integer
language sql immutable
set search_path=''
as $$
  select coalesce(round(
    sum(coalesce((p_metrics->>w.key)::numeric,0) * w.value::numeric)
    / nullif(sum(w.value::numeric),0) * 99.99
  )::integer,0)
  from jsonb_each_text(coalesce(p_weights,'{}'::jsonb)) w;
$$;

revoke all on function private.calculate_brand_weighted_score(jsonb,jsonb) from public,anon,authenticated;

create or replace function private.ensure_brand_fan_populations()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_teams integer:=0;v_drivers integer:=0;
begin
  insert into public.caleris_fan_populations(entity_kind,team_id,region_key,population,loyalty,engagement,sentiment)
  select 'team',t.id,'Indonesia',
    case lower(coalesce(t.division_key,''))
      when 'premio' then 20000
      when 'zwei' then 8000
      else 5000
    end,50,50,50
  from public.teams t
  where not exists(
    select 1 from public.caleris_fan_populations f
    where f.entity_kind='team' and f.team_id=t.id
  );
  get diagnostics v_teams=row_count;

  insert into public.caleris_fan_populations(entity_kind,member_id,region_key,population,loyalty,engagement,sentiment)
  select 'driver',m.id,'Indonesia',
    case lower(coalesce(t.division_key,''))
      when 'premio' then 1500
      when 'zwei' then 750
      else 1000
    end,50,50,50
  from public.members m
  left join public.teams t on t.id=m.team_id
  where m.role='Driver'
    and not exists(
      select 1 from public.caleris_fan_populations f
      where f.entity_kind='driver' and f.member_id=m.id
    );
  get diagnostics v_drivers=row_count;
  return jsonb_build_object('teams_seeded',v_teams,'drivers_seeded',v_drivers);
end;
$$;

revoke all on function private.ensure_brand_fan_populations() from public,anon,authenticated;

create or replace function private.refresh_brand_reputation_for_division(p_division_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
$$;

revoke all on function private.refresh_brand_reputation_for_division(uuid) from public,anon,authenticated;

create or replace function private.auto_generate_team_sponsorship_offers(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_team record;
  v_sponsor record;
  v_created integer:=0;
  v_offer uuid;
  v_amount numeric;
  v_probs jsonb;
  v_division text;
begin
  select config_value into v_probs
  from public.caleris_brand_ecosystem_config where config_key='sponsor_division_probabilities';

  for v_team in
    select t.id,t.division_key,coalesce(r.score,0) score,
      coalesce((select sum(f.population) from public.caleris_fan_populations f
        where f.entity_kind='team' and f.team_id=t.id),0) fans,
      coalesce((select (r2.metrics->>'season_performance')::numeric
        from public.caleris_team_reputation r2 where r2.team_id=t.id),0) season_performance
    from public.teams t
    left join public.caleris_team_reputation r on r.team_id=t.id
    where exists(select 1 from public.members m where m.team_id=t.id and m.role='Driver')
  loop
    v_division:=lower(coalesce(v_team.division_key,''));
    for v_sponsor in
      select s.*,tr.minimum_season_performance
      from public.caleris_sponsors s
      join public.caleris_sponsor_tier_rules tr on tr.tier_key=s.tier_key and tr.is_active
      where s.is_active
        and s.available_budget is not null
        and s.available_budget>=coalesce((s.target_audience->>'offer_amount_min')::numeric,0)
        and nullif(s.target_audience->>'base_amount','') is not null
        and v_team.score>=tr.minimum_team_reputation
        and v_team.fans>=tr.minimum_fan_population
        and v_team.season_performance>=tr.minimum_season_performance
        and coalesce((v_probs->v_division->>s.tier_key)::numeric,0)>0
        and random()<coalesce((v_probs->v_division->>s.tier_key)::numeric,0)/100
        and not exists(select 1 from public.caleris_sponsorship_offers o
          where o.sponsor_id=s.id and o.target_team_id=v_team.id and o.season_id=p_season_id)
        and not exists(select 1 from public.caleris_sponsorship_contracts c
          where c.sponsor_id=s.id and c.target_team_id=v_team.id and c.season_id=p_season_id and c.status='active')
    loop
      v_amount:=(v_sponsor.target_audience->>'base_amount')::numeric;
      if v_amount<=0 or v_amount<>round(v_amount,2) or v_sponsor.available_budget<v_amount then
        continue;
      end if;
      insert into public.caleris_sponsorship_offers(
        sponsor_id,target_kind,target_team_id,season_id,proposed_amount,terms,status,expires_at,created_by,generated_by_engine
      )
      values(v_sponsor.id,'team',v_team.id,p_season_id,v_amount,
        jsonb_build_object(
          'tier',v_sponsor.tier_key,
          'duration_seasons',v_sponsor.default_duration_seasons,
          'focus',v_sponsor.focus_key,
          'source_code',v_sponsor.source_code,
          'origin',case when v_sponsor.is_indonesian then 'Indonesia' else 'Global' end
        ),
        'offered',now()+interval '7 days',null,true
      )
      returning id into v_offer;
      insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
      values(v_offer,'admin',v_amount,jsonb_build_object(
        'tier',v_sponsor.tier_key,'duration_seasons',v_sponsor.default_duration_seasons,
        'focus',v_sponsor.focus_key,'source_code',v_sponsor.source_code
      ));
      v_created:=v_created+1;
    end loop;
  end loop;
  return jsonb_build_object('created',v_created,'season_id',p_season_id);
end;
$$;

revoke all on function private.auto_generate_team_sponsorship_offers(uuid) from public,anon,authenticated;

create or replace function private.sponsor_engine_respond(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_offer public.caleris_sponsorship_offers%rowtype;
  v_sponsor public.caleris_sponsors%rowtype;
  v_last public.caleris_sponsorship_offer_revisions%rowtype;
  v_initial numeric;
  v_limit numeric;
  v_amount numeric;
  v_response text;
begin
  select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
  if not found or v_offer.target_kind<>'team' or v_offer.status<>'negotiating' then
    return jsonb_build_object('status','not_waiting');
  end if;
  if v_offer.expires_at is not null and now()>v_offer.expires_at then
    update public.caleris_sponsorship_offers set status='expired' where id=v_offer.id;
    return jsonb_build_object('status','expired');
  end if;
  select * into v_sponsor from public.caleris_sponsors where id=v_offer.sponsor_id for update;
  select * into v_last from public.caleris_sponsorship_offer_revisions
  where offer_id=v_offer.id order by created_at desc,id desc limit 1;
  if not found or v_last.actor_kind<>'member' then
    return jsonb_build_object('status','not_waiting');
  end if;
  select amount into v_initial from public.caleris_sponsorship_offer_revisions
  where offer_id=v_offer.id order by created_at,id limit 1;
  v_limit:=v_initial*(1+v_sponsor.flexibility_percent/100);

  if v_last.amount<=v_limit
    and (v_sponsor.available_budget is null or v_sponsor.available_budget>=v_last.amount) then
    v_amount:=v_last.amount;
    v_response:='accepted';
  elsif v_offer.counter_count<3
    and (v_sponsor.available_budget is null or v_sponsor.available_budget>=v_initial) then
    v_amount:=least(v_limit,greatest(v_initial,v_last.amount*0.95));
    v_response:='countered';
  else
    update public.caleris_sponsorship_offer_revisions set response='rejected' where id=v_last.id;
    update public.caleris_sponsorship_offers set status='rejected' where id=v_offer.id;
    return jsonb_build_object('status','rejected','counter_count',v_offer.counter_count);
  end if;

  update public.caleris_sponsorship_offer_revisions set response=v_response where id=v_last.id;
  insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
  values(v_offer.id,'admin',v_amount,
    coalesce(v_last.terms,'{}'::jsonb)||jsonb_build_object(
      'duration_seasons',coalesce(
        nullif(v_last.terms->>'duration_seasons','')::integer,
        nullif(v_offer.terms->>'duration_seasons','')::integer,
        v_sponsor.default_duration_seasons,1
      ),
      'engine_response',v_response
    ));
  update public.caleris_sponsorship_offers
  set status='offered',proposed_amount=v_amount
  where id=v_offer.id;
  return jsonb_build_object('status',v_response,'amount',v_amount,'counter_count',v_offer.counter_count);
end;
$$;

revoke all on function private.sponsor_engine_respond(uuid) from public,anon,authenticated;

create or replace function private.trigger_auto_respond_sponsorship_counter()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='negotiating' and old.status is distinct from new.status then
    perform private.sponsor_engine_respond(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists caleris_auto_sponsor_counter_response on public.caleris_sponsorship_offers;
create trigger caleris_auto_sponsor_counter_response
after update of status on public.caleris_sponsorship_offers
for each row execute function private.trigger_auto_respond_sponsorship_counter();

create or replace function public.sponsor_engine_respond(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then
    raise exception 'Akses Admin diperlukan untuk menjalankan engine sponsor.';
  end if;
  return private.sponsor_engine_respond(p_offer_id);
end;
$$;

create or replace function private.trigger_refresh_sponsorship_targets()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_division uuid;v_season uuid;
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is distinct from new.published_at) then
    select lr.season_division_id,sd.season_id into v_division,v_season
    from public.license_rounds lr
    join public.license_season_divisions sd on sd.id=lr.season_division_id
    where lr.id=new.round_id;

    perform private.ensure_brand_fan_populations();
    perform private.refresh_sponsorship_targets_for_round(new.round_id);
    perform private.apply_fan_growth_for_round(new.round_id);
    perform private.apply_fan_inactivity_for_round(new.round_id);
    if v_division is not null then
      perform private.refresh_brand_reputation_for_division(v_division);
    end if;
    if v_season is not null then
      perform private.auto_generate_team_sponsorship_offers(v_season);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.evaluate_brand_sponsorship_trust_for_division(p_division_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_season uuid;
  v_contract record;
  v_weights jsonb;
  v_metrics jsonb;
  v_score numeric;
  v_band text;
  v_updated integer:=0;
  v_target_total integer;
  v_target_achieved integer;
  v_target_missed integer;
  v_entries integer;
  v_finishes integer;
  v_fans bigint;
  v_net_fan_change bigint;
  v_start_fans bigint;
begin
  select season_id into v_season from public.license_season_divisions where id=p_division_id;
  if v_season is null then return jsonb_build_object('status','division_not_found'); end if;
  select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='sponsor_trust_weights';
  if v_weights is null then
    v_weights:='{"target_achievement":45,"consistency":20,"fanbase_growth":15,"commercial_exposure":10,"partnership_conduct":10}'::jsonb;
  end if;

  update public.caleris_sponsorship_targets t
  set status='missed'
  from public.caleris_sponsorship_contracts c
  where c.id=t.contract_id and c.status='active' and c.target_team_id is not null
    and t.season_id=v_season and t.status='in_progress';

  for v_contract in
    select c.id contract_id,c.target_team_id
    from public.caleris_sponsorship_contracts c
    join public.teams tm on tm.id=c.target_team_id
    join public.license_season_divisions sd on sd.id=p_division_id and sd.season_id=c.season_id
    where c.status='active' and c.target_kind='team'
      and lower(coalesce(tm.division_key,''))=lower(sd.division_key)
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

    select sum((v_metrics->>w.key)::numeric*w.value::numeric)
      /nullif(sum(w.value::numeric),0)
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
  return jsonb_build_object('status','evaluated','contracts',v_updated,'season_id',v_season);
end;
$$;

revoke all on function private.evaluate_brand_sponsorship_trust_for_division(uuid) from public,anon,authenticated;

create or replace function private.trigger_evaluate_brand_sponsorship_trust()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status in ('completed','finalized') and old.status is distinct from new.status then
    perform private.evaluate_brand_sponsorship_trust_for_division(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists caleris_auto_sponsor_trust_evaluation on public.license_season_divisions;
create trigger caleris_auto_sponsor_trust_evaluation
after update of status on public.license_season_divisions
for each row execute function private.trigger_evaluate_brand_sponsorship_trust();

-- Bootstrap existing game entities and calculate their current-season reputations.
select private.ensure_brand_fan_populations();

do $$
declare v_division record;
begin
  for v_division in
    select distinct lr.season_division_id
    from public.license_rounds lr
    join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
  loop
    perform private.refresh_brand_reputation_for_division(v_division.season_division_id);
  end loop;

  for v_division in
    select id from public.license_season_divisions where status in ('completed','finalized')
  loop
    perform private.evaluate_brand_sponsorship_trust_for_division(v_division.id);
  end loop;
end;
$$;

-- Resolve any counter already waiting when this migration is applied.
do $$
declare v_offer record;
begin
  for v_offer in
    select o.id
    from public.caleris_sponsorship_offers o
    join lateral (
      select actor_kind from public.caleris_sponsorship_offer_revisions r
      where r.offer_id=o.id order by r.created_at desc,r.id desc limit 1
    ) last_revision on true
    where o.status='negotiating' and last_revision.actor_kind='member'
  loop
    perform private.sponsor_engine_respond(v_offer.id);
  end loop;
end;
$$;

-- Recalculate the active season's matching once so no manual Generate button is needed.
do $$
declare v_season record;
begin
  for v_season in
    select distinct s.id
    from public.license_seasons s
    join public.license_season_divisions sd on sd.season_id=s.id
    where s.status='active'
  loop
    perform private.auto_generate_team_sponsorship_offers(v_season.id);
  end loop;
end;
$$;
