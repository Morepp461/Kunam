export const TEAM_HQ_RACE_SNAPSHOT_SCHEMA_VERSION = 1;

export const RACE_RELEVANT_HQ_FACILITY_KEYS = [
  "engineering_department",
  "rd_center",
  "simulator_facility",
  "pit_crew_training_center"
] as const;

export const RACE_HQ_EFFECT_KEYS = [
  "race_pace_bonus",
  "reliability_bonus",
  "aero_power_bonus",
  "pit_stop_efficiency_bonus"
] as const;

export type TeamHqDivision = "premio" | "zwei";
export type RaceHqEffectKey = (typeof RACE_HQ_EFFECT_KEYS)[number];

export interface TeamHqFacilityLevelInput {
  readonly facilityKey: string;
  readonly level: number;
  readonly condition?: number;
}

export interface TeamHqFacilityConfigInput {
  readonly facilityKey: string;
  readonly isEnabled: boolean;
  readonly maxLevelPremio: number;
  readonly maxLevelZwei: number;
  readonly effectsByLevel: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly updatedAt: string;
}

export interface TeamHqFacilityAppliedSnapshot {
  readonly facilityKey: string;
  readonly level: number;
  readonly condition: number;
  readonly configUpdatedAt: string;
  readonly maximumLevel: number;
  readonly isEnabled: boolean;
  readonly appliedEffects: Readonly<Partial<Record<RaceHqEffectKey, number>>>;
}

export interface TeamHqRaceEffectSnapshot {
  readonly schemaVersion: typeof TEAM_HQ_RACE_SNAPSHOT_SCHEMA_VERSION;
  readonly division: TeamHqDivision;
  readonly capturedAt: string;
  readonly facilityLevels: Readonly<Record<string, number>>;
  readonly facilities: readonly TeamHqFacilityAppliedSnapshot[];
  readonly unresolvedFacilityKeys: readonly string[];
  readonly effects: Readonly<Partial<Record<RaceHqEffectKey, number>>>;
}

