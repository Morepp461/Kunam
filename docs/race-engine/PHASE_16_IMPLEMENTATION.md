# Race Engine Phase 16 — Circuit map position projection

## Delivered

- Timing projections now include the immutable normalized circuit layout from the race-start snapshot.
- Driver markers are interpolated along the reviewed layout polyline using completed circuit distance and track length.
- LIVE RACE renders the circuit outline and position markers from the persisted projection.
- Position interpolation is deterministic and remains tied to the immutable geometry snapshot used by the race.
- Added unit coverage for layout availability and normalized marker coordinates.

## Fidelity boundary

- Marker placement is approximate at segment granularity. The simulation currently advances one whole segment per tick and does not expose continuous within-segment position or GPS telemetry.
- The map does not claim official geographic accuracy or substitute for the circuit geometry release gate.
- No production circuit records, production database schema, or Vercel environment settings were changed by this phase.
