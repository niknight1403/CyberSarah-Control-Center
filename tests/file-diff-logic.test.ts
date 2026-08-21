import { describe, expect, it } from "vitest";

import { getFileDiffSummaries, getFileDiffSummary } from "../lib/file-diff-logic";

describe("file diff logic", () => {
  it("reports added and removed lines for an edited file", () => {
    expect(getFileDiffSummary({ path: "src/app.ts", before: "one\ntwo\nthree", after: "one\nTWO\nthree\nfour" })).toEqual({ path: "src/app.ts", addedLines: 2, removedLines: 1, changedLineCount: 3 });
  });

  it("omits unchanged files from a diff preview", () => {
    expect(getFileDiffSummaries([{ path: "same.ts", before: "export {}", after: "export {}" }, { path: "new.ts", before: "", after: "export const ready = true;" }])).toEqual([{ path: "new.ts", addedLines: 1, removedLines: 0, changedLineCount: 1 }]);
  });
});
