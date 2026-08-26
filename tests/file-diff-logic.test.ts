import { describe, expect, it } from "vitest";

import { getDetailedFileDiffPreview, getFileDiffSummaries, getFileDiffSummary } from "../lib/file-diff-logic";

describe("file diff logic", () => {
  it("reports added and removed lines for an edited file", () => {
    expect(getFileDiffSummary({ path: "src/app.ts", before: "one\ntwo\nthree", after: "one\nTWO\nthree\nfour" })).toEqual({ path: "src/app.ts", addedLines: 2, removedLines: 1, changedLineCount: 3 });
  });

  it("omits unchanged files from a diff preview", () => {
    expect(getFileDiffSummaries([{ path: "same.ts", before: "export {}", after: "export {}" }, { path: "new.ts", before: "", after: "export const ready = true;" }])).toEqual([{ path: "new.ts", addedLines: 1, removedLines: 0, changedLineCount: 1 }]);
  });

  it("returns a bounded, line-numbered review hunk without auto-applying it", () => {
    const preview = getDetailedFileDiffPreview({ path: "src/app.ts", before: "const version = 1;\nrun(version);", after: "const version = 2;\nrun(version);" });
    expect(preview?.lines).toEqual([
      { kind: "removed", lineNumber: 1, content: "const version = 1;" },
      { kind: "added", lineNumber: 1, content: "const version = 2;" },
      { kind: "context", lineNumber: 2, content: "run(version);" },
    ]);
    expect(preview?.truncated).toBe(false);
  });

  it("truncates large review hunks while preserving the explicit safety signal", () => {
    const preview = getDetailedFileDiffPreview({ path: "src/large.ts", before: "one\ntwo\nthree", after: "alpha\nbeta\ngamma" }, 2);
    expect(preview?.truncated).toBe(true);
    expect(preview?.lines.filter((line) => line.kind !== "context")).toHaveLength(2);
  });
});
