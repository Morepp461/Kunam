-- Expand the synthetic Race Engine Lab to the confirmed 25-driver division target.
-- Testing project only; this does not enable official race persistence.
alter table public.race_engine_test_sessions drop constraint if exists race_engine_test_sessions_driver_count_check;
alter table public.race_engine_test_sessions add constraint race_engine_test_sessions_driver_count_check check (driver_count between 2 and 25) not valid;
alter table public.race_engine_test_sessions validate constraint race_engine_test_sessions_driver_count_check;
