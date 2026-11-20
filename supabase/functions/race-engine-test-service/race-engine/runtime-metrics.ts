export interface RaceEngineBatchItem {
  readonly status: string;
}

export interface RaceEngineBatchMetrics {
  readonly batchSize: number;
  readonly activeQueueDepth: number;
  readonly progressedCount: number;
  readonly busyCount: number;
  readonly retryPendingCount: number;
  readonly suspendedCount: number;
  readonly oldestActiveAgeMs: number | null;
}

export function summarizeRaceEngineBatch(
  processed: readonly RaceEngineBatchItem[],
  activeQueueDepth: number,
  activeCreatedAt: readonly string[],
  now: string
): RaceEngineBatchMetrics {
  if (!Number.isInteger(activeQueueDepth) || activeQueueDepth < 0) {
    throw new RangeError("activeQueueDepth must be a non-negative integer");
  }
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Batch metrics now must be a valid timestamp");
  const ages = activeCreatedAt.map((value) => {
    const createdAtMs = Date.parse(value);
    if (!Number.isFinite(createdAtMs) || createdAtMs > nowMs) {
      throw new Error("Active session createdAt must be valid and not in the future");
    }
    return nowMs - createdAtMs;
  });
  const count = (status: string) => processed.filter((item) => item.status === status).length;
  const suspendedCount = count("suspended_by_red_flag");
  const busyCount = count("busy");
  const retryPendingCount = count("retry_pending");
  return Object.freeze({
    batchSize: processed.length,
    activeQueueDepth,
    progressedCount: processed.length - suspendedCount - busyCount - retryPendingCount,
    busyCount,
    retryPendingCount,
    suspendedCount,
    oldestActiveAgeMs: ages.length ? Math.max(...ages) : null
  });
}
