begin;

do $owner_reputation_round_scoring_backfill$
declare v_owner record;
begin
  for v_owner in
    select distinct owner_member_id
    from public.caleris_team_owner_tenures
  loop
    perform private.caleris_refresh_owner_reputation(
      v_owner.owner_member_id,
      'owner_reputation_round_scoring_backfill'
    );
  end loop;
end;
$owner_reputation_round_scoring_backfill$;

commit;
