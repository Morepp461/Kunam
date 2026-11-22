# Race Engine Phase 23 — Segment-level circuit replay

## Delivered
- Added a deterministic replay projection rebuilt from persisted segment-completion events and the immutable race-start circuit snapshot.
- Replay cursor changes reconstruct each driver's last committed segment, lap, distance, map coordinate, and relative order without consulting the latest live checkpoint state.
- Circuit geometry references are validated against the exact snapshot; unknown drivers, unknown segments, invalid timestamps, non-monotonic progress, and out-of-order event sequences fail closed.
- LIVE RACE now renders a circuit map and ranked driver list for the selected replay event.
- The UI labels the view as segment-level replay. It does not claim continuous GPS position or fabricate throttle, braking, gear, or other unavailable telemetry.
- Replay playback speed remains a local viewer preference and does not issue race-worker commands.

## Compatibility and data scope
- No new package or dependency.
- No database schema, migration, fixture, or production data changes.
- No Supabase Edge Function copy is needed because the replay projection is a browser-side read model.
- Existing event history and immutable race-start snapshots remain the source of truth.

## Validation
- Added unit coverage for cursor reconstruction, classification order, deterministic output, unknown segment rejection, and event-sequence validation.
- Required checks: TypeScript, Vitest, production build, GitHub Actions CI, and Android viewport review.

## Explicit limitation
The map marker is placed at the end of the last committed segment for each driver. It is not interpolated inside a segment and is not official GPS telemetry. Continuous movement requires a validated intra-segment position producer and a versioned telemetry contract.
