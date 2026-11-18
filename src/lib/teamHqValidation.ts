import { z } from "zod";

const nonNegativeNumberMap = z.record(z.string(), z.number().finite().nonnegative());
const jsonObject = z.record(z.string(), z.unknown());

export const teamHqFacilityConfigSchema = z.object({
  facility_key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(1000),
  is_enabled: z.boolean(),
  max_level_premio: z.number().int().min(1).max(8),
  max_level_zwei: z.number().int().min(1).max(6),
  construction_cost_by_level: nonNegativeNumberMap,
  construction_days_by_level: nonNegativeNumberMap,
  maintenance_by_level: nonNegativeNumberMap,
  effects_by_level: jsonObject,
  maintenance_required: z.boolean(),
  unlock_rules: jsonObject,
});

export function parseTeamHqConfigJson(input: Record<string, string>) {
  const fields = [
    "construction_cost_by_level",
    "construction_days_by_level",
    "maintenance_by_level",
    "effects_by_level",
    "unlock_rules",
  ] as const;
  const parsed: Record<string, unknown> = {};
  for (const field of fields) {
    const value: unknown = JSON.parse(input[field] || "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Konfigurasi ${field} harus berupa object JSON.`);
    }
    parsed[field] = value;
  }
  return parsed;
}
