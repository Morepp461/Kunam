import { describe, expect, it } from "vitest";
import { translateUiText } from "./ui-language";
describe("CALERIS UI language", () => {
  it("translates English interface labels to Indonesian", () => {
    expect(translateUiText("Transfer Market", "id")).toBe("Bursa Transfer");
    expect(translateUiText("Market Value · € 18.000.000", "id")).toBe("Nilai Pasar · € 18.000.000");
    expect(translateUiText("TEAM HQ", "id")).toBe("MARKAS TIM");
  });
  it("covers admin, season, and economy labels in both languages", () => {
    expect(translateUiText("ADMIN ONLY", "id")).toBe("KHUSUS ADMIN");
    expect(translateUiText("Daily Check-in Reward", "id")).toBe("Hadiah Check-in Harian");
    expect(translateUiText("Team Wallet", "id")).toBe("Dompet Tim");
    expect(translateUiText("Hadiah Check-in Harian", "en")).toBe("Daily Check-in Reward");
    expect(translateUiText("The race begins here", "id")).toBe("Balapan dimulai di sini");
    expect(translateUiText("Balapan dimulai di sini", "en")).toBe("The race begins here");
    expect(translateUiText("English", "id")).toBe("Bahasa Inggris");
  });
  it("covers Assets Marketplace labels and dynamic catalog categories in both directions", () => {
    const englishLabels = [
      ["Assets Marketplace", "Marketplace Aset"],
      ["Personal Wallet", "Dompet Pribadi"],
      ["Owned Asset Value", "Nilai Aset yang Dimiliki"],
      ["Collection Catalog", "Katalog Koleksi"],
      ["Browse Assets", "Jelajahi Aset"],
      ["Aircraft jets", "Pesawat Jet"],
      ["Initial market value · € 1.500.000", "Nilai pasar awal · € 1.500.000"],
      ["Buy Asset", "Beli Aset"],
      ["Owned Assets", "Aset yang Dimiliki"],
      ["Marketplace Listings", "Daftar Listing Marketplace"],
      ["Cancel Listing", "Batalkan Listing"],
    ];
    for (const [english, indonesian] of englishLabels) {
      expect(translateUiText(english, "id")).toBe(indonesian);
      expect(translateUiText(indonesian, "en")).toBe(english);
    }
    expect(translateUiText("TIER 1", "id")).toBe("TINGKAT 1");
    expect(translateUiText("40 tiers", "id")).toBe("40 tingkat");
  });
  it("translates Indonesian interface labels to English", () => {
    expect(translateUiText("Pengaturan Akun", "en")).toBe("Account Settings");
    expect(translateUiText("Bahasa aplikasi", "en")).toBe("App language");
    expect(translateUiText("Pembalap Bebas", "en")).toBe("Free Agent");
  });
});
