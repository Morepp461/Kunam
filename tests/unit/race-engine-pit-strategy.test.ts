import { describe, expect, it } from "vitest";
import { choosePitDecision, createPitStrategyModel } from "../../src/lib/race-engine/pit-strategy";
import type { PitDecisionInput, PitStrategyProfile } from "../../src/lib/race-engine/pit-strategy";

const profile: PitStrategyProfile = {
  schemaVersion: 1, id: "pit-test", version: "1.0.0",
  pitWindowStartLap: 5, pitWindowEndLap: 20, wearTriggerPercent: 50,
  minimumLapsBetweenStops: 3, maximumStops: 2
};
const input: PitDecisionInput = {
  currentLap: 8, totalLaps: 30, currentWearPercent: 70, currentCompound: "soft",
  currentStopCount: 0, lastStopLap: null, trackWetness: 0.1,
  candidates: [
    { compound: "medium", pitLaneLossMs: 20_000, expectedLapTimeDeltaMs: 120, expectedDegradationMsPerLap: 60, riskPenaltyMs: 0, compatibleWetnessMin: 0, compatibleWetnessMax: 0.3 },
    { compound: "hard", pitLaneLossMs: 20_000, expectedLapTimeDeltaMs: 80, expectedDegradationMsPerLap: 10, riskPenaltyMs: 0, compatibleWetnessMin: 0, compatibleWetnessMax: 0.3 },
    { compound: "intermediate", pitLaneLossMs: 20_000, expectedLapTimeDeltaMs: 100, expectedDegradationMsPerLap: 5, riskPenaltyMs: 0, compatibleWetnessMin: 0.3, compatibleWetnessMax: 1 }
  ]
};

describe("Pit strategy selector", () => {
  it("chooses the lowest caller-calibrated total time cost", () => {
    const decision = choosePitDecision(createPitStrategyModel(profile), input);
    expect(decision.shouldPit).toBe(true);
    expect(decision.selectedCompound).toBe("hard");
    expect(decision.reason).toBe("optimal_candidate");
  });

  it("respects window, wear, stop limit, and minimum interval constraints", () => {
    const model = createPitStrategyModel(profile);
    expect(choosePitDecision(model, { ...input, currentLap: 2 }).reason).toBe("outside_window");
    expect(choosePitDecision(model, { ...input, currentWearPercent: 10 }).reason).toBe("wear_below_trigger");
    expect(choosePitDecision(model, { ...input, currentStopCount: 2 }).reason).toBe("stop_limit");
    expect(choosePitDecision(model, { ...input, lastStopLap: 7 }).reason).toBe("minimum_interval");
  });

  it("does not select a tyre outside the supplied wetness compatibility range", () => {
    const decision = choosePitDecision(createPitStrategyModel(profile), { ...input, trackWetness: 0.8, candidates: input.candidates.map((candidate) => ({ ...candidate, compatibleWetnessMax: 0.3 })) });
    expect(decision.reason).toBe("no_valid_candidate");
    expect(decision.selectedCompound).toBeNull();
  });


  it("applies calibrated Strategy Quality and Pit Stop Efficiency adjustments to candidate costs", () => {
    const model = createPitStrategyModel(profile);
    const baseline = choosePitDecision(model, input);
    const calibrated = choosePitDecision(model, {
      ...input,
      strategyQualityAdjustmentMs: -1_000,
      pitStopTimeAdjustmentMs: -2_000
    });
    expect(calibrated.selectedCompound).toBe(baseline.selectedCompound);
    expect(calibrated.expectedTimeCostMs).toBe(baseline.expectedTimeCostMs! - 3_000);
  });

  it("rejects non-finite calibrated pit strategy adjustments", () => {
    const model = createPitStrategyModel(profile);
    expect(() => choosePitDecision(model, { ...input, strategyQualityAdjustmentMs: Number.NaN }))
      .toThrow(/strategyQualityAdjustmentMs/);
    expect(() => choosePitDecision(model, { ...input, pitStopTimeAdjustmentMs: Number.POSITIVE_INFINITY }))
      .toThrow(/pitStopTimeAdjustmentMs/);
  });

  it("rejects invalid profile and candidate inputs", () => {
    expect(() => createPitStrategyModel({ ...profile, maximumStops: -1 })).toThrow(/Invalid pit strategy profile/);
    expect(() => choosePitDecision(createPitStrategyModel(profile), {
      ...input, candidates: [{ ...input.candidates[0], pitLaneLossMs: -1 }]
    })).toThrow(/candidate constraints/);
  });
});
