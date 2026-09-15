import { Platform } from "react-native";
import Constants from "expo-constants";

import { createTRPCClient } from "@/lib/trpc";

/**
 * Sprint 125 — Crash-Reporter (Expo/React Native).
 *
 * Strukturierte Fehlererfassung fuer unvorhergesehene UI-Abstuerze:
 * Der globale Error-Handler (ErrorUtils) faengt fatale JS-Fehler ab,
 * bevor die App stirbt, und meldet sie an das Control Center. Dort werden
 * die Reports serverseitig verschluesselt (AES-256-GCM at-rest) in das
 * Self-Healing-Incident-Ledger geschrieben und vom Superagenten analysiert.
 *
 * Schutzmechanismen:
 *   - Debounce: max. 1 Report pro Minute (Alarmfluten vermeiden)
 *   - Fehler im Reporter selbst duerfen NIE die App mitreissen (try/catch)
 *   - Original-Handler wird immer weiter aufgerufen (kein Reporting-Verlust
 *     an die RN-Dev-UI oder Crashlytics)
 */

let initialized = false;
let lastReportAt = 0;
let queuedReport: (() => void) | null = null;
const REPORT_DEBOUNCE_MS = 60_000;

type ErrorUtilsGlobal = typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
    setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
};

function sanitize(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  return String(value ?? "unknown");
}

function reportNow(error: unknown, isFatal: boolean, componentStack?: string) {
  try {
    // Bewusst ein Vanilla-CRUD-Client statt des React-Hooks: Der Reporter
    // laeuft aussserhalb des React-Baums (globaler Error-Handler).
    const client = createTRPCClient();
    void client.crashReporting.report.mutate({
      appVersion: Constants.expoConfig?.version ?? "unknown",
      platform: `${Platform.OS} ${Platform.Version}${isFatal ? " (fatal)" : ""}`,
      message: sanitize(error).slice(0, 2000),
      stack: error instanceof Error ? error.stack?.slice(0, 6000) : undefined,
      componentStack: componentStack?.slice(0, 6000),
    }).catch(() => undefined);
  } catch {
    // Der Crash-Reporter darf niemals selbst crashen.
  }
}

/** Initialisiert den globalen Crash-Fang (idempotent, im Root-Layout aufrufen). */
export function initCrashReporter(): void {
  if (initialized) return;
  initialized = true;

  const errorUtils = (globalThis as ErrorUtilsGlobal).ErrorUtils;
  if (!errorUtils?.setGlobalHandler || !errorUtils.getGlobalHandler) return;
  const originalHandler = errorUtils.getGlobalHandler();

  errorUtils.setGlobalHandler((error, isFatal) => {
    const now = Date.now();
    if (now - lastReportAt >= REPORT_DEBOUNCE_MS) {
      lastReportAt = now;
      reportNow(error, Boolean(isFatal));
    } else {
      // Debounce-Fenster: letzten Report verwerfen ist ok — Dedupe macht der Server.
      queuedReport = () => reportNow(error, Boolean(isFatal));
    }
    if (originalHandler) {
      try {
        originalHandler(error, isFatal);
      } catch {
        // Original-Handler darf nicht doppelt crashen.
      }
    }
  });

  // Debounce-Warteschlange nach Ablauf des Fensters abarbeiten.
  setInterval(() => {
    if (queuedReport && Date.now() - lastReportAt >= REPORT_DEBOUNCE_MS) {
      const report = queuedReport;
      queuedReport = null;
      report();
    }
  }, REPORT_DEBOUNCE_MS);
}
