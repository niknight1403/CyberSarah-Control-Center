import { describe, expect, it } from "vitest";

import {
  aggregateByCategory,
  buildCleanupPlan,
  cleanupTargetsUnchanged,
  buildPromptResult,
  buildStorageSuggestions,
  classifyStorageEntry,
  formatBytesGerman,
  isProtectedPath,
  parseStoragePrompt,
  sortStorageEntries,
  selectCleanupTargets,
  totalSizeBytes,
  type StorageEntry,
} from "../lib/storage-manager-logic";

const NOW = 1_800_000_000_000; // deterministische Testzeit
const DAY = 86_400_000;

function entry(path: string, sizeBytes: number, ageDays: number): StorageEntry {
  return { path, sizeBytes, modifiedAt: NOW - ageDays * DAY };
}

const FIXTURE: StorageEntry[] = [
  entry("cache/download.tmp", 500_000, 1),
  entry("cache/preview.png", 300_000, 2),
  entry("document/logs/agent.log", 900_000, 30),
  entry("document/logs/fresh.log", 10_000, 1),
  entry("document/exports/report.csv", 120_000, 5),
  entry("document/backups/settings.csc-backup", 2_000_000, 10),
  entry("document/media/avatar.png", 60_000, 90),
  entry("document/exports/report.csv", 120_000, 6),
];

