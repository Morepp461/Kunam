-- Normalize the Development RPC's condition-scaled Pit Crew discount body
-- so Testing and Production expose the exact same function definition.
do $patch$
declare
  v_definition text;
  v_old_block text;
  v_new_block text;
begin
  v_definition := pg_get_functiondef('public.member_upgrade_development_attribute(uuid,text,text,numeric,text)'::regprocedure);
  v_definition := replace(v_definition, 'v_pit_crew_level integer:=0;', 'v_pit_crew_level numeric:=0;');

  v_old_block := $old1$if p_scope='team' and p_attribute_key='pit_stop_efficiency' then
    v_pit_crew_level:=least(8,greatest(0,coalesce((private.team_hq_effects_for_team(v_member.team_id)->>'pit_stop_efficiency_bonus')::numeric,0)));
    if v_pit_crew_level>0 then
      v_cash_cost:=round(v_cash_cost*power(0.9::numeric,v_pit_crew_level),2);
    end if;
  end if;$old1$;

  if position(v_old_block in v_definition) = 0 then
    v_old_block := $old2$if p_scope='team' and p_attribute_key='pit_stop_efficiency' then
  v_pit_crew_level:=least(8,greatest(0,coalesce((private.team_hq_effects_for_team(v_member.team_id)->>'pit_stop_efficiency_bonus')::numeric,0)));
  v_pit_crew_level:=least(8,greatest(0,coalesce(v_pit_crew_level,0)));
  if v_pit_crew_level>0 then v_cash_cost:=round(v_cash_cost*power(0.9::numeric,v_pit_crew_level),2); end if;
 end if;$old2$;
  end if;

  v_new_block := $new$if p_scope='team' and p_attribute_key='pit_stop_efficiency' then
    v_pit_crew_level:=least(8,greatest(0,coalesce((private.team_hq_effects_for_team(v_member.team_id)->>'pit_stop_efficiency_bonus')::numeric,0)));
    if v_pit_crew_level>0 then
      v_cash_cost:=round(v_cash_cost*power(0.9::numeric,v_pit_crew_level),2);
    end if;
  end if;$new$;

  if position(v_old_block in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_block, v_new_block);
  elsif position(v_new_block in v_definition) = 0 then
    raise exception 'Development RPC has an unknown Pit Crew discount body; refusing unsafe normalization.';
  end if;
  execute v_definition;
end;
$patch$;
