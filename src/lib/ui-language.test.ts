import { describe, expect, it } from "vitest";
import { translateUiText } from "./ui-language";
describe("CALERIS UI language", () => {
  it("translates English interface labels to Indonesian", () => {
    expect(translateUiText("Transfer Market", "id")).toBe("Bursa Transfer");
    expect(translateUiText("Market Value · € 18.000.000", "id")).toBe("Nilai Pasar · € 18.000.000");
    expect(translateUiText("TEAM HQ", "id")).toBe("MARKAS TIM");
  });
  it("translates Indonesian interface labels to English", () => {
    expect(translateUiText("Pengaturan Akun", "en")).toBe("Account Settings");
    expect(translateUiText("Bahasa aplikasi", "en")).toBe("App language");
    expect(translateUiText("Pembalap Bebas", "en")).toBe("Free Agent");
  });
});
