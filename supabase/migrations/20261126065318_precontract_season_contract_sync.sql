-- A Pre-contract term is inserted after its first target Season already exists.
-- Seed that first Season's economy contract directly; the existing season-insert trigger
-- remains responsible for later seasons in the multi-season term.

begin;
do $$
declare
  v_definition text;
  v_old text:= $old$on conflict(member_id,first_season_id) do nothing;$old$;
  v_new text:= $new$on conflict(member_id,first_season_id) do nothing;

    insert into public.economy_driver_contracts(
      season_id,team_id,member_id,annual_salary,status,created_by
    ) values(
      v_next_season.id,n.destination_team_id,n.driver_member_id,n.annual_salary,'active',null
    )
    on conflict(season_id,member_id) do update set
      team_id=excluded.team_id,annual_salary=excluded.annual_salary,
      status='active',created_by=excluded.created_by;$new$;
begin
  v_definition:=pg_get_functiondef('private.process_driver_precontracts()'::regprocedure);
  if position(v_old in v_definition)=0 then
    raise exception 'Pre-contract term insertion anchor not found; aborting safe patch.';
  end if;
  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$$;
commit;
