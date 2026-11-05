import { describe, expect, it } from "vitest";
import {
  migrationHash,
  planJournalReconciliation,
  splitSslMode,
  splitStatements,
  sslOptionsFor,
  type JournalEntry,
} from "../lib/migration-journal-logic";

describe("splitSslMode", () => {
  it("entfernt sslmode aus der URL und entschärft die Prüfung", () => {
    const parts = splitSslMode("postgresql://u:p@db.example.com:5432/app?sslmode=require");
    expect(parts.connectionString).not.toContain("sslmode");
    expect(parts.requestedSslMode).toBe("require");
    expect(parts.relaxedVerification).toBe(true);
  });

  it("entschärft nicht, wenn verify-full verlangt ist", () => {
    const parts = splitSslMode("postgresql://u:p@db.example.com:5432/app?sslmode=verify-full");
    expect(parts.relaxedVerification).toBe(false);
    expect(parts.requestedSslMode).toBe("verify-full");
  });

  it("entschärft bei nackter IP auch ohne sslmode", () => {
    const parts = splitSslMode("postgresql://u:p@92.5.177.159:5432/app");
    expect(parts.relaxedVerification).toBe(true);
    expect(parts.connectionString).toContain("92.5.177.159");
  });

  it("räumt alle SSL-Parameter weg", () => {
    const parts = splitSslMode(
      "postgresql://u:p@db.example.com/app?sslmode=require&sslrootcert=/x&uselibpqcompat=true",
    );
    expect(parts.connectionString).not.toMatch(/ssl(rootcert|mode)|uselibpqcompat/);
  });

  it("wirft bei fehlender oder unsinniger URL", () => {
    expect(() => splitSslMode("")).toThrow(/DATABASE_URL fehlt/);
    expect(() => splitSslMode("nicht-mal-eine-url")).toThrow(/keine gültige URL/);
  });

  it("prüft lokal kein TLS", () => {
    expect(sslOptionsFor(splitSslMode("postgresql://u:p@localhost:5432/app"))).toBeUndefined();
    expect(sslOptionsFor(splitSslMode("postgresql://u:p@db.example.com/app"))).toEqual({
      rejectUnauthorized: false,
    });
  });
});

describe("migrationHash", () => {
  it("ist stabil und SHA-256", () => {
    const hash = migrationHash("create table t (id int);");
    expect(hash).toBe(migrationHash("create table t (id int);"));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ändert sich mit dem Inhalt", () => {
    expect(migrationHash("a")).not.toBe(migrationHash("b"));
  });
});

describe("planJournalReconciliation", () => {
  const entries: JournalEntry[] = [
    { idx: 1, tag: "0001_a", when: 1000 },
    { idx: 2, tag: "0002_b", when: 2000 },
  ];
  const files: Record<string, string> = { "0001_a": "sql-a", "0002_b": "sql-b" };
  const readSql = (tag: string) => files[tag] ?? null;

  it("trägt alles nach, wenn die DB leer ist", () => {
    const plan = planJournalReconciliation(entries, [], readSql);
    expect(plan.toStamp.map((entry) => entry.tag)).toEqual(["0001_a", "0002_b"]);
    expect(plan.toStamp[1].createdAt).toBe(2000);
  });

  it("überspringt bereits gestempelte Hashes", () => {
    const plan = planJournalReconciliation(entries, [migrationHash("sql-a")], readSql);
    expect(plan.alreadyApplied).toEqual(["0001_a"]);
    expect(plan.toStamp.map((entry) => entry.tag)).toEqual(["0002_b"]);
  });

  it("meldet fehlende Dateien statt sie zu erfinden", () => {
    const plan = planJournalReconciliation(entries, [], (tag) => (tag === "0002_b" ? null : files[tag]));
    expect(plan.unreadable).toEqual(["0002_b"]);
    expect(plan.toStamp.map((entry) => entry.tag)).toEqual(["0001_a"]);
  });

  it("stempelt nichts doppelt, wenn die DB den Hash schon kennt", () => {
    const hashes = [migrationHash("sql-a"), migrationHash("sql-b")];
    const plan = planJournalReconciliation(entries, hashes, readSql);
    expect(plan.toStamp).toHaveLength(0);
    expect(plan.alreadyApplied).toHaveLength(2);
  });

  it("arbeitet die Einträge in Index-Reihenfolge ab", () => {
    const shuffled: JournalEntry[] = [entries[1], entries[0]];
    const plan = planJournalReconciliation(shuffled, [], readSql);
    expect(plan.toStamp.map((entry) => entry.tag)).toEqual(["0001_a", "0002_b"]);
  });
});

describe("splitStatements", () => {
  it("trennt an drizzle-Breakpoints und wirft Kommentare weg", () => {
    const sql = ["-- Kommentar", "create table a (id int);", "--> statement-breakpoint", "-- noch einer", "create table b (id int);"].join("\n");
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe("create table a (id int);");
    expect(statements[1]).toBe("create table b (id int);");
  });

  it("liefert für leere Dateien nichts", () => {
    expect(splitStatements("")).toEqual([]);
    expect(splitStatements("-- nur ein Kommentar")).toEqual([]);
  });
});
