-- Restrict sensitive SECURITY DEFINER RPCs to the JWT-verifying economy gateway.
-- The economy-workflows Edge Function validates auth.getUser(jwt), derives actor_id
-- from that verified user, and invokes these RPCs with the server-only service role.
-- Direct anon/authenticated execution would let callers spoof p_actor_id.

revoke all privileges on function public.member_upgrade_development_attribute(uuid, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.member_upgrade_development_attribute(uuid, text, text, numeric)
  to service_role;

revoke all privileges on function public.member_team_cash_loan_preview(uuid)
  from public, anon, authenticated;
grant execute on function public.member_team_cash_loan_preview(uuid)
  to service_role;

revoke all privileges on function public.member_apply_team_cash_loan(uuid, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.member_apply_team_cash_loan(uuid, numeric, integer)
  to service_role;

-- These SECURITY DEFINER functions are invoked only by database triggers.
-- They must never be exposed as PostgREST RPC endpoints.
revoke all privileges on function public.rls_auto_enable()
  from public, anon, authenticated;
revoke all privileges on function public.seed_driver_development_attributes()
  from public, anon, authenticated;
