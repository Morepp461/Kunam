# Race Engine Phase 7 — Geometry-based track-limit evidence

## Delivered

- Added a versioned track-limit polygon contract using the same normalized coordinate space as the existing circuit layout model.
- Validates circuit/revision identity, supported coordinate system, finite normalized points, polygon area, adjacent duplicate points, and self-intersection.
- Evaluates a telemetry position against the explicit polygon using point-in-polygon geometry.
- Treats positions exactly on the boundary as inside; no tolerance or penalty threshold is invented.
- Produces a deterministic, auditable `track_limit_observation` with race, driver, timestamp, simulation time, lap, sector, segment, circuit revision, position, and geometry evidence.
- The evaluator records geometry evidence only. It does not issue a penalty, infer repeated-infringement thresholds, or adjudicate rules.
- Adds unit tests for inside/boundary/outside positions, deterministic evidence, invalid polygons, and immutable output.
- Includes the module in the canonical Edge sync manifest and synchronized the Deno-compatible Edge modules.

## Boundaries

- The evaluator consumes an explicit reviewed polygon. It does not derive track boundaries from a centerline or guessed track width.
- This helper is not yet wired to a live position producer or persisted telemetry stream. The telemetry contract now carries normalized track coordinates for that later integration.
- Real-circuit polygons still require source provenance, licensing, geometry verification, and circuit revision review.
- No DB migration or production/testing data changes are required for this pure domain module.
