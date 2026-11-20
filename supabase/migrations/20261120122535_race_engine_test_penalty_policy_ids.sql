-- Stable policy IDs link pure race-control decisions to durable test penalty rows.
alter table public.race_engine_test_penalties add column if not exists policy_penalty_id text;
update public.race_engine_test_penalties
set policy_penalty_id = 'legacy-' || id::text
where policy_penalty_id is null;
alter table public.race_engine_test_penalties alter column policy_penalty_id set not null;
create unique index if not exists race_engine_test_penalties_policy_id_idx
  on public.race_engine_test_penalties (session_id, policy_penalty_id);
