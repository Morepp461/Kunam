begin;

create or replace function private.caleris_owner_reputation_round_standing_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_team_id uuid;
begin
  if tg_op='DELETE' then
    select coalesce(old.team_id_snapshot,(
      select re.team_id from public.caleris_race_result_entries re
      where re.round_id=old.round_id and re.member_id=old.member_id
    )) into v_team_id;
  else
    select coalesce(new.team_id_snapshot,(
      select re.team_id from public.caleris_race_result_entries re
      where re.round_id=new.round_id and re.member_id=new.member_id
    )) into v_team_id;
  end if;
  perform private.caleris_refresh_owner_reputation_for_team(v_team_id,'round_standing_'||lower(tg_op));
  if tg_op='UPDATE' then
    select coalesce(old.team_id_snapshot,(
      select re.team_id from public.caleris_race_result_entries re
      where re.round_id=old.round_id and re.member_id=old.member_id
    )) into v_team_id;
    if v_team_id is not null then
      perform private.caleris_refresh_owner_reputation_for_team(v_team_id,'round_standing_previous_team');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function private.caleris_owner_reputation_round_standing_event() from public,anon,authenticated;

commit;
