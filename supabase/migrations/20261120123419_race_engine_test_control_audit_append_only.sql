-- Keep race-control audit ledgers append-only, including for the service worker.
revoke update, delete, truncate on table public.race_engine_test_control_events from service_role;
revoke update, delete, truncate on table public.race_engine_test_penalties from service_role;
grant select, insert on table public.race_engine_test_control_events to service_role;
grant select, insert on table public.race_engine_test_penalties to service_role;
