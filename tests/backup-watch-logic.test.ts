/**
 * Sprint 121 — Backup-Waechter: deterministische Tests der reinen Logik —
 * Schwellen (22 h/26 h), Erstzustand ohne Fehlalarm, Verzeichnung von
 * Backup-Laeufen, Ops-Check-Eingabe fuer die Betriebswacht.
 */
import { describe, expect, it } from "vitest";

import {
  BACKUP_WATCH_CRITICAL_AFTER_MS,
  BACKUP_WATCH_WARN_AFTER_MS,
  buildBackupWatchCheckInput,
  emptyBackupWatchSnapshot,
  evaluateBackupWatch,
  formatBackupAgeHours,
  recordBackupWatchRun,
} from "@/lib/backup-watch-logic";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

const manifest = { checksum: "1a2b3c4d", totalRows: 42 };

describe("Sprint 121: Schwellen-Konstanten", () => {
  it("Warnung vor Kritisch, Tagesrhythmus mit Toleranz beidseitig", () => {
    expect(BACKUP_WATCH_WARN_AFTER_MS).toBe(22 * HOUR);
    expect(BACKUP_WATCH_CRITICAL_AFTER_MS).toBe(26 * HOUR);
    expect(BACKUP_WATCH_WARN_AFTER_MS).toBeLessThan(BACKUP_WATCH_CRITICAL_AFTER_MS);
  });
});

describe("Sprint 121: Erstzustand (kein Fehlalarm nach Restart)", () => {
  it("leerer Snapshot bewertet ehrlich 'unbekannt', niemals kritisch", () => {
    const evaluation = evaluateBackupWatch(emptyBackupWatchSnapshot(), NOW);
    expect(evaluation.state).toBe("unknown");
    expect(evaluation.ageHours).toBeNull();
    expect(evaluation.detail).toContain("kein Backup");
  });
});

describe("Sprint 121: Verzeichnung", () => {
  it("recordBackupWatchRun speichert Zeit, Pruefsumme, Zeilen (Kopie, keine Mutation)", () => {
    const before = emptyBackupWatchSnapshot();
    const after = recordBackupWatchRun(before, manifest, NOW);
    expect(after.lastBackupAt).toBe(NOW);
    expect(after.lastChecksum).toBe("1a2b3c4d");
    expect(after.lastTotalRows).toBe(42);
    expect(before.lastBackupAt).toBeNull(); // Original unberuehrt
  });

  it("erneuter Lauf ueberschreibt den vorherigen Stand", () => {
    const first = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW - HOUR);
    const second = recordBackupWatchRun(first, { checksum: "ffeeddcc", totalRows: 77 }, NOW);
    expect(second.lastBackupAt).toBe(NOW);
    expect(second.lastChecksum).toBe("ffeeddcc");
    expect(second.lastTotalRows).toBe(77);
  });
});

describe("Sprint 121: Bewertung gegen die Schwellen", () => {
  it("unter 22 h -> ok mit Stunden-Detail und Pruefsumme", () => {
    const snapshot = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW - 5 * HOUR);
    const evaluation = evaluateBackupWatch(snapshot, NOW);
    expect(evaluation.state).toBe("ok");
    expect(evaluation.detail).toContain("5,0 h");
    expect(evaluation.detail).toContain("42 Zeilen");
    expect(evaluation.detail).toContain("1a2b3c4d");
  });

  it("22-26 h -> degraded (Warnung, handlungsfaehig)", () => {
    const snapshot = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW - 23 * HOUR);
    const evaluation = evaluateBackupWatch(snapshot, NOW);
    expect(evaluation.state).toBe("degraded");
    expect(evaluation.detail).toContain("neues Backup");
  });

  it("ueber 26 h -> down (kritisch, sofort handeln)", () => {
    const snapshot = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW - 27 * HOUR);
    const evaluation = evaluateBackupWatch(snapshot, NOW);
    expect(evaluation.state).toBe("down");
    expect(evaluation.detail).toContain("kritisch");
    expect(evaluation.ageHours).toBeCloseTo(27, 5);
  });

  it("Grenzfalle: exakt 22 h noch ok, exakt 26 h schon kritisch-bewertet als down-Schwelle", () => {
    const at22 = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW - 22 * HOUR);
    expect(evaluateBackupWatch(at22, NOW).state).toBe("degraded"); // < gilt, exakt 22 ist abgelaufen
    const at26 = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW - 26 * HOUR);
    expect(evaluateBackupWatch(at26, NOW).state).toBe("down");
  });

  it("Zukunfts-Zeitstempel (Uhrdrift) bewerten still als ok", () => {
    const snapshot = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW + HOUR);
    expect(evaluateBackupWatch(snapshot, NOW).state).toBe("ok");
  });
});

describe("Sprint 121: Ops-Check-Eingabe", () => {
  it("Check-Input traegt kind backup, bewerteten Zustand und Detail, Messzeit jetzt", () => {
    const snapshot = recordBackupWatchRun(emptyBackupWatchSnapshot(), manifest, NOW - 25 * HOUR);
    const input = buildBackupWatchCheckInput(snapshot, NOW);
    expect(input.kind).toBe("backup");
    expect(input.state).toBe("degraded");
    expect(input.ageMs).toBe(0);
    expect(input.checkedAt).toBe(NOW);
    expect(input.detail).toContain("25,0 h");
  });

  it("leerer Snapshot liefert unknown-Check (kein Fehlalarm im Dashboard)", () => {
    const input = buildBackupWatchCheckInput(emptyBackupWatchSnapshot(), NOW);
    expect(input.state).toBe("unknown");
  });
});

describe("Sprint 121: Stunden-Formatierung", () => {
  it("deutscher Dezimaltrenner, eine Nachkommastelle", () => {
    expect(formatBackupAgeHours(NOW - 90 * 60 * 1000, NOW)).toBe("1,5");
    expect(formatBackupAgeHours(NOW - 5 * HOUR, NOW)).toBe("5,0");
  });
});
