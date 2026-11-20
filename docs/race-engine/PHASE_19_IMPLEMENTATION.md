# Race Engine Phase 19 — Circuit Maker and versioned circuit snapshots

## Delivered
- Added a visual centerline editor to FIA Circuit Pool Input. Admin/FIA can draw a closed path, undo points, clear a drawing, and preview the path.
- Added a specification editor for sector/segment distances, track width, corner type/radius, grip, speed/traction/braking demand, elevation change, DRS/ERS availability, and overtake/defence opportunity.
- Added circuit-wide specifications for direction, surface, elevation-data availability, pit-lane measurements, DRS-zone distances/detection points, and track-limit method/source notes.
- Geometry is validated against the existing versioned Race Engine circuit contract. Missing measurements remain invalid rather than being silently fabricated.
- Circuit geometry is stored separately from the image and imported GeoJSON draft. Each save creates an immutable, append-only revision row and updates the current revision pointer.
- The Circuit Pool view exposes the latest geometry and revision. Directory cards and details can display Circuit Maker geometry without a GeoJSON import.
- Race Engine Lab can list eligible circuits and create a Testing session from a saved Circuit Maker revision. The exact geometry is embedded in the immutable race-start snapshot; the session also stores the circuit ID, revision number, and name snapshot.
- Real circuits remain blocked from test selection and official release until source provenance and fidelity review satisfy the release validator. Fictional circuits can be used for isolated Testing sessions after geometry validation.
- Added unit coverage for Circuit Maker geometry, missing measurements, pit-lane/DRS specifications, and the real-circuit provenance gate.

## Database scope
- Migration `20261120170000_race_engine_test_circuit_maker_revisions.sql` is Testing-only. It adds current geometry/revision metadata, an append-only revision table, a caller-authorized invoker RPC, and test-session circuit references.
- It updates the existing Circuit Pool view to expose the new fields without changing the existing view's security mode.
- Do not apply this Testing-only migration to Production.

## Explicit limitations
- Circuit Maker's hand-drawn path is a design draft, not evidence of real-world circuit fidelity.
- The current track-limit specification supports measured segment widths or an explicitly unverified state; polygon boundaries and automatic adjudication are not yet implemented.
- Pit-lane and DRS measurements are retained in the geometry snapshot. They are not yet a fully calibrated pit-lane movement or DRS activation model in the simulation kernel.
- The current geometry editor uses a single editable segment list grouped by three sectors; it does not yet provide CAD-grade point dragging, curve fitting, banking surfaces, or full pit-lane polygon authoring.
- A valid fictional circuit geometry does not satisfy real-world physics calibration or the 10-simultaneous-race managed-runtime benchmark.
- Official race activation remains disabled pending all PRD release gates and explicit owner acceptance.
