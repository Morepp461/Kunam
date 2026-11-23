import { describe, expect, it } from "vitest";
import { validateTeamLiveryDesign } from "./team-livery";
import { TEAM_LIVERY_DECALS } from "./team-livery-decals";

const valid = { schemaVersion:1, mainColor:"#B51F2B", secondaryColor:"#17191D", accentColor:"#F2EEE5", pattern:"split", carNumber:"16", teamWordmark:"CALERIS", sponsors:["TITLE","TECH","PARTNER"], logoDataUrl:null, decalId:"decal-01", decalColor:"#F2EEE5" };

describe("team livery contract", () => {
  it("accepts a valid v1 atlas design", () => expect(validateTeamLiveryDesign(valid)).toBe(true));
  it("rejects malformed colors, unknown patterns and oversized sponsor labels", () => {
    expect(validateTeamLiveryDesign({...valid,mainColor:"red"})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,pattern:"neon"})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,sponsors:["A".repeat(25),"B","C"]})).toBe(false);
  });
  it("exposes fifty unique, colorable decal variants", () => {
    expect(TEAM_LIVERY_DECALS).toHaveLength(50);
    expect(new Set(TEAM_LIVERY_DECALS.map(item => item.id)).size).toBe(50);
    expect(TEAM_LIVERY_DECALS.every(item => item.name.length > 0 && item.category.length > 0)).toBe(true);
    expect(validateTeamLiveryDesign({...valid, decalId:"decal-50", decalColor:"#12ABEF"})).toBe(true);
    expect(validateTeamLiveryDesign({...valid, decalId:"decal-51"})).toBe(false);
    expect(validateTeamLiveryDesign({...valid, decalColor:"red"})).toBe(false);
  });
  it("rejects unsupported or oversized uploaded logo payloads", () => {
    expect(validateTeamLiveryDesign({...valid,logoDataUrl:"data:image/svg+xml;base64,AA=="})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,logoDataUrl:"data:image/png;base64,"+"A".repeat(140001)})).toBe(false);
  });
});
