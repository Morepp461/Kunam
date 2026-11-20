export type ScheduleRound = {
  id: string;
  season_division_id: string;
  round_number: number;
  status?: string | null;
};
export type SchedulePeriodMapping = {
  period_id: string;
  season_division_id: string;
  round_id: string;
};
export type CircuitIdentity = {
  id: string;
  name: string;
  country_code: string;
};
export type RoundCircuitIdentity = {
  circuit_name?: string | null;
  circuit_country_code?: string | null;
};

export function getScheduleRoundsForPeriod<T extends ScheduleRound>(
  rounds: T[],
  mappings: SchedulePeriodMapping[],
  periodId: string,
  divisionIds: Set<string>,
): T[] {
  const mappedRoundIds = new Set(
    mappings
      .filter((mapping) => mapping.period_id === periodId && divisionIds.has(mapping.season_division_id))
      .map((mapping) => mapping.round_id),
  );
  const seen = new Set<string>();
  return rounds
    .filter((round) => {
      if (round.status === "cancelled" || !divisionIds.has(round.season_division_id) || !mappedRoundIds.has(round.id) || seen.has(round.id)) return false;
      seen.add(round.id);
      return true;
    })
    .sort((a, b) => a.round_number - b.round_number);
}

export function findCircuitForRound<T extends CircuitIdentity>(
  circuits: T[],
  round: RoundCircuitIdentity,
): T | null {
  const name = round.circuit_name?.trim().toLocaleLowerCase("id-ID");
  const country = round.circuit_country_code?.trim().toUpperCase();
  if (!name || !country) return null;
  return circuits.find((circuit) =>
    circuit.name.trim().toLocaleLowerCase("id-ID") === name &&
    circuit.country_code.toUpperCase() === country
  ) ?? null;
}
