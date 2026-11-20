# Race Engine Phase 8 — Strategy authority policy

## Delivered

- Added a server-side domain policy for race strategy authority.
- Team owner has authority over both drivers on their own team while present in the live race.
- A driver may command only their own car when the team owner is absent.
- When both are present, a driver's input is classified as a suggestion and the owner retains final authority.
- AI is the default authority when neither owner nor driver is present.
- Admin, FIA, spectator, and anonymous actors do not receive strategy authority from this policy.
- Commands are accepted only while the race is running; identity, target, timestamp, presence, and role checks are required.
- Every accepted, suggested, or rejected command receives immutable audit metadata.
- Added unit tests for team scope, driver self-scope, suggestion routing, AI fallback, non-strategy roles, race-state gating, timestamps, and audit records.
- Added the policy to the canonical Edge sync manifest and synchronized the Edge module.

## Boundaries

- Actor identity, team ownership, race state, and live presence must be loaded and verified server-side by the eventual API adapter. Client-provided claims are not authoritative.
- This phase defines authorization policy only. It does not invent strategy command types, change tyre/pit decisions, or create a client control UI.
- No database migration or Supabase data/config changes are required for this pure domain policy.
