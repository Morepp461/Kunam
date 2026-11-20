-- Enforce fixed durations for the named time penalties in the test audit ledger.
alter table public.race_engine_test_penalties add constraint race_engine_test_penalties_fixed_time_values_check
  check (
    (penalty_type <> 'time_5s' or duration_ms = 5000)
    and (penalty_type <> 'time_10s' or duration_ms = 10000)
  ) not valid;
alter table public.race_engine_test_penalties validate constraint race_engine_test_penalties_fixed_time_values_check;
