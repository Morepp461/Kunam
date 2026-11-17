-- Apply an inactivity decay after the configured grace rounds without a classified entry.
create or replace function private.apply_fan_inactivity_for_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_config jsonb;v_rate numeric;v_grace integer;v_division uuid;
 v_fan record;v_prior_count integer;v_missing_count integer;v_delta bigint;v_event uuid;
 v_team_count integer:=0;v_driver_count integer:=0;
begin
 select config_value into v_config from public.caleris_brand_ecosystem_config where config_key='fan_growth_config';
 v_rate:=coalesce((v_config->>'inactive_decline_percent')::numeric,0.03);
 v_grace:=greatest(1,least(10,coalesce((v_config->>'inactive_grace_rounds')::integer,2)));
 select season_division_id into v_division from public.license_rounds where id=p_round_id;
 if v_division is null or v_rate<=0 then return jsonb_build_object('status','disabled'); end if;

 for v_fan in
  select f.* from public.caleris_fan_populations f
  where f.entity_kind='team'
   and not exists(select 1 from public.caleris_race_result_entries e where e.round_id=p_round_id and e.team_id=f.team_id)
  for update
 loop
  select count(*),count(*) filter(where not q.has_entry) into v_prior_count,v_missing_count
  from (
   select lr.id,exists(select 1 from public.caleris_race_result_entries e where e.round_id=lr.id and e.team_id=v_fan.team_id) has_entry
   from public.license_rounds lr join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
   where lr.season_division_id=v_division and lr.round_number<(select round_number from public.license_rounds where id=p_round_id)
   order by lr.round_number desc limit greatest(v_grace-1,0)
  ) q;
  if v_prior_count<v_grace-1 or v_missing_count<v_grace-1 then continue; end if;
  v_delta:=-greatest(1,round(v_fan.population*v_rate*(1-least(100,greatest(0,v_fan.loyalty))/200)/100)::bigint);
  v_delta:=greatest(v_delta,-v_fan.population);
  if v_delta=0 then continue; end if;
  insert into public.caleris_fan_growth_events(round_id,entity_kind,team_id,region_key,population_delta,growth_rate_percent)
  values(p_round_id,'team',v_fan.team_id,v_fan.region_key,v_delta,-v_rate)
  on conflict do nothing returning id into v_event;
  if v_event is not null then
   update public.caleris_fan_populations set population=greatest(0,population+v_delta),
    loyalty=greatest(0,loyalty-0.5),sentiment=greatest(0,sentiment-0.75),
    engagement=greatest(0,engagement-0.5),updated_at=now()
   where id=v_fan.id;
   insert into public.caleris_fan_population_history(entity_kind,team_id,region_key,population_delta,source_event,metadata)
   values('team',v_fan.team_id,v_fan.region_key,v_delta,'race_inactivity_decline',
    jsonb_build_object('round_id',p_round_id,'grace_rounds',v_grace,'rate',-v_rate));
   v_team_count:=v_team_count+1;
  end if;
  v_event:=null;
 end loop;

 for v_fan in
  select f.* from public.caleris_fan_populations f
  where f.entity_kind='driver'
   and not exists(select 1 from public.caleris_race_result_entries e where e.round_id=p_round_id and e.member_id=f.member_id)
  for update
 loop
  select count(*),count(*) filter(where not q.has_entry) into v_prior_count,v_missing_count
  from (
   select lr.id,exists(select 1 from public.caleris_race_result_entries e where e.round_id=lr.id and e.member_id=v_fan.member_id) has_entry
   from public.license_rounds lr join public.caleris_race_results rr on rr.round_id=lr.id and rr.published_at is not null
   where lr.season_division_id=v_division and lr.round_number<(select round_number from public.license_rounds where id=p_round_id)
   order by lr.round_number desc limit greatest(v_grace-1,0)
  ) q;
  if v_prior_count<v_grace-1 or v_missing_count<v_grace-1 then continue; end if;
  v_delta:=-greatest(1,round(v_fan.population*v_rate*(1-least(100,greatest(0,v_fan.loyalty))/200)/100)::bigint);
  v_delta:=greatest(v_delta,-v_fan.population);
  if v_delta=0 then continue; end if;
  insert into public.caleris_fan_growth_events(round_id,entity_kind,member_id,region_key,population_delta,growth_rate_percent)
  values(p_round_id,'driver',v_fan.member_id,v_fan.region_key,v_delta,-v_rate)
  on conflict do nothing returning id into v_event;
  if v_event is not null then
   update public.caleris_fan_populations set population=greatest(0,population+v_delta),
    loyalty=greatest(0,loyalty-0.5),sentiment=greatest(0,sentiment-0.75),
    engagement=greatest(0,engagement-0.5),updated_at=now()
   where id=v_fan.id;
   insert into public.caleris_fan_population_history(entity_kind,member_id,region_key,population_delta,source_event,metadata)
   values('driver',v_fan.member_id,v_fan.region_key,v_delta,'race_inactivity_decline',
    jsonb_build_object('round_id',p_round_id,'grace_rounds',v_grace,'rate',-v_rate));
   v_driver_count:=v_driver_count+1;
  end if;
  v_event:=null;
 end loop;
 return jsonb_build_object('status','processed','team_regions',v_team_count,'driver_regions',v_driver_count);
