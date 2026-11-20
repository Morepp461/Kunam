# Race Engine Phase 3 — Service Integration

**Implementation status:** Test-service integration deployed; production worker rollout remains gated by infrastructure and migration-ledger reconciliation.

## Delivered in this phase branch

- Dedicated test-only persistence in `caleris-masters-testing`: sessions, checkpoints, event stream, and idempotent commands.
- RLS enabled on all test tables. Browser roles have no table privileges; only the server-side service role can read/write test data.
- Atomic database functions for worker leases and checkpoint/event commits.
- Server-authorized 1x/5x/10x/15x speed commands. Speed affects simulation clock progression/batch cadence only, not physics or attributes, and every change is persisted in the control-command audit log.
- Admin-authenticated Supabase Edge Function. It validates the user's JWT against the production Auth project and verifies the `site_admins` row before accessing test data.
- Admin Race Engine Lab replaces the static mock page at `/admin/live-race`. It creates synthetic races, advances the simulation, displays classification/tyres/weather/events, and validates checkpoint restoration.
- Synthetic test profiles exercise the 24-attribute calibration interface, tyres, weather, pit strategy, Strategy Quality, Pit Stop Efficiency, incidents, and race-control flags. They are explicitly test-only and must never be selected as production calibration.
- Deno worker process with bounded batches, leases, and automatic checkpoint recovery after lease expiry.
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

Migration `20261120083016_race_engine_test_service` is applied to the testing project only. The production database was not changed and does not need a migration for this test-only feature.

The repository and existing Testing/Production Supabase migration histories already contain timestamp/name divergence from earlier work. This branch does not rewrite or repair historical migration records. Full reconciliation remains a release gate before production race persistence is enabled.

## Remaining release gates

- Provision and benchmark the dedicated VPS before starting the persistent worker. The worker source is committed, but no VPS has been provisioned or deployed. The web test page currently advances sessions through bounded Edge Function invocations.
- Reconcile the pre-existing Testing/Production migration-ledger drift without rewriting history or resetting either database.
- Run real multi-worker load/recovery tests against the provisioned worker host and verify two concurrent sessions remain isolated under process restarts.
- Approve a production calibration dataset and coefficients. Synthetic profiles are not production presets.
- Approve penalty adjudication and restart rules before implementing those behaviors.
- Complete production security review and staged rollout before enabling official races.

Phase 3's test-service contract and web test harness are available for validation, but the engine is not approved for official race scheduling or production settlement yet.
