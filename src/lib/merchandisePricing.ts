export function calculatePriceDemandFactor(referencePrice: number, sellingPrice: number, elasticity: number): number {
  if (![referencePrice, sellingPrice, elasticity].every(Number.isFinite) || referencePrice <= 0 || sellingPrice <= 0 || elasticity < 0) return 0;
  return Math.min(3, Math.max(0.1, Math.pow(referencePrice / sellingPrice, elasticity)));
}

export function calculateUnitMargin(sellingPrice: number, unitCost: number): number {
  if (![sellingPrice, unitCost].every(Number.isFinite)) return 0;
  return sellingPrice - unitCost;
}
