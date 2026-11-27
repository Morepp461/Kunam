import { describe, expect, it } from "vitest";
import { generateCalerisQrCode } from "../../src/lib/qr-code";

describe("CALERIS local QR generation", () => {
  it("creates a PNG data URL without a hosted QR service", async () => {
    const result = await generateCalerisQrCode("https://calerismasters.com/member-id/ABC123456789");
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects empty content", async () => {
    await expect(generateCalerisQrCode("  ")).rejects.toThrow("QR content is required.");
  });
});
