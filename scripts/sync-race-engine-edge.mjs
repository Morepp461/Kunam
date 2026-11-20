import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/lib/race-engine");
const destination = resolve(root, "supabase/functions/race-engine-test-service/race-engine");
const modules = [
  "attributes.ts", "calibration.ts", "circuit-geometry.ts", "contracts.ts",
  "incidents.ts", "pit-strategy.ts", "random.ts", "simulation.ts",
  "synthetic-fixture.ts", "test-profiles.ts", "tyres.ts", "weather.ts"
];

mkdirSync(destination, { recursive: true });
for (const name of modules) {
  const sourcePath = resolve(source, name);
  const destinationPath = resolve(destination, name);
  copyFileSync(sourcePath, destinationPath);
  const original = readFileSync(destinationPath, "utf8");
  const denoCompatible = original.replace(
    /(from\s+["'])(\.\/[^"']+)(["'])/g,
    (_match, prefix, path, suffix) => prefix + (path.endsWith(".ts") ? path : `${path}.ts`) + suffix
  );
  writeFileSync(destinationPath, denoCompatible);
}
console.info(`Synced ${modules.length} Race Engine modules for Supabase Edge and Deno worker runtimes.`);
