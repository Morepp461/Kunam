# CALERIS RACE ENGINE
## Product Requirements Document

**Status:** Draft baseline for architecture and prototype  
**Initial host:** Caleris Masters  
**Product scope:** Reusable multi-game motorsport simulation engine  
**Repository:** `Morepp461/Kunam` monorepo  
**Development data:** Dummy data in Supabase testing only. No production race data for prototype.

## 1. Product vision

Build a reusable motorsport simulation engine that can serve Caleris Masters and other games. The engine owns simulation, timing, telemetry, race events, replay, and recovery. Each host game owns its own accounts, progression, economy, licensing, and game-specific rules.

The engine must support multiple concurrent races, run independently from a browser session, and expose stable API contracts for the current web app and a future mobile app sharing the same backend and database.

## 2. Goals and non-goals

**Goals**
- Hybrid simulation at lap, sector, and segment level.
- Multiple simultaneous sessions, including Premio and Zwei.
- Configurable driver/team scale.
- Mandatory deterministic seed and versioned simulation configuration.
- Race duration derived from simulated lap progression and configured total laps, not a fixed 90-minute timer.
- Live speed controls: 1x, 5x, 10x, 15x for authorized Admin/FIA operators.
- Independent replay playback controls.
- Real and fictional circuit support, tyre/weather/strategy models, race events, classification, checkpoints, and recovery.
- Future mobile client uses the same API and database.

**Non-goals for initial prototype**
- Replacing Caleris Economy Engine, license engine, sponsor engine, or wallet ledger.
- Manual race start by FIA. Scheduled races start automatically.
- Hosting the public website on the race VPS.
- Public spectator access before release acceptance.
- Direct wallet settlement inside the simulation worker.

## 3. Confirmed requirements from the 60 answers

| Domain | Locked requirement |
|---|---|
| Reuse | Engine can be integrated into other games |
| Simulation | Hybrid model |
| Capacity | Flexible driver/team count |
| Concurrency | Several races at once |
| Divisions | Premio and Zwei can run together |
| Simulation detail | Lap, sector, and segment layers |
| Timing | Actual race duration depends on simulated lap time × race distance |
| Live speed | Admin and FIA can choose 1x / 5x / 10x / 15x |
| Replay | Viewer chooses playback speed independently |
| Determinism | Required |
| Physics | Advanced target, calibrated through tests |
| Attributes | Driver and car attributes remain separate |
| Weather | Fixed or dynamic setting before race; dynamic default |
| Circuit editor | Visual editor plus specification editor |
| Real circuit | Layout must match source reference and remain editable |
| Fictional circuit | Free design, with validation |
| Race control | Automated race procedures with configurable operator controls |
| Maintenance | Only mechanical failure, engine failure, and crash create maintenance cost |
| UI | Viewers can select their preferred presentation mode |
| Retention | Keep race data through the end of off-season |
| Recovery | Resume from last valid checkpoint |
| Runtime | VPS runs scheduler and persistent workers, not website |
| Database | Existing Supabase environment, testing data only during development |
| Mobile | Future mobile app shares backend/database |
| Repo | Adapt current monorepo; no duplicate app structure |
| VPS budget | Target ceiling Rp100,000/month |
| Test data | Dummy data belongs in testing DB only |

## 4. Simulation clock and race lifecycle

The authoritative simulation clock advances according to the selected live multiplier:
- 1x = one simulation second per wall-clock second.
- 5x = five simulation seconds per wall-clock second.
- 10x = ten simulation seconds per wall-clock second.
- 15x = fifteen simulation seconds per wall-clock second.

The multiplier changes clock progression only, not the physics model or driver/car attributes. Every speed change must be authorized server-side and written to the race event log. Replay speed is a separate client playback setting.

Race completion is based on the configured distance and actual simulated lap progression. Lap time changes dynamically with car/driver performance, circuit segment, tyres, weather, strategy, incidents, and race control. The engine records wall-clock timestamps and simulation-clock timestamps separately.

A race starts automatically when its configured schedule is due. FIA/Admin do not need to keep a browser open and cannot manually force a race start through the ordinary race UI.

## 5. Driver, car, and Team HQ models

### Driver attributes currently documented
1. Race Pace
2. Qualifying Pace
3. Experience
4. Aggression
5. Defensive Strength
6. Overtake Skill
7. Mistake Rate (higher means riskier)
8. Tyre Management

