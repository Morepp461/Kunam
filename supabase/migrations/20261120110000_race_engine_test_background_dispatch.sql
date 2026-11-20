begin;

-- Test-only managed dispatcher. This migration is applied to caleris-masters-testing only.
create extension if not exists pg_net;

create or replace function public.race_engine_validate_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select decrypted_secret = p_token
      from vault.decrypted_secrets
      where name = 'race_engine_test_worker_token'
      limit 1
    ),
    false
  );
$$;

revoke all on function public.race_engine_validate_worker_token(text) from public, anon, authenticated;
grant execute on function public.race_engine_validate_worker_token(text) to service_role;

-- Supabase Vault stores the endpoint, publishable key and worker token outside source control.
-- The scheduled Edge Function only processes synthetic Race Engine test sessions.
select cron.schedule(
  'race-engine-test-background',
  '30 seconds',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'race_engine_test_project_url'
      ) || '/functions/v1/race-engine-test-service',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'race_engine_test_publishable_key'
        ),
        'x-race-worker-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'race_engine_test_worker_token'
        )
      ),
      body := '{"action":"background_tick"}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);

commit;
