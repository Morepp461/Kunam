export type TeamLiveryPattern = "split" | "stripe" | "solid" | "carbon";
import { TEAM_LIVERY_DECAL_CATALOG, type TeamLiveryDecal } from "./team-livery-decals";

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
  decals?: TeamLiveryDecal[];
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
      /^data:image\/(png|jpeg|webp);base64,/i.test(row.logoDataUrl) && row.logoDataUrl.length <= 140000)) &&
    (row.decals === undefined || (Array.isArray(row.decals) && row.decals.length <= 50 && row.decals.every((item) => {
      if (!item || typeof item !== "object") return false;
      const decal = item as Record<string, unknown>;
      return TEAM_LIVERY_DECAL_CATALOG.some((entry) => entry.id === decal.id) &&
        typeof decal.color === "string" && HEX.test(decal.color) &&
        typeof decal.scale === "number" && decal.scale >= 0.2 && decal.scale <= 2 &&
        typeof decal.rotation === "number" && decal.rotation >= -180 && decal.rotation <= 180 &&
        typeof decal.x === "number" && decal.x >= 0 && decal.x <= 100 &&
        typeof decal.y === "number" && decal.y >= 0 && decal.y <= 100 &&
        ["sidepod", "nose", "frontWing", "rearWing"].includes(String(decal.surface));
    }))) &&
    (row.sponsorPlacements === undefined || (row.sponsorPlacements !== null && typeof row.sponsorPlacements === "object" && !Array.isArray(row.sponsorPlacements) && Object.keys(row.sponsorPlacements).length <= 20 && Object.values(row.sponsorPlacements).every(value => ["title", "major", "other"].includes(String(value)))));
}
