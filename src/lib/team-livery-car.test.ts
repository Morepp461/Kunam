import { describe, expect, it } from "vitest";
import { buildF1Appearance } from "./team-livery-car";

const design = {
  mainColor: "#B51F2B",
  secondaryColor: "#17191D",
  accentColor: "#F2EEE5",
  pattern: "stripe" as const,
  carNumber: "16",
  teamWordmark: "CALERIS RACING",
  sponsors: ["TITLE SPONSOR", "MAJOR PARTNER", "OFFICIAL PARTNER"] as [string, string, string],
  logoDataUrl: "data:image/webp;base64,AA==",
  decals: [{ id: "decal-12", color: "#ffffff", scale: 1, rotation: 0, x: 50, y: 50, surface: "sidepod" }],
  sponsorPlacements: { title: "title", major: "major", partner: "other" } as Record<string, "title" | "major" | "other">,
};

describe("team livery to 2026 chassis mapping", () => {
  it("maps team identity, colors, number, decal and logo into the chassis appearance", () => {
    const appearance = buildF1Appearance(design, []);
    expect(appearance.primaryHex).toBe(design.mainColor);
    expect(appearance.secondaryHex).toBe(design.secondaryColor);
    expect(appearance.accentHex).toBe(design.accentColor);
    expect(appearance.carNumber).toBe("16");
    expect(appearance.decalId).toBe("decal-12");
    expect(appearance.teamDecals).toEqual(design.decals);
    expect(appearance.sponsorSlots["slot-1"].customText).toBe("CALERIS RACING");
    expect(appearance.sponsorSlots["slot-1"].logoDataUrl).toBe(design.logoDataUrl);
  });

  it("maps active sponsor placements into the corresponding chassis sponsor slots", () => {
    const appearance = buildF1Appearance(design, [
      { id: "title", name: "Title Racing" },
      { id: "major", name: "Major Tech" },
      { id: "partner", name: "Official Partner" },
    ]);
    expect(appearance.sponsorSlots["slot-3"].customText).toBe("Title Racing");
    expect(appearance.sponsorSlots["slot-5"].customText).toBe("Major Tech");
    expect(appearance.sponsorSlots["slot-7"].customText).toBe("Official Partner");
  });

  it("uses a compatible visual preset when no custom decal layer exists", () => {
    const appearance = buildF1Appearance({ ...design, decals: [], pattern: "carbon" }, []);
    expect(appearance.decalId).toBe("decal-06");
  });
});
