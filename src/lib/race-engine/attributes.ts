export type AttributeScope = "driver" | "car_team";
export type AttributeDirection = "higher_is_better" | "higher_is_riskier" | "calibration_required";

export interface RaceAttributeDefinition {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly scope: AttributeScope;
  readonly dataType: "number";
  readonly unit: "rating_points";
  readonly min: 50;
  readonly max: 100;
  readonly direction: AttributeDirection;
  readonly introducedIn: 1;
  readonly status: "active";
}

const driverAttributes = [
  { id: "driver.race_pace", key: "race_pace", label: "Race Pace", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "driver.qualifying_pace", key: "qualifying_pace", label: "Qualifying Pace", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "driver.experience", key: "experience", label: "Experience", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "driver.aggression", key: "aggression", label: "Aggression", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "driver.defensive_strength", key: "defensive_strength", label: "Defensive Strength", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "driver.overtake_skill", key: "overtake_skill", label: "Overtake Skill", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "driver.mistake_rate", key: "mistake_rate", label: "Mistake Rate", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "higher_is_riskier", introducedIn: 1, status: "active" },
  { id: "driver.tyre_management", key: "tyre_management", label: "Tyre Management", scope: "driver", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" }
] as const satisfies readonly RaceAttributeDefinition[];

const carTeamAttributes = [
  { id: "car_team.race_pace", key: "race_pace", label: "Race Pace", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.qualifying_pace", key: "qualifying_pace", label: "Qualifying Pace", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.engine_power", key: "engine_power", label: "Engine Power", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.aero_power", key: "aero_power", label: "Aero Power", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.low_speed_corners", key: "low_speed_corners", label: "Low Speed Corners", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.high_speed_corners", key: "high_speed_corners", label: "High Speed Corners", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.traction", key: "traction", label: "Traction", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.mechanical_grip", key: "mechanical_grip", label: "Mechanical Grip", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.team_tyre_management", key: "team_tyre_management", label: "Team Tyre Management", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.strategy_quality", key: "strategy_quality", label: "Strategy Quality", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.team_morale", key: "team_morale", label: "Team Morale", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.reliability", key: "reliability", label: "Reliability", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.car_tyre_wear", key: "car_tyre_wear", label: "Car Tyre Wear", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.pit_stop_efficiency", key: "pit_stop_efficiency", label: "Pit Stop Efficiency", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.drs_efficiency", key: "drs_efficiency", label: "DRS Efficiency", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" },
  { id: "car_team.ers_efficiency", key: "ers_efficiency", label: "ERS Efficiency", scope: "car_team", dataType: "number", unit: "rating_points", min: 50, max: 100, direction: "calibration_required", introducedIn: 1, status: "active" }
] as const satisfies readonly RaceAttributeDefinition[];

export const ATTRIBUTE_SCHEMA_VERSION = 1;
export const DRIVER_ATTRIBUTE_DEFINITIONS = Object.freeze(driverAttributes);
export const CAR_TEAM_ATTRIBUTE_DEFINITIONS = Object.freeze(carTeamAttributes);
export const RACE_ATTRIBUTE_DEFINITIONS = Object.freeze([
  ...DRIVER_ATTRIBUTE_DEFINITIONS,
  ...CAR_TEAM_ATTRIBUTE_DEFINITIONS
]);

export type DriverAttributeKey = (typeof DRIVER_ATTRIBUTE_DEFINITIONS)[number]["key"];
export type CarTeamAttributeKey = (typeof CAR_TEAM_ATTRIBUTE_DEFINITIONS)[number]["key"];
export type DriverAttributeValues = Readonly<Record<DriverAttributeKey, number>>;
export type CarTeamAttributeValues = Readonly<Record<CarTeamAttributeKey, number>>;

export interface AttributeValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateAttributeValues(
  scope: AttributeScope,
  values: Readonly<Record<string, unknown>>
): AttributeValidationResult {
  const definitions = scope === "driver"
    ? DRIVER_ATTRIBUTE_DEFINITIONS
    : CAR_TEAM_ATTRIBUTE_DEFINITIONS;
  const expectedKeys = new Set<string>(definitions.map((definition) => definition.key));
  const errors: string[] = [];

  for (const definition of definitions) {
    const value = values[definition.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${definition.key} must be a finite number`);
      continue;
    }
    if (value < definition.min || value > definition.max) {
      errors.push(`${definition.key} must be between ${definition.min} and ${definition.max}`);
    }
  }

  for (const key of Object.keys(values)) {
    if (!expectedKeys.has(key)) errors.push(`Unknown ${scope} attribute: ${key}`);
  }

  return { valid: errors.length === 0, errors };
}

export function getAttributeDefinition(id: string): RaceAttributeDefinition | undefined {
  return RACE_ATTRIBUTE_DEFINITIONS.find((definition) => definition.id === id);
}