### Car/team attributes currently documented
1. Race Pace
2. Qualifying Pace
3. Engine Power
4. Aero Power
5. Low Speed Corners
6. High Speed Corners
7. Traction
8. Mechanical Grip
9. Team Tyre Management
10. Strategy Quality
11. Team Morale
12. Reliability
13. Car Tyre Wear
14. Pit Stop Efficiency
15. DRS Efficiency
16. ERS Efficiency

**Baseline resmi: 24 atribut.** Race Engine v1 menggunakan tepat 8 Driver Attributes dan 16 Car/Team Attributes yang tercantum di atas. Angka 32 tidak lagi menjadi target atau asumsi. Daftar 24 atribut ini menjadi baseline kontrak awal, setelah dicocokkan dengan definisi aktual repository/database pada fase audit.

Team HQ facility levels 1–8 must have measurable effects on simulation performance or unlocks. Race-start input snapshots freeze driver, car, and facility effects for that session. Mid-race upgrades cannot retroactively modify an active race.

### Attribute schema evolution
The initial engine contract contains exactly 24 attributes. The data model must remain extensible so attributes may be added, renamed, redefined, deprecated, or disabled in future versions without destructive schema changes. Attribute definitions must use stable identifiers independent of display labels and include at least: key/ID, display name, entity scope (driver or car/team), data type, unit/scale, valid range, direction/meaning, default or migration behavior, effective engine version, and status. Changes to an attribute's meaning, scale, or calculation are versioned semantic changes, not simple label edits.

Every race stores an immutable, versioned attribute/config snapshot and the engine/ruleset version used at race start. Existing race snapshots and replays must retain their original definitions and interpretation. New/changed attributes apply only to races created under the compatible newer configuration. Database migrations must be additive/backward-compatible where possible; do not delete or reinterpret historical values. Deprecation precedes removal, with compatibility mapping and tests. Any future attribute change requires a new feature branch, migration review where needed, testing-DB validation, deterministic replay compatibility tests, QA/CI, and an explicit rollout plan.

## 6. Circuit and environment

Circuit schema must support centerline geometry, track width, straights, corners/radius/direction, elevation, gradient, banking, sectors, segments, DRS zones, pit lane/entry/exit, track limits, surface and grip characteristics, and source provenance.

Real circuits are imported from a verified reference and validated for geometry fidelity. They remain editable, with source/version history. Fictional circuits can be freely designed but must pass geometry and simulation validation.

Tyres: Soft, Medium, Hard, Intermediate, Full Wet. Degradation must account for tyre compound, temperature, track surface, load, weather, driver style, and setup. Weather can be fixed or dynamic before a race; dynamic is default. Weather model includes air/track temperature, humidity, rainfall, water level, grip evolution, and rubbering-in when supported by data.

## 7. Race events, flags, and maintenance

The event system should support configured mechanical/engine failures, spins, off-track events, collisions, crashes, yellow/double-yellow, VSC, safety car, red flag, restart/suspension, penalties, and retirements. Only mechanical failure, engine failure, and crash should produce maintenance-cost facts.

The engine emits validated incident and result facts. Caleris' Economy Engine remains responsible for actual maintenance charges, rewards, wallet movements, and ledger settlement. This keeps the engine reusable for other games.

## 8. Live race, telemetry, and replay

Selectable display modes:
- broadcast overview;
- timing tower and gaps;
- circuit map/driver positions;
- telemetry;
- race-control event timeline.

Telemetry contract candidates: speed, throttle, braking, gear, tyre compound/condition, ERS, DRS, position, lap, and sector. Sampling frequency and retention granularity must be benchmarked before finalizing.

Replay reads persisted events and telemetry snapshots, supports seek by lap/event, independent playback speed, and driver comparison where retained data permits. Keep race data through the end of the relevant off-season. Do not delete active, disputed, or unsettled race data.

## 9. Architecture

### Monorepo
Use the existing `Kunam` repository and its existing source, library, and Supabase conventions. Adapt existing structure; do not create duplicate app roots or a separate repository unless a later architecture review proves it necessary. Candidate boundaries: engine core/domain contracts, physics/simulation, circuit model, worker/scheduler, API contracts, tests, benchmarks, and fixtures.

### Responsibilities
- **Vercel:** current web app, admin interface, and request-bound APIs. Do not run multi-hour simulations inside serverless requests.
- **VPS:** scheduler, persistent race worker(s), queue/lease coordination, checkpoints, and health reporting. It is not the public website host.
- **Supabase:** shared Postgres, auth/authorization integration, race sessions, immutable input snapshots, checkpoints, events, timing/telemetry, and realtime projections.
- **Mobile:** future app consumes the same versioned API and same database.

