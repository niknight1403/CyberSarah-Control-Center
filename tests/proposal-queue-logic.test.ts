import { describe, expect, it } from "vitest";
import { evaluateProposalQueue, transitionProposal, type AgentProposal } from "../lib/proposal-queue-logic";

function proposal(overrides: Partial<AgentProposal>): AgentProposal {
  return {
    id: "p1",
    targetPath: "src/a.ts",
    contentHash: "hash-a",
    priority: "normal",
    createdAtMs: 10,
    expiresAtMs: 1_000,
    status: "pending",
    ...overrides,
  };
}

describe("proposal queue logic", () => {
  it("orders proposals by priority and then by creation time", () => {
    const result = evaluateProposalQueue(
      [
        proposal({ id: "low-old", targetPath: "src/low.ts", priority: "low", createdAtMs: 1 }),
        proposal({ id: "normal", targetPath: "src/normal.ts", priority: "normal", createdAtMs: 5 }),
        proposal({ id: "critical", targetPath: "src/critical.ts", priority: "critical", createdAtMs: 9 }),
        proposal({ id: "high", targetPath: "src/high.ts", priority: "high", createdAtMs: 3 }),
      ],
      { nowMs: 100, maxQueued: 10 },
    );
    expect(result.order.map((entry) => entry.id)).toEqual(["critical", "high", "normal", "low-old"]);
  });

  it("expires proposals whose expiry has passed and excludes them", () => {
    const expired = proposal({ id: "old", expiresAtMs: 50 });
    const fresh = proposal({ id: "new", targetPath: "src/b.ts", expiresAtMs: 5_000 });
    const result = evaluateProposalQueue([expired, fresh], { nowMs: 100, maxQueued: 10 });
    expect(result.expiredIds).toEqual(["old"]);
    expect(expired.status).toBe("expired");
    expect(result.order.map((entry) => entry.id)).toEqual(["new"]);
  });

  it("does not expire finalized proposals", () => {
    const applied = proposal({ id: "done", status: "applied", expiresAtMs: 50 });
    evaluateProposalQueue([applied], { nowMs: 100, maxQueued: 10 });
    expect(applied.status).toBe("applied");
  });

  it("removes duplicates by target and content hash, keeping the oldest", () => {
    const result = evaluateProposalQueue(
      [
        proposal({ id: "dup-new", createdAtMs: 20 }),
        proposal({ id: "dup-old", createdAtMs: 5 }),
        proposal({ id: "other", targetPath: "src/b.ts", createdAtMs: 1 }),
      ],
      { nowMs: 100, maxQueued: 10 },
    );
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.order.find((entry) => entry.targetPath === "src/a.ts")?.id).toBe("dup-old");
  });

  it("drops the lowest-priority overflow entries deterministically", () => {
    const entries = Array.from({ length: 5 }, (_, index) =>
      proposal({ id: `p${index}`, targetPath: `src/p${index}.ts`, priority: index === 0 ? "low" : "high", createdAtMs: index }),
    );
    const result = evaluateProposalQueue(entries, { nowMs: 100, maxQueued: 2 });
    expect(result.order).toHaveLength(2);
    expect(result.droppedForOverflow).toContain("p0");
    expect(result.order.map((entry) => entry.id).every((id) => id !== "p0")).toBe(true);
  });

  it("allows only valid status transitions", () => {
    expect(transitionProposal("pending", "review").allowed).toBe(true);
    expect(transitionProposal("review", "applied").allowed).toBe(true);
    expect(transitionProposal("pending", "applied").allowed).toBe(false);
    expect(transitionProposal("applied", "review").allowed).toBe(false);
    expect(transitionProposal("rejected", "pending").allowed).toBe(false);
    expect(transitionProposal("pending", "pending").allowed).toBe(false);
  });

  it("rejects invalid configurations", () => {
    expect(() => evaluateProposalQueue([], { nowMs: 0, maxQueued: 0 })).toThrow();
  });
});
