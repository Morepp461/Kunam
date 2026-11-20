# Race Engine Phase 4 — Presentation and Replay

## Scope

Connect persisted race information to the operator-facing experience without making the browser a simulation runtime. Phase 4 presentation surfaces are consumers of stored projections and event history.

## Delivered in this branch

- Added a replay timeline to Admin → LIVE RACE.
- Replay reads the persisted event stream through an authenticated API action scoped to the session owner.
- Event history is paginated in ascending sequence order (up to 500 rows per request), so the UI does not mistake the existing 150-event activity preview for the full replay.
- Added independent 1x/2x/4x/8x playback controls, play/pause, restart, and seek.
- Playback changes only the viewer's local event cursor. It never changes simulation state, race speed, checkpoints, or persisted events.
- Replay UI is responsive for narrow Android viewports and does not require the race simulation to be running.

## Safety boundaries

- All sessions and events remain synthetic test data in `caleris-masters-testing`.
- Existing Admin authentication and ownership checks remain enforced server-side.
- No service-role credential is exposed to the browser.
- No official race result, wallet, reward, maintenance, or economy settlement is written.
- The replay currently presents the persisted event timeline. Full broadcast rendering, interpolated circuit positions, and telemetry graphs remain gated on validated persisted telemetry/projection contracts.

## Background execution decision

The owner has rejected VPS as a production dependency. The target is Supabase Cron plus bounded Supabase Edge Function invocations, with durable Postgres leases/checkpoints/events. This branch records the architecture change and implements persisted replay presentation. It does not claim the managed dispatcher is deployed: the Testing project currently has `pg_cron` and Vault available, but `pg_net` was not installed at audit time. Machine authentication and Cron invocation must be configured securely before background automation can be activated.

## QA required before merge

- TypeScript check and production build.
- Unit and integration tests for replay pagination, ordering, session ownership, and seek/playback state.
- Android viewport QA.
- Testing DB verification that replay reads every persisted event without changing session state.
- CI and Vercel preview deployment must pass. Production deployment remains behind release approval.
