-- Allow Admin-created sponsor records to participate in the same matching engine.
create or replace function public.admin_set_sponsor_offer_band(p_sponsor_id uuid,p_minimum numeric,p_maximum numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_minimum is null or p_maximum is null or p_minimum<=0 or p_maximum<p_minimum
  or p_maximum<>round(p_maximum,2) or p_minimum<>round(p_minimum,2) then raise exception 'Rentang nilai penawaran tidak valid.'; end if;
 update public.caleris_sponsors set target_audience=coalesce(target_audience,'{}'::jsonb)||
  jsonb_build_object('offer_amount_min',p_minimum,'offer_amount_max',p_maximum,'base_amount',p_minimum),
  default_duration_seasons=coalesce(nullif(default_duration_seasons,0),1),updated_at=now()
 where id=p_sponsor_id;
 if not found then raise exception 'Sponsor tidak ditemukan.'; end if;
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
   where s.is_active and s.available_budget is not null and s.available_budget>=coalesce((s.target_audience->>'offer_amount_min')::numeric,0)
    and nullif(s.target_audience->>'base_amount','') is not null
    and v_team.score>=tr.minimum_team_reputation and v_team.fans>=tr.minimum_fan_population
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
