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
