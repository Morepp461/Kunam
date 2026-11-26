-- Complete the verified Team HQ consumers and preserve lifecycle integrity.
-- No business data is copied or reset by this migration.

-- Restore the intended Pit Crew effect and replace the obsolete linear Factory
-- percentage with the approved discrete +1 production-capacity effect at LV6.
update public.caleris_team_hq_facility_configs
set effects_by_level = (
  select jsonb_object_agg(level::text, jsonb_build_object('pit_stop_efficiency_bonus', level::numeric))
  from generate_series(1, 8) as level
), updated_at = now()
where facility_key = 'pit_crew_training_center';

update public.caleris_team_hq_facility_configs
set effects_by_level = (
  select jsonb_object_agg(
    level::text,
    case when level = 6 then jsonb_build_object('factory_production_capacity_bonus', 1) else '{}'::jsonb end
  )
  from generate_series(1, 8) as level
), updated_at = now()
where facility_key = 'factory';

-- Keep all effects in one authoritative condition-scaled calculation.
create or replace function private.team_hq_effects_for_team(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'fan_growth_bonus_percent', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'fan_growth_bonus_percent')::numeric, 0) * f.condition / 100), 0),
    'fanbase_reputation_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'fanbase_reputation_bonus')::numeric, 0) * f.condition / 100), 0),
    'commercial_credibility_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'commercial_credibility_bonus')::numeric, 0) * f.condition / 100), 0),
    'merchandise_demand_bonus_percent', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'merchandise_demand_bonus_percent')::numeric, 0) * f.condition / 100), 0),
    'merchandise_capacity_bonus_percent', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'merchandise_capacity_bonus_percent')::numeric, 0) * f.condition / 100), 0),
    'sponsor_attraction_bonus_percent', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'sponsor_attraction_bonus_percent')::numeric, 0) * f.condition / 100), 0),
    'pit_stop_efficiency_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'pit_stop_efficiency_bonus')::numeric, 0) * f.condition / 100), 0),
    'qualifying_pace_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'qualifying_pace_bonus')::numeric, 0) * f.condition / 100), 0),
    'race_pace_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'race_pace_bonus')::numeric, 0) * f.condition / 100), 0),
    'reliability_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'reliability_bonus')::numeric, 0) * f.condition / 100), 0),
    'aero_power_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'aero_power_bonus')::numeric, 0) * f.condition / 100), 0),
    'factory_capacity_bonus_percent', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'factory_capacity_bonus_percent')::numeric, 0) * f.condition / 100), 0),
    'factory_production_capacity_bonus', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'factory_production_capacity_bonus')::numeric, 0) * f.condition / 100), 0),
    'driver_development_efficiency_bonus_percent', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'driver_development_efficiency_bonus_percent')::numeric, 0) * f.condition / 100), 0),
    'research_efficiency_bonus_percent', coalesce(sum(coalesce((c.effects_by_level->f.level::text->>'research_efficiency_bonus_percent')::numeric, 0) * f.condition / 100), 0),
    'analytics_round_window', coalesce(max(round((c.effects_by_level->f.level::text->>'analytics_round_window')::numeric * f.condition / 100)::integer), 0),
    'strategy_analysis_depth', coalesce(max(round((c.effects_by_level->f.level::text->>'strategy_analysis_depth')::numeric * f.condition / 100)::integer), 0)
  )
  from public.caleris_team_hq_facilities f
  join public.caleris_team_hq_facility_configs c on c.facility_key = f.facility_key
  where f.team_id = p_team_id and f.level > 0 and c.is_enabled;
$function$;

