do $$
declare v_definition text;
begin
 v_definition:=pg_get_functiondef('private.apply_fan_growth_for_round(uuid)'::regprocedure);
 v_definition:=replace(v_definition,
  'on conflict(round_id,entity_kind,team_id,member_id,region_key) do nothing',
  'on conflict do nothing');
 if position('on conflict do nothing' in v_definition)=0 then raise exception 'Could not patch fan growth idempotency safely.'; end if;
 execute v_definition;
end $$;
