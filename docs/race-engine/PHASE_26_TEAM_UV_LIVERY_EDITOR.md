# Phase 26 — Team UV Livery Editor

## Implemented in feature branch

- Added Team Panel → Custom Team Livery for Owner/Principal accounts.
- Added versioned CALERIS UV atlas template V1 with separate regions for nose/monocoque, left/right sidepods, engine cover, front wing, rear wing, and halo/details.
- Added editable main/secondary/accent colors, split/stripe/solid/carbon patterns, car number, team wordmark, three sponsor labels, and PNG/JPEG/WebP logo upload (100 KB input cap).
- Added save/load through the team-scoped `caleris_team_liveries` table, plus JSON import/export.
- Added a procedural Three.js car preview and responsive editor layout.
- Added RLS policies for team-member reads and Owner/Principal writes, with verified `site_admins` access.
- No changes to Race Engine physics, timing, classification, economy, or existing save data.

## Fidelity and integration boundaries

- The repository does not yet contain an original/licensed production vehicle asset with a verified UV map matching this atlas. The editor and public Team Profile currently use the procedural preview and must not be described as a final Monoposto-compatible GLB/GLTF model.
- Current race sessions in the test service use isolated synthetic teams. The existing replay projection is segment-level and does not provide continuous vehicle dynamics.
- Race-start livery snapshot integration is intentionally gated until real roster-backed race sessions exist. Historical replays must eventually freeze livery revision and UV asset version at race start.
- No steering, suspension travel, wheel angular velocity, throttle, or brake values are invented.

## Database and QA

- Migration: `20261122130000_team_uv_livery_editor.sql`.
- Apply to Supabase Testing first, verify RLS and save/load with Owner/Principal/Admin identities, then apply the same migration to Production after merge.
- CI must pass before merge. Manual Android QA is still required for touch interactions, file upload, atlas readability, and WebGL performance.


## 2025 vehicle asset intake — 2026-11-24

The original CC BY 4.0 2025 F1 CAR GLB has been supplied and structurally verified. It contains 143 UV-mapped primitives but no embedded texture images and is approximately 3.1 million triangles / 85.2 MiB. The procedural preview remains the active renderer. Real-model integration is gated on an optimized derivative, verified UV/material body-zone mapping, approved asset hosting, and Android performance acceptance. See [asset attribution and intake](../assets/2025-f1-car-attribution.md).
