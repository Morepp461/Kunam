-- Exposed configuration tables are Admin-only; remove inherited non-row privileges from anon/PUBLIC.
revoke all privileges on table public.caleris_configurations from anon, public;
revoke all privileges on table public.caleris_configuration_revisions from anon, public;
