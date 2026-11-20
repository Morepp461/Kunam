# Race Engine Phase 13 — Managed runtime fairness and timing projection

## Delivered

- Added a versioned, rebuildable timing projection derived only from committed simulation checkpoint and classification facts.
- Projection rows expose position, driver/team, completed lap, elapsed time, pit count, current segment, distance completed, and tyre state where present.
- Projection carries simulation clock, weather summary, active race-control flags, and the latest 20 event references.
- The Edge test service writes the projection after a successful checkpoint commit and seeds tick-zero projection on session creation.
- Admin detail reads now include the persisted projection; LIVE RACE displays the segment alongside the timing tower.
- Projection persistence is an upsert keyed by session, so retrying a committed checkpoint cannot create duplicate projection records.
- Background dispatch now orders active sessions by oldest update first. This prevents the same three long-running sessions from permanently occupying the first batch and starving later sessions.
- Added a partial queue index for active test sessions and a ten-session interleaved 25-driver simulation isolation test.

## Explicit limits

- This projection is a timing/read model, not full vehicle telemetry. Speed, throttle, braking, gear, and normalized circuit coordinates are not fabricated because the current simulation kernel does not yet expose measured values for them.
- The ten-session test validates deterministic in-process isolation, not managed-runtime/database throughput or the PRD's full concurrency gate.
- Migration `20261120150000` and Edge deployment are for `calerismasters-testing` only. No production schema, data, or function is changed.
- Official race activation remains disabled.
