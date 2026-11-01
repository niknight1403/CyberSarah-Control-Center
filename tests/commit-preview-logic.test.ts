import { describe, expect, it } from "vitest";
import {
  buildCommitPreview,
  formatCommitPreviewForChat,
} from "../lib/commit-preview-logic";

describe("Sprint 291 — Commit Diff-Vorschau im Chat", () => {
  it("baut eine gueltige Commit-Vorschau mit Datei-Diffs und Statistiken", () => {
    const files = [
      {
        path: "lib/test.ts",
        before: 'console.log("old");\n',
        after: 'console.log("new");\nconsole.log("added");\n',
      },
    ];

    const preview = buildCommitPreview({
      commitMessage: "feat: update test log",
      branchName: "main",
      files,
    });

    expect(preview.readyToCommit).toBe(true);
    expect(preview.totalFilesCount).toBe(1);
    expect(preview.totalAddedLines).toBe(2);
    expect(preview.totalRemovedLines).toBe(1);
    expect(preview.filePreviews.length).toBe(1);
    expect(preview.filePreviews[0].path).toBe("lib/test.ts");
  });

  it("blockiert Vorschau, wenn keine Commit-Message oder keine Aenderungen vorliegen", () => {
    const noMsgPreview = buildCommitPreview({
      commitMessage: "",
      files: [{ path: "a.ts", before: "a", after: "b" }],
    });
    expect(noMsgPreview.readyToCommit).toBe(false);
    expect(noMsgPreview.blockReason).toContain("Keine Commit-Message");

    const noChangesPreview = buildCommitPreview({
      commitMessage: "test",
      files: [],
    });
    expect(noChangesPreview.readyToCommit).toBe(false);
    expect(noChangesPreview.blockReason).toContain("Keine geänderten Dateien");
  });

  it("formatiert die Vorschau in lesbares Markdown fuer den Chat", () => {
    const preview = buildCommitPreview({
      commitMessage: "fix(core): improve error handling",
      branchName: "feature/sprint-291",
      files: [
        {
          path: "core/error.ts",
          before: "export const err = null;",
          after: 'export const err = "defined";',
        },
      ],
    });

    const formatted = formatCommitPreviewForChat(preview);
    expect(formatted).toContain("🔍 **Commit-Vorschau** (feature/sprint-291)");
    expect(formatted).toContain("fix(core): improve error handling");
    expect(formatted).toContain("📄 **core/error.ts**");
    expect(formatted).toContain("```diff");
  });
});
