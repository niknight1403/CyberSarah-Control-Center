import { describe, expect, it } from "vitest";

import { captureProposalSnapshots, getSelectedProposalChanges } from "../lib/proposal-application-logic";

describe("proposal application controls", () => {
  const changes = [{ path: "src/a.ts", content: "new a" }, { path: "src/b.ts", content: "new b" }];

  it("filters a proposal to the explicitly selected files", () => {
    expect(getSelectedProposalChanges(changes, ["src/b.ts"])).toEqual([{ path: "src/b.ts", content: "new b" }]);
  });

  it("captures only existing affected files for a controlled reversal", () => {
    expect(captureProposalSnapshots([{ id: "a", path: "src/a.ts", content: "old a" }, { id: "c", path: "src/c.ts", content: "old c" }], changes)).toEqual([{ id: "a", path: "src/a.ts", content: "old a" }]);
  });
});
