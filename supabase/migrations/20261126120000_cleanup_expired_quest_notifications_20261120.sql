-- Historical one-time cleanup of expired quest notifications associated with 20 November 2026.
-- The cleanup and its idempotency tombstones were already applied and verified in both Testing and Production.
-- This is intentionally a no-op when replayed in a newly provisioned environment: historical notification cleanup
-- is an operational data action and must not delete unrelated future notifications during a database reset.
do $$
begin
  raise notice 'Historical quest notification cleanup for 2026-11-20 was already applied to the original environments.';
end $$;
