import { describe, expect, it } from "vitest";
import { createRaceEngineTestAuthHeaders } from "../../src/lib/race-engine/api-auth";

describe("Race Engine Testing gateway authentication", () => {
  it("keeps Testing gateway JWT separate from the Testing Admin session token", () => {
    expect(createRaceEngineTestAuthHeaders("testing-anon-jwt", "testing-user-jwt")).toEqual({
      apikey: "testing-anon-jwt",
      Authorization: "Bearer testing-anon-jwt",
      "x-caleris-testing-authorization": "Bearer testing-user-jwt"
    });
  });

  it("rejects missing gateway or Testing user credentials", () => {
    expect(() => createRaceEngineTestAuthHeaders("", "testing-user-jwt")).toThrow(/Testing gateway JWT/);
    expect(() => createRaceEngineTestAuthHeaders("testing-anon-jwt", " ")).toThrow(/Testing user access token/);
  });
});
