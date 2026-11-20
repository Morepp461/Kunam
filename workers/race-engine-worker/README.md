# Race Engine Test Worker

This is the persistent worker process for the isolated Race Engine test service. It polls only `race_engine_test_sessions` in the **caleris-masters-testing** Supabase project. It never writes to production race results, wallets, rewards, or economy ledgers.

## Runtime

- Deno 2.x
- Supabase JS pinned to 2.57.4
- Bounded batch: 10 segment ticks per lease
- Lease: 60 seconds; expired leases can be reclaimed after a worker restart
- Checkpoints and events are committed through atomic database RPCs
- Multiple processes can run concurrently; row leases prevent two workers from advancing the same session

## Environment

Set these on the worker host. Use credentials from the testing Supabase project only.

```sh
SUPABASE_URL=https://vxwvhyyvoipjwucbrvlu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<testing-project-service-role-key>
```

Never put the service-role key in Vercel client environment variables or browser code.

## Run

```sh
deno run --allow-env --allow-net workers/race-engine-worker/main.ts
```

The Admin web page can also advance a test session in bounded batches. Both paths use the same lease and checkpoint protocol, so manual test actions and a background worker cannot safely advance the same session at once.

## Deployment status

The worker source is committed, but no VPS has been provisioned or connected. The web-based test runner uses the deployed Supabase Edge Function in bounded invocations until the VPS runtime is provisioned and benchmarked. Do not treat this test worker as production race infrastructure.
