-- Align Free Agent recruitment authorization with the approved Team Owner-only rule.
begin;
do $$
declare
  v_definition text;
  v_old text:= $old$if not found or v_actor.role not in ('Owner','Principal') or v_actor.team_id is null then
  raise exception 'Hanya Team Owner/Principal yang dapat mengajukan kontrak Free Agent.';$old$;
  v_new text:= $new$if not found or v_actor.role<>'Owner' or v_actor.team_id is null then
  raise exception 'Hanya Team Owner yang dapat mengajukan kontrak Free Agent.';$new$;
begin
  v_definition:=pg_get_functiondef(
    'public.member_start_free_agent_contract_negotiation(uuid,numeric,text)'::regprocedure
  );
  if position(v_old in v_definition)=0 then
    raise exception 'Free Agent authorization anchor not found; aborting safe patch.';
  end if;
  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$$;
commit;
