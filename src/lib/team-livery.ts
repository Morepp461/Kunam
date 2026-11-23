import { TEAM_LIVERY_DECALS } from "./team-livery-decals";

export type TeamLiveryPattern = "split" | "stripe" | "solid" | "carbon";
export interface TeamLiveryDesign {
  schemaVersion: 1;
  mainColor: string;
  secondaryColor: string;
  accentColor: string;
  pattern: TeamLiveryPattern;
  carNumber: string;
  teamWordmark: string;
  sponsors: [string, string, string];
  logoDataUrl: string | null;
  decalId: string;
  decalColor: string;
}
const HEX = /^#[0-9a-f]{6}$/i;
export function validateTeamLiveryDesign(value: unknown): value is TeamLiveryDesign {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.schemaVersion === 1 &&
    typeof row.mainColor === "string" && HEX.test(row.mainColor) &&
    typeof row.secondaryColor === "string" && HEX.test(row.secondaryColor) &&
    typeof row.accentColor === "string" && HEX.test(row.accentColor) &&
    ["split", "stripe", "solid", "carbon"].includes(String(row.pattern)) &&
    typeof row.carNumber === "string" && /^\d{1,3}$/.test(row.carNumber) &&
    typeof row.teamWordmark === "string" && row.teamWordmark.length <= 28 &&
    Array.isArray(row.sponsors) && row.sponsors.length === 3 &&
    row.sponsors.every(item => typeof item === "string" && item.length <= 24) &&
    (row.logoDataUrl === null || (typeof row.logoDataUrl === "string" &&
      /^data:image\/(png|jpeg|webp);base64,/i.test(row.logoDataUrl) && row.logoDataUrl.length <= 140000));
}
