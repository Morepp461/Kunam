# Race Engine Phase 6 — Telemetry contract foundation

## Delivered

- Added a versioned telemetry sample contract for race and driver identity, recorded wall-clock timestamp, simulation timestamp, lap, sector, segment, speed, throttle, braking, gear, tyre compound/condition, ERS deployment, DRS state, race position, and physical track distance.
- Race classification position and physical track distance are represented separately to avoid overloading the ambiguous word "position".
- Added validation for identity, timestamps, non-negative timing/speed/distance, percentage bounds, tyre compound, gear, lap/sector, and race position.
- Added immutable sample construction, including a frozen tyre-condition snapshot.
- Added unit coverage for valid samples, invalid values, unsupported compounds, and immutability.
- Added the telemetry module to the canonical Edge sync manifest and synchronized its Deno-compatible Edge copy.

## Boundaries

- This phase defines and validates the contract only. It does not fabricate throttle, braking, gear, speed, or track-position values from the current simulation.
- No telemetry rows are persisted, no sampling frequency is selected, and no public realtime endpoint or broadcast UI is enabled.
- Sampling frequency, retention granularity, storage volume, and realtime projection policy remain benchmark decisions in the PRD.
- No database migration or production/testing data change is required for this contract-only phase.
