import { describe, expect, it } from "vitest";
import { createSnapshot, hashContent, rollbackSnapshot } from "../lib/change-snapshot-logic";

describe("change snapshot logic", () => {
  it("creates an immutable snapshot with a stable content hash", () => {
    const snapshot = createSnapshot({ id: "s1", targetPath: "src/a.ts", content: "alter inhalt", createdAtMs: 5 });
    expect(snapshot.contentHash).toBe(hashContent("alter inhalt"));
    expect(snapshot.rolledBackAtMs).toBeNull();
  });

  it("rejects snapshots without a path or with invalid content", () => {
    expect(() => createSnapshot({ id: "s1", targetPath: "", content: "x", createdAtMs: 1 })).toThrow();
    expect(() => createSnapshot({ id: "s1", targetPath: "a.ts", content: undefined as unknown as string, createdAtMs: 1 })).toThrow();
  });

  it("restores content on a valid rollback and marks it as used", () => {
    const snapshot = createSnapshot({ id: "s1", targetPath: "src/a.ts", content: "alter inhalt", createdAtMs: 5 });
    const outcome = rollbackSnapshot(snapshot, "neuer inhalt", 99);
    expect(outcome.rolledBack).toBe(true);
    expect(outcome.restoredContent).toBe("alter inhalt");
    expect(snapshot.rolledBackAtMs).toBe(99);
  });

  it("refuses a second rollback of the same snapshot", () => {
    const snapshot = createSnapshot({ id: "s1", targetPath: "src/a.ts", content: "alter inhalt", createdAtMs: 5 });
    rollbackSnapshot(snapshot, "neuer inhalt", 99);
    const second = rollbackSnapshot(snapshot, "neuer inhalt", 120);
    expect(second.rolledBack).toBe(false);
    expect(second.restoredContent).toBeNull();
  });

  it("refuses rollback when the snapshot content was tampered with", () => {
    const snapshot = createSnapshot({ id: "s1", targetPath: "src/a.ts", content: "alter inhalt", createdAtMs: 5 });
    snapshot.content = "manipulierter inhalt";
    const outcome = rollbackSnapshot(snapshot, "neuer inhalt", 99);
    expect(outcome.rolledBack).toBe(false);
    expect(outcome.restoredContent).toBeNull();
    expect(outcome.reason).toContain("Integrität");
  });

  it("skips rollback when current content already matches the snapshot", () => {
    const snapshot = createSnapshot({ id: "s1", targetPath: "src/a.ts", content: "gleich", createdAtMs: 5 });
    const outcome = rollbackSnapshot(snapshot, "gleich", 99);
    expect(outcome.rolledBack).toBe(false);
    expect(snapshot.rolledBackAtMs).toBeNull();
  });
});