-- The Sponsor Engine consumes Commercial Department attraction as an increase
-- to eligible sponsor discovery probability. Existing sponsor caps and terms stay intact.
create or replace function private.team_hq_sponsor_attraction_probability(
  p_team_id uuid,
  p_base_probability numeric
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select least(
    100::numeric,
    greatest(0::numeric, coalesce(p_base_probability, 0)) *
    (1 + greatest(0::numeric, coalesce((private.team_hq_effects_for_team(p_team_id)->>'sponsor_attraction_bonus_percent')::numeric, 0)) / 100)
  );
$function$;

revoke all on function private.team_hq_sponsor_attraction_probability(uuid, numeric) from public, anon, authenticated;

do $patch$
declare
  v_definition text;
  v_original text;
  v_replacement text;
begin
  v_definition := pg_get_functiondef('private.auto_generate_team_sponsorship_offers(uuid)'::regprocedure);
  v_original := 'random()<coalesce((v_probs->v_division->>s.tier_key)::numeric,0)/100';
  v_replacement := 'random()<private.team_hq_sponsor_attraction_probability(v_team.id,coalesce((v_probs->v_division->>s.tier_key)::numeric,0))/100';
  if position(v_original in v_definition) = 0 then
    raise exception 'AI Sponsor generator changed; review Team HQ sponsor integration.';
  end if;
  execute replace(v_definition, v_original, v_replacement);

  v_definition := pg_get_functiondef('public.generate_team_sponsorship_offers(uuid)'::regprocedure);
  v_original := 'random() < coalesce((v_probs->v_team.division_key->>s.tier_key)::numeric,0)/100';
  v_replacement := 'random() < private.team_hq_sponsor_attraction_probability(v_team.id,coalesce((v_probs->v_team.division_key->>s.tier_key)::numeric,0))/100';
  if position(v_original in v_definition) = 0 then
    raise exception 'Admin Sponsor generator changed; review Team HQ sponsor integration.';
  end if;
  execute replace(v_definition, v_original, v_replacement);
end;
$patch$;

-- Pit Crew cash discount now uses the same condition-scaled effect as the
-- authoritative HQ effect calculation. The frontend preview is synchronized separately.
do $patch$
declare
  v_definition text;
  v_original text;
  v_replacement text;
begin
  v_definition := pg_get_functiondef('public.member_upgrade_development_attribute(uuid,text,text,numeric,text)'::regprocedure);
  v_definition := replace(v_definition, 'v_pit_crew_level integer:=0;', 'v_pit_crew_level numeric:=0;');
  v_original := 'if p_scope=''team'' and p_attribute_key=''pit_stop_efficiency'' then
    select coalesce(level,0) into v_pit_crew_level
    from public.caleris_team_hq_facilities
    where team_id=v_member.team_id and facility_key=''pit_crew_training_center'';
    v_pit_crew_level:=least(8,greatest(0,coalesce(v_pit_crew_level,0)));
    if v_pit_crew_level>0 then
      v_cash_cost:=round(v_cash_cost*power(0.9::numeric,v_pit_crew_level),2);
    end if;
  end if;';
  v_replacement := 'if p_scope=''team'' and p_attribute_key=''pit_stop_efficiency'' then
    v_pit_crew_level:=least(8,greatest(0,coalesce((private.team_hq_effects_for_team(v_member.team_id)->>''pit_stop_efficiency_bonus'')::numeric,0)));
    if v_pit_crew_level>0 then
      v_cash_cost:=round(v_cash_cost*power(0.9::numeric,v_pit_crew_level),2);
    end if;
  end if;';
  if position(v_original in v_definition) = 0 then
    raise exception 'Development upgrade cash discount changed; review before applying HQ condition scaling.';
  end if;
  execute replace(v_definition, v_original, v_replacement);
end;
$patch$;

-- Read-only, team-scoped HQ Development bonuses for accurate client previews.
create or replace function public.member_get_team_hq_development_effects()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member public.members%rowtype;
  v_effects jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Login diperlukan.'; end if;
  select m.* into v_member
  from public.profiles p
  join public.members m on m.id = p.member_id
  where p.user_id = (select auth.uid());
  if not found then raise exception 'Member tidak ditemukan.'; end if;
  if v_member.team_id is null then return '{}'::jsonb; end if;
  v_effects := private.team_hq_effects_for_team(v_member.team_id);
  return jsonb_build_object(
    'research_efficiency_bonus_percent', coalesce((v_effects->>'research_efficiency_bonus_percent')::numeric, 0),
    'driver_development_efficiency_bonus_percent', coalesce((v_effects->>'driver_development_efficiency_bonus_percent')::numeric, 0),
    'pit_stop_efficiency_bonus', coalesce((v_effects->>'pit_stop_efficiency_bonus')::numeric, 0)
  );
end;
$function$;

revoke all on function public.member_get_team_hq_development_effects() from public, anon;
grant execute on function public.member_get_team_hq_development_effects() to authenticated;

-- Keep project completion safe if a facility reaches 0% condition during an
-- already-running project: preserve the project, but require maintenance at its
-- completed target level before its effects can return.
create or replace function private.complete_due_team_hq_projects()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project public.caleris_team_hq_projects%rowtype;
  v_count integer := 0;
begin
  for v_project in
    select *
    from public.caleris_team_hq_projects
    where status = 'in_progress' and completes_at <= now()
    order by completes_at, id
    for update skip locked
  loop
    update public.caleris_team_hq_facilities
    set level = v_project.target_level,
        asset_value = asset_value + v_project.cost,
        maintenance_restore_level = case
          when condition = 0
            and maintenance_restore_level = v_project.target_level - 1
            and level = v_project.target_level - 2
          then v_project.target_level
          else maintenance_restore_level
        end,
        updated_at = now()
    where team_id = v_project.team_id
      and facility_key = v_project.facility_key
      and (
        level = v_project.target_level - 1
        or (
          condition = 0
          and maintenance_restore_level = v_project.target_level - 1
          and level = v_project.target_level - 2
        )
      );
    if not found then
      raise warning 'Team HQ project % skipped: facility level changed unexpectedly.', v_project.id;
      continue;
    end if;
    update public.caleris_team_hq_projects
    set status = 'completed', completed_at = now()
    where id = v_project.id and status = 'in_progress';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- Prevent an upgrade from starting on a facility already degraded to a lower
-- level, or when its condition would reach zero before the configured build ends.
do $patch$
declare
  v_definition text;
  v_original text;
  v_replacement text;
begin
  v_definition := pg_get_functiondef('public.member_start_team_hq_project(text,text)'::regprocedure);
  v_original := 'if v_cost is null or v_cost<=0 or v_days is null or v_days<=0 then raise exception ''Harga atau durasi level berikutnya belum dikonfigurasi FIA.''; end if;';
  v_replacement := 'if v_cost is null or v_cost<=0 or v_days is null or v_days<=0 then raise exception ''Harga atau durasi level berikutnya belum dikonfigurasi FIA.''; end if;
  if v_facility.maintenance_restore_level is not null then raise exception ''Bayar maintenance sebelum memulai upgrade fasilitas yang terdegradasi.''; end if;
  if v_facility.condition <= v_days then raise exception ''Condition fasilitas terlalu rendah untuk durasi proyek ini. Bayar maintenance sebelum upgrade.''; end if;';
  if position(v_original in v_definition) = 0 then
    raise exception 'Team HQ project start function changed; review maintenance/upgrade safety gate.';
  end if;
  execute replace(v_definition, v_original, v_replacement);
end;
$patch$;

-- Real strategy-analysis detail is derived only from official published results.
-- Pit-stop and tyre strategy telemetry is explicitly not inferred or fabricated.
create or replace function public.team_owner_get_hq_analytics_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member public.members%rowtype;
  v_level integer;
  v_condition numeric;
  v_enabled boolean;
  v_window integer;
  v_depth integer;
  v_effects jsonb;
  v_metrics jsonb;
  v_strategy_rounds jsonb;
begin
  select m.* into v_member
  from public.profiles p
  join public.members m on m.id = p.member_id
  where p.user_id = (select auth.uid());
  if not found or v_member.role not in ('Owner','Principal') or v_member.team_id is null then
    raise exception 'Akses Team Owner diperlukan untuk Data Analytics Center.';
  end if;

  select f.level, f.condition, c.is_enabled
    into v_level, v_condition, v_enabled
  from public.caleris_team_hq_facilities f
  join public.caleris_team_hq_facility_configs c on c.facility_key = f.facility_key
  where f.team_id = v_member.team_id and f.facility_key = 'data_analytics_center';

  if coalesce(v_level, 0) = 0 or not coalesce(v_enabled, false) or coalesce(v_condition, 0) <= 0 then
    return jsonb_build_object('unlocked', false, 'message', 'Data Analytics Center harus dibangun dan dalam kondisi operasional untuk membuka laporan.');
  end if;

  v_effects := private.team_hq_effects_for_team(v_member.team_id);
  v_window := greatest(1, least(24, coalesce((v_effects->>'analytics_round_window')::integer, 1)));
  v_depth := greatest(0, least(8, coalesce((v_effects->>'strategy_analysis_depth')::integer, 0)));

  with recent_rounds as (
    select r.round_id, max(r.published_at) as published_at
    from public.caleris_race_results r
    join public.caleris_race_result_entries e on e.round_id = r.round_id
    where e.team_id = v_member.team_id and r.published_at is not null
    group by r.round_id
    order by max(r.published_at) desc
    limit v_window
  ),
  recent_entries as (
    select e.*, rr.published_at
    from public.caleris_race_result_entries e
    join recent_rounds rr on rr.round_id = e.round_id
    where e.team_id = v_member.team_id
  )
  select jsonb_build_object(
    'sample_rounds', count(distinct round_id),
    'sample_entries', count(*),
    'average_grid', round(avg(grid_position)::numeric, 2),
    'average_finish', round(avg(finishing_position)::numeric, 2),
    'positions_gained', round(avg(grid_position - finishing_position)::numeric, 2),
    'finish_rate_percent', round(100.0 * count(*) filter (where lower(coalesce(finish_status,'')) in ('finished','classified','completed')) / greatest(count(*),1), 2),
    'wins', count(*) filter (where finishing_position = 1),
    'fastest_laps', count(*) filter (where fastest_lap_ms is not null),
    'dnf_count', count(*) filter (where lower(coalesce(finish_status,'')) not in ('finished','classified','completed')),
    'average_gap_ms', round(avg(gap_ms)::numeric, 0)
  )
  into v_metrics
  from recent_entries;

  with recent_rounds as (
    select r.round_id, max(r.published_at) as published_at
    from public.caleris_race_results r
    join public.caleris_race_result_entries e on e.round_id = r.round_id
    where e.team_id = v_member.team_id and r.published_at is not null
    group by r.round_id
    order by max(r.published_at) desc
    limit v_window
  ),
  recent_entries as (
    select e.*, rr.published_at
    from public.caleris_race_result_entries e
    join recent_rounds rr on rr.round_id = e.round_id
    where e.team_id = v_member.team_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'round_id', analysis.round_id,
      'published_at', analysis.published_at,
      'sample_entries', analysis.sample_entries,
      'average_grid', analysis.average_grid,
      'average_finish', analysis.average_finish,
      'positions_gained', analysis.positions_gained,
      'finish_rate_percent', analysis.finish_rate_percent,
      'wins', analysis.wins,
      'fastest_laps', analysis.fastest_laps,
      'dnf_count', analysis.dnf_count
    ) order by analysis.published_at desc
  ), '[]'::jsonb)
  into v_strategy_rounds
  from (
    select
      round_id,
      max(published_at) as published_at,
      count(*) as sample_entries,
      round(avg(grid_position)::numeric, 2) as average_grid,
      round(avg(finishing_position)::numeric, 2) as average_finish,
      round(avg(grid_position - finishing_position)::numeric, 2) as positions_gained,
      round(100.0 * count(*) filter (where lower(coalesce(finish_status,'')) in ('finished','classified','completed')) / greatest(count(*),1), 2) as finish_rate_percent,
      count(*) filter (where finishing_position = 1) as wins,
      count(*) filter (where fastest_lap_ms is not null) as fastest_laps,
      count(*) filter (where lower(coalesce(finish_status,'')) not in ('finished','classified','completed')) as dnf_count
    from recent_entries
    group by round_id
    order by max(published_at) desc
    limit v_depth
  ) analysis;

  return jsonb_build_object(
    'unlocked', true,
    'facility_level', v_level,
    'condition', v_condition,
    'analysis_window', v_window,
    'metrics', coalesce(v_metrics, '{}'::jsonb),
    'strategy_analysis', jsonb_build_object(
      'depth', v_depth,
      'rounds', coalesce(v_strategy_rounds, '[]'::jsonb),
      'source', 'official_published_race_results',
      'pit_strategy_telemetry_available', false
    ),
    'effects', v_effects
  );