end $$;
revoke all on function private.apply_fan_inactivity_for_round(uuid) from public,anon,authenticated;

create or replace function private.trigger_refresh_sponsorship_targets()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.published_at is not null and (tg_op='INSERT' or old.published_at is distinct from new.published_at) then
  perform private.refresh_sponsorship_targets_for_round(new.round_id);
  perform private.apply_fan_growth_for_round(new.round_id);
  perform private.apply_fan_inactivity_for_round(new.round_id);
 end if;
 return new;
end $$;

create or replace function public.admin_set_brand_ecosystem_config(p_key text,p_value jsonb,p_description text)
returns void language plpgsql security definer set search_path='' as $$
declare v_total numeric;v_entry record;
begin
 if not exists(select 1 from public.site_admins where user_id=(select auth.uid())) then raise exception 'Akses Admin diperlukan.'; end if;
 if p_key is null or length(trim(p_key)) not between 2 and 80 or jsonb_typeof(p_value)<>'object' then raise exception 'Konfigurasi tidak valid.'; end if;
 if p_key in ('team_reputation_weights','driver_reputation_weights','sponsor_trust_weights') then
  select sum(value::numeric) into v_total from jsonb_each_text(p_value);
  if v_total is null or v_total<=0 or exists(select 1 from jsonb_each_text(p_value) e where e.value::numeric<0) then raise exception 'Bobot harus non-negatif dan totalnya lebih dari nol.'; end if;
 elsif p_key='bonus_pool_percent' then
  if coalesce((p_value->>'value')::numeric,-1)<0 or (p_value->>'value')::numeric>100 then raise exception 'Bonus pool harus 0 sampai 100 persen.'; end if;
 elsif p_key='sponsor_division_probabilities' then
  for v_entry in select key,value from jsonb_each(p_value) loop
   if jsonb_typeof(v_entry.value)<>'object' then raise exception 'Probabilitas divisi tidak valid.'; end if;
   select sum(value::numeric) into v_total from jsonb_each_text(v_entry.value);
   if abs(coalesce(v_total,0)-100)>0.01 or exists(select 1 from jsonb_each_text(v_entry.value) e where e.value::numeric<0 or e.value::numeric>100) then raise exception 'Probabilitas tier untuk divisi % harus berjumlah 100 persen.',v_entry.key; end if;
  end loop;
 elsif p_key='sponsor_focus_targets' then
  for v_entry in select key,value from jsonb_each(p_value) loop
   if jsonb_typeof(v_entry.value)<>'object' or exists(select 1 from jsonb_each_text(v_entry.value) e where e.value::numeric<0 or e.value::numeric>100) then raise exception 'Target fokus sponsor harus 0 sampai 100.'; end if;
  end loop;
 elsif p_key='fan_growth_config' then
  if coalesce((p_value->>'base_growth_percent')::numeric,-1)<0 or (p_value->>'base_growth_percent')::numeric>5
   or coalesce((p_value->>'win_multiplier')::numeric,0)<0 or coalesce((p_value->>'podium_multiplier')::numeric,0)<0
   or coalesce((p_value->>'points_multiplier')::numeric,0)<0 or coalesce((p_value->>'finish_multiplier')::numeric,0)<0
   or coalesce((p_value->>'win_multiplier')::numeric,0)>10 or coalesce((p_value->>'podium_multiplier')::numeric,0)>10
   or coalesce((p_value->>'points_multiplier')::numeric,0)>10 or coalesce((p_value->>'finish_multiplier')::numeric,0)>10
   or coalesce((p_value->>'bad_finish_decline_percent')::numeric,0)<0 or coalesce((p_value->>'bad_finish_decline_percent')::numeric,0)>5
   or coalesce((p_value->>'dnf_decline_percent')::numeric,0)<0 or coalesce((p_value->>'dnf_decline_percent')::numeric,0)>5
   or coalesce((p_value->>'poor_streak_decline_percent')::numeric,0)<0 or coalesce((p_value->>'poor_streak_decline_percent')::numeric,0)>5
   or coalesce((p_value->>'inactive_decline_percent')::numeric,0)<0 or coalesce((p_value->>'inactive_decline_percent')::numeric,0)>5
   or coalesce((p_value->>'inactive_grace_rounds')::integer,2)<1 or (p_value->>'inactive_grace_rounds')::integer>10 then
   raise exception 'Fan growth/decline rate harus 0–5 persen, multiplier 0–10, grace 1–10 race.';
  end if;
 end if;
 insert into public.caleris_brand_ecosystem_config(config_key,config_value,description,updated_by)
 values(trim(p_key),p_value,coalesce(nullif(trim(p_description),''),'Brand ecosystem configuration'),(select auth.uid()))
 on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=excluded.updated_by,updated_at=now();
end $$;

update public.caleris_brand_ecosystem_config
set config_value=config_value||'{"inactive_decline_percent":0.03,"inactive_grace_rounds":2}'::jsonb,
 description='Regional fan growth, performance and inactivity dynamics; editable by Admin.',updated_at=now()
where config_key='fan_growth_config';
