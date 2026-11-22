# Phase 25 — 3D Race Replay Viewer

## Delivered in PR #279

- Added a lazy-loaded Three.js replay viewer to the existing LIVE RACE Race Replay panel.
- Added 3D / 2D mode switching. The existing SVG map remains intact as the 2D fallback.
- Added broadcast, trackside, and overview camera presets.
- Added a low-detail original procedural single-seater model, capped at 10 visible cars.
- Reconstructs each vehicle location from the existing persisted segment-level replay projection. The scene remains mounted while replay seeks; it updates vehicle transforms without rebuilding the renderer or track each event.
- The renderer does not call the race API, mutate simulation state, or write to Supabase.
- Added WebGL capability checks, context-loss messaging, responsive resize handling, capped pixel ratio, visibility-aware rendering, and disposal of scene resources.
- Added pure projection helper and unit tests for coordinate and heading conversion. Heading is estimated from the nearest centerline edge because segment IDs and layout-point IDs are separate identifiers.

## Data and visual fidelity constraints

- Track path is a schematic centerline derived from the immutable replay layout. The rendered tube is a visual guide, not a measured track-width surface.
- Elevation, banking, pit lane, kerbs, barriers, and scenery are not fabricated.
- Current event data is segment-level. The viewer does not claim continuous GPS or provide unsupported speed/throttle/brake/gear telemetry.
- Car paint colors are generic visual differentiators, not official team liveries. No third-party model or logo asset was added.

## Known scope boundary

This is the first replay vertical slice, not a complete live 3D broadcast. Camera presets are local to the viewer. Live projection integration, measured circuit surface geometry, licensed GLB/GLTF assets, data-driven team livery, and advanced effects remain subsequent phases after Android profiling.

## QA

- Unit tests cover coordinate projection, nearest-edge heading, invalid coordinates, and layouts without a usable edge.
- Full repository CI must pass before merge.
- No dependency, database schema/data, migration, Edge Function, or Vercel environment change is included.
