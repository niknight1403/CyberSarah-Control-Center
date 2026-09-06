import { describe, expect, it } from "vitest";
import {
  buildProposalQueueView,
  DEFAULT_PROPOSAL_QUEUE_TTL_MS,
  requestProposalTransition,
  resolveProposalStatus,
  sanitizeProposalTitle,
  type ProposalSource,
} from "../lib/proposal-queue-view-logic";

const NOW_MS = 1_000_000_000_000;

function source(overrides: Partial<ProposalSource> = {}): ProposalSource {
  return {
    messageId: "proposal-1",
    summary: "Lesezeichen-Logik ergänzen",
    changes: [{ path: "lib/bookmarks.ts", content: "export {}" }],
    createdAtMs: NOW_MS - 60_000,
    state: "ready",
    ...overrides,
  };
}

function config(overrides: Partial<Parameters<typeof buildProposalQueueView>[1]> = {}) {
  return {
    nowMs: NOW_MS,
    maxQueued: 10,
    ttlMs: DEFAULT_PROPOSAL_QUEUE_TTL_MS,
    defaultPriority: "normal" as const,
    ...overrides,
  };
}

describe("proposal queue view logic", () => {
  it("maps chat states onto the sprint 35 state machine", () => {
    const cases: Array<[ProposalSource["state"], string]> = [
      ["ready", "pending"],
      ["error", "pending"],
      ["applying", "review"],
      ["reverting", "review"],
      ["applied", "applied"],
      ["reverted", "rejected"],
    ];
    for (const [state, expectedStatus] of cases) {
      const view = buildProposalQueueView([source({ state })], config());
      expect(view.items).toHaveLength(1);
      expect(view.items[0].status).toBe(expectedStatus);
      expect(view.items[0].actionable).toBe(expectedStatus === "pending" || expectedStatus === "review");
    }
  });

  it("orders by queue evaluation and exposes the sprint 35 evaluation result", () => {
    const view = buildProposalQueueView(
      [
        source({ messageId: "a", createdAtMs: NOW_MS - 50_000, changes: [{ path: "lib/alpha.ts", content: "export {}" }] }),
        source({ messageId: "b", createdAtMs: NOW_MS - 60_000 }),
      ],
      config(),
    );
    expect(view.evaluation.order.map((item) => item.id)).toEqual(["b", "a"]);
    expect(view.items.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("removes duplicates by target path and content hash (oldest wins)", () => {
    const view = buildProposalQueueView(
      [
        source({ messageId: "old", createdAtMs: NOW_MS - 90_000 }),
        source({ messageId: "new", createdAtMs: NOW_MS - 10_000 }),
      ],
      config(),
    );
    expect(view.summary.duplicatesRemoved).toBe(1);
    expect(view.items.map((item) => item.id)).toEqual(["old"]);
  });

  it("keeps proposals with same paths but different content separate", () => {
    const view = buildProposalQueueView(
      [
        source({ messageId: "one" }),
        source({ messageId: "two", changes: [{ path: "lib/bookmarks.ts", content: "export const x = 1;" }] }),
      ],
      config(),
    );
    expect(view.summary.duplicatesRemoved).toBe(0);
    expect(view.items).toHaveLength(2);
  });

  it("marks expired proposals and reports them in the summary", () => {
    const view = buildProposalQueueView(
      [source({ createdAtMs: NOW_MS - DEFAULT_PROPOSAL_QUEUE_TTL_MS - 1 })],
      config(),
    );
    expect(view.items[0].isExpired).toBe(true);
    expect(view.items[0].badgeLabel).toBe("Abgelaufen");
    expect(view.items[0].badgeTone).toBe("warning");
    expect(view.items[0].expiryLabel).toBe("abgelaufen");
    expect(view.items[0].actionable).toBe(false);
    expect(view.summary.expiredCount).toBe(1);
    expect(view.summary.queuedCount).toBe(0);
  });

  it("drops overflow entries and surfaces them in the summary text", () => {
    const sources = Array.from({ length: 4 }, (_, index) =>
      source({ messageId: `p-${index}`, createdAtMs: NOW_MS - index - 1, changes: [{ path: `lib/file-${index}.ts`, content: "export {}" }] }),
    );
    const view = buildProposalQueueView(sources, config({ maxQueued: 2 }));
    expect(view.items).toHaveLength(2);
    expect(view.summary.droppedForOverflow).toBe(2);
    expect(view.summary.summaryText).toContain("2 wegen Überlauf verworfen");
  });

  it("counts applied and rejected entries in the summary", () => {
    const view = buildProposalQueueView(
      [
        source({ messageId: "done", state: "applied" }),
        source({ messageId: "no", state: "reverted" }),
      ],
      config(),
    );
    expect(view.summary.appliedCount).toBe(1);
    expect(view.summary.rejectedCount).toBe(1);
    expect(view.summary.summaryText).toContain("1 angewendet");
    expect(view.summary.summaryText).toContain("1 abgelehnt");
  });

  it("sanitizes titles deterministically to the first line with a hard limit", () => {
    expect(sanitizeProposalTitle("Kurzer Titel")).toBe("Kurzer Titel");
    expect(sanitizeProposalTitle("Erste Zeile\nZweite Zeile mit Secret")).toBe("Erste Zeile");
    const long = "x".repeat(80);
    expect(sanitizeProposalTitle(long)).toHaveLength(58);
    expect(sanitizeProposalTitle(long).endsWith("…")).toBe(true);
  });

  it("rejects invalid inputs deterministically", () => {
    expect(() => buildProposalQueueView(null as never, config())).toThrow();
    expect(() => buildProposalQueueView([], config({ nowMs: Number.NaN }))).toThrow();
    expect(() => buildProposalQueueView([], config({ ttlMs: 0 }))).toThrow();
    expect(() => buildProposalQueueView([], config({ maxQueued: 0 }))).toThrow();
  });

  it("delegates transitions strictly to the sprint 35 state machine", () => {
    expect(requestProposalTransition("pending", "review").allowed).toBe(true);
    expect(requestProposalTransition("review", "applied").allowed).toBe(true);
    expect(requestProposalTransition("pending", "applied").allowed).toBe(false);
    expect(requestProposalTransition("applied", "pending").allowed).toBe(false);
    expect(requestProposalTransition("expired", "review").allowed).toBe(false);
    expect(requestProposalTransition("pending", "pending").allowed).toBe(false);
  });

  it("applies the reviewed override from the queue controls", () => {
    const view = buildProposalQueueView(
      [source({ statusOverride: "review" })],
      config(),
    );
    expect(view.items[0].status).toBe("review");
    expect(view.items[0].badgeLabel).toBe("In Prüfung");
    expect(view.items[0].badgeTone).toBe("accent");
    expect(view.items[0].actionable).toBe(true);
  });

  it("applies the rejected override from the queue controls", () => {
    const view = buildProposalQueueView(
      [source({ statusOverride: "rejected" })],
      config(),
    );
    expect(view.items[0].status).toBe("rejected");
    expect(view.items[0].badgeLabel).toBe("Abgelehnt");
    expect(view.items[0].actionable).toBe(false);
    expect(view.summary.rejectedCount).toBe(1);
    expect(view.summary.queuedCount).toBe(0);
  });

  it("keeps final chat states inviolable against overrides", () => {
    expect(
      resolveProposalStatus(source({ state: "applied", statusOverride: "review" })),
    ).toBe("applied");
    expect(
      resolveProposalStatus(source({ state: "applied", statusOverride: "review" })),
    ).toBe("applied");
    expect(
      resolveProposalStatus(source({ state: "reverted", statusOverride: "pending" })),
    ).toBe("rejected");
  });

  it("resolves queue controls only through validated transitions", () => {
    const first = requestProposalTransition("pending", "review");
    expect(first.allowed).toBe(true);
    expect(first.nextStatus).toBe("review");
    const view = buildProposalQueueView(
      [source({ statusOverride: first.nextStatus ?? undefined })],
      config(),
    );
    expect(view.items[0].status).toBe("review");
    const invalid = requestProposalTransition("review", "pending");
    expect(invalid.allowed).toBe(false);
  });

  it("produces token-free view output", () => {
    const view = buildProposalQueueView(
      [source({ summary: "Erste Zeile\nhttps://secret.example/token=abc\nghp_1234567890", changes: [{ path: "lib/x.ts", content: "export const token = 'ghp_shouldNotAppear';" }] })],
      config(),
    );
    const serialized = JSON.stringify(view);
    expect(view.items[0].title).toBe("Erste Zeile");
    expect(serialized).not.toMatch(/ghp_|sk-|api[-_]?key|token\s*=|https?:\/\//i);
  });
});
