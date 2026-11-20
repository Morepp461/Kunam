# Race Engine Phase 9 — Race start lifecycle policy

## Delivered

- Added a versioned-domain start authorization policy for scheduled and manual race starts.
- Scheduled start is accepted only from the trusted scheduler and only when the scheduled time has arrived.
- Manual start is accepted only from Admin and requires an operational reason.
- Both start paths require the race to be queued and all server-supplied readiness checks to pass.
- Repeated requests with the same persisted idempotency key are recognized as replays and do not request a second start.
- Other race states and duplicate keys are rejected.
- Every decision returns immutable audit metadata including actor, source, timestamp, reason, readiness blockers, and idempotency key.
- Added unit tests for schedule timing, Admin-only manual start, readiness, state transitions, idempotency, and audit metadata.
- Added the policy to the canonical Edge sync manifest and synchronized the Edge module.

## Boundaries

- This is a domain policy, not a live scheduler or database transaction. The adapter must atomically persist/check the idempotency key with the race state.
- Readiness checks are supplied by the server adapter; this policy does not invent the complete readiness checklist or activate official races.
- No DB migration or Supabase data/config changes are required for this pure domain policy.
