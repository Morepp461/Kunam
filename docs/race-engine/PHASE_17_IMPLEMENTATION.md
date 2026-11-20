# Race Engine Phase 17 — 24-attribute sensitivity audit

## Delivered

- Replaced the synthetic Race Engine Lab's blanket default pace coefficient with explicit test-only influence mappings for all 24 stable driver and car/team attribute IDs.
- Added sensitivity coverage proving each attribute changes at least one measurable calibration influence channel.
- Added regression checks keeping Aggression attack/defence influence separate from Mistake Rate risk.
- Added direction checks for Reliability, driver/team tyre management, and Car Tyre Wear.

## Calibration boundary

- These coefficients remain synthetic test fixtures and are not approved production physics calibration.
- The test validates mapping coverage and influence direction, not real-world lap-time fidelity. Production coefficients still require empirical calibration, sensitivity analysis, and statistical review under the PRD release gates.
- No production data, Supabase schema, or Vercel environment changes.
