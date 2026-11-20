-- Keep the synthetic test worker behind the Supabase Edge gateway JWT check.
-- The function still validates its separate Vault-backed worker token before processing.
do $migration$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'race-engine-test-background'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
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
          'Authorization', 'Bearer ' || (
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
end
$migration$;
