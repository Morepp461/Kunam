export function createRaceEngineTestAuthHeaders(
  testingGatewayJwt: string,
  testingUserAccessToken: string
): Readonly<Record<string, string>> {
  if (!testingGatewayJwt.trim()) throw new Error("Testing gateway JWT is required");
  if (!testingUserAccessToken.trim()) throw new Error("Testing user access token is required");
  return Object.freeze({
    apikey: testingGatewayJwt,
    Authorization: `Bearer ${testingGatewayJwt}`,
    "x-caleris-testing-authorization": `Bearer ${testingUserAccessToken}`
  });
}
