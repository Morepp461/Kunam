-- Lock new sponsorship workflows to Team Owner / team contracts while preserving historical driver records.
create or replace function private.create_sponsorship_contract_from_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_offer public.caleris_sponsorship_offers%rowtype;v_revision public.caleris_sponsorship_offer_revisions%rowtype;v_id uuid;
begin
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id for update;
 if not found then raise exception 'Sponsorship offer not found.'; end if;
 if v_offer.target_kind<>'team' or v_offer.target_team_id is null then raise exception 'New sponsorship contracts are team-only.'; end if;
 if v_offer.status not in ('offered','negotiating') then raise exception 'Sponsorship offer is no longer open.'; end if;
 select * into v_revision from public.caleris_sponsorship_offer_revisions where offer_id=p_offer_id order by created_at desc,id desc limit 1;
 if not found then raise exception 'Sponsorship offer revision is missing.'; end if;
 insert into public.caleris_sponsorship_contracts(offer_id,sponsor_id,target_kind,target_member_id,target_team_id,season_id,contract_amount,terms,status)
 values(v_offer.id,v_offer.sponsor_id,'team',null,v_offer.target_team_id,v_offer.season_id,v_revision.amount,v_revision.terms,'active')
 returning id into v_id;
 update public.caleris_sponsorship_offers set proposed_amount=v_revision.amount,terms=v_revision.terms,status='accepted' where id=v_offer.id;
 update public.caleris_sponsorship_offer_revisions set response='accepted' where id=v_revision.id;
 return v_id;
end $$;

