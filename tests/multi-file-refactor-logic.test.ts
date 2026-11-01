import { describe, expect, it } from "vitest";
import {
  createMultiFileTransaction,
  executeMultiFileTransaction,
  formatTransactionReport,
  rollbackTransaction,
  validateMultiFileOperations,
} from "../lib/multi-file-refactor-logic";

describe("multi-file-refactor-logic (Sprint 285)", () => {
  it("validiert Operationen und erkennt fehlerhafte Eingaben", () => {
    const valid = validateMultiFileOperations([
      { path: "src/a.ts", action: "write", content: "const a = 1;" },
      { path: "src/b.ts", action: "delete" },
    ]);
    expect(valid.valid).toBe(true);

    const empty = validateMultiFileOperations([]);
    expect(empty.valid).toBe(false);

    const duplicate = validateMultiFileOperations([
      { path: "src/a.ts", action: "write", content: "a" },
      { path: "src/a.ts", action: "delete" },
    ]);
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors[0]).toContain("Doppelter Pfad");

    const missingContent = validateMultiFileOperations([
      { path: "src/a.ts", action: "write" },
    ]);
    expect(missingContent.valid).toBe(false);
    expect(missingContent.errors[0]).toContain("Inhalt ('content') muss bei Aktion 'write'");
  });

  it("führt Transaktionen erfolgreich aus und aktualisiert den Dateisystemzustand", () => {
    const initialFs = {
      "src/old.ts": "legacy code",
      "src/existing.ts": "export const x = 1;",
    };

    const tx = createMultiFileTransaction({
      operations: [
        { path: "src/new.ts", action: "write", content: "export const y = 2;" },
        { path: "src/existing.ts", action: "write", content: "export const x = 100;" },
        { path: "src/old.ts", action: "delete" },
      ],
      commitMessage: "refactor: update module exports",
      nowMs: 1000,
    });

    const result = executeMultiFileTransaction(initialFs, tx);
    expect(result.success).toBe(true);
    expect(result.appliedOps).toBe(3);
    expect(result.newState["src/new.ts"]).toBe("export const y = 2;");
    expect(result.newState["src/existing.ts"]).toBe("export const x = 100;");
    expect(result.newState["src/old.ts"]).toBeUndefined();
    expect(result.updatedTransaction.status).toBe("committed");

    const report = formatTransactionReport(result.updatedTransaction, result.appliedOps);
    expect(report).toContain("erfolgreich angewendet (3 Datei(en) geändert)");
  });

  it("macht bei einem Ausführungsfehler ein automatisches Rollback zum Ursprungszustand", () => {
    const initialFs = {
      "src/a.ts": "original a",
      "src/b.ts": "original b",
    };

    const tx = createMultiFileTransaction({
      operations: [
        { path: "src/a.ts", action: "write", content: "modified a" },
        { path: "src/b.ts", action: "write", content: "modified b" },
      ],
      rollbackOnError: true,
    });

    // Custom executor simulate crash on second file write
    const result = executeMultiFileTransaction(initialFs, tx, (op, state) => {
      if (op.path === "src/b.ts") {
        throw new Error("Schreibfehler auf Festplatte");
      }
      state[op.path] = op.content!;
    });

    expect(result.success).toBe(false);
    expect(result.newState).toEqual(initialFs); // Rollback restores original
    expect(result.updatedTransaction.status).toBe("rolled_back");

    const report = formatTransactionReport(result.updatedTransaction, result.appliedOps, result.error);
    expect(report).toContain("Rollback");
  });

  it("rollbackTransaction stellt gelöschte und geänderte Dateien exakt wieder her", () => {
    const fs = {
      "a.ts": "new content",
    };
    const backups = [
      { path: "a.ts", originalContent: "old content" },
      { path: "b.ts", originalContent: null },
    ];

    const restored = rollbackTransaction(fs, backups);
    expect(restored["a.ts"]).toBe("old content");
    expect(restored["b.ts"]).toBeUndefined();
  });
});
