# Race Engine Phase 3 — Service Integration

**Implementation status:** Test-service integration deployed to Supabase Testing. The VPS worker is no longer the required runtime architecture; the project owner has selected a managed, VPS-independent background execution model.

## Delivered in this phase branch

- Dedicated test-only persistence in `caleris-masters-testing`: sessions, checkpoints, event stream, and idempotent commands.
- RLS enabled on all test tables. Browser roles have no table privileges; only the server-side service role can read/write test data.
- Atomic database functions for worker leases and checkpoint/event commits.
- Server-authorized 1x/5x/10x/15x speed commands. Speed affects simulation clock progression/batch cadence only, not physics or attributes, and every change is persisted in the control-command audit log.
- Admin-authenticated Supabase Edge Function. It validates the user's JWT against the production Auth project and verifies the `site_admins` row before accessing test data.
- Admin Race Engine Lab at `/admin/live-race`. It creates synthetic races, advances the simulation, displays classification/tyres/weather/events, and validates checkpoint restoration.
- Synthetic test profiles exercise the 24-attribute calibration interface, tyres, weather, pit strategy, Strategy Quality, Pit Stop Efficiency, incidents, and race-control flags. They are explicitly test-only and must never be selected as production calibration.
- Deno worker process retained as an optional reference runner, with bounded batches, leases, and automatic checkpoint recovery after lease expiry.
- A sync script keeps the Edge/Deno-compatible module copies aligned with the canonical engine modules.

## Web test procedure

1. Sign in to CALERIS MASTERS with an Admin account.
2. Open **Admin → LIVE RACE** (`/admin/live-race`).
3. Create a test session. Defaults are 20 AI drivers, 10 teams, 5 laps, and a fixed seed.
4. Use the 1x/5x/10x/15x selector, **Advance** for incremental testing, or **Run to completion** for a full synthetic race.
5. Inspect classification, tyre wear, wetness/grip, pit stops, incidents, flags, and persisted event history.
6. Use **Verify recovery** to restore the last persisted checkpoint and validate the engine state.
7. Create another session with the same seed to compare deterministic behavior within each session; race IDs remain unique.

All records are written to the testing project only. The service does not write official Caleris race results, wallet entries, rewards, maintenance charges, or settlement transactions.

## Database scope

Migration `20261120083016_race_engine_test_service` and its speed-control follow-ups are applied to the testing project only. The production database was not changed and does not need a migration for this test-only feature.

The repository and existing Testing/Production Supabase migration histories already contain timestamp/name divergence from earlier work. This branch does not rewrite or repair historical migration records. Full reconciliation remains a release gate before production race persistence is enabled.

## Updated runtime decision: no VPS dependency

The VPS-based scheduler/worker design in the original PRD is superseded by the owner's explicit requirement: a VPS must not be required for a race to start, continue, finish, or produce replay data.

Target runtime:
- Supabase Postgres remains the durable source of truth for schedule, queue, leases, checkpoints, append-only events, and final classification.
- Supabase Cron schedules short, recurring dispatches from the database.
- Supabase Edge Functions claim bounded work, advance a limited number of simulation segments, atomically commit events/checkpoints, and exit. They must never hold a multi-hour request open.
- Expired leases are reclaimable. Retries are idempotent. The browser and LIVE RACE page are read/operator clients only; closing them cannot stop a scheduled race.
- Replay reads the persisted event timeline and remains available after the simulation worker or LIVE RACE page stops.
- The VPS worker source is optional for local profiling only. It is not a production dependency and is not part of the availability path.

Supabase Edge Functions have finite CPU and wall-clock quotas, so this model must use small bounded batches and benchmarked work per invocation. A Supabase project/database outage can still delay processing; no architecture using that same database can guarantee progress during a database outage. Once Supabase recovers, queued work must resume from the last committed checkpoint.

## Remaining release gates

- Implement and deploy the managed Cron → Edge Function dispatcher in Testing, with its machine-auth secret stored securely (Vault/Function secrets), never in frontend code.
- Verify that the Testing project has the required `pg_net` extension enabled and confirm Cron invocation results.
- Run browser-closed background progression, forced function termination, lease expiry/reclaim, duplicate dispatch, and replay-after-worker-stop tests.
- Benchmark bounded batch CPU/time, queue throughput, event write volume, and two simultaneous sessions. Do not claim a concurrency target before measurement.
- Reconcile the pre-existing Testing/Production migration-ledger drift without rewriting history or resetting either database.
- Approve a production calibration dataset and coefficients. Synthetic profiles are not production presets.
- Approve penalty adjudication and restart rules before implementing those behaviors.
- Complete production security review and staged rollout before enabling official races.

The test-service contract and web test harness are available. Official race scheduling, managed background dispatch, and production settlement are not yet approved or enabled.
