import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const component = readFileSync(resolve(process.cwd(), "src/GlobalLoading.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/global-loading.css"), "utf8");

describe("Caleris global Cale loading experience", () => {
  it("uses the shared loader for global, auth, and lazy-route loading", () => {
    expect(app).toContain('import GlobalLoading from "./GlobalLoading";');
    expect(app).toContain("{busy&&<GlobalLoading />}");
    expect(app).toContain("if(!authReady)return <GlobalLoading />;");
    expect(app).toContain("if(session&&!profileReady)return <GlobalLoading />;");
    expect(app).toContain("<Suspense fallback={<GlobalLoading />}>");
  });

  it("uses the official static Cale racing mascot and the requested copy", () => {
    expect(component).toContain('outfitOverride="racing"');
    expect(component).toContain('const MESSAGE = "Cale sedang memproses...";');
    expect(component).not.toMatch(/cale-loading__mascot[^]*animation/);
  });

  it("provides an animated ECG trace, typing cursor, and reduced-motion fallback", () => {
    expect(styles).toContain("@keyframes cale-heartbeat-trace");
    expect(styles).toContain("@keyframes cale-loading-cursor");
    expect(styles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(component).toContain("matchMedia");
  });
});
