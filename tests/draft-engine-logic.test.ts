import { describe, expect, it } from "vitest";

import {
  buildDraftQueueView,
  draftApprovalHint,
  draftKindLabel,
  draftStatusLabel,
  nextDraftStatus,
  planDraftRun,
  validateDraftPayload,
  type DraftRow,
} from "../lib/draft-engine-logic";

const NOW = 1_760_000_000_000;

function row(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: 1,
    kind: "content",
    title: "Test",
    payload: { personaId: "nova", platform: "instagram", topic: "KI-Agenten", content: "Text" },
    status: "pending",
    createdAtMs: NOW,
    decidedAtMs: null,
    ...overrides,
  };
}

describe("planDraftRun", () => {
  it("fuellt freie Slots bis zum Limit", () => {
    const plan = planDraftRun({ content: 1, "revenue-loop": 3, idea: 0 });
    expect(plan).toEqual([
      { kind: "content", slots: 2, reason: "quota" },
      { kind: "revenue-loop", slots: 0, reason: "limit" },
      { kind: "idea", slots: 3, reason: "quota" },
    ]);
  });

  it("negatives/negatives-fehlendes Pending wird als 0 gelesen", () => {
    const plan = planDraftRun({} as never);
    expect(plan.every((entry) => entry.slots === 3)).toBe(true);
  });
});

describe("validateDraftPayload", () => {
  it("akzeptiert vollstaendige Content-Entwuerfe", () => {
    const result = validateDraftPayload("content", { personaId: "nova", platform: "x", topic: " T ", content: " C " });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.title).toBe("T");
  });

  it("verwirft Content ohne Text", () => {
    expect(validateDraftPayload("content", { personaId: "nova", platform: "x", topic: "T", content: "  " }).valid).toBe(false);
  });

  it("verwirft Revenue-Loops ohne Stufen", () => {
    const result = validateDraftPayload("revenue-loop", { name: "N", hypothesis: "H", metric: "M", stages: [] });
    expect(result.valid).toBe(false);
  });

  it("akzeptiert Revenue-Loops mit Stufen und filtert Leereinträge", () => {
    const result = validateDraftPayload("revenue-loop", { name: "N", hypothesis: "H", metric: "M", stages: ["A", "  ", "B"] });
    expect(result.valid).toBe(true);
    if (result.valid && "stages" in result.payload) expect(result.payload.stages).toEqual(["A", "B"]);
  });

  it("verwirft Ideen ohne Begruendung", () => {
    expect(validateDraftPayload("idea", { note: "N", rationale: "" }).valid).toBe(false);
  });

  it("verwirft zu lange Titel", () => {
    expect(validateDraftPayload("idea", { note: "x".repeat(400), rationale: "R" }).valid).toBe(false);
  });
});

describe("buildDraftQueueView", () => {
  it("gruppiert pending nach Art und trennt entschieden", () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, kind: "idea", payload: { note: "N", rationale: "R" } }),
      row({ id: 3, status: "approved", decidedAtMs: NOW + 1000 }),
      row({ id: 4, kind: "revenue-loop", payload: { name: "N", hypothesis: "H", stages: ["A"], metric: "M" } }),
    ];
    const view = buildDraftQueueView(rows, NOW);
    expect(view.counts).toEqual({ pending: 3, approved: 1, rejected: 0 });
    expect(view.pending.map((group) => group.kind)).toEqual(["content", "revenue-loop", "idea"]);
    expect(view.decided).toHaveLength(1);
    expect(view.oldestPendingDays).toBe(0);
  });

  it("leere Queue hat keine Altersangabe", () => {
    const view = buildDraftQueueView([], NOW);
    expect(view.oldestPendingDays).toBeNull();
  });

  it("berechnet das Alter des aeltesten offenen Entwurfs", () => {
    const view = buildDraftQueueView([row({ createdAtMs: NOW - 5 * 86_400_000 })], NOW);
    expect(view.oldestPendingDays).toBe(5);
  });
});

describe("Status-/Label-Helfer", () => {
  it("nur approve/reject schliessen einen Entwurf", () => {
    expect(nextDraftStatus("approve")).toBe("approved");
    expect(nextDraftStatus("reject")).toBe("rejected");
  });

  it("Labels sind deutsch und ehrlich", () => {
    expect(draftStatusLabel("pending")).toContain("Freigabe");
    expect(draftKindLabel("revenue-loop")).toBe("Revenue-Loop");
    expect(draftApprovalHint("content")).toContain("separater Schritt");
  });
});
