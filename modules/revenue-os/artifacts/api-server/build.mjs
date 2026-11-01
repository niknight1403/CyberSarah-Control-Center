/**
 * API Server Build Script (esbuild)
 * Baut TypeScript → ES Module (.mjs)
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const result = await build({
  entryPoints: [fileURLToPath(new URL("./src/index.ts", import.meta.url))],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: fileURLToPath(new URL("./dist/index.mjs", import.meta.url)),
  external: [
    "@google-cloud/storage",
    "pg",
    "node-cron",
    "openai",
    "stripe",
    "pino",
    "pino-http",
    "cookie-parser",
    "cors",
    "dotenv",
    "express",
    "google-auth-library",
    "drizzle-orm",
  ],
  sourcemap: true,
  minify: false,
  metafile: true,
  logLevel: "info",
});

console.log("✅ Build abgeschlossen:", Object.keys(result.metafile.outputs));
