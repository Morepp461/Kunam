begin;

-- Synthetic Race Engine Lab only. Do not apply to production.
create table if not exists public.race_engine_test_projections (
  session_id uuid primary key references public.race_engine_test_sessions(id) on delete cascade,
  schema_version integer not null check (schema_version = 1),
  engine_version text not null,
  tick integer not null check (tick >= 0),
  status text not null check (status in ('running','completed')),
  simulation_time_ms bigint not null check (simulation_time_ms >= 0),
  projection jsonb not null check (jsonb_typeof(projection) = 'object'),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists race_engine_test_sessions_fair_queue_idx
  on public.race_engine_test_sessions (status, updated_at asc, created_at asc)
  where status in ('queued','running');

alter table public.race_engine_test_projections enable row level security;
revoke all on public.race_engine_test_projections from public, anon, authenticated;
grant all on public.race_engine_test_projections to service_role;

comment on table public.race_engine_test_projections is
  'Latest rebuildable timing/read projection for synthetic Race Engine Lab sessions only. Never official results or telemetry truth.';

commit;
