import { describe, expect, it } from "vitest";
import { exportAuditLog, rotateAuditLog, sanitizeAuditEntry, type AuditEntry } from "../lib/audit-rotation-logic";

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: "a1",
    actor: "agent",
    action: "push",
    targetPath: "src/a.ts",
    timestampMs: 900,
    metadata: {},
    ...overrides,
  };
}

describe("audit rotation logic", () => {
  it("keeps entries within age and count limits", () => {
    const result = rotateAuditLog(
      [entry({ id: "old", timestampMs: 0 }), entry({ id: "new", timestampMs: 950 })],
      { nowMs: 1_000, maxEntries: 10, maxAgeMs: 200 },
    );
    expect(result.kept.map((item) => item.id)).toEqual(["new"]);
    expect(result.removedCount).toBe(1);
  });

  it("keeps only the most recent entries when the count overflows", () => {
    const entries = Array.from({ length: 5 }, (_, index) => entry({ id: `a${index}`, timestampMs: index }));
    const result = rotateAuditLog(entries, { nowMs: 10, maxEntries: 2, maxAgeMs: 1_000 });
    expect(result.kept.map((item) => item.id)).toEqual(["a4", "a3"]);
  });

  it("requires no rotation when everything fits", () => {
    const result = rotateAuditLog([entry({ timestampMs: 500 })], { nowMs: 1_000, maxEntries: 5, maxAgeMs: 1_000 });
    expect(result.removedCount).toBe(0);
    expect(result.reason).toContain("Keine Rotation");
  });

  it("rejects invalid rotation configurations", () => {
    expect(() => rotateAuditLog([], { nowMs: 0, maxEntries: 0, maxAgeMs: 100 })).toThrow();
    expect(() => rotateAuditLog([], { nowMs: 0, maxEntries: 5, maxAgeMs: 0 })).toThrow();
  });

  it("removes sensitive metadata keys and redacts sensitive string values", () => {
    const sanitized = sanitizeAuditEntry(
      entry({ metadata: { githubToken: "abc", okCount: 3, note: "https://evil.example.com", branch: "dev" } }),
    );
    expect(sanitized.metadata).not.toHaveProperty("githubToken");
    expect(sanitized.metadata.okCount).toBe(3);
    expect(sanitized.metadata.note).toBe("[redigiert]");
    expect(sanitized.metadata.branch).toBe("dev");
  });

  it("exports a token-free audit bundle with a redaction count", () => {
    const exportResult = exportAuditLog(
      [entry({ metadata: { apiToken: "x", actor: "agent" } })],
      1_000,
    );
    expect(exportResult.redactedFieldCount).toBe(1);
    expect(JSON.stringify(exportResult)).not.toMatch(/token.*:|https?:/i);
  });
});