describe("storage manager logic (Sprint 201)", () => {
  it("klassifiziert Pfade in Kategorien", () => {
    expect(classifyStorageEntry("cache/download.tmp")).toBe("cache");
    expect(classifyStorageEntry("Caches/blob.dat")).toBe("cache");
    expect(classifyStorageEntry("document/logs/agent.log")).toBe("logs");
    expect(classifyEntryLog()).toBe("logs");
    expect(classifyStorageEntry("document/backups/settings.csc-backup")).toBe("backups");
    expect(classifyStorageEntry("cache/backups/settings.zip")).toBe("backups");
    expect(classifyStorageEntry("document/media/avatar.png")).toBe("media");
    expect(classifyStorageEntry("document/report.csv")).toBe("documents");
    expect(classifyStorageEntry("something/unknown.bin")).toBe("other");
  });

  function classifyEntryLog(): string {
    return classifyStorageEntry("app/run-2026.log");
  }

  it("schuetzt Traversal, Systemdateien und Sitzungsdaten", () => {
    for (const path of ["cache/../document/secret", "cache/./file", "cache\\file", "/cache/file", "document//file", "webstorage/app_session_token", "webstorage/manus-runtime-user-info", "cache/sqlite/app.db", "cache/backup?.zip", "other/file"]) {
      expect(isProtectedPath(path), path).toBe(true);
    }
    expect(isProtectedPath("cache/images/photo.png")).toBe(false);
    expect(buildCleanupPlan([entry("cache/backups/save.zip", 100, 1)], { now: NOW }).items).toEqual([]);
  });

  it("interpretiert verneinte Loeschbefehle nur als Analyse", () => {
    for (const prompt of ["Zeig den Cache, nicht löschen", "Keine Dateien löschen, nur analysieren", "Ohne zu löschen: Speicher bereinigen?", "Nichts löschen"]) {
      const command = parseStoragePrompt(prompt);
      expect(command.actions, prompt).not.toContain("clean");
      expect(buildPromptResult(command, FIXTURE, { now: NOW }).plan).toBeUndefined();
    }
  });

  it("waehlt nur freigegebene Ziele aus dem sichtbaren Plan", () => {
    const plan = buildCleanupPlan(FIXTURE, { now: NOW, categories: ["backups", "cache"] });
    const targets = selectCleanupTargets(FIXTURE, plan, ["document/backups/settings.csc-backup", "cache/download.tmp"], []);
    expect(targets.map((item) => item.path)).toEqual(["cache/download.tmp"]);
    const confirmed = selectCleanupTargets(FIXTURE, plan, [], ["document/backups/settings.csc-backup", "document/exports/report.csv"]);
    expect(confirmed.map((item) => item.path)).toEqual(["document/backups/settings.csc-backup"]);
    expect(selectCleanupTargets(FIXTURE, null, ["cache/download.tmp"], [])).toEqual([]);
  });

  it("verwirft veraltete Plaene nach Dateiaenderung", () => {
    const target = [entry("cache/a.tmp", 100, 1)];
    expect(cleanupTargetsUnchanged(target, target)).toBe(true);
    expect(cleanupTargetsUnchanged(target, [entry("cache/a.tmp", 200, 1)])).toBe(false);
    expect(cleanupTargetsUnchanged(target, [])).toBe(false);
  });

  it("behauptet keine identischen Inhalte ohne Inhaltsvergleich", () => {
    const suggestions = buildStorageSuggestions(FIXTURE, { now: NOW });
    const duplicate = suggestions.find((item) => item.kind === "duplicate");
    expect(duplicate?.detail).toContain("Inhalte sind nicht verglichen");
    expect(duplicate?.reclaimableBytes).toBeUndefined();
    expect(suggestions.filter((item) => item.kind === "largest" || item.kind === "stale")
      .every((item) => item.reclaimableBytes === undefined)).toBe(true);
  });

  it("aggregiert Groessen pro Kategorie, absteigend sortiert", () => {
    const aggregates = aggregateByCategory(FIXTURE);
    expect(aggregesAreSorted(aggregates)).toBe(true);
    const backups = aggregates.find((a) => a.category === "backups");
    expect(backups?.count).toBe(1);
    expect(backups?.sizeBytes).toBe(2_000_000);
    expect(totalSizeBytes(FIXTURE)).toBe(4_010_000);
  });

  function aggregesAreSorted(aggregates: Array<{ sizeBytes: number }>): boolean {
    return aggregates.every((a, i) => i === 0 || aggregates[i - 1].sizeBytes >= a.sizeBytes);
  }

  it("formatiert Bytes deutsch mit Komma", () => {
    expect(formatBytesGerman(0)).toBe("0 B");
    expect(formatBytesGerman(500)).toBe("500 B");
    expect(formatBytesGerman(1_024)).toBe("1,00 KB");
    expect(formatBytesGerman(1_500_000)).toBe("1,43 MB");
    expect(formatBytesGerman(-5)).toBe("0 B");
  });

  it("sortiert nach Groesse, Datum, Name und Kategorie", () => {
    expect(sortStorageEntries(FIXTURE, "size-desc")[0]?.path).toBe("document/backups/settings.csc-backup");
    expect(sortStorageEntries(FIXTURE, "date-asc")[0]?.path).toBe("document/media/avatar.png");
    const byName = sortStorageEntries(FIXTURE, "name-asc").map((e) => e.path);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    expect(sortStorageEntries(FIXTURE, "size-desc")).not.toBe(FIXTURE);
  });

  it("plant gefahrloses Aufraeumen: Cache + veraltete Logs automatisch, Rest geschützt", () => {
    const plan = buildCleanupPlan(FIXTURE, { now: NOW, logMaxAgeDays: 14 });
    const paths = plan.items.map((item) => item.path);
    expect(paths).toContain("cache/download.tmp");
    expect(paths).toContain("cache/preview.png");
    expect(paths).toContain("document/logs/agent.log");
    expect(paths).not.toContain("document/logs/fresh.log");
    expect(paths).not.toContain("document/backups/settings.csc-backup");
    const automatic = plan.items.filter((item) => !item.requiresConfirmation);
    expect(automatic.every((item) => item.category === "cache" || item.category === "logs")).toBe(true);
    expect(plan.automaticBytes).toBe(500_000 + 300_000 + 900_000);
  });

  it("schliesst Backups nur auf ausdruecklichen Wunsch ein — und dann nur mit Bestaetigung", () => {
    const without = buildCleanupPlan(FIXTURE, { now: NOW, includeBackups: true });
    const backupItem = without.items.find((item) => item.category === "backups");
    expect(backupItem?.requiresConfirmation).toBe(true);
    const explicit = buildCleanupPlan(FIXTURE, { now: NOW, categories: ["backups"] });
    expect(explicit.items.map((item) => item.path)).toContain("document/backups/settings.csc-backup");
  });

  it("respektiert angeforderte Kategorien und eigene Dateien nur mit Bestaetigung", () => {
    const docsPlan = buildCleanupPlan(FIXTURE, { now: NOW, categories: ["documents"] });
    for (const item of docsPlan.items) {
      expect(item.requiresConfirmation).toBe(true);
    }
    expect(docsPlan.items.length).toBe(2);
  });

  it("blockt systemrelevante Pfade immer", () => {
    expect(isProtectedPath("SQLite/app.db")).toBe(true);
    expect(isProtectedPath("data/user.sqlite")).toBe(true);
    expect(isProtectedPath("IndexedDB/blob")).toBe(true);
    expect(isProtectedPath("../../escape.txt")).toBe(true);
    expect(isProtectedPath("cache/tmp.bin")).toBe(false);
    const systemFixture: StorageEntry[] = [entry("SQLite/app.db", 999, 100), entry("cache/tmp.bin", 42, 1)];
    const plan = buildCleanupPlan(systemFixture, { now: NOW });
    expect(plan.items.map((item) => item.path)).toEqual(["cache/tmp.bin"]);
  });

  it("schlaegt groesste, veraltete und doppelte Eintraege vor", () => {
    const suggestions = buildStorageSuggestions(FIXTURE, { now: NOW, topN: 2 });
    expect(suggestions.some((s) => s.kind === "largest" && s.title.includes("settings.csc-backup"))).toBe(true);
    expect(suggestions.some((s) => s.kind === "stale")).toBe(true);
    const duplicate = suggestions.find((s) => s.kind === "duplicate");
    expect(duplicate?.title).toContain("report.csv");
    expect(duplicate?.reclaimableBytes).toBeUndefined();
  });

  it("parst deutsche Prompts in Befehle", () => {
    const clean = parseStoragePrompt("Räume den Cache auf");
    expect(clean.actions).toContain("clean");
    expect(clean.categories).toEqual(["cache"]);

    const sort = parseStoragePrompt("Sortiere den Speicher nach Kategorie");
    expect(sort.actions).toContain("sort");
    expect(sort.sortKey).toBe("category");

    const logs = parseStoragePrompt("Lösche Logs älter als 7 Tage");
    expect(logs.actions).toContain("clean");
    expect(logs.categories).toEqual(["logs"]);
    expect(logs.logMaxAgeDays).toBe(7);

    const suggest = parseStoragePrompt("Zeig mir Vorschläge zur Speicherplatz-Optimierung");
    expect(suggest.actions).toContain("suggest");
    expect(suggest.actions).toContain("analyze");

    const empty = parseStoragePrompt("");
    expect(empty.actions).toEqual(["analyze"]);
    expect(empty.includeBackups).toBe(false);

    const unknown = parseStoragePrompt("blablabla");
    expect(unknown.actions).toEqual(["analyze"]);
  });

  it("baut ehrliche Prompt-Ergebnisse: Analyse, Plan und Vorschlaege", () => {
    const result = buildPromptResult(
      parseStoragePrompt("Analysiere den Speicher und räume auf, mit Vorschlägen"),
      FIXTURE,
      { now: NOW },
    );
    expect(result.headline).toBe("Aufräumen vorbereitet");
    expect(result.lines.some((line) => line.includes("4.010.000") || line.includes("gesamtf"))).toBe(false);
    expect(result.lines[0]).toContain("Einträge");
    expect(result.plan).toBeDefined();
    expect(result.plan?.automaticBytes).toBe(1_700_000);
    expect(result.lines.some((line) => line.includes("Optimierungs-Vorschläge"))).toBe(true);

    const cleanOnly = buildPromptResult(parseStoragePrompt("Räume den Cache auf"), FIXTURE, { now: NOW });
    expect(cleanOnly.plan?.items.every((item) => item.category === "cache")).toBe(true);
    expect(cleanOnly.lines.some((line) => line.includes("Aufräum-Plan"))).toBe(true);

    const emptyStorage = buildPromptResult(parseStoragePrompt("Analyse"), [], { now: NOW });
    expect(emptyStorage.plan).toBeUndefined();
    expect(emptyStorage.lines.some((line) => line.includes("aufgeräumt"))).toBe(true);
  });
});
