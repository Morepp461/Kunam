-- Preserve original contract duration and focus terms throughout every negotiation round.
do $$
declare v_definition text;
begin
 v_definition:=pg_get_functiondef('public.owner_respond_sponsorship_offer(uuid,text,numeric,jsonb)'::regprocedure);
 v_definition:=replace(v_definition,
  'values(v_offer.id,''member'',v_member.id,p_amount,coalesce(p_terms,''{}''::jsonb));',
  'values(v_offer.id,''member'',v_member.id,p_amount,coalesce(v_offer.terms,''{}''::jsonb)||coalesce(p_terms,''{}''::jsonb));');
 if position('coalesce(v_offer.terms' in v_definition)=0 then raise exception 'Could not patch owner negotiation terms safely.'; end if;
 execute v_definition;

 v_definition:=pg_get_functiondef('public.sponsor_engine_respond(uuid)'::regprocedure);
 v_definition:=replace(v_definition,
  'coalesce(nullif(v_last.terms->>''duration_seasons'','''')::integer,1)',
  'coalesce(nullif(v_last.terms->>''duration_seasons'','''')::integer,nullif(v_offer.terms->>''duration_seasons'','''')::integer,v_sponsor.default_duration_seasons,1)');
 if position('v_sponsor.default_duration_seasons' in v_definition)=0 then raise exception 'Could not patch sponsor duration fallback safely.'; end if;
 execute v_definition;
end $$;