export interface TeamHqRaceEffectResolution {
  readonly snapshot: TeamHqRaceEffectSnapshot;
  readonly unresolvedFacilityKeys: readonly string[];
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateTeamHqRaceEffectSnapshot(snapshot: TeamHqRaceEffectSnapshot): readonly string[] {
  const errors: string[] = [];
  if (snapshot.schemaVersion !== TEAM_HQ_RACE_SNAPSHOT_SCHEMA_VERSION) errors.push("Unsupported HQ race-effect snapshot schema version");
  if (snapshot.division !== "premio" && snapshot.division !== "zwei") errors.push("HQ snapshot division is invalid");
  if (!validTimestamp(snapshot.capturedAt)) errors.push("HQ snapshot capture timestamp is invalid");
  for (const [key, level] of Object.entries(snapshot.facilityLevels)) {
    if (!key.trim() || !Number.isInteger(level) || level < 0 || level > 8) errors.push(`HQ snapshot level for ${key} is invalid`);
  }
  if (!Array.isArray(snapshot.unresolvedFacilityKeys)) errors.push("HQ snapshot unresolved facility list is invalid");
  else if (snapshot.unresolvedFacilityKeys.length > 0) errors.push(`HQ facilities have no configured race effect: ${snapshot.unresolvedFacilityKeys.join(", ")}`);
  const aggregate: Partial<Record<RaceHqEffectKey, number>> = {};
  for (const facility of snapshot.facilities) {
    if (!RACE_RELEVANT_HQ_FACILITY_KEYS.includes(facility.facilityKey as (typeof RACE_RELEVANT_HQ_FACILITY_KEYS)[number])) {
      errors.push(`HQ snapshot contains unknown race facility ${facility.facilityKey}`);
    }
    if (snapshot.facilityLevels[facility.facilityKey] !== facility.level) {
      errors.push(`HQ snapshot level mismatch for ${facility.facilityKey}`);
    }
    if (!validTimestamp(facility.configUpdatedAt)) errors.push(`HQ config revision timestamp is invalid for ${facility.facilityKey}`);
    if (!Number.isInteger(facility.maximumLevel) || facility.maximumLevel < 0 || facility.level > facility.maximumLevel) errors.push(`HQ snapshot configured maximum is invalid for ${facility.facilityKey}`);
    if (!Number.isFinite(facility.condition) || facility.condition < 0 || facility.condition > 100) errors.push(`HQ snapshot condition for ${facility.facilityKey} is invalid`);
    if (facility.level > 0 && !facility.isEnabled) errors.push(`HQ facility ${facility.facilityKey} is disabled`);
    for (const [key, value] of Object.entries(facility.appliedEffects)) {
      if (!(RACE_HQ_EFFECT_KEYS as readonly string[]).includes(key) || !Number.isFinite(value)) {
        errors.push(`HQ snapshot effect ${facility.facilityKey}.${key} is invalid`);
        continue;
      }
      const effectKey = key as RaceHqEffectKey;
      aggregate[effectKey] = (aggregate[effectKey] ?? 0) + value;
    }
  }
  for (const key of RACE_HQ_EFFECT_KEYS) {
    if (Math.abs((aggregate[key] ?? 0) - (snapshot.effects[key] ?? 0)) > 1e-9) {
      errors.push(`HQ snapshot aggregate effect mismatch for ${key}`);
    }
    if (snapshot.effects[key] !== undefined && !Number.isFinite(snapshot.effects[key])) {
      errors.push(`HQ snapshot effect ${key} must be finite`);
    }
  }
  return Object.freeze(errors);
}

/**
 * Resolves only effects explicitly present in the current HQ configuration.
 * It does not infer a gameplay bonus from a facility's name or level.
 */
export function resolveTeamHqRaceEffects(
  division: TeamHqDivision,
  levels: readonly TeamHqFacilityLevelInput[],
  configs: readonly TeamHqFacilityConfigInput[],
  capturedAt: string
): TeamHqRaceEffectResolution {
  if (!validTimestamp(capturedAt)) throw new Error("HQ race-effect capture timestamp is invalid");

  const configByKey = new Map<string, TeamHqFacilityConfigInput>();
  for (const config of configs) {
    if (!config.facilityKey.trim() || configByKey.has(config.facilityKey)) {
      throw new Error("HQ facility config keys must be present and unique");
    }
    if (!validTimestamp(config.updatedAt)) throw new Error(`HQ config ${config.facilityKey} has an invalid revision timestamp`);
    configByKey.set(config.facilityKey, config);
  }

  const levelByKey = new Map<string, number>();
  for (const item of levels) {
    if (!item.facilityKey.trim() || levelByKey.has(item.facilityKey)) {
      throw new Error("HQ facility level keys must be present and unique");
    }
    const config = configByKey.get(item.facilityKey);
    if (!config) throw new Error(`HQ config is missing for ${item.facilityKey}`);
    const maximum = division === "premio" ? config.maxLevelPremio : config.maxLevelZwei;
    if (!Number.isInteger(item.level) || item.level < 0 || item.level > maximum) {
      throw new Error(`HQ facility ${item.facilityKey} level is outside its configured division limit`);
    }
    const condition = item.condition ?? 100;
    if (!Number.isFinite(condition) || condition < 0 || condition > 100) {
      throw new Error(`HQ facility ${item.facilityKey} condition must be between 0 and 100`);
    }
    levelByKey.set(item.facilityKey, item.level);
  }

  const effects: Partial<Record<RaceHqEffectKey, number>> = {};
  const facilities: TeamHqFacilityAppliedSnapshot[] = [];
  const unresolved: string[] = [];

  for (const facilityKey of RACE_RELEVANT_HQ_FACILITY_KEYS) {
    const level = levelByKey.get(facilityKey) ?? 0;
    const input = levels.find((item) => item.facilityKey === facilityKey);
    const condition = input?.condition ?? 100;
    const config = configByKey.get(facilityKey);
    if (!config) {
      if (level > 0) unresolved.push(facilityKey);
      continue;
    }
    if (level === 0) continue;
    if (!config.isEnabled) { unresolved.push(facilityKey); continue; }
    if (condition <= 0) {
      facilities.push(Object.freeze({
        facilityKey, level, condition, configUpdatedAt: config.updatedAt,
        maximumLevel: division === "premio" ? config.maxLevelPremio : config.maxLevelZwei,
        isEnabled: config.isEnabled, appliedEffects: Object.freeze({})
      }));
      continue;
    }

    const configured = config.effectsByLevel[String(level)] ?? {};
    const applied: Partial<Record<RaceHqEffectKey, number>> = {};
    for (const effectKey of RACE_HQ_EFFECT_KEYS) {
      const value = configured[effectKey];
      if (value === undefined) continue;
      if (!Number.isFinite(value)) throw new Error(`HQ effect ${facilityKey}.${effectKey} must be finite`);
      const conditionScaledValue = value * condition / 100;
      applied[effectKey] = conditionScaledValue;
      effects[effectKey] = (effects[effectKey] ?? 0) + conditionScaledValue;
    }

    if (Object.keys(applied).length === 0) unresolved.push(facilityKey);
    facilities.push(Object.freeze({
      facilityKey,
      level,
      condition,
      configUpdatedAt: config.updatedAt,
      maximumLevel: division === "premio" ? config.maxLevelPremio : config.maxLevelZwei,
      isEnabled: config.isEnabled,
      appliedEffects: Object.freeze(applied)
    }));
  }

  const facilityLevels = Object.freeze(Object.fromEntries([...levelByKey.entries()].sort(([a], [b]) => a.localeCompare(b))));
  return Object.freeze({
    snapshot: Object.freeze({
      schemaVersion: TEAM_HQ_RACE_SNAPSHOT_SCHEMA_VERSION,
      division,
      capturedAt,
      facilityLevels,
      facilities: Object.freeze(facilities),
      unresolvedFacilityKeys: Object.freeze(unresolved.sort()),
      effects: Object.freeze(effects)
    }),
    unresolvedFacilityKeys: Object.freeze(unresolved.sort())
  });
}
