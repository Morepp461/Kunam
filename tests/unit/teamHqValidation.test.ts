import { describe, expect, it } from "vitest";
import { parseTeamHqConfigJson, teamHqFacilityConfigSchema } from "../../src/lib/teamHqValidation";

const validConfig = {
  facility_key: "driver_development_center", title: "Driver Development Center", description: "Development",
  is_enabled: true, max_level_premio: 8, max_level_zwei: 6,
  construction_cost_by_level: {}, construction_days_by_level: {}, maintenance_by_level: {},
  effects_by_level: {}, maintenance_required: false, unlock_rules: {},
};

describe("Team HQ configuration validation", () => {
  it("accepts the approved division level limits", () => {
    expect(teamHqFacilityConfigSchema.safeParse(validConfig).success).toBe(true);
  });
  it("rejects levels outside the division rules", () => {
    expect(teamHqFacilityConfigSchema.safeParse({ ...validConfig, max_level_zwei: 8 }).success).toBe(false);
  });
  it("rejects negative construction or maintenance values", () => {
    expect(teamHqFacilityConfigSchema.safeParse({ ...validConfig, construction_cost_by_level: { 2: -1 } }).success).toBe(false);
  });
  it("rejects arrays where a JSON object is required", () => {
    expect(() => parseTeamHqConfigJson({ construction_cost_by_level: "[]", construction_days_by_level: "{}", maintenance_by_level: "{}", effects_by_level: "{}", unlock_rules: "{}" })).toThrow();
  });
  it("parses FIA-provided JSON without inventing defaults", () => {
    expect(parseTeamHqConfigJson({ construction_cost_by_level: "{}", construction_days_by_level: "{}", maintenance_by_level: "{}", effects_by_level: "{}", unlock_rules: "{}" })).toEqual({ construction_cost_by_level: {}, construction_days_by_level: {}, maintenance_by_level: {}, effects_by_level: {}, unlock_rules: {} });
  });
});
