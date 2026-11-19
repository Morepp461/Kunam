import { describe, expect, it } from "vitest";
import { createStage5QueryPlan } from "../../src/lib/stage5QueryPlan";

describe("Stage5 route-scoped data plan", () => {
  it("keeps unrelated economy and sponsorship queries out of competition pages", () => {
    const plan = createStage5QueryPlan("main-event", "global", "", true);
    expect(plan.needsRaceResults).toBe(true);
    expect(plan.needsResultEntries).toBe(true);
    expect(plan.needsRoundPoints).toBe(true);
    expect(plan.needsWallets).toBe(false);
    expect(plan.needsFinancialLedger).toBe(false);
    expect(plan.needsSponsorshipData).toBe(false);
  });
  it("loads schedule mappings only on calendar detail", () => {
    expect(createStage5QueryPlan("main-event", "global", "calendar").isCompetitionSchedulePage).toBe(true);
    expect(createStage5QueryPlan("main-event", "global", "driver-ranking").isCompetitionSchedulePage).toBe(false);
  });
  it("loads avatar paths only for driver exhibition", () => {
    expect(createStage5QueryPlan("main-event", "global", "driver-list").needsDirectoryAvatars).toBe(true);
    expect(createStage5QueryPlan("main-event", "global", "team-list").needsDirectoryAvatars).toBe(false);
  });
  it("loads driver profile data without financial transaction history", () => {
    const plan = createStage5QueryPlan("driver-panel", "character", "");
    expect(plan.needsAttributes).toBe(true);
    expect(plan.needsWallets).toBe(true);
    expect(plan.needsDriverReputation).toBe(true);
    expect(plan.needsFinancialLedger).toBe(false);
  });
  it("loads historical race data for career history without wallet data", () => {
    const plan = createStage5QueryPlan("driver-panel", "career-history", "");
    expect(plan.needsFinalStandings).toBe(true);
    expect(plan.needsRaceResults).toBe(true);
    expect(plan.needsRoundPoints).toBe(true);
    expect(plan.needsWallets).toBe(false);
  });
  it("loads wallet and ledger data only for Financial Centre", () => {
    const plan = createStage5QueryPlan("driver-panel", "financial-centre", "");
    expect(plan.needsWallets).toBe(true);
    expect(plan.needsFinancialLedger).toBe(true);
    expect(plan.needsRaceResults).toBe(false);
    expect(plan.needsAttributes).toBe(false);
  });
  it("loads all team scouting dependencies, including active season contracts", () => {
    const plan = createStage5QueryPlan("team-panel", "scout", "");
    expect(plan.needsSeasonData).toBe(true);
    expect(plan.needsTeamData).toBe(true);
    expect(plan.needsMemberDirectory).toBe(true);
    expect(plan.needsContracts).toBe(true);
    expect(plan.needsAttributes).toBe(true);
    expect(plan.needsDriverReputation).toBe(true);
  });
  it("loads sponsorship data only for Team Summary", () => {
    expect(createStage5QueryPlan("team-panel", "team-summary", "").needsSponsorshipData).toBe(true);
    expect(createStage5QueryPlan("team-panel", "scout", "").needsSponsorshipData).toBe(false);
  });
  it("loads team names and adverts for Job Search", () => {
    const plan = createStage5QueryPlan("main-event", "job-search", "");
    expect(plan.needsTeamData).toBe(true);
    expect(plan.needsJobAdverts).toBe(true);
    expect(plan.needsRaceResults).toBe(false);
  });
  it("loads FIA appeal data only for Admin", () => {
    expect(createStage5QueryPlan("fia-panel", "appeal-room", "", false).needsAppealData).toBe(false);
    expect(createStage5QueryPlan("fia-panel", "appeal-room", "", true).needsAppealData).toBe(true);
  });
});
