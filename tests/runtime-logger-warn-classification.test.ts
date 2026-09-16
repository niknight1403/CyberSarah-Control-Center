import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRuntimeLoggerForTests,
  getRuntimeLogs,
  installRuntimeLogger,
} from "../server/runtime-logger";

/**
 * Sprint 129 — Regressionstests fuer die Warnungs-Klassifizierung:
 *
 * Vor dem Fix liefen console.warn-Ausgaben (Auth-Hinweise wie
 * "[Auth] Missing session cookie", LLM-Retry-Hinweise) ununterscheidbar
 * über stderr und wurden vom Stream-Patch pauschal als "error" in den
 * Ringpuffer gelegt. appStatus.status wertet den letzten error-Eintrag
 * aus (RUNTIME_ERROR_GRACE_MS = 60 s) — das Dashboard zeigte also nach
 * jeder harmlosen Warnung "ERROR" und schaltete alle abgeleiteten
 * Kacheln (Leitender Superagent, Revenue OS, LLM-Switcher) rot.
 *
 * Ab jetzt: console.warn => "warn", console.error => "error".
 */

describe("runtime-logger (Sprint 129: Warn-Klassifizierung)", () => {
  beforeEach(() => {
    __resetRuntimeLoggerForTests();
    installRuntimeLogger();
  });

  afterEach(() => {
    __resetRuntimeLoggerForTests();
  });

  it("protokolliert console.warn als warn, nicht als error", () => {
    console.warn("[Auth] Missing session cookie");
    const logs = getRuntimeLogs();
    const entry = logs.find((l) => l.message.includes("Missing session cookie"));
    expect(entry).toBeDefined();
    expect(entry?.level).toBe("warn");
  });

  it("protokolliert stderr-Fehler weiterhin als error", () => {
    // Produktiv-Pfad echter Fehler: Exceptions/Stack-Traces schreiben auf stderr.
    process.stderr.write("[Server] Echter Fehler\n");
    const logs = getRuntimeLogs();
    const entry = logs.find((l) => l.message.includes("Echter Fehler"));
    expect(entry).toBeDefined();
    expect(entry?.level).toBe("error");
  });

  it("klassifiziert Fehler nach einer Warnung wieder korrekt als error", () => {
    console.warn("Warnung 1");
    process.stderr.write("Fehler 1\n");
    const logs = getRuntimeLogs();
    expect(logs.find((l) => l.message === "Warnung 1")?.level).toBe("warn");
    expect(logs.find((l) => l.message === "Fehler 1")?.level).toBe("error");
  });

  it("erkennt mehrere Argumente und Objekte in console.warn", () => {
    console.warn("Retry", 3, { status: 503 });
    const logs = getRuntimeLogs();
    const entry = logs.find((l) => l.message.includes("Retry"));
    expect(entry?.level).toBe("warn");
  });
});