### Concurrency
Start with one VPS and a bounded worker queue. Do not assume one worker per race. Benchmark one and multiple sessions, then configure maximum concurrent sessions from measured CPU/memory usage. Prevent one race from starving other sessions or checkpoint writes.

## 10. Security and authorization

- Worker credentials remain server-side and never enter browser/mobile bundles.
- Public clients receive authorized read-only race projections.
- Live-speed commands require server-side Admin/FIA validation and audit records.
- Admin-only development page uses existing `site_admins` authorization. FIA must not inherit unrelated Admin god-mode capabilities.
- Commands/events are idempotent; use unique command/event IDs.
- Validate immutable race snapshots, circuit revisions, engine version, and schedule before launch.
- Rate-limit operator commands and public telemetry endpoints.
- Keep service credentials separate from member JWTs.

## 11. Checkpoints and recovery

Persist checkpoints at a benchmarked interval and after critical events. Include simulation clock, lap/sector/segment state, driver/car state, tyre state, weather, flags, pit state, and event sequence.

On restart, worker claims a session lease, loads the last committed checkpoint, validates version/checksum, and resumes without duplicating committed events. Heartbeats detect abandoned workers. Invalid checkpoints must leave the session recoverable for investigation; never silently reset a race. Prevent duplicate final results and duplicate economy settlement.

## 12. VPS recommendation

Budget ceiling is Rp100,000/month. Recommended procurement approach:
- KVM VPS in Singapore or nearby Southeast Asia region;
- initial evaluation target: 2 vCPU, 4 GB RAM, 60 GB NVMe;
- Ubuntu 24.04 LTS;
- provider should offer firewall, snapshots/backups, console access, and transparent CPU limits;
- benchmark one race, then two concurrent races before setting production concurrency.

This is a budget-constrained prototype target, not a production capacity guarantee. If benchmarks show CPU or memory pressure, lower concurrency or revise the budget. Do not buy the VPS until the prototype has a measured resource profile. Provider selection remains open pending current price/region/terms comparison.

## 13. Monitoring

Start with low-cost monitoring:
- worker heartbeat/lease;
- queue depth and active race count;
- CPU, RAM, disk, and network;
- checkpoint age/write errors;
- event processing lag;
- structured logs with race/session correlation IDs;
- health endpoint and restart count;
- Discord alerts for worker down, checkpoint failure, or stalled race.

Add external metrics/log retention only when real workload justifies it.

## 14. Android-first workflow

Use GitHub mobile/web for branches, PRs, and CI; cloud IDE/Codespaces for compilation/tests; Supabase dashboard for testing schema/fixtures; Vercel dashboard for preview deployments/logs; SSH terminal app or browser terminal for VPS operations after procurement. If a task requires local Docker, desktop-only GUI, or sustained local compute, provide a cloud fallback rather than assuming a PC.

## 15. Development phases and acceptance gates

1. **Deterministic prototype:** synthetic circuit, 20 AI drivers/10 teams as initial benchmark, seeded RNG, deterministic replay, input snapshots, checkpoint save/restore.
2. **Simulation validation:** driver/car/HQ effects, tyres, weather, DRS/ERS, overtaking/defending, pit strategy, failures/incidents/flags/classification; at least 1,000 Monte Carlo seeds and sensitivity tests.
3. **Service integration:** scheduler, queue, persistent worker, API contracts, concurrency/load tests, checkpoint recovery, duplicate prevention, Supabase testing fixtures, security tests.
4. **Presentation/release:** LIVE RACE, timing, map, telemetry, event timeline, replay, Android viewport QA, preview deployment, load/recovery tests, staged public release.

Release gates: deterministic replay passes; worker restart resumes correctly; concurrent races remain isolated; event ordering/classification are stable; secrets never reach clients; Admin/FIA authorization is enforced server-side; migrations are reviewed/reconciled; QA and CI pass before merge/deploy.

## 16. Open items

1. Confirm source/reference standard and licensing for real circuit geometry.
2. Calibrate physics, tyre degradation, weather transitions, incident probabilities, and severity with simulation tests.
3. Verify whether the Rp100,000 VPS ceiling can support the desired concurrent sessions.
4. Select provider only after current offers and prototype benchmarks are compared.
5. Finalize telemetry frequency and storage granularity.
6. Finalize database schema, event schema, API versioning, and worker authentication after schema/migration audit.
7. Confirm whether official results should be archived beyond the off-season retention target.

## Appendix: LIVE RACE development page

The initial page is an Admin-only UI foundation. It must visibly identify demo data and an unconnected engine. Its preview controls are local UI state, not real worker commands. Public access stays disabled until engine release gates pass.

