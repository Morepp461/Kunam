# Race Engine Phase 2 Implementation Notes

## Scope in this branch

This branch adds versioned, explicit-profile domain models for:
- weather input validation, immutable weather model snapshots, water accumulation, drying, track wetness, and grip evolution;
- pit-stop candidate evaluation using caller-supplied time-loss, pace, degradation, risk, wetness-compatibility, pit-window, wear, and stop-limit data;
- deterministic incident sampling from a race seed and stable race/driver/lap/segment identity;
- race-control flag and duration resolution from an explicit profile;
- deterministic 1,000-seed incident distribution and Mistake Rate direction tests.

## Calibration and safety boundaries

No production coefficient set is introduced. The caller must provide every physical, strategy, probability, and race-control coefficient. Weather samples and pit candidate estimates are inputs, not generated assumptions. Mistake Rate is validated as higher-is-riskier for incident probability. Maintenance-cost eligibility is limited to mechanical failure, engine failure, and crash. The models emit facts only; they do not post charges, prizes, wallet movements, or economy ledger entries.

## Integration status

These are domain model foundations, not a production-ready race lifecycle integration. The existing RaceSimulation currently advances segment timing and tyre state, but does not yet own global weather timing, pit execution/tyre replacement, incident event ordering, race-control neutralization, or the corresponding checkpoint state. Integrating those systems requires a coordinated simulation/checkpoint schema change and deterministic recovery tests. This branch deliberately does not pretend that standalone model tests prove full race integration.

## Acceptance gates still required before Phase 2 can be marked complete

1. Integrate weather state into simulation timing and tyre environment, including dynamic transitions and recovery.
2. Integrate pit decision and pit execution, including pit lane time, compound replacement, and stop history.
3. Integrate incidents into event ordering, time loss/retirement state, and race-control flags.
4. Add DRS/ERS, overtaking/defending, reliability, HQ, and calibrated attribute effects to the active performance model.
5. Run full 20-driver/10-team and multi-race Monte Carlo/sensitivity validation using reviewed calibration profiles.
6. Validate checkpoint recovery across every new state and verify no duplicate events or economy settlement facts.
7. Only then approve Phase 2 completion and begin service integration.

No database migration is required by these standalone domain modules. Persistent race storage remains in Phase 3 after the existing Testing/Production migration ledger drift is reconciled.