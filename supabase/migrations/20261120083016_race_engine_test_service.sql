begin;

create table if not exists public.race_engine_test_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  seed bigint not null check (seed between 0 and 4294967295),
  driver_count integer not null check (driver_count between 2 and 20),
  team_count integer not null check (team_count between 1 and 10 and team_count <= driver_count),
  total_laps integer not null check (total_laps between 1 and 10),
  engine_version text not null,
  snapshot jsonb not null,
  checkpoint jsonb not null,
  classification jsonb,
  tick integer not null default 0 check (tick >= 0),
  total_ticks integer not null check (total_ticks > 0),
  lease_owner uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists race_engine_test_sessions_owner_created_idx
  on public.race_engine_test_sessions (created_by, created_at desc);
create index if not exists race_engine_test_sessions_queue_idx
  on public.race_engine_test_sessions (status, lease_expires_at, created_at);

create table if not exists public.race_engine_test_checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.race_engine_test_sessions(id) on delete cascade,
  tick integer not null check (tick >= 0),
  engine_version text not null,
  checkpoint jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, tick)
);

create table if not exists public.race_engine_test_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.race_engine_test_sessions(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  event_type text not null,
  driver_id text,
  lap_number integer not null default 0 check (lap_number >= 0),
  simulation_time_ms bigint not null check (simulation_time_ms >= 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);

create index if not exists race_engine_test_events_session_sequence_idx
  on public.race_engine_test_events (session_id, sequence);

create table if not exists public.race_engine_test_commands (
  id uuid primary key,
  session_id uuid not null references public.race_engine_test_sessions(id) on delete cascade,
  actor_id uuid not null,
  command_type text not null,
  idempotency_key text not null,
  status text not null check (status in ('completed','rejected')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key)
);

alter table public.race_engine_test_sessions enable row level security;
alter table public.race_engine_test_checkpoints enable row level security;
alter table public.race_engine_test_events enable row level security;
alter table public.race_engine_test_commands enable row level security;

revoke all on public.race_engine_test_sessions from public, anon, authenticated;
revoke all on public.race_engine_test_checkpoints from public, anon, authenticated;
revoke all on public.race_engine_test_events from public, anon, authenticated;
revoke all on public.race_engine_test_commands from public, anon, authenticated;
grant all on public.race_engine_test_sessions to service_role;
grant all on public.race_engine_test_checkpoints to service_role;
grant all on public.race_engine_test_events to service_role;
grant all on public.race_engine_test_commands to service_role;

create or replace function public.race_engine_claim_test_session(
  p_session_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.race_engine_test_sessions%rowtype;
begin
  if p_session_id is null or p_worker_id is null then
    raise exception 'Session and worker identifiers are required';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception 'Lease duration must be between 5 and 300 seconds';
  end if;

  select * into v_session
  from public.race_engine_test_sessions
  where id = p_session_id
  for update;

  if not found or v_session.status not in ('queued','running') then
    return null;
  end if;
  if v_session.lease_expires_at is not null
     and v_session.lease_expires_at > now()
     and v_session.lease_owner is distinct from p_worker_id then
    return null;
  end if;

  update public.race_engine_test_sessions
  set status = 'running',
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'id', v_session.id,
    'tick', v_session.tick,
    'total_ticks', v_session.total_ticks,
    'checkpoint', v_session.checkpoint,
    'status', v_session.status
  );
end;
$$;

create or replace function public.race_engine_commit_test_step(
  p_session_id uuid,
  p_worker_id uuid,
  p_expected_tick integer,
  p_checkpoint jsonb,
  p_events jsonb,
  p_classification jsonb,
  p_status text,
  p_command_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.race_engine_test_sessions%rowtype;
  v_existing public.race_engine_test_commands%rowtype;
  v_event jsonb;
  v_new_tick integer;
  v_result jsonb;
begin
  if p_session_id is null or p_worker_id is null or p_command_id is null or p_actor_id is null then
    raise exception 'Session, worker, command, and actor identifiers are required';
  end if;
  if p_status not in ('running','completed') then
    raise exception 'Unsupported simulation status';
  end if;
  if jsonb_typeof(p_checkpoint) is distinct from 'object'
     or jsonb_typeof(coalesce(p_events,'[]'::jsonb)) is distinct from 'array' then
    raise exception 'Checkpoint or event payload is invalid';
  end if;

  select * into v_existing
  from public.race_engine_test_commands
  where id = p_command_id;
  if found then
    return v_existing.result || jsonb_build_object('duplicate', true);
  end if;

  select * into v_session
  from public.race_engine_test_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'Race Engine test session not found'; end if;
  if v_session.lease_owner is distinct from p_worker_id
     or v_session.lease_expires_at is null
     or v_session.lease_expires_at <= now() then
    raise exception 'Worker lease expired or belongs to another worker';
  end if;
  if v_session.tick <> p_expected_tick then
    return jsonb_build_object('ok', false, 'conflict', true, 'tick', v_session.tick);
  end if;

  v_new_tick := (p_checkpoint->>'tick')::integer;
  if v_new_tick < v_session.tick or v_new_tick > v_session.total_ticks then
    raise exception 'Checkpoint tick is outside the session range';
  end if;

  update public.race_engine_test_sessions
  set checkpoint = p_checkpoint,
      tick = v_new_tick,
      status = p_status,
      classification = p_classification,
      lease_owner = null,
      lease_expires_at = null,
      heartbeat_at = now(),
      updated_at = now(),
      completed_at = case when p_status = 'completed' then now() else null end,
      last_error = null
  where id = p_session_id;

  insert into public.race_engine_test_checkpoints(session_id, tick, engine_version, checkpoint)
  values (p_session_id, v_new_tick, p_checkpoint->>'engineVersion', p_checkpoint)
  on conflict (session_id, tick) do update
    set checkpoint = excluded.checkpoint, engine_version = excluded.engine_version;

  for v_event in select value from jsonb_array_elements(coalesce(p_events,'[]'::jsonb))
  loop
    insert into public.race_engine_test_events(
      session_id, sequence, event_type, driver_id, lap_number, simulation_time_ms, payload
    ) values (
      p_session_id,
      (v_event->>'sequence')::integer,
      v_event->>'type',
      nullif(v_event->>'driverId',''),
      coalesce((v_event->>'lapNumber')::integer,0),
      coalesce((v_event->>'simulationTimeMs')::bigint,0),
      v_event
    )
    on conflict (session_id, sequence) do nothing;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'tick', v_new_tick,
    'status', p_status,
    'events_added', jsonb_array_length(coalesce(p_events,'[]'::jsonb))
  );
  insert into public.race_engine_test_commands(
    id, session_id, actor_id, command_type, idempotency_key, status, result
  ) values (
    p_command_id, p_session_id, p_actor_id, 'advance', p_command_id::text, 'completed', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.race_engine_claim_test_session(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.race_engine_commit_test_step(uuid,uuid,integer,jsonb,jsonb,jsonb,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.race_engine_claim_test_session(uuid,uuid,integer) to service_role;
grant execute on function public.race_engine_commit_test_step(uuid,uuid,integer,jsonb,jsonb,jsonb,text,uuid,uuid) to service_role;

commit;
