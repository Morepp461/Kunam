# Race Engine Phase 10 — Division capacity contract

## Delivered

- Added the PRD-confirmed hard cap of 25 entrants to race-start snapshot validation.
- The cap is enforced before immutable snapshot creation, so oversized race inputs fail closed before simulation initialization.
- Added an exported constant for use by adapters and UI validation.
- Added a boundary test confirming 25 is accepted by the contract and 26 is rejected.

## Boundaries

- The 10-simultaneous-race target remains a benchmark target, not a hard-coded capacity claim. Existing worker behavior must be load-tested before concurrency is raised.
- No new schema, database migration, production data, or environment change is required.
