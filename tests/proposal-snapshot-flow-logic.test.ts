import { describe, expect, it } from "vitest";
import { hashContent } from "../lib/change-snapshot-logic";
import {
  buildProposalSnapshots,
  restoreProposalSnapshots,
  verifyProposalSnapshot,
  type SnapshotFileSource,
} from "../lib/proposal-snapshot-flow-logic";

const NOW_MS = 2_000_000_000_000;

function files(...overrides: Partial<SnapshotFileSource>[]) {
  const input = overrides.length
    ? overrides
    : [{ id: "file-1", path: "lib/one.ts", content: "export const one = 1;" }];
  return input.map((file, index) => ({
    id: file.id ?? `file-${index + 1}`,
    path: file.path ?? `lib/file-${index + 1}.ts`,
    content: file.content ?? `export const v${index + 1} = ${index + 1};`,
  }));
}

describe("proposal snapshot flow logic", () => {
  it("creates hash-secured snapshots for affected files before applying", () => {
    const snapshots = buildProposalSnapshots(
      files(
        { id: "f1", path: "lib/one.ts", content: "export const one = 1;" },
        { id: "f2", path: "lib/two.ts", content: "export const two = 2;" },
      ),
      [{ path: "lib/two.ts", content: "export const two = 22;" }],
      NOW_MS,
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe("f2");
    expect(snapshots[0].targetPath).toBe("lib/two.ts");
    expect(snapshots[0].content).toBe("export const two = 2;");
    expect(snapshots[0].contentHash).toBe(hashContent("export const two = 2;"));
    expect(snapshots[0].rolledBackAtMs).toBeNull();
  });

  it("restores only verified content when the current content differs", () => {
    const snapshots = buildProposalSnapshots(
      files(),
      [{ path: "lib/one.ts", content: "export const one = 11;" }],
      NOW_MS,
    );
    const outcome = restoreProposalSnapshots(
      snapshots,
      { "lib/one.ts": "export const one = 11;" },
      NOW_MS + 1000,
    );
    expect(outcome.restored).toHaveLength(1);
    expect(outcome.restored[0]).toEqual({
      id: "file-1",
      path: "lib/one.ts",
      content: "export const one = 1;",
    });
    expect(outcome.skipped).toHaveLength(0);
    expect(outcome.summaryText).toContain("1 Datei(en) wiederhergestellt");
  });

  it("skips unchanged content with a reasoned outcome", () => {
    const snapshots = buildProposalSnapshots(
      files(),
      [{ path: "lib/one.ts", content: "export const one = 1;" }],
      NOW_MS,
    );
    const outcome = restoreProposalSnapshots(
      snapshots,
      { "lib/one.ts": "export const one = 1;" },
      NOW_MS + 1000,
    );
    expect(outcome.restored).toHaveLength(0);
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.skipped[0].reason).toContain("Kein Rollback erforderlich");
    expect(outcome.summaryText).toContain("1 übersprungen");
  });

  it("refuses tampered snapshots through the integrity check", () => {
    const snapshots = buildProposalSnapshots(
      files(),
      [{ path: "lib/one.ts", content: "export const one = 11;" }],
      NOW_MS,
    );
    snapshots[0].content = "export const one = 'manipuliert';";
    const outcome = restoreProposalSnapshots(
      snapshots,
      { "lib/one.ts": "export const one = 11;" },
      NOW_MS + 1000,
    );
    expect(outcome.restored).toHaveLength(0);
    expect(outcome.skipped[0].reason).toContain("Integritätsprüfung fehlgeschlagen");
    expect(verifyProposalSnapshot(snapshots[0])).toBe(false);
  });

  it("allows the rollback exactly once (one-time protection)", () => {
    const snapshots = buildProposalSnapshots(
      files(),
      [{ path: "lib/one.ts", content: "export const one = 11;" }],
      NOW_MS,
    );
    const first = restoreProposalSnapshots(
      snapshots,
      { "lib/one.ts": "export const one = 11;" },
      NOW_MS + 1000,
    );
    expect(first.rolledBackCount).toBe(1);
    const second = restoreProposalSnapshots(
      snapshots,
      { "lib/one.ts": "export const one = 11;" },
      NOW_MS + 2000,
    );
    expect(second.restored).toHaveLength(0);
    expect(second.skipped[0].reason).toContain("bereits zurückgerollt");
  });

  it("restores when the file no longer exists (null content)", () => {
    const snapshots = buildProposalSnapshots(
      files(),
      [{ path: "lib/one.ts", content: "export const one = 11;" }],
      NOW_MS,
    );
    const outcome = restoreProposalSnapshots(snapshots, {}, NOW_MS + 1000);
    expect(outcome.restored).toHaveLength(1);
    expect(outcome.restored[0].content).toBe("export const one = 1;");
  });

  it("handles mixed outcomes with per-file reasons", () => {
    const snapshots = buildProposalSnapshots(
      files(
        { id: "f1", path: "lib/one.ts", content: "one" },
        { id: "f2", path: "lib/two.ts", content: "two" },
        { id: "f3", path: "lib/three.ts", content: "three" },
      ),
      [
        { path: "lib/one.ts", content: "one-new" },
        { path: "lib/two.ts", content: "two-new" },
        { path: "lib/three.ts", content: "three-new" },
      ],
      NOW_MS,
    );
    snapshots[1].contentHash = "deadbeef"; // manipuliert
    const outcome = restoreProposalSnapshots(
      snapshots,
      { "lib/one.ts": "one-new", "lib/two.ts": "two-new", "lib/three.ts": "three" },
      NOW_MS + 1000,
    );
    expect(outcome.restored.map((entry) => entry.path)).toEqual(["lib/one.ts"]);
    expect(outcome.skipped.map((entry) => entry.path)).toEqual(["lib/two.ts", "lib/three.ts"]);
    expect(outcome.summaryText).toContain("1 Datei(en) wiederhergestellt");
    expect(outcome.summaryText).toContain("2 übersprungen");
  });

  it("keeps reasons and summaries token-free while restoring full content", () => {
    const snapshots = buildProposalSnapshots(
      [{ id: "f1", path: "lib/secret.ts", content: "const token = 'ghp_shouldNotAppear';" }],
      [{ path: "lib/secret.ts", content: "neu" }],
      NOW_MS,
    );
    const outcome = restoreProposalSnapshots(snapshots, { "lib/secret.ts": "neu" }, NOW_MS + 1000);
    expect(outcome.restored[0].content).toContain("ghp_shouldNotAppear");
    const displaySurfaces = [outcome.summaryText, ...outcome.skipped.map((entry) => entry.reason)];
    for (const surface of displaySurfaces) {
      expect(surface).not.toMatch(/ghp_|sk-|api[-_]?key|token\s*=|https?:\/\//i);
    }
  });

  it("rejects invalid inputs deterministically", () => {
    expect(() => buildProposalSnapshots(null as never, [], NOW_MS)).toThrow();
    expect(() => buildProposalSnapshots([], null as never, NOW_MS)).toThrow();
    expect(() => buildProposalSnapshots([], [], Number.NaN)).toThrow();
    expect(() => restoreProposalSnapshots(null as never, {}, NOW_MS)).toThrow();
    expect(() => restoreProposalSnapshots([], null as never, NOW_MS)).toThrow();
  });
});
