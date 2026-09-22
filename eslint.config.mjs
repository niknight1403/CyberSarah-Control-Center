// https://docs.expo.dev/guides/using-eslint/
//
// Sprint 141 — Deterministischer Lint-Gate.
//
// Hintergrund: `expo lint` laedt den Import-Resolver aus dem eigenen
// Paketkontext (eslint-import-resolver-typescript@3.10 hat eine fuer
// eslint-plugin-import inkompatible Resolver-Schnittstelle) und scheitert
// dadurch mit hunderten Pseudo-Fehlern ("Resolve error ... invalid
// interface"). Der direkte ESLint-Aufruf (`npm run lint` -> `eslint .`)
// nutzt die Top-Level-Installation (Resolver 3.7 + @typescript-eslint/parser
// als devDependencies) und arbeitet deterministisch.
//
// React-Compiler-Regeln (set-state-in-effect, purity, immutability,
// preserve-manual-memoization) werden bewusst als WARNUNG gefuehrt: Sie
// markieren Refaktor-Kandidaten, die App bleibt funktional; sie werden
// sprintweise behoben, ohne den Gate zu blockieren.
import globals from "globals";
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

const REACT_COMPILER_RULES = {
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/purity": "warn",
  "react-hooks/immutability": "warn",
  "react-hooks/preserve-manual-memoization": "warn",
};

export default defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "web-dist/*",
      "coverage/*",
      // Revenue OS ist ein eigenständiger pnpm-Workspace mit eigener
      // TypeScript-/ESLint-Konfiguration und wird separat validiert.
      "modules/revenue-os/**/*",
      "workspace-service/node_modules/*",
      "workspace-service/dist/*",
      // Generierte Expo/Capacitor-Bundles sind Build-Artefakte, kein Quellcode.
      "android/app/src/main/assets/public/**/*",
    ],
  },
  {
    // Node-Kontext (Server, Skripte, Workspace-Service): Node-Globals und
    // Expo-App-Regeln (env-var inlining) bewusst deaktiviert.
    files: ["server/**/*.{ts,js,mjs}", "scripts/**/*.{ts,mjs,js}", "workspace-service/src/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "expo/no-dynamic-env-var": "off",
    },
  },
  {
    rules: REACT_COMPILER_RULES,
  },
]);
