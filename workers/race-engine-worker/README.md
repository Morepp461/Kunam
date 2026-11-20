# Optional Race Engine Worker Reference

This Deno process is retained for local profiling and fault-injection experiments only. **It is not a required runtime and must not be treated as production infrastructure.** CALERIS RACE ENGINE must continue without a VPS.

## Target production runtime

- Supabase Postgres owns schedules, durable queue state, leases, checkpoints, append-only events, and final results.
- Supabase Cron periodically dispatches due work.
- Supabase Edge Functions execute bounded simulation batches and exit before platform CPU/wall-clock limits.
- Every batch claims a lease, restores the last committed checkpoint, advances a bounded number of segments, and commits checkpoint plus event sequence atomically.
- Retry and lease reclamation resume from the last valid checkpoint. Idempotency prevents duplicate events/results.
- The browser and LIVE RACE page never run the authoritative race simulation.

## Optional local runner

Deno 2.x with Supabase JS pinned to 2.57.4.

Required environment:
```sh
SUPABASE_URL=<testing-project-url>
SUPABASE_SERVICE_ROLE_KEY=<testing-project-service-role-key>
```

Run:
```sh
deno run --allow-env --allow-net workers/race-engine-worker/main.ts
```

Use Testing credentials only. Never put service-role keys in Vercel client variables, browser code, mobile bundles, or logs.

## Deployment status

This runner is not deployed. The VPS route is intentionally retired as a production dependency. The managed Supabase Cron/Edge Function dispatcher remains a release gate and must be validated in Testing before official race scheduling is enabled.