## Change control

All changes use a new feature branch and PR. Database migrations are versioned in the repository. Dummy fixtures are inserted only into Supabase testing. Production schema/data changes require separate QA, CI, and migration review.


---

## Architecture decision addendum — VPS-independent race execution

**Decision date:** 20 November 2026  
**Owner requirement:** A VPS must not be a dependency for scheduled race execution or replay availability.

This addendum supersedes the VPS runtime dependency described in the initial baseline sections. The original VPS design remains historical context only.

### Required runtime model

- Supabase Postgres is the durable source of truth for schedules, queued jobs, worker leases, checkpoints, ordered race events, telemetry projections, and final classifications.
- Supabase Cron dispatches due work from the database.
- Supabase Edge Functions process bounded simulation batches. Each invocation restores the last committed checkpoint, advances a bounded number of segments, atomically persists events and the next checkpoint, then exits.
- No Edge Function invocation may attempt to hold a 2–3 hour race open. CPU/time quotas require chunked execution and benchmarked batch sizing.
- The browser, Admin panel, FIA panel, and LIVE RACE view are never required to keep a race running.
- Replay is reconstructed from persisted event/timing data and remains available independently of the LIVE RACE UI and the worker process.
- The Deno VPS worker is optional tooling for profiling/fault injection only. It is not a production dependency.

### Failure semantics

If a worker invocation fails, the lease expires and a later scheduled invocation reclaims the session from its last committed checkpoint. Event sequence and idempotency constraints prevent duplicate committed events. If the Supabase database/platform itself is unavailable, progress may pause until service recovers; no worker architecture using the same database can guarantee writes during a database outage.

### Rollout gates

The managed dispatcher must first be implemented and tested in the Testing project. Required tests include browser-closed progression, forced invocation termination, lease expiry/reclaim, duplicate dispatch, concurrent sessions, and replay after worker shutdown. The required `pg_net` extension and machine-auth secret must be configured securely (Supabase Vault/Function secrets). Never expose service-role credentials to the client. Production race persistence remains disabled until migration parity, RLS, security, load, recovery, and release gates pass.


---

## Owner decision addendum — Detailed simulation, race operations, and release requirements

**Decision date:** 20 November 2026  
**Status:** Requirements confirmed by the product owner through the 50-item decision round and the subsequent clarification of Aggression vs Mistake Rate.  
**Change policy:** This section is additive. All preceding PRD content is retained verbatim. Where a prior open recommendation or baseline statement conflicts with an explicit decision in this addendum, this dated owner decision is the newer requirement for future implementation; it does not authorize deleting or rewriting historical requirements or race data.

### 1. Simulation realism and competitive model

- Target simulation quality is **pro-realistic**. This is a product target, not a claim of validated fidelity; formulas and coefficients still require calibration, sensitivity analysis, repeatable scenario tests, and statistical review.
- Car/team performance has the larger overall influence on results than driver attributes. Driver skill remains materially influential and must not become cosmetic.
- A stronger driver may lose because of car specification, team strategy, weather, tyre condition, incidents, mistakes, race-control events, or other race conditions.
- Simulation includes deterministic per-lap variability. With identical engine version, seed, ruleset, circuit revision, and input snapshots, the complete event/state sequence and result must remain reproducible.
- Every one of the 24 baseline attributes must have a measurable, testable effect in every applicable race session. An attribute may affect different phases or contexts through different calibrated paths; it must not be assigned a meaningless placeholder modifier.
- Attribute direction, scale, bounds, interaction effects, and version must be explicit. Effects must be bounded and tested for monotonicity where appropriate. No uncalibrated coefficient may be treated as an established fact.

### 2. Driver attributes — semantic distinction

The baseline remains exactly eight driver attributes. No attribute is removed, merged, or silently renamed.

- **Aggression:** assertiveness during racing, influencing attack, defence, and wheel-to-wheel decisions. Its effect can be beneficial or costly depending on context.
- **Mistake Rate:** driver recklessness/risk-taking tendency. A higher value means the driver is more likely to choose risky actions; those actions can produce an advantage but also increase the chance of errors or adverse outcomes. It is not a measure of general driving skill.
- The model must keep these two attributes independent. Examples used for acceptance: high Aggression + low Mistake Rate represents assertive but measured driving; low Aggression + high Mistake Rate represents less assertive but still risk-prone decisions; high values in both represent assertive and highly risky behaviour.
- The other six driver attributes retain their existing names and baseline definitions. Their exact formula paths must be verified against the repository's actual schema and simulation contracts before implementation.

