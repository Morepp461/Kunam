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
  v_open_count integer;
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
    select count(*) into v_open_count
    from public.caleris_sponsorship_offers o
    where o.target_team_id=v_team.id and o.season_id=p_season_id
      and o.status in ('offered','negotiating','accepted');
    if v_open_count>=3 then continue; end if;

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
      order by s.tier_key,s.name
    loop
      exit when v_open_count>=3;
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
      v_open_count:=v_open_count+1;
    end loop;
  end loop;
  return jsonb_build_object('created',v_created,'season_id',p_season_id,'max_open_offers_per_team',3);
end;
$$;

revoke all on function private.auto_generate_team_sponsorship_offers(uuid) from public,anon,authenticated;

with ranked as (
  select id,row_number() over(partition by target_team_id,season_id order by created_at,id) rn
  from public.caleris_sponsorship_offers
  where status in ('offered','negotiating') and generated_by_engine=true
)
update public.caleris_sponsorship_offers o
set status='expired'
from ranked r
where r.id=o.id and r.rn>3;
