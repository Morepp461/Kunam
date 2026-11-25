import { describe, expect, it } from "vitest";
import { calculatePriceDemandFactor, calculateUnitMargin } from "../../src/lib/merchandisePricing";

describe("merchandise pricing", () => {
  it("keeps baseline demand at the configured reference price", () => {
    expect(calculatePriceDemandFactor(100, 100, 1)).toBe(1);
  });
  it("reduces demand when the selling price exceeds reference price", () => {
    expect(calculatePriceDemandFactor(100, 200, 1)).toBe(0.5);
  });
  it("increases demand when the selling price is below reference price", () => {
    expect(calculatePriceDemandFactor(100, 50, 1)).toBe(2);
  });
  it("clamps extreme price effects to the configured safety bounds", () => {
    expect(calculatePriceDemandFactor(1000, 1, 5)).toBe(3);
    expect(calculatePriceDemandFactor(1, 1000, 5)).toBe(0.1);
  });
  it("returns no demand factor for unconfigured prices", () => {
    expect(calculatePriceDemandFactor(0, 10, 1)).toBe(0);
    expect(calculatePriceDemandFactor(10, 0, 1)).toBe(0);
  });
  it("allows a negative unit margin to represent a loss", () => {
    expect(calculateUnitMargin(80, 100)).toBe(-20);
  });
});
