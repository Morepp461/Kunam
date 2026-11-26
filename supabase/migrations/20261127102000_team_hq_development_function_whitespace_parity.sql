-- Normalize formatting-only drift in the Development RPC across environments.
do $patch$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.member_upgrade_development_attribute(uuid,text,text,numeric,text)'::regprocedure);
  v_definition := replace(v_definition, E'\n v_cash_cost:=round(v_delta*v_cash_rate,2);', E'\n  v_cash_cost:=round(v_delta*v_cash_rate,2);');
  v_definition := replace(v_definition, E'\n if p_scope=''team'' and p_attribute_key=''pit_stop_efficiency'' then', E'\n  if p_scope=''team'' and p_attribute_key=''pit_stop_efficiency'' then');
  v_definition := replace(v_definition, E'\n \n  if p_scope=''driver''', E'\n  \n  if p_scope=''driver''');
  execute v_definition;
end;
$patch$;
