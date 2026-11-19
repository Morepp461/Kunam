-- Pit Crew Training Center: compound cash discount for Team Pit Stop Efficiency only.
-- Remove the previous direct attribute bonus. The facility now affects only cash pricing.
update public.caleris_team_hq_facility_configs
set effects_by_level = coalesce((
  select jsonb_object_agg(level_key, level_effect - 'pit_stop_efficiency_bonus')
  from jsonb_each(effects_by_level) as levels(level_key, level_effect)
), '{}'::jsonb),
updated_at = now()
where facility_key = 'pit_crew_training_center';

update public.caleris_team_development_parts
set hq_bonus = 0,
    updated_at = now()
where part_key = 'pit_stop_efficiency'
  and coalesce(hq_bonus, 0) <> 0;

do $migration$
declare
  v_definition text;
  v_decl_old text := 'v_idempotency text; v_tx jsonb; v_license_tier text; v_team_division text; v_now timestamptz:=now();';
  v_decl_new text := 'v_idempotency text; v_tx jsonb; v_license_tier text; v_team_division text; v_pit_crew_level integer:=0; v_now timestamptz:=now();';
  v_cash_old text := 'v_cash_cost:=round(v_delta*v_cash_rate,2);';
  v_cash_new text := $replacement$
  v_cash_cost:=round(v_delta*v_cash_rate,2);
  if p_scope='team' and p_attribute_key='pit_stop_efficiency' then
    select coalesce(level,0) into v_pit_crew_level
    from public.caleris_team_hq_facilities
    where team_id=v_member.team_id and facility_key='pit_crew_training_center';
    v_pit_crew_level:=least(8,greatest(0,coalesce(v_pit_crew_level,0)));
    if v_pit_crew_level>0 then
      v_cash_cost:=round(v_cash_cost*power(0.9::numeric,v_pit_crew_level),2);
    end if;
  end if;
  $replacement$;
begin
  v_definition:=pg_get_functiondef('public.member_upgrade_development_attribute(uuid,text,text,numeric,text)'::regprocedure);
  if position(v_decl_old in v_definition)=0 then
    raise exception 'Development upgrade declaration changed; review before applying Pit Crew discount.';
  end if;
  if position(v_cash_old in v_definition)=0 then
    raise exception 'Development cash calculation changed; review before applying Pit Crew discount.';
  end if;
  v_definition:=replace(v_definition,v_decl_old,v_decl_new);
  v_definition:=replace(v_definition,v_cash_old,v_cash_new);
  execute v_definition;
end;
$migration$;