### 3. Car, reliability, and Team HQ effects

- The baseline remains exactly 16 car/team attributes.
- **Reliability** must influence the probability/risk of mechanical, engine, or component failures. Failure events must be attributable to the relevant component/system and remain deterministic under the race seed.
- Team HQ facilities have levels 1–8. Every applicable facility level must create a measurable simulation effect or unlock a defined capability. The facility-to-effect mapping must be explicit, configurable/versioned, and covered by tests.
- Race-start snapshots freeze car, driver, Team HQ, setup, and relevant configuration inputs. Upgrades during an active race do not retroactively alter that race.

### 4. Tyre, weather, and track conditions

Tyre compounds and their intended relative behaviour:

- **Soft:** highest pace potential and highest degradation.
- **Medium:** balanced pace and durability.
- **Hard:** more durable with lower pace potential.
- **Intermediate:** for light/wet transitional conditions.
- **Full Wet:** for heavy rain and high water conditions.

Tyre degradation and performance must account for compound, tyre age/temperature, air and track temperature, circuit surface and geometry, load, driving style, setup, weather, and track water/grip state. Interactions must be calibrated rather than represented by arbitrary fixed penalties.

Dynamic weather evolves gradually and with uncertainty. Weather state includes relevant temperature, humidity, rainfall, water level/wetness, wind where modelled, and grip evolution. Weather changes must be seeded and deterministic for replay. Rain must affect grip, water accumulation, tyre suitability, and pit strategy.

### 5. Car setup and team strategy

- Car setup is part of the pre-race team preparation and immutable race input snapshot.
- Setup dimensions include at least aero configuration, suspension, brake balance, and tyre pressure.
- Setup values must be bounded by circuit/team/car constraints and affect relevant simulation outcomes through calibrated effects.
- Setup selection and strategy preparation belong to the team workflow before the race begins. Setup changes during a race are only permitted if an explicitly modelled and authorized procedure allows them.

### 6. Strategy authority and live decision workflow

- AI strategy is the default when no authorized human operator is actively controlling strategy.
- When a team owner watches the live race, the owner may manually control strategy for both drivers belonging to that team.
- A driver watching the live race may control that driver's own strategy, within the permissions and available command types defined by the host game.
- If both owner and driver are watching, the driver may submit a strategy suggestion. The owner remains the decision-maker for the team's driver strategy and may accept the driver's suggestion or choose another strategy.
- Strategy commands must be server-authorized, timestamped, associated with the acting user and affected driver/team, validated against current race state, and written to an audit/event record.
- AI must continue to operate safely when an owner/driver disconnects, closes the browser, or does not submit a command. Browser presence must never be a runtime dependency.

### 7. Pit-stop constraints

- Minimum and maximum pit-stop constraints must be configurable by the applicable ruleset/event configuration.
- Strategy validation must consider current tyre state, weather, race distance, traffic, pit loss, pit lane status, race-control restrictions, and the configured pit-stop limits.
- Invalid or disallowed pit commands must be rejected server-side and recorded where auditability is required.

### 8. Incidents, penalties, and evidence

- The event model must support the full agreed incident catalogue, including mechanical/engine/component failure, spin, off-track, track-limit infringement, collision, crash, pit events, and retirement.
- Incident severity is dynamic and classified into a criticality/severity level based on the event context and its validated inputs. Severity thresholds and probabilities are configurable/versioned and tested.
- Penalties are automatically detected/assigned by the engine/ruleset where the rule is deterministic. FIA may intervene while observing a live race within the FIA capability boundary.
- Supported penalty outcomes include warning, 5-second, 10-second, drive-through, stop-go, grid penalty, time penalty, disqualification (DSQ), and race ban.
- DSQ and race-ban outcomes must have very low calibrated occurrence rates and require strong rule/evidence conditions. They must not be used as ordinary random incidents.
- Every incident/penalty requiring adjudication must retain supporting evidence and an audit record: event timestamp, driver, circuit location/segment, reason/rule reference, relevant state/context, detection source, and operator action if any.
- FIA may suspend a driver when watching a live race, within the defined authority and audit process. FIA does not receive Admin god-mode or Economy permissions.

### 9. Flags, safety procedures, and restart rules

