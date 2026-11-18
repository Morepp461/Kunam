-- Trigger functions are invoked by PostgreSQL, not by direct client RPC calls.
revoke all on function public.enforce_team_hq_project_limit() from public, anon, authenticated;