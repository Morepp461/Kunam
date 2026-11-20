-- Atomically ratify and apply a grid penalty before a synthetic race receives its first worker lease.
create or replace function public.race_engine_test_commit_grid_penalty_ratification(
  p_session_id uuid,
  p_created_by uuid,
  p_checkpoint jsonb,
  p_event jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_session public.race_engine_test_sessions%rowtype;
begin
  select * into v_session
  from public.race_engine_test_sessions
  where id = p_session_id and created_by = p_created_by
  for update;

  if not found then
    raise exception 'Race Engine test session not found';
  end if;
  if v_session.status <> 'queued' or v_session.tick <> 0
     or v_session.lease_owner is not null or v_session.lease_expires_at is not null then
    raise exception 'Grid penalties can only be committed before the first worker claim';
  end if;
  if p_event->>'action' <> 'penalty_ratified' then
    raise exception 'Only a penalty-ratification event can commit a grid change';
  end if;

  insert into public.race_engine_test_control_events (
    session_id, sequence, action, actor_id, actor_role, occurred_at,
    simulation_time_ms, reason, payload, evidence, supersedes_event_id,
    requires_admin_ratification
  ) values (
    p_session_id,
    (p_event->>'sequence')::integer,
    p_event->>'action',
    (p_event->>'actorId')::uuid,
    p_event->>'actorRole',
    (p_event->>'occurredAt')::timestamptz,
    (p_event->>'simulationTimeMs')::bigint,
    p_event->>'reason',
    p_event,
    p_event->'evidence',
    null,
    coalesce((p_event->>'requiresAdminRatification')::boolean, false)
  );

  update public.race_engine_test_sessions
  set checkpoint = p_checkpoint, updated_at = now()
  where id = p_session_id;

  return jsonb_build_object('ok', true, 'session_id', p_session_id, 'grid_applied', true);
end;
$function$;

revoke all on function public.race_engine_test_commit_grid_penalty_ratification(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.race_engine_test_commit_grid_penalty_ratification(uuid,uuid,jsonb,jsonb) to service_role;
