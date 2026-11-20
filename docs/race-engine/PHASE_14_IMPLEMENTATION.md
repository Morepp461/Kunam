# Race Engine Phase 14 — Managed runtime observability

## Delivered

- Added a typed batch-metrics contract for managed background dispatch.
- Background tick responses now report processed batch size, exact active queue depth, progress count, lease contention, retry-pending count, red-flag suspension count, and the age of the oldest session selected into the current batch.
- Queue depth is queried separately from the bounded three-session batch; the reported count is not confused with the batch size.
- Added validation for invalid counts and timestamps plus unit coverage for empty and mixed-status batches.

## Boundaries

- These metrics are emitted in the authenticated worker response and are available to the existing Cron HTTP response history. A durable monitoring dashboard/alerting pipeline is still outstanding.
- Selected-session age is not a full queue-latency histogram or a service-level objective.
- No production schema/data/config changes; no Vercel environment changes.
