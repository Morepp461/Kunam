import { describe, expect, it } from "vitest";
import { validateTeamLiveryDesign } from "./team-livery";

const valid = { schemaVersion:1, mainColor:"#B51F2B", secondaryColor:"#17191D", accentColor:"#F2EEE5", pattern:"split", carNumber:"16", teamWordmark:"CALERIS", sponsors:["TITLE","TECH","PARTNER"], logoDataUrl:null };

describe("team livery contract", () => {
  it("accepts a valid v1 atlas design", () => expect(validateTeamLiveryDesign(valid)).toBe(true));
  it("rejects malformed colors, unknown patterns and oversized sponsor labels", () => {
    expect(validateTeamLiveryDesign({...valid,mainColor:"red"})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,pattern:"neon"})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,sponsors:["A".repeat(25),"B","C"]})).toBe(false);
  });
  it("rejects unsupported or oversized uploaded logo payloads", () => {
    expect(validateTeamLiveryDesign({...valid,logoDataUrl:"data:image/svg+xml;base64,AA=="})).toBe(false);
    expect(validateTeamLiveryDesign({...valid,logoDataUrl:"data:image/png;base64,"+"A".repeat(140001)})).toBe(false);
  });
});
