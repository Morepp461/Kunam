# Race Engine Phase 20 — DRS zone runtime mapping

## Delivered
- Circuit Maker DRS zones now map onto measured segment-distance intervals when the geometry definition is built.
- A segment is marked DRS-available when its measured distance interval overlaps a configured DRS zone; manually enabled segment DRS flags remain supported.
- The mapping uses cumulative measured segment distances and does not infer DRS zones or add unmeasured track data.
- Added regression assertions for a DRS zone crossing a segment boundary.

## Limits
- DRS activation still depends on the existing Race Engine eligibility/availability logic; this change only supplies the zone-to-segment availability map.
- DRS detection-point gap enforcement and full activation logic still require integration with race-position snapshots and scenario tests.
