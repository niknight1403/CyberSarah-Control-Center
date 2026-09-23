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
      // 1. TS-Pfad-Alias (tsconfig.json: "@/*" -> "./*", "@shared/*" -> "./shared/*")
      { find: /^@\/(.*)$/, replacement: path.resolve(projektWurzel, "$1") },
      { find: /^@shared\/(.*)$/, replacement: path.resolve(projektWurzel, "shared/$1") },
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
    // Sprint 112: PBKDF2-Iterationen der Settings-Backup-Tests reduzieren,
    // sonst dauert eine einzelne Schluesselableitung auf langsamen CI-Runnern
    // ~20 s und die Suite scheitert am 60-s-Timeout (Flake). Produktion bleibt
    // bei 310.000 (lib/settings-backup-logic.ts, Guard: NODE_ENV=test + >=1000).
    env: {
      // Sprint 187 (Root-Cause-Fix): NODE_ENV explizit auf "test" setzen.
      // Vitest setzt NODE_ENV nur, wenn es nicht bereits definiert ist — in
      // produktiven Umgebungen (NODE_ENV=production) liefen die KDF-Guards
      // der Backup-Logik sonst ins Leere und die Suite zog 310.000
      // Iterationen durch (~60 s pro Datei). Auf dem CI-Runner war das nie
      // sichtbar (dort NODE_ENV=test); lokal/produktiv schon.
      NODE_ENV: "test",
      SETTINGS_BACKUP_TEST_KDF_ITERATIONS: "10000",
      // Sprint 187 (Performance): Support-Backups nutzen dasselbe Sprint-112-Muster
      // (Guard in der Logik: NODE_ENV=test + >= 1000). 310.000 Iterationen je
      // Ableitung × 2 Ableitungen (MAC + Entschluesselung) × mehrere Tests
      // waren der Haupttreiber der ~120 s Backup-Suite.
      SUPPORT_BACKUP_TEST_KDF_ITERATIONS: "10000",
    },
    // Sprint 187 (Performance): Worker ueber Testdateien hinweg wiederverwenden
    // (~5 s Ersparnis bei 144 Dateien) und ein Fallback-Timeout von 3 Minuten,
    // damit langsame CI-Runner nicht an der 5-s-Vorgabe scheitern.
    isolate: false,
    testTimeout: 180_000,
    include: ["tests/**/*.test.{ts,tsx}"],
    watch: false,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "json-summary", "lcov"],
      include: ["lib/**", "server/**", "shared/**", "scripts/**/*.{js,mjs,cjs,ts,tsx}"],
      exclude: ["tests/**", "**/*.test.*", "**/*.d.ts", "**/__mocks__/**"],
      reportOnFailure: false,
    },
  },
});
