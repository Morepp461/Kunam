import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/RaceControl.tsx"), "utf8");

describe("Race OCR loading boundary", () => {
  it("loads the OCR component through a lazy import", () => {
    expect(source).toMatch(/const RaceOCR\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/RaceOCR"\)\)/);
  });

  it("provides a Suspense fallback while the OCR chunk loads", () => {
    expect(source).toMatch(/<Suspense fallback=\{<div className="race-control-hint" role="status">Memuat modul OCR…<\/div>\}>/);
    expect(source).toMatch(/<Suspense[\s\S]*?<RaceOCR entries=\{entries\}/);
  });
});
