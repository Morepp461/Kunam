begin;

-- Reconcile previously published official classifications so existing results
-- receive the same one-time XP as results published after this engine shipped.
do $backfill_official_results$
declare
  v_round record;
begin
  for v_round in
    select distinct rr.round_id
    from public.caleris_race_results rr
    join public.license_rounds r on r.id=rr.round_id
    where rr.published_at is not null
      and lower(coalesce(r.race_lifecycle_status,r.status,'')) in ('completed','closed')
    order by rr.round_id
  loop
    perform private.caleris_reconcile_race_xp(v_round.round_id);
  end loop;
end;
$backfill_official_results$;

commit;
