import { fileURLToPath } from "node:url";
import path from "node:path";

import { defineConfig } from "vitest/config";

const projektWurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const rnStub = path.resolve(projektWurzel, "tests/stubs/react-native-stub.mjs");

/**
 * Vitest-Konfiguration fuer die Logik-Suite (tests/).
 *
 * Zwei zentrale Fixtures:
 * 1. Alias `@/*` → Projektwurzel (wie in tsconfig.json) — sonst schlagen
 *    Importe der Form `@/lib/...` in Modulen fehl, die Tests importieren.
 * 2. react-native-/Expo-Pakete werden auf einen Universal-Stub gemappt,
 *    damit Importketten durch RN-abhaengige `lib/`-Module ohne Fehler
 *    aufgeloest werden koennen (React-Native-Runtime ist in Node nicht
 *    verfuegbar). Komponenten-/Screen-Tests waeren damit bewusst NICHT
 *    moeglich — die Suite bleibt eine Logik-Suite.
 *
 * Coverage (Sprint 91): `npm run test:coverage` misst die Logik-Suite
 * mit dem v8-Provider. RN-/Expo-Stubs und die Stub-Fixture selbst werden
 * ausgeschlossen, damit nur echtes Projektgemess wird. Reporter:
 * text (CI-Log), json-summary (maschinenlesbar fuer spaetere Gates)
 * und lcov (Codecov/Artifacts).
 */
export default defineConfig({
  resolve: {
    alias: [
      // 1. TS-Pfad-Alias (tsconfig.json: "@/*" -> "./*")
      { find: /^@\/(.*)$/, replacement: path.resolve(projektWurzel, "$1") },
      // 2. React-Native-Ökosystem → Stub
      { find: /^react-native$/, replacement: rnStub },
      { find: /^react-native-safe-area-context$/, replacement: rnStub },
      { find: /^@react-native-async-storage\/async-storage$/, replacement: rnStub },
      { find: /^expo(-[\w-]+)?(\/[\w./-]*)?$/, replacement: rnStub },
    ],
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    watch: false,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "json-summary", "lcov"],
      include: ["lib/**", "server/**", "shared/**", "scripts/**"],
      exclude: ["tests/**", "**/*.test.*", "**/*.d.ts", "**/__mocks__/**"],
      reportOnFailure: false,
    },
  },
});