end;
$function$;

revoke all on function public.team_owner_get_hq_analytics_report() from public, anon;
grant execute on function public.team_owner_get_hq_analytics_report() to authenticated;

-- Immutable, season-scoped HQ audit events now distinguish facility creation and demolition.
alter table public.caleris_team_hq_audit_logs
  drop constraint if exists caleris_team_hq_audit_logs_event_type_check;
alter table public.caleris_team_hq_audit_logs
  add constraint caleris_team_hq_audit_logs_event_type_check
  check (event_type in ('facility_created','condition_decay','level_degraded','maintenance','project_started','project_completed','demolition'));

create unique index if not exists caleris_team_hq_demolition_idempotency_uidx
  on public.caleris_team_hq_audit_logs(team_id, (metadata->>'idempotency_key'))
  where event_type = 'demolition' and metadata ? 'idempotency_key';

create or replace function private.audit_team_hq_facility_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    insert into public.caleris_team_hq_audit_logs(
      team_id, facility_key, event_type, previous_level, new_level,
      previous_condition, new_condition, metadata
    ) values (
      new.team_id, new.facility_key, 'facility_created', null, new.level,
      null, new.condition, jsonb_build_object('source','facility_created')
    );
    return new;
  end if;

  if new.level < old.level and new.maintenance_restore_level is not null then
    v_event := 'level_degraded';
  elsif new.condition < old.condition then
    v_event := 'condition_decay';
  else
    return new;
  end if;

  insert into public.caleris_team_hq_audit_logs(
    team_id, facility_key, event_type, previous_level, new_level,
    previous_condition, new_condition, metadata
  ) values (
    new.team_id, new.facility_key, v_event, old.level, new.level,
    old.condition, new.condition,
    jsonb_build_object('source','system_lifecycle','restore_level',new.maintenance_restore_level)
  );
  return new;
