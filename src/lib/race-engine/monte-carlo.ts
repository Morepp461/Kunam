export interface MonteCarloDistribution {
  readonly sampleCount: number;
  readonly minimum: number;
  readonly percentile10: number;
  readonly median: number;
  readonly percentile90: number;
  readonly maximum: number;
  readonly mean: number;
  readonly standardDeviation: number;
  readonly iqrOutlierCount: number;
}

function quantile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Summarizes finite Monte Carlo observations without imposing an unapproved balance threshold. */
export function summarizeMonteCarloDistribution(values: readonly number[]): MonteCarloDistribution {
  if (values.length === 0) throw new RangeError("Monte Carlo distribution requires at least one sample");
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Monte Carlo samples must all be finite numbers");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  return {
    sampleCount: sorted.length,
    minimum: sorted[0],
    percentile10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    percentile90: quantile(sorted, 0.9),
    maximum: sorted[sorted.length - 1],
    mean,
    standardDeviation: Math.sqrt(variance),
    iqrOutlierCount: sorted.filter((value) => value < lowerFence || value > upperFence).length
  };
}
