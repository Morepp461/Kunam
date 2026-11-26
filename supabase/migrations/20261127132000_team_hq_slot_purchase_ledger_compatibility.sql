do $patch$
declare d text;
begin
 d:=pg_get_functiondef('public.member_purchase_team_hq_project_slot(text)'::regprocedure);
 d:=replace(d,'''team_hq_project_slot_purchase''','''team_hq_upgrade''');
 if position('team_hq_project_slot_purchase' in d)>0 then raise exception 'Shop purchase ledger event normalization incomplete.'; end if;
 execute d;
end;$patch$;