# Race Engine Phase 21 — Circuit Maker track boundaries and vertical profile

## Delivered
- Circuit Maker now has separate drawing modes for the circuit centerline and a measured track-limit boundary polygon.
- Boundary polygons use the existing normalized coordinate contract and the existing self-intersection/area validation.
- A polygon-based track-limit method requires a valid polygon tied to the same circuit ID and immutable geometry revision.
- Real circuits cannot pass official release readiness without a measured boundary polygon, source provenance, and independent fidelity review.
- Segment specifications now retain optional measured banking angle (degrees) and longitudinal gradient (percent).
- Empty banking/gradient inputs remain absent; the editor does not silently insert zero measurements.
- Boundary and banking/gradient values are part of the immutable circuit geometry JSON and therefore travel with the race-start snapshot.
- The Testing Edge geometry validator is synchronized from the canonical source module.
- Added unit coverage for valid/missing/self-intersecting boundaries, banking/gradient persistence, and real-circuit release gating.

## Database and compatibility
- No SQL schema migration is required: geometry is stored in the existing JSON geometry/revision payload.
- Existing geometry without banking, gradient, or a boundary polygon remains readable. Polygon validation is required only when the polygon method is selected; real-circuit official readiness is intentionally stricter.
- No Production database or Vercel environment changes.

## Limits
- The boundary polygon is measured input from the circuit source/operator, not an automatically inferred corridor around the centerline.
- Segment banking and gradient are stored as measurements but do not yet alter vehicle dynamics. A calibrated physics model and validated source data are required before they may affect lap time or grip.
- Track-limit observations remain evidence only; they do not automatically issue penalties.
- This phase does not establish real-world circuit fidelity by drawing alone.
