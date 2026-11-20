begin;

-- Test-only durable audit records for the Race Engine Lab.
-- No official Caleris race or Economy Engine tables are modified.
create table if not exists public.race_engine_test_control_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.race_engine_test_sessions(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  action text not null check (action in (
    'flag_deployed','flag_cleared','race_suspended','race_resumed',
    'restart_authorized','penalty_issued','penalty_ratified','penalty_reversed'
  )),
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('admin','fia')),
  occurred_at timestamptz not null,
  simulation_time_ms bigint not null check (simulation_time_ms >= 0),
  reason text not null check (length(btrim(reason)) > 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  supersedes_event_id uuid references public.race_engine_test_control_events(id),
  requires_admin_ratification boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);

create table if not exists public.race_engine_test_penalties (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.race_engine_test_sessions(id) on delete cascade,
  driver_id text not null check (length(btrim(driver_id)) > 0),
  penalty_type text not null check (penalty_type in (
    'warning','time_5s','time_10s','drive_through','stop_go',
    'grid_penalty','time_penalty','disqualification','race_ban'
  )),
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  reason text not null check (length(btrim(reason)) > 0),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  issued_by uuid not null,
  issued_at timestamptz not null,
  ratified_by_admin_id uuid,
  ratified_at timestamptz,
  reversed_by_event_id uuid references public.race_engine_test_control_events(id),
  created_at timestamptz not null default now(),
  check (
    (penalty_type in ('time_5s','time_10s','drive_through','stop_go','time_penalty') and duration_ms is not null)
    or (penalty_type not in ('time_5s','time_10s','drive_through','stop_go','time_penalty') and duration_ms is null)
  ),
  check ((ratified_by_admin_id is null) = (ratified_at is null))
);

create index if not exists race_engine_test_control_events_session_sequence_idx
  on public.race_engine_test_control_events (session_id, sequence);
create index if not exists race_engine_test_penalties_session_driver_idx
  on public.race_engine_test_penalties (session_id, driver_id, issued_at);

alter table public.race_engine_test_control_events enable row level security;
alter table public.race_engine_test_penalties enable row level security;
revoke all on public.race_engine_test_control_events from public, anon, authenticated;
revoke all on public.race_engine_test_penalties from public, anon, authenticated;
grant all on public.race_engine_test_control_events to service_role;
grant all on public.race_engine_test_penalties to service_role;

commit;
