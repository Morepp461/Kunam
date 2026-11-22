# Phase 24 — 3D Race Visualization Foundation

## Status

Approved roadmap and architecture foundation. This phase records the implementation contract; it does not claim that a 3D race viewer is already shipped.

## Repository audit

- Three.js and matching TypeScript types are already direct dependencies (three and @types/three). Do not install a second renderer or duplicate dependency.
- The repository already has a Three.js driver exhibition, GLB loading/caching patterns, React/TypeScript, Circuit Maker geometry, Circuit Pool revisions, and segment-level replay projections.
- No dedicated 3D race-car model is currently committed in the repository. The first prototype therefore uses procedural original geometry; external models are not a blocker.
- Existing replay positions are segment-level. They are not continuous GPS samples.

## Implementation boundary

The renderer is a read-only presentation layer. It consumes immutable circuit revisions and Race Engine timing/replay projections. It cannot call simulation commands, write race state, settle results, or become a source of truth. The current 2D experience remains the fallback.

## Planned delivery

1. Isolated lazy-loaded Three.js renderer, WebGL capability checks, 2D fallback, resize/context-loss handling, and disposal.
2. Validated circuit mesh from the selected revision plus one procedural original single-seater model; initial benchmark limited to 10 cars.
3. Replay cursor integration using committed segment-level projections, with honest segment-level/interpolated labeling.
4. Live read-only projection integration after replay QA.
5. Optional licensed GLB/GLTF vehicle assets, data-driven team colors/livery, caching, LOD, and texture optimization after Android profiling.
6. Broadcast/chase, trackside, and overview camera presets.

## Asset governance

No downloaded or scraped official F1/team car models, logos, or liveries without explicit commercial redistribution rights. Every external asset must record source URL, author/provider, license, attribution, revision, and content hash. Missing assets fall back to the procedural model. Team identity is applied as data/material configuration, not baked into the shared model.

## Truthfulness and performance

- Do not infer missing track width, elevation, banking, pit lane, or barriers.
- Do not call segment-level interpolation continuous GPS.
- Do not display fabricated speed, throttle, braking, gear, steering, or suspension as telemetry.
- Mobile-first budgets must be set from actual low/mid-range Android profiling; adaptive quality, bounded pixel ratio, lazy loading, and resource disposal are required.
- Rendering failure must never stop or corrupt simulation. Replay controls are viewer-local.

## QA gates

Android browser QA, WebGL-unavailable fallback, context-loss/recovery, orientation/resize, replay seek/order synchronization, repeated mount/unmount memory checks, and all existing CI/regression suites. No DB migration or Vercel environment change is part of this documentation/foundation step.