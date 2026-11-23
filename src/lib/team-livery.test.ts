import { describe, expect, it } from "vitest";
import { validateTeamLiveryDesign } from "./team-livery";
import { TEAM_LIVERY_DECAL_CATALOG } from "./team-livery-decals";

const valid = { schemaVersion:1, mainColor:"#B51F2B", secondaryColor:"#17191D", accentColor:"#F2EEE5", pattern:"split", carNumber:"16", teamWordmark:"CALERIS", sponsors:["TITLE","TECH","PARTNER"], logoDataUrl:null };

describe("team livery contract", () => {
  it("accepts a valid v1 atlas design", () => expect(validateTeamLiveryDesign(valid)).toBe(true));
  it("rejects malformed colors, unknown patterns and oversized sponsor labels", () => {
    expect(validateTeamLiveryDesign({...valid,mainColor:"red"})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,pattern:"neon"})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,sponsors:["A".repeat(25),"B","C"]})).toBe(false);
  });
  it("exposes 50 distinct vector decal presets across ten design families", () => {
    expect(TEAM_LIVERY_DECAL_CATALOG).toHaveLength(50);
    expect(new Set(TEAM_LIVERY_DECAL_CATALOG.map(item => item.id)).size).toBe(50);
    expect(new Set(TEAM_LIVERY_DECAL_CATALOG.map(item => item.family)).size).toBe(10);
  });
  it("accepts bounded custom decal layers and rejects invalid colors or transforms", () => {
    const decals = [{id:"decal-01",color:"#FFAA22",scale:1,rotation:15,x:50,y:45,surface:"sidepod"}];
    expect(validateTeamLiveryDesign({...valid,decals})).toBe(true);
    expect(validateTeamLiveryDesign({...valid,decals:[{...decals[0],color:"red"}]})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,decals:[{...decals[0],scale:3}]})).toBe(false);
  });
  it("rejects unsupported or oversized uploaded logo payloads", () => {
    expect(validateTeamLiveryDesign({...valid,logoDataUrl:"data:image/svg+xml;base64,AA=="})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,logoDataUrl:"data:image/png;base64,"+"A".repeat(140001)})).toBe(false);
  });
});
