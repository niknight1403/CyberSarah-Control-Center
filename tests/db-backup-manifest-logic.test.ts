import { describe, expect, it } from "vitest";
import {
  buildBackupFilename,
  buildBackupManifest,
  manifestChecksum,
  normalizeTableCounts,
  validateManifest,
} from "../lib/db-backup-manifest-logic";

const GENERATED_AT = "2026-09-10T15:00:00.000Z";
const NOW = "2026-09-10T18:00:00.000Z";

describe("db-backup-manifest-logic", () => {
  it("normalisiert Roh-Zaelle deterministisch (sortiert, bereinigt, gekappt)", () => {
    const tables = normalizeTableCounts({
      billingSubscriptions: 3,
      users: 12,
      chatMessages: -5,
      "": 99,
      broken: Number.NaN,
    });
    expect(tables.map((t) => t.name)).toEqual([
      "billingSubscriptions",
      "broken",
      "chatMessages",
      "users",
    ]);
    expect(tables.find((t) => t.name === "chatMessages")?.rowCount).toBe(0);
    expect(tables.find((t) => t.name === "broken")?.rowCount).toBe(0);
  });

  it("erzeugt eine stabile, inhaltsabhaengige Pruefsumme", () => {
    const tables = normalizeTableCounts({ users: 12, chatMessages: 40 });
    expect(manifestChecksum(tables, GENERATED_AT)).toBe(
      manifestChecksum(normalizeTableCounts({ chatMessages: 40, users: 12 }), GENERATED_AT),
    );
    expect(manifestChecksum(tables, GENERATED_AT)).not.toBe(
      manifestChecksum(tables, "2026-09-10T15:00:01.000Z"),
    );
    expect(manifestChecksum(normalizeTableCounts({ users: 13 }), GENERATED_AT)).not.toBe(
      manifestChecksum(normalizeTableCounts({ users: 12 }), GENERATED_AT),
    );
    expect(manifestChecksum([], GENERATED_AT)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("baut ein vollstaendiges Manifest mit sicherem Dateinamen", () => {
    const manifest = buildBackupManifest({
      label: "CyberSarah Produktion",
      tableCounts: { users: 12, chatMessages: 40 },
      generatedAt: GENERATED_AT,
    });
    expect(manifest.format).toBe("cybersarah-db-backup-manifest");
    expect(manifest.version).toBe(1);
    expect(manifest.label).toBe("CyberSarah Produktion");
    expect(manifest.totalRows).toBe(52);
    expect(manifest.tables).toHaveLength(2);
    expect(manifest.filename).toBe(
      "db-backup-manifest-cybersarah-produktion-2026-09-10T15-00-00-000Z.json",
    );
  });

  it("faellt bei leerem Label auf 'production' zurueck und normalisiert den Namen", () => {
    const manifest = buildBackupManifest({
      label: "   ",
      tableCounts: {},
      generatedAt: GENERATED_AT,
    });
    expect(manifest.label).toBe("production");
    expect(buildBackupFilename("Ä/Ö/Ü", GENERATED_AT)).toContain("ae-oe-ue");
  });

  it("validiert frische, unveraenderte Manifeste und lehnt alte/veraenderte ab", () => {
    const manifest = buildBackupManifest({
      label: "prod",
      tableCounts: { users: 12 },
      generatedAt: GENERATED_AT,
    });
    expect(validateManifest(manifest, NOW)).toEqual({ valid: true });

    const tampered = { ...manifest, tables: [{ name: "users", rowCount: 999 }] };
    const tamperedResult = validateManifest(tampered, NOW);
    expect(tamperedResult.valid).toBe(false);
    if (!tamperedResult.valid) expect(tamperedResult.reason).toContain("Pruefsumme");

    const later = "2026-09-11T20:00:00.000Z";
    const stale = validateManifest(manifest, later);
    expect(stale.valid).toBe(false);
    if (!stale.valid) expect(stale.reason).toContain("zu alt");

    expect(
      validateManifest({ ...manifest, version: 2 as unknown as 1 }, NOW).valid,
    ).toBe(false);
  });

  it("akzeptiert konfigurierbare Frische-Fenster", () => {
    const manifest = buildBackupManifest({
      label: "prod",
      tableCounts: { users: 1 },
      generatedAt: GENERATED_AT,
    });
    expect(validateManifest(manifest, NOW, 1).valid).toBe(false);
    expect(validateManifest(manifest, NOW, 48).valid).toBe(true);
  });
});