- Support yellow flag, double yellow, Full Course Yellow (FCY), Virtual Safety Car (VSC), Safety Car (SC), and red flag procedures.
- SC/VSC procedures must model deployment, speed/pace control, field ordering or gap control as applicable, pit restrictions, ending/withdrawal, and restart.
- Support both standing and rolling restarts where the configured ruleset allows them.
- Red-flag decision **B** from the owner decision round is locked: restart order uses the positions from before the interruption/last valid classification point as defined by the selected rule. Implementation must preserve the exact selected rule in the versioned ruleset and scenario tests; it must not invent an alternative restart-order policy.
- All flag/restart transitions must be deterministic, sequenced, auditable, and tested for interrupted sessions, pit states, lapped cars, and worker recovery.

### 10. Race-control authority and result governance

- FIA may manage race control, issue or reverse penalties within its permission set, and ratify race results.
- A penalty ratification performed by FIA must be forwarded to Admin for audit visibility. This does not grant FIA authority over economy, wallet balances, tariffs, members, teams, or other Admin-only capabilities.
- Both Admin and FIA are authorized to cancel a race, with the action and reason audited.
- Only Admin may correct an already-ratified official result. A correction creates an auditable superseding result version; the original result and its history must never be deleted or overwritten invisibly.
- Official result publication updates all applicable official records: division standings, championships, sprint classification/points, pole position, fastest lap, and driver/team statistics according to the configured ruleset.
- Race Engine emits validated facts and classifications only. Economy Engine remains the sole owner of rewards, maintenance charges, taxes, wallet movements, and ledger settlement. Race Engine must not directly write balances or financial ledger entries.

### 11. Circuit data, fidelity, and track limits

- Research reliable sources for circuit data and record source provenance, version, date, and applicable usage/licensing conditions.
- Real-circuit fidelity target is full geometry/specification fidelity to the approved reference source. The implementation must define measurable comparison criteria and tolerances; do not claim exact fidelity without a verifiable source and validation.
- Preserve circuit geometry and relevant specifications, including layout, dimensions, sectors, segments, elevation/banking where available, pit lane, DRS zones, surface, and track-limit boundaries.
- Admin must have both a visual editor and specification editor for fictional circuits and required circuit configuration. Changes create a new circuit revision and cannot mutate an active or historical race snapshot.
- Track-limit detection must use circuit geometry and generate auditable events with location, timestamp, participant, and evidence/context. It must not rely solely on arbitrary visual/UI boundaries.
- Circuit data must only be imported/used where its source and licensing terms permit the intended use. A source being publicly viewable does not automatically grant reuse rights.

### 12. Telemetry, replay, broadcast, and spectators

Telemetry must support the agreed full set of relevant fields, including at least speed, throttle, braking, gear, tyre compound/condition, ERS, DRS, position, lap, sector, and timestamps. Additional state needed for faithful replay and broadcast may be persisted as versioned projections/events.

- Telemetry is intended to be available in real time through authorized projections.
- Replay requirements include position movement, circuit map, tyre and pit information, incidents and penalties, driver comparison, weather, and race-control state.
- Broadcast mode is required in addition to timing, circuit, telemetry, and race-control views.
- Public/member spectators may access the authorized spectator experience after release approval. Admin and FIA retain only their separately authorized controls; spectator access does not grant operator permissions.
- Each viewer's replay playback controls remain independent and cannot mutate authoritative race state.
- Detailed race data remains available through the end of the relevant off-season. At the end of off-season, preserve a key-data snapshot for Hall of Fame and lifetime statistics.
- Replay retention is a separate policy: replay availability/storage is limited to 48 hours after the race. The implementation must preserve the required underlying official result and the end-of-off-season archive facts independently of the short replay window. Any dispute/legal/operational hold must prevent premature deletion of data needed for adjudication.

### 13. Race scale, concurrency, and division configuration

- Support up to **25 drivers per division**.
- Concurrency target **E** from the owner decision round is **10 simultaneous races**. This is a target to validate through load and recovery benchmarks, not a capacity guarantee before measurement.
- Premio and Zwei use the same engine core and rules framework, but retain separate ruleset/configuration and schedule data. Both divisions may race on the same day and may use the same circuit on that day.
- Isolation is mandatory across sessions: race state, participants, event sequence, leases, checkpoints, telemetry, commands, and result versions.
- A race must not starve or overwrite another session. Concurrency limits and worker fairness must be tested at the target of 10 simultaneous sessions with realistic participant counts and data volume.

### 14. Runtime rollout and infrastructure budget

