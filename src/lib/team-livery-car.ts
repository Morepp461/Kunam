import { createDefaultSponsorSlots, type SponsorSlotId } from "./three-f1-car/f1Decals";
import type { TeamLiveryDecal } from "./team-livery-decals";
import type { F1AppearanceConfig } from "./three-f1-car/f1Materials";

export type TeamCarLiveryDesign = {
  mainColor: string;
  secondaryColor: string;
  accentColor: string;
  pattern: "split" | "stripe" | "solid" | "carbon";
  carNumber: string;
  teamWordmark: string;
  sponsors: [string, string, string];
  logoDataUrl: string | null;
  decals: TeamLiveryDecal[];
  sponsorPlacements: Record<string, "title" | "major" | "other">;
};

export type TeamCarSponsor = { id: string; name: string };

export function buildF1Appearance(
  design: TeamCarLiveryDesign,
  sponsors: readonly TeamCarSponsor[],
): F1AppearanceConfig {
  const slots = createDefaultSponsorSlots();
  const labelFor = (placement: "title" | "major" | "other", fallback: string) => {
    const names = sponsors
      .filter((sponsor) => design.sponsorPlacements[sponsor.id] === placement)
      .map((sponsor) => sponsor.name.trim())
      .filter(Boolean);
    return (names.length ? names.join(" / ") : fallback).slice(0, 24);
  };

  const labels = {
    title: labelFor("title", design.sponsors[0]),
    major: labelFor("major", design.sponsors[1]),
    other: labelFor("other", design.sponsors[2]),
  };
  const configure = (id: SponsorSlotId, customText: string, logoDataUrl: string | null = null) => {
    slots[id] = { id, enabled: Boolean(customText || logoDataUrl), customText, logoDataUrl };
  };

  configure("slot-1", design.teamWordmark, design.logoDataUrl);
  configure("slot-2", labels.title);
  configure("slot-3", labels.title);
  configure("slot-4", labels.title);
  configure("slot-5", labels.major);
  configure("slot-6", labels.major);
  configure("slot-7", labels.other);
  configure("slot-8", labels.other);

  const patternDecal: Record<TeamCarLiveryDesign["pattern"], string> = {
    split: "decal-01",
    stripe: "decal-11",
    solid: "decal-01",
    carbon: "decal-06",
  };
  const selectedDecal = design.decals.find((decal) => /^decal-\d{2}$/.test(decal.id));

  return {
    primaryHex: design.mainColor,
    secondaryHex: design.secondaryColor,
    decalHex: design.accentColor,
    accentHex: design.accentColor,
    decalId: selectedDecal?.id ?? patternDecal[design.pattern],
    carNumber: design.carNumber,
    sponsorSlots: slots,
    decalPeel: 0,
    metalness: 0.38,
    roughness: 0.24,
    clearcoat: 0.95,
    rimAccent: design.accentColor,
    teamDecals: design.decals.map((decal) => ({ ...decal })),
  };
}
