-- Recalculate existing team reputation rows once so current HQ levels are reflected immediately.
update public.caleris_team_reputation
set metrics=metrics,calculated_at=now();
