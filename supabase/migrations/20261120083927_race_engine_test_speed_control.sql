begin;

alter table public.race_engine_test_sessions
  add column if not exists speed_multiplier smallint not null default 1;
alter table public.race_engine_test_sessions
  drop constraint if exists race_engine_test_sessions_speed_multiplier_check,
  add constraint race_engine_test_sessions_speed_multiplier_check
    check (speed_multiplier in (1,5,10,15));

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
    'status', v_session.status,
    'speed_multiplier', v_session.speed_multiplier
  );
end;
$$;

create or replace function public.race_engine_set_test_speed(
  p_session_id uuid,
  p_actor_id uuid,
  p_speed_multiplier smallint,
  p_command_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.race_engine_test_sessions%rowtype;
  v_existing public.race_engine_test_commands%rowtype;
  v_result jsonb;
begin
  if p_session_id is null or p_actor_id is null or p_command_id is null then
    raise exception 'Session, actor, and command identifiers are required';
  end if;
  if p_speed_multiplier not in (1,5,10,15) then
    raise exception 'Speed multiplier must be 1, 5, 10, or 15';
  end if;

  select * into v_existing
  from public.race_engine_test_commands
  where id = p_command_id;
  if found then
    return v_existing.result || jsonb_build_object('duplicate', true);
  end if;

  select * into v_session
  from public.race_engine_test_sessions
  where id = p_session_id and created_by = p_actor_id
  for update;
  if not found then raise exception 'Race Engine test session not found'; end if;
  if v_session.status not in ('queued','running') then
    raise exception 'Speed cannot be changed after the simulation is completed';
  end if;

  update public.race_engine_test_sessions
  set speed_multiplier = p_speed_multiplier, updated_at = now()
  where id = p_session_id;

  v_result := jsonb_build_object(
    'ok', true,
    'command', 'speed_changed',
    'session_id', p_session_id,
    'speed_multiplier', p_speed_multiplier
  );
  insert into public.race_engine_test_commands(
    id, session_id, actor_id, command_type, idempotency_key, status, result
  ) values (
    p_command_id, p_session_id, p_actor_id, 'set_speed',
    p_command_id::text, 'completed', v_result
  );
  return v_result;
end;
$$;

revoke all on function public.race_engine_claim_test_session(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.race_engine_set_test_speed(uuid,uuid,smallint,uuid) from public, anon, authenticated;
grant execute on function public.race_engine_claim_test_session(uuid,uuid,integer) to service_role;
grant execute on function public.race_engine_set_test_speed(uuid,uuid,smallint,uuid) to service_role;

commit;
