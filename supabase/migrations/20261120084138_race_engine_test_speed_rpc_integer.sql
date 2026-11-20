begin;
drop function if exists public.race_engine_set_test_speed(uuid,uuid,smallint,uuid);
create or replace function public.race_engine_set_test_speed(
  p_session_id uuid,
  p_actor_id uuid,
  p_speed_multiplier integer,
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
  if p_speed_multiplier is null or p_speed_multiplier not in (1,5,10,15) then
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
revoke all on function public.race_engine_set_test_speed(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.race_engine_set_test_speed(uuid,uuid,integer,uuid) to service_role;
commit;
