-- Extend test-only penalty persistence with explicit grid-position penalties.
alter table public.race_engine_test_penalties add column if not exists grid_positions integer;
alter table public.race_engine_test_penalties add constraint race_engine_test_penalties_grid_positions_check
  check (
    (penalty_type = 'grid_penalty' and grid_positions between 1 and 20)
    or (penalty_type <> 'grid_penalty' and grid_positions is null)
  ) not valid;
alter table public.race_engine_test_penalties validate constraint race_engine_test_penalties_grid_positions_check;
