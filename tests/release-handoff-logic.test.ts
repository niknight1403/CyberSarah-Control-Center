import { describe, expect, it } from "vitest";
import { buildReleaseHandoff } from "../lib/release-handoff-logic";

const validPreflight = {
  appName: "CyberSarah Control Center",
  version: "1.2.1",
  androidPackage: "com.cybersarah.controlcenter",
  orientation: "portrait",
  buildCommand: "npm run build",
};

const nowIso = "2026-09-11T12:00:00.000Z";

describe("release handoff (sprint 49)", () => {
  it("haengt ein redigiertes Changelog aus Conventional Commits an", () => {
    const handoff = buildReleaseHandoff(
      {
        preflight: validPreflight,
        commitSubjects: [
          "feat(offline): Wiederholungen mit Backoff planen",
          "fix(security): token abc123 entfernt",
          "Merge pull request #5",
        ],
        metadata: { repository: "niknight1403/CyberSarah-Control-Center", status: "passed" },
      },
      nowIso,
    );
    expect(handoff.preflight.ok).toBe(true);
    expect(handoff.changelog).not.toBeNull();
    expect(handoff.changelog?.version).toBe("1.2.1");
    expect(handoff.changelog?.entryCount).toBe(3);
    expect(handoff.changelog?.unclassifiedCount).toBe(1);
    expect(handoff.changelog?.markdown).toContain("# Changelog 1.2.1");
    expect(handoff.changelog?.markdown).toContain("- [offline] Wiederholungen mit Backoff planen");
    expect(handoff.changelog?.markdown).toContain("token [redigiert]");
    expect(handoff.changelog?.markdown).not.toContain("abc123");
    expect(handoff.changelogIssue).toBeNull();
    expect(handoff.secretsIncluded).toBe(false);
    expect(handoff.schemaVersion).toBe(2);
    expect(handoff.status).toBe("passed");
  });

  it("redigiert URLs in Betreffzeilen", () => {
    const handoff = buildReleaseHandoff(
      { preflight: validPreflight, commitSubjects: ["docs: Anleitung unter https://example.com/abc aktualisiert"] },
      nowIso,
    );
    expect(handoff.changelog?.markdown).toContain("[redigiert]");
    expect(handoff.changelog?.markdown).not.toContain("example.com");
  });

  it("laesst das Changelog bei ungueltiger Version sichtbar begruendet entfallen", () => {
    const handoff = buildReleaseHandoff(
      { preflight: { ...validPreflight, version: "1.2.1-rc.1" }, commitSubjects: ["feat: x"] },
      nowIso,
    );
    expect(handoff.changelog).toBeNull();
    expect(handoff.changelogIssue).toBe("Changelog entfaellt: Version '1.2.1-rc.1' genuegt nicht dem Schema major.minor.patch.");
    expect(handoff.secretsIncluded).toBe(false);
  });

  it("uebernimmt Preflight-Issues unverfaelscht und erzeugt kein Changelog ohne Version", () => {
    const handoff = buildReleaseHandoff(
      { preflight: { ...validPreflight, version: "", buildCommand: "" }, commitSubjects: ["feat: x"] },
      nowIso,
    );
    expect(handoff.preflight.ok).toBe(false);
    expect(handoff.preflight.issues.map((issue) => issue.code)).toEqual(["invalid-version", "missing-build-command"]);
    expect(handoff.changelog).toBeNull();
    expect(handoff.changelogIssue).toBe("Changelog entfaellt: keine Version angegeben.");
  });

  it("lehnt ungueltige Eingaben deterministisch ab", () => {
    expect(() => buildReleaseHandoff({ preflight: validPreflight }, "not-a-date")).toThrow();
    expect(() => buildReleaseHandoff({ preflight: validPreflight, commitSubjects: "feat: x" }, nowIso)).toThrow(
      "Betreffzeilen muessen ein Array aus Zeichenketten sein."
    );
    expect(() => buildReleaseHandoff({ preflight: validPreflight, commitSubjects: [42] }, nowIso)).toThrow(
      "Betreffzeilen muessen ein Array aus Zeichenketten sein."
    );
  });

  it("akzeptiert fehlende Betreffzeilen als leeres Changelog und bleibt deterministisch", () => {
    const first = buildReleaseHandoff({ preflight: validPreflight, metadata: { status: "kaputt" } }, nowIso);
    const second = buildReleaseHandoff({ preflight: validPreflight, metadata: { status: "kaputt" } }, nowIso);
    expect(first.changelog?.entryCount).toBe(0);
    expect(first.changelog?.markdown).toContain("# Changelog 1.2.1");
    expect(first.status).toBe("unknown");
    expect(first).toEqual(second);
    expect(first.generatedAt).toBe(nowIso);
  });
});