create or replace function public.member_respond_sponsorship_offer(p_offer_id uuid,p_action text,p_counter_amount numeric default null,p_terms jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_offer public.caleris_sponsorship_offers%rowtype;
begin
 select * into v_offer from public.caleris_sponsorship_offers where id=p_offer_id;
 if not found or v_offer.target_kind<>'team' then raise exception 'Individual driver sponsorship is no longer available.'; end if;
 return public.owner_respond_sponsorship_offer(p_offer_id,p_action,p_counter_amount,p_terms);
end $$;

create or replace function public.admin_create_sponsorship_offer(p_sponsor_id uuid,p_target_kind text,p_target_id uuid,p_season_id uuid,p_amount numeric,p_terms jsonb default '{}'::jsonb,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_offer_id uuid;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Hanya Admin yang dapat membuat sponsorship offer.'; end if;
 if p_target_kind<>'team' then raise exception 'Sponsorship hanya dapat ditawarkan kepada tim.'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal offer tidak valid.'; end if;
 if not exists(select 1 from public.caleris_sponsors where id=p_sponsor_id and is_active) then raise exception 'Sponsor tidak tersedia atau nonaktif.'; end if;
 if not exists(select 1 from public.teams where id=p_target_id) then raise exception 'Tim target tidak ditemukan.'; end if;
 if not exists(select 1 from public.license_seasons where id=p_season_id) then raise exception 'Season tidak ditemukan.'; end if;
 insert into public.caleris_sponsorship_offers(sponsor_id,target_kind,target_team_id,season_id,proposed_amount,terms,status,expires_at,created_by)
 values(p_sponsor_id,'team',p_target_id,p_season_id,p_amount,coalesce(p_terms,'{}'::jsonb),'offered',p_expires_at,(select auth.uid()))
 returning id into v_offer_id;
 insert into public.caleris_sponsorship_offer_revisions(offer_id,actor_kind,amount,terms)
 values(v_offer_id,'admin',p_amount,coalesce(p_terms,'{}'::jsonb));
 return v_offer_id;
end $$;

create or replace function public.admin_calculate_team_reputation(p_team_id uuid,p_metrics jsonb,p_source_event text default 'season_evaluation')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_weights jsonb;v_total numeric:=0;v_weight numeric:=0;v_item record;v_value numeric;v_score integer;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if jsonb_typeof(p_metrics)<>'object' or not exists(select 1 from public.teams where id=p_team_id) then raise exception 'Team atau metrics tidak valid.'; end if;
 select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='team_reputation_weights';
 for v_item in select key,value from jsonb_each(v_weights) loop
  v_value:=coalesce((p_metrics->>v_item.key)::numeric,0);
  if v_value<0 or v_value>100 then raise exception 'Metrik % harus 0 sampai 100.',v_item.key; end if;
  v_total:=v_total+v_value*(v_item.value#>>'{}')::numeric;
  v_weight:=v_weight+(v_item.value#>>'{}')::numeric;
 end loop;
 if v_weight<=0 then raise exception 'Bobot Team Reputation tidak valid.'; end if;
 v_score:=round((v_total/v_weight)*99.99)::integer;
 return public.admin_set_team_reputation(p_team_id,v_score,p_metrics,p_source_event);
end $$;

create or replace function public.admin_calculate_driver_reputation(p_member_id uuid,p_metrics jsonb,p_source_event text default 'season_evaluation')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_weights jsonb;v_total numeric:=0;v_weight numeric:=0;v_item record;v_value numeric;v_score integer;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if jsonb_typeof(p_metrics)<>'object' or not exists(select 1 from public.members where id=p_member_id and role='Driver') then raise exception 'Driver atau metrics tidak valid.'; end if;
 select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='driver_reputation_weights';
 for v_item in select key,value from jsonb_each(v_weights) loop
  v_value:=coalesce((p_metrics->>v_item.key)::numeric,0);
  if v_value<0 or v_value>100 then raise exception 'Metrik % harus 0 sampai 100.',v_item.key; end if;
  v_total:=v_total+v_value*(v_item.value#>>'{}')::numeric;
  v_weight:=v_weight+(v_item.value#>>'{}')::numeric;
 end loop;
 if v_weight<=0 then raise exception 'Bobot Driver Reputation tidak valid.'; end if;
 v_score:=round((v_total/v_weight)*99.99)::integer;
 return public.admin_set_driver_reputation(p_member_id,v_score,p_metrics,p_source_event);
end $$;

create or replace function public.generate_team_sponsorship_offers(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_team record;v_sponsor record;v_created integer:=0;v_offer uuid;v_amount numeric;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if not exists(select 1 from public.license_seasons where id=p_season_id) then raise exception 'Season tidak ditemukan.'; end if;
 for v_team in
  select t.id,coalesce(r.score,0) score,coalesce((r.metrics->>'season_performance')::numeric,0) performance,
   coalesce((select sum(f.population) from public.caleris_fan_populations f where f.entity_kind='team' and f.team_id=t.id),0) fans
  from public.teams t left join public.caleris_team_reputation r on r.team_id=t.id
 loop
  for v_sponsor in
   select s.*,tr.minimum_budget as tier_minimum_budget,tr.minimum_season_performance
   from public.caleris_sponsors s join public.caleris_sponsor_tier_rules tr on tr.tier_key=s.tier_key and tr.is_active
   where s.is_active and s.available_budget is not null and s.available_budget>=tr.minimum_budget
    and v_team.score>=tr.minimum_team_reputation and v_team.fans>=tr.minimum_fan_population
    and v_team.performance>=tr.minimum_season_performance
    and (tr.maximum_budget is null or s.available_budget<=tr.maximum_budget)
    and nullif(s.target_audience->>'offer_amount_min','') is not null
    and nullif(s.target_audience->>'offer_amount_max','') is not null
    and (s.target_audience->>'offer_amount_min')::numeric>0
    and (s.target_audience->>'offer_amount_max')::numeric >= (s.target_audience->>'offer_amount_min')::numeric
    and not exists(select 1 from public.caleris_sponsorship_offers o where o.sponsor_id=s.id and o.target_team_id=v_team.id and o.season_id=p_season_id and o.status in ('offered','negotiating','accepted'))
    and not exists(select 1 from public.caleris_sponsorship_contracts c where c.sponsor_id=s.id and c.target_team_id=v_team.id and c.season_id=p_season_id and c.status='active')
  loop
   v_amount:=least(v_sponsor.available_budget,(v_sponsor.target_audience->>'offer_amount_min')::numeric);
   if v_amount<=0 or v_amount<>round(v_amount,2) then continue; end if;
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

create or replace function public.admin_evaluate_sponsorship_trust(p_contract_id uuid,p_season_id uuid,p_metrics jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contract public.caleris_sponsorship_contracts%rowtype;v_weights jsonb;v_score numeric;v_band text;v_item record;v_value numeric;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if jsonb_typeof(p_metrics)<>'object' then raise exception 'Metrics evaluasi tidak valid.'; end if;
 select * into v_contract from public.caleris_sponsorship_contracts where id=p_contract_id and status='active' for update;
 if not found then raise exception 'Kontrak aktif tidak ditemukan.'; end if;
 select config_value into v_weights from public.caleris_brand_ecosystem_config where config_key='sponsor_trust_weights';
 v_score:=0;
 for v_item in select key,value from jsonb_each(v_weights) loop
  v_value:=coalesce((p_metrics->>v_item.key)::numeric,0);
  if v_value<0 or v_value>100 then raise exception 'Metrik % harus 0 sampai 100.',v_item.key; end if;
  v_score:=v_score+v_value*(v_item.value#>>'{}')::numeric;
 end loop;
 v_score:=v_score/nullif((select sum((value#>>'{}')::numeric) from jsonb_each(v_weights)),0);
 if v_score is null or v_score<0 or v_score>100 then raise exception 'Bobot Trust Score tidak valid.'; end if;
 v_band:=case when v_score>=90 then 'premium' when v_score>=80 then 'standard' when v_score>=60 then 'conditional' else 'terminated' end;
 insert into public.caleris_sponsorship_season_evaluations(contract_id,season_id,trust_score,renewal_band,metrics)
 values(p_contract_id,p_season_id,round(v_score)::integer,v_band,p_metrics)
 on conflict(contract_id,season_id) do update set trust_score=excluded.trust_score,renewal_band=excluded.renewal_band,metrics=excluded.metrics,evaluated_at=now();
 update public.caleris_sponsorship_contracts set renewal_status=case v_band when 'premium' then 'proposed' when 'standard' then 'proposed' when 'conditional' then 'conditional' else 'terminated' end,
  status=case when v_band='terminated' then 'terminated' else status end,
  ended_at=case when v_band='terminated' then now() else ended_at end
 where id=p_contract_id;
 return jsonb_build_object('trust_score',round(v_score)::integer,'renewal_band',v_band);
end $$;

revoke all on function public.admin_calculate_team_reputation(uuid,jsonb,text) from public,anon;
revoke all on function public.admin_calculate_driver_reputation(uuid,jsonb,text) from public,anon;
grant execute on function public.admin_calculate_team_reputation(uuid,jsonb,text) to authenticated;
grant execute on function public.admin_calculate_driver_reputation(uuid,jsonb,text) to authenticated;