- Begin with the managed Supabase runtime already adopted for Testing: Cron dispatch plus bounded Edge Function execution, durable Postgres state, leases, checkpoints, and persisted events. No single invocation may attempt to hold an entire multi-hour race open.
- The owner is also willing to transition to a full VPS worker once the infrastructure is ready and demonstrated to work reliably. VPS adoption is a later runtime option/transition, not a prerequisite for continuing the managed-runtime validation.
- Managed and VPS workers must use the same versioned engine contract, database source of truth, event ordering, checkpoint format, idempotency rules, and recovery semantics. Runtime migration must not reset or fork race state.
- Before transition, benchmark the managed runtime, document its limits, compare VPS resource requirements, test failover/recovery, and prove that a session can resume from a valid checkpoint without duplicate events.
- Total target infrastructure budget is approximately **Rp300,000 per month**, including an Indonesian cloud VPS if/when selected. This replaces the earlier Rp100,000 planning ceiling for future sizing decisions. It is a budget target, not proof that a specific provider/specification is available at that price.
- Select VPS provider/region/specification only after current pricing, CPU policy, network latency to Supabase, storage, backup, security, and measured workload have been reviewed. Do not purchase or activate infrastructure solely from an unverified estimate.

### 15. Scheduling, manual start, notifications, and release activation

- Scheduled race start remains automatic and must not depend on an operator browser being open.
- Admin may also initiate an authorized manual start when needed, including to coordinate a TikTok Live broadcast. Manual start must validate readiness and schedule/race state, be idempotent, and record actor, timestamp, and reason.
- Discord notifications are sent to Admin only for the agreed operational alerts. Do not broadcast private operational alerts to ordinary members or spectators.
- Official race activation remains disabled until every release gate is passed and the owner has personally tested the delivered experience and explicitly approved official activation.
- Passing CI or deploying a build does not by itself authorize official/public race activation.

### 16. Final release gates and owner acceptance

All of the following are mandatory before official activation:

1. Deterministic replay: same engine version, seed, ruleset, circuit revision, and immutable inputs produce identical event/state history and result.
2. Physics calibration: approved calibration report, attribute effect tests, sensitivity analysis, and statistically reviewed Monte Carlo results.
3. Race control: penalty, evidence, flags, SC/VSC, red-flag, standing/rolling restart, cancellation, and result-correction scenarios pass.
4. Concurrency: target of 10 simultaneous races passes load, isolation, fairness, and recovery tests with the supported participant scale.
5. Recovery: forced worker termination, lease expiry/reclaim, database/network interruption handling, checkpoint validation, and duplicate prevention pass.
6. Security: Admin/FIA/driver/team-owner/spectator authorization and RLS are verified server-side; secrets are absent from client bundles and logs.
7. Data governance: result supersession, audit trail, replay 48-hour retention, off-season archive, Hall of Fame/lifetime-stat snapshot, and dispute holds are tested.
8. Database: migrations are additive/backward-compatible, Testing schema is verified, migration ledger parity is reconciled, and production changes are separately reviewed and approved.
9. QA/CI: required tests, build, lint/type checks, security checks, and repository CI pass.
10. Deployment: Vercel deployment is verified READY; runtime deployment/health checks pass for the selected environment.
11. Owner acceptance: the owner has tested the available web experience and explicitly approved official race activation. Until then, official race activation and public race operation remain disabled.

### 17. Decision record — 50-item owner confirmation

The 50-item decision round is recorded as confirmed. The detailed requirements above are the authoritative implementation interpretation. Specific option-based decisions retained from that round:
- Red-flag restart policy: option **B**, using the prior/last-valid positions as defined in the selected ruleset.
- Concurrency: option **E**, target of **10 simultaneous races**.
- Runtime: managed Supabase runtime first; transition to a full VPS worker when ready and validated.
- Official activation: only after all release gates and explicit owner test/approval.

The Aggression/Mistake Rate clarification is recorded separately in section 2 above: both attributes remain in the 24-attribute baseline and represent different behaviours.

## 18. 3D race visualization and asset pipeline

**Status:** Approved product direction; implementation is staged and must not be represented as shipped until its acceptance gates pass.

### 18.1 Product objective

Provide an optional real-time 3D presentation for LIVE RACE and replay, driven exclusively by authoritative Race Engine snapshots/events. The 3D viewer is a presentation client: it must never alter simulation state, race timing, classification, penalties, strategy, or persisted results. The existing 2D timing/map/replay experience remains available as a reliable fallback.

### 18.2 Rendering and compatibility

