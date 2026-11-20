# Race Engine Phase 5 — Attribute semantics and calibration validation

## Delivered

- Physics calibration validation now enforces the owner-approved distinction between Aggression and Mistake Rate.
- Aggression must map to a non-zero attack or defence duel influence and cannot be used as a mistake-probability modifier.
- Mistake Rate must have a positive risk-probability influence; it is not accepted as a generic substitute for Aggression.
- The Admin Race Engine Lab synthetic profile and Monte Carlo profile now model Aggression through duel channels. These coefficients remain synthetic test data only.
- Calibration tests verify profile rejection for missing/conflated Aggression effects, and verify that Aggression changes the model only in eligible attack/defence contexts.
- The 1,000-seed Race Pace, Mistake Rate, and Reliability sensitivity tests remain in place and use deterministic inputs.
- Canonical modules and the Supabase Edge Function copy are synchronized.

## Scope and safety

- No production calibration coefficients were introduced.
- No real-race activation, official results, wallet, maintenance, or settlement behavior was enabled.
- No new dependency or database schema change is required.
- Supabase Testing and Production configuration/data were not modified by this phase.

## Verified configuration blocker retained

The Testing and Production databases both contain an empty `effects_by_level` map for every Pit Crew Training Center level. The PRD requires each Team HQ facility level to have a measurable simulation effect or a defined capability unlock, but it does not specify the Pit Crew Training Center effect or its numeric values. This phase deliberately does not invent one. A later owner-approved/configured effect and calibrated mapping are still required before a non-zero Pit Crew Training Center level can pass the HQ readiness gate.

## Remaining gates

- Complete reviewed, versioned production physics calibration and statistical review.
- Define and validate the remaining attribute semantics from owner-approved formulas rather than inferred mappings.
- Complete Pit Crew Training Center effect configuration and calibration.
- Complete circuit visual/specification editor, track-limit detection, strategy authority, full telemetry/broadcast, concurrency/recovery, and production integration.
- Keep official activation disabled until all PRD release gates and owner acceptance pass.
