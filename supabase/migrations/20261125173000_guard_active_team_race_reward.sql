begin;
create unique index if not exists caleris_one_active_team_race_reward_per_round
on public.caleris_race_cash_rewards(round_id)
where recipient_type='team' and reversed_at is null;

do $$
declare v_def text; v_old text;
begin
  v_def:=pg_get_functiondef('private.sync_official_race_cash_and_maintenance(uuid)'::regprocedure);
  v_old:=$old$where round_id=p_round_id and recipient_type='team' for update;$old$;
  if position(v_old in v_def)=0 then raise exception 'Team race reward lookup changed; aborting safely.'; end if;
  v_def:=replace(v_def,v_old,$new$where round_id=p_round_id and recipient_type='team' and reversed_at is null for update;$new$);
  execute v_def;
end $$;
commit;