- Reuse the repository's installed Three.js dependency and existing React/TypeScript stack. Do not add another rendering framework or duplicate Three.js in the dependency graph without a documented benchmark and approval.
- Build the renderer as an isolated, lazy-loaded presentation module. Keep simulation, Supabase access, and race authority outside the render loop.
- Target Android/mobile browsers first, with adaptive render quality, bounded device-pixel ratio, capped frame rate where appropriate, visibility-aware pause/resume, explicit WebGL capability detection, context-loss recovery, and deterministic resource disposal.
- Provide a 2D fallback when WebGL is unavailable, disabled, or unstable. A rendering failure must never stop or corrupt a race.
- Initial benchmark scope: one circuit and up to 10 cars. Higher grids, scenery density, shadows, reflections, and effects are separate performance gates, not assumptions.

### 18.3 Circuit geometry contract

- Generate the 3D track from the selected immutable circuit revision and its validated centerline/segment geometry, not from a screenshot or an invented outline.
- Track width, elevation, banking, pit lane, kerbs, barriers, and other physical dimensions may only be rendered when their source values exist and pass the circuit's provenance/fidelity rules. Unknown measurements remain unknown; do not silently substitute plausible-looking engineering values.
- Preserve circuit revision identity so historical replays use the exact geometry revision captured for that race.
- Circuit Maker remains the source of authored fictional-circuit geometry; Circuit Pool remains the source of selected circuit records and approved layout revisions.

### 18.4 Vehicle assets and livery

- First prototype may use a procedural, original single-seater placeholder assembled from low-cost Three.js geometry. This avoids blocking engineering on third-party vehicle files and provides a stable visual contract.
- Production vehicle models may use .glb/.gltf assets with documented provenance, license, attribution, source URL, revision, and content hash. No scraped, leaked, or unlicensed championship/team car models or official logos/liveries may be bundled.
- Keep the vehicle model independent from team identity. Apply team colors, number, and permitted livery graphics through data-driven materials/decal layers; never bake team-specific identity into a shared base mesh.
- Establish a model budget before accepting external assets: mobile-tested triangle/texture budgets, compressed textures where supported, bounded material count, sensible LODs, and no unbounded animation clips. Exact numeric budgets are to be set from representative Android profiling, not guessed in advance.
- Asset loading must be lazy, cancellable, cache-aware, and safe when a model fails. A missing model falls back to the procedural vehicle without affecting race state.

### 18.5 Motion and telemetry truthfulness

- Vehicle position and ordering must be reconstructed from versioned authoritative timing/replay projections and persisted race events. Render interpolation may smooth between known committed samples, but it must not invent race progress or change official timing.
- Current segment-completion replay supports segment-level positions only. Until the engine persists a validated intra-segment position/sampling contract, the viewer must label motion as segment-level/interpolated and must not claim continuous GPS accuracy.
- Speed, throttle, braking, gear, steering, suspension, wheel slip, tyre deformation, and collision effects may only be shown as measured or modelled telemetry when the engine explicitly supplies validated fields. Otherwise omit them or label them clearly as visual-only effects; never present fabricated telemetry as race data.
- Replay seek, pause, and playback speed remain viewer-local and cannot mutate authoritative race state.

### 18.6 Camera and presentation modes

- Initial camera set: broadcast/chase, trackside, and overview. Camera selection is viewer-local.
- 3D replay must remain synchronized with the same immutable race snapshot, event sequence, and replay cursor as the 2D timeline.
- Leaderboard, flags, incidents, pit events, and race-control state remain sourced from existing race projections/events. Visual overlays must not become a second source of truth.

### 18.7 Delivery phases and acceptance

1. **Foundation:** renderer boundary, WebGL fallback, mobile performance instrumentation, procedural vehicle, and validated circuit mesh preview. No production race integration yet.
2. **Replay vertical slice:** render one immutable circuit revision and up to 10 procedural vehicles from the existing segment-level replay projection. Verify cursor seeking, classification ordering, resize/orientation, and renderer teardown.
3. **Live presentation:** connect the same read-only renderer to committed live timing projections; prove that rendering is isolated from simulation worker lifecycle and race state.
4. **Asset pipeline:** accept licensed GLB/GLTF models, team-color/livery data, caching, LOD and texture optimization after device profiling.
5. **Broadcast polish:** camera presets, trackside cuts, overlays, incidents, pit events, weather visuals, and optional scenery, each backed by supported data.

Acceptance requires Android browser QA on representative low/mid-range devices, WebGL fallback tests, context-loss/recovery tests, no memory growth after repeated mount/unmount, no render-loop database/network calls, replay determinism unchanged, 2D fallback parity for critical information, and all existing CI/regression suites passing. No database migration is required for the renderer foundation; any future persisted sampling/asset metadata schema must be additive, tested in Supabase Testing first, and reconciled with Production only through reviewed migrations.