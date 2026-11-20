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

The active `RaceSimulation` lifecycle now owns the following Phase 2 systems:
- shared weather clock, water/grip evolution, tyre-environment coupling, and weather checkpoint recovery (checkpoint schema v4);
- calibrated pit decisions, pit-lane time loss, compound replacement, stop count/history, and pit-model checkpoint identity (schema v5);
- deterministic incidents, time loss, configurable retirements, maintenance eligibility facts, race-control flags, timed flag expiry, red-flag suspension/resume, and recovery of active flags/clock (schema v6);
- calibrated active performance effects for DRS, ERS, tyre wear, wet grip, deterministic consistency, overtaking, defending, and HQ effects;
- race-control pace multipliers supplied by the selected race-control profile;
- legacy checkpoint restore compatibility for schemas v3, v4, and v5 where the corresponding injected models are supplied.

The simulation emits facts only. It does not write wallet, maintenance, prize, or economy ledger transactions. The host game's Economy Engine remains the sole settlement owner.


- Strategy Quality and Pit Stop Efficiency now feed the pit decision cost and actual pit-lane time through explicit calibration channels. The model exposes the per-entrant adjustments; missing channels remain zero and no default coefficients are invented.
- Sensitivity validation now includes 1,000-seed direction checks for Race Pace and Reliability in addition to Mistake Rate. These use synthetic test-only coefficients and do not constitute approved production calibration.

## Validation gates and remaining release decisions

1. Full-grid Monte Carlo validation runs 1,000 seeds at 20 drivers/10 teams. A separate interleaved-session test verifies that two races remain isolated and replay-equivalent.
2. Weather, pit, incident, red-flag suspension, active-flag expiry, and checkpoint recovery each have deterministic tests.
3. Calibration profiles remain caller-supplied and versioned. Synthetic test coefficients are not production presets. A reviewed calibration dataset and approval of production coefficients are still required before enabling a real season.
4. Penalty adjudication and restart rules remain to be implemented from an approved ruleset; no penalty or restart behavior is invented.
5. The engine still needs a benchmarked worker/service integration, persistence, telemetry, and multi-worker load/recovery tests in Phase 3.

No database migration is required by the current in-memory simulation lifecycle changes. Persistent race storage remains in Phase 3 after the existing Testing/Production migration ledger drift is reconciled.

No database migration is required by these standalone domain modules. Persistent race storage remains in Phase 3 after the existing Testing/Production migration ledger drift is reconciled.

## Active performance and race-battle integration

The calibrated performance model now consumes the optional circuit capability flags
`ersAvailable`, `overtakingOpportunity`, and `defendingOpportunity`. Missing flags
remain disabled for backward compatibility. No circuit capability is inferred from
track names or generated geometry.

The versioned calibration profile includes `battleDetectionGapMs`, which controls
when adjacent entrants are considered in an attack/defence interaction. The model
uses only caller-supplied coefficients:
- `ers_efficiency_per_point` applies only where ERS is available.
- `overtake_advantage_per_point` and `defense_advantage_per_point` apply only in
  configured segment opportunities and within the calibrated gap.
- `tyre_degradation_per_point` scales current tyre wear.
- `wet_grip_per_point` scales the current shared track wetness.
- `consistency_variance_ms_per_point` and `morale_consistency_per_point` scale
  the deterministic consistency sample supplied by the simulation.

These are coefficient contracts, not production presets. The repository still needs
an approved calibration dataset and benchmark evidence before a production profile
can be selected. An absent segment capability flag or absent model coefficient must
not silently create a gameplay effect.


## Immutable car setup integration

The race-start entrant snapshot now optionally carries a versioned car setup containing aero setting, suspension setting, front brake-balance percentage, and front/rear tyre pressures. The values are immutable for the race and are persisted with the checkpoint input snapshot.

A calibration profile may define explicit per-setting bounds, baselines, and influence coefficients. The engine rejects a setup if its calibration is absent, incomplete, or out of range. Configured setup influences feed the segment pace, low/high-speed, traction, braking-demand, and tyre-degradation channels. Circuit segments may carry an optional normalized braking-demand value; legacy circuits remain compatible and default to no braking-specific setup effect.

No physical ranges or coefficients are embedded as production defaults. Test coverage uses synthetic calibration values only. A reviewed production calibration profile and setup validation against approved team/car constraints remain release gates.


## Team HQ effect snapshots and release blockers

Race-start entrant snapshots can now carry a versioned HQ facility snapshot: division, capture time, each facility level, the configured maximum level, the exact configuration revision timestamp, and the effects applied. Race-relevant effects are resolved only from `effects_by_level`; the engine does not infer bonuses from a facility name or level. Effects must have explicit calibration mappings before a simulation can use them.

The current Testing database configuration was inspected on 2026-11-20:
- Engineering Department supplies `reliability_bonus`.
- R&D Center supplies `aero_power_bonus`.
- Simulator Facility supplies `race_pace_bonus` and `qualifying_pace_bonus`; only the race effect is used by the race simulation.
- Pit Crew Training Center currently has empty `effects_by_level` entries at every configured level. A team with this facility above level 0 is reported as unresolved and cannot pass the HQ snapshot validation gate.

Configured facility maxima currently read as level 8 for Premio and level 6 for Zwei. These are read from the database configuration and are not hardcoded as the authority. The Pit Crew Training Center race effect and its calibrated influence remain an explicit release blocker; no effect has been invented.
