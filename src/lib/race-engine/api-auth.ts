export function createRaceEngineTestAuthHeaders(
  testingGatewayJwt: string,
  productionAccessToken: string
): Readonly<Record<string, string>> {
  if (!testingGatewayJwt.trim()) throw new Error("Testing gateway JWT is required");
  if (!productionAccessToken.trim()) throw new Error("Production user access token is required");
  return Object.freeze({
    apikey: testingGatewayJwt,
    Authorization: `Bearer ${testingGatewayJwt}`,
    "x-caleris-production-authorization": `Bearer ${productionAccessToken}`
  });
}