end;
$function$;

-- Owner-only demolition: no refund, no project deletion, and asset value is removed.
create or replace function public.member_demolish_team_hq_facility(
  p_facility_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_member public.members%rowtype;
  v_facility public.caleris_team_hq_facilities%rowtype;
  v_existing public.caleris_team_hq_audit_logs%rowtype;
  v_asset_value numeric;
begin
  if v_user_id is null then raise exception 'Sesi login tidak ditemukan.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 180 then
    raise exception 'Kunci pembongkaran tidak valid.';
  end if;

  select m.* into v_member
  from public.profiles p
  join public.members m on m.id = p.member_id
  where p.user_id = v_user_id
  for update of m;

  if not found or v_member.role <> 'Owner' or v_member.team_id is null then
    raise exception 'Hanya Team Owner yang dapat membongkar fasilitas HQ.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-hq:' || v_member.team_id::text, 0)
  );

  select * into v_existing
  from public.caleris_team_hq_audit_logs
  where team_id = v_member.team_id
    and facility_key = p_facility_key
    and event_type = 'demolition'
    and metadata->>'idempotency_key' = p_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object('status','duplicate','facility_key',p_facility_key,'audit_id',v_existing.id);
  end if;

  if exists (
    select 1 from public.caleris_team_hq_projects
    where team_id = v_member.team_id
      and facility_key = p_facility_key
      and status in ('queued','in_progress')
  ) then
    raise exception 'Fasilitas tidak dapat dibongkar selama proyek upgrade masih berjalan.';
  end if;

  select * into v_facility
  from public.caleris_team_hq_facilities
  where team_id = v_member.team_id and facility_key = p_facility_key
  for update;
  if not found then raise exception 'Fasilitas tim tidak ditemukan.'; end if;
  if v_facility.level <= 0 and v_facility.maintenance_restore_level is null then
    raise exception 'Fasilitas belum dibangun.';
  end if;

  v_asset_value := coalesce(v_facility.asset_value, 0);

  update public.caleris_team_hq_facilities
  set level = 0,
      condition = 100,
      asset_value = 0,
      maintenance_restore_level = null,
      last_condition_decay_at = now(),
      updated_at = now()
  where id = v_facility.id;

  insert into public.caleris_team_hq_audit_logs(
    team_id, facility_key, event_type, previous_level, new_level,
    previous_condition, new_condition, amount, metadata, actor_id
  ) values (
    v_member.team_id, p_facility_key, 'demolition',
    v_facility.level, 0, v_facility.condition, 100, 0,
    jsonb_build_object(
      'idempotency_key',p_idempotency_key,
      'asset_value_removed',v_asset_value,
      'refund',0,
      'no_refund',true
    ),
    v_user_id
  );

  return jsonb_build_object(
    'status','demolished',
    'facility_key',p_facility_key,
    'level',0,
    'asset_value_removed',v_asset_value,
    'refund',0
  );
end;
$function$;

revoke all on function public.member_demolish_team_hq_facility(text,text) from public, anon;
grant execute on function public.member_demolish_team_hq_facility(text,text) to authenticated;
