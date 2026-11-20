# Race Engine Phase 12 — Replay and archive retention policy

## Delivered

- Added the PRD-defined 48-hour replay retention rule.
- Full race details remain retained until the relevant off-season ends.
- At off-season end, key facts must be archived before full detail becomes purge-eligible.
- Dispute, legal, or operational hold preserves replay and full detail from further purge.
- Existing purge markers are recognized so retention jobs can be idempotent.
- Added immutable evaluation metadata and tests for the 48-hour boundary, off-season archive ordering, hold behavior, and invalid dates.
- Added the policy to the canonical Edge sync manifest and synchronized the Edge module.

## Boundaries

- This is a deterministic retention decision helper, not a scheduled deletion job.
- The persistence adapter must store archive/purge markers transactionally and retain key facts for Hall of Fame/lifetime statistics.
- No records were archived or deleted in Supabase during this phase; no migration or data changes were made.
