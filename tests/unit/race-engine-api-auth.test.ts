import { describe, expect, it } from "vitest";
import { createRaceEngineTestAuthHeaders } from "../../src/lib/race-engine/api-auth";

describe("Race Engine Testing gateway authentication", () => {
  it("keeps Testing gateway JWT separate from the production Admin session token", () => {
    expect(createRaceEngineTestAuthHeaders("testing-anon-jwt", "production-user-jwt")).toEqual({
      apikey: "testing-anon-jwt",
      Authorization: "Bearer testing-anon-jwt",
      "x-caleris-production-authorization": "Bearer production-user-jwt"
    });
  });

  it("rejects missing gateway or production credentials", () => {
    expect(() => createRaceEngineTestAuthHeaders("", "production-user-jwt")).toThrow(/Testing gateway JWT/);
    expect(() => createRaceEngineTestAuthHeaders("testing-anon-jwt", " ")).toThrow(/Production user access token/);
  });
});
