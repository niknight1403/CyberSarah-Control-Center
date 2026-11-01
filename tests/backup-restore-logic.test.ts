import { describe, it, expect } from "vitest";
import {
  buildRestorePlan,
  evaluateDrill,
  assessRecoverability,
  RESTORE_DRILL_MAX_AGE_MS,
} from "@/lib/backup-restore-logic";
import type { BackupManifest, RestoreDrillResult } from "@/lib/backup-restore-logic";

const DAY = 86_400_000;
const manifest: BackupManifest = {
  id: "bak-1",
  createdAt: 0,
  checksum: "abc123",
  tableNames: ["users", "projects"],
};
const goodDrill: RestoreDrillResult = {
  performedAt: 10 * DAY,
  restoredChecksum: "abc123",
  verifiedTables: ["users", "projects"],
  rowCountsMatched: true,
};

describe("Sprint 327 — Backup-Restore-Beweis", () => {
  it("Restore-Plan hat feste, geordnete Schritte inkl. Schatten-DB", () => {
    const plan = buildRestorePlan(manifest);
    expect(plan).toHaveLength(6);
    expect(plan[1]).toContain("NIE in Produktion");
    expect(plan[3]).toContain("users, projects");
  });

  it("nur volle Uebereinstimmung ist ein Beweis", () => {
    expect(evaluateDrill(manifest, goodDrill).proven).toBe(true);
    expect(evaluateDrill(manifest, { ...goodDrill, restoredChecksum: "nope" }).proven).toBe(false);
    expect(evaluateDrill(manifest, { ...goodDrill, verifiedTables: ["users"] }).issues.join(" ")).toContain("projects");
    expect(evaluateDrill(manifest, { ...goodDrill, rowCountsMatched: false }).proven).toBe(false);
  });

  it("Zustaende: kein Backup, unbewiesen, veraltet, bewiesen", () => {
    expect(assessRecoverability(null, null, 0).state).toBe("kein-backup");
    const unproven = assessRecoverability(manifest, null, 0);
    expect(unproven.state).toBe("unbewiesen");
    expect(unproven.message).toContain("NIE geuebt");
    const fresh = assessRecoverability(manifest, goodDrill, 11 * DAY);
    expect(fresh.state).toBe("bewiesen");
    const stale = assessRecoverability(manifest, goodDrill, 10 * DAY + RESTORE_DRILL_MAX_AGE_MS + 1);
    expect(stale.state).toBe("veraltet");
    expect(stale.message).toContain("erneut ueben");
  });
});
