import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function copyCalerisAssets() {
  return {
    name: "copy-caleris-static-assets",
    apply: "build" as const,
    writeBundle() {
      const source = resolve(process.cwd(), "assets");
      const destination = resolve(process.cwd(), "dist/assets");
      mkdirSync(destination, { recursive: true });
      cpSync(source, destination, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyCalerisAssets()],
  build: { sourcemap: false },
  server: { host: "0.0.0.0" },
});
