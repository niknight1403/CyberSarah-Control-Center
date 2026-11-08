import { describe, expect, it, vi } from "vitest";

import { previewHubDraftAutopilot, runHubDraftAutopilot } from "../server/hub-draft-autopilot";
import { LOOP_STAGES, type DraftHubId } from "../lib/hub-draft-coverage-logic";

const NOW = Date.UTC(2026, 10, 9, 9, 0, 0);

function recordingInsert(outcome: "inserted" | "duplicate" = "inserted") {
  const calls: { kind: string; title: string; dedupeKey: string; payload: Record<string, unknown> }[] = [];
  const insertDraft = vi.fn(async (kind: string, title: string, payload: any, dedupeKey: string) => {
    calls.push({ kind, title, dedupeKey, payload: payload as Record<string, unknown> });
    return outcome;
  });
  return { calls, insertDraft };
}

describe("Hub-Draft-Autopilot", () => {
  it("plant einen Entwurf je Hub, ohne im Trockenlauf zu schreiben", async () => {
    const insertDraft = vi.fn();
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      dryRun: true,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => [],
    });

    expect(result.created).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(result.planned).toBe(8);
    expect(result.jobs.every((job) => job.outcome === "planned")).toBe(true);
    expect(insertDraft).not.toHaveBeenCalled();
    // Ein Lauf deckt je Hub genau eine der vier Stufen ab.
    expect(result.coverage.coveragePct).toBe(25);
    expect(result.note).toContain("Freigabe");
  });

  it("legt Entwuerfe mit Hub- und Stufen-Tag an", async () => {
    const { calls, insertDraft } = recordingInsert("inserted");
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => [],
    });

    expect(result.created).toBe(8);
    expect(result.duplicates).toBe(0);
    const contentCalls = calls.filter((call) => call.kind === "content");
    expect(contentCalls).toHaveLength(8);
    for (const call of contentCalls) {
      expect(call.payload.hub).toEqual(expect.any(String));
      expect(call.payload.loopStage).toEqual(expect.any(String));
      expect(call.payload.disclosure).toEqual(expect.any(String));
    }
    expect(result.coverage.coveredStages).toBe(8);
    expect(result.coverage.hubs.every((hub) => hub.coveredStages === 1)).toBe(true);
  });

  it("legt je Revenue-Hub einen Loop-Engineering-Entwurf an", async () => {
    const { calls, insertDraft } = recordingInsert("inserted");
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => [],
    });

    const loopCalls = calls.filter((call) => call.kind === "revenue-loop");
    expect(loopCalls).toHaveLength(4);
    expect(result.loopDrafts.created).toBe(4);
    expect(new Set(loopCalls.map((call) => call.payload.hub))).toEqual(new Set(["hara", "saas", "loop", "trading"]));
    expect(loopCalls.every((call) => call.payload.baseline === "keine Messdaten vorhanden")).toBe(true);
  });

  it("zaehlt Duplikate, statt denselben Entwurf doppelt zu melden", async () => {
    const { insertDraft } = recordingInsert("duplicate");
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => [],
    });

    expect(result.created).toBe(0);
    expect(result.duplicates).toBe(8);
    // Ein Duplikat bedeutet: die Stufe ist bereits besetzt.
    expect(result.coverage.coveredStages).toBe(8);
  });

  it("haelt das Queue-Limit fuer Inhalte ein", async () => {
    const pendingContent = Array.from({ length: 24 }, () => ({ kind: "content", status: "pending", payload: {} }));
    const { insertDraft } = recordingInsert("inserted");
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => pendingContent,
    });

    expect(result.created).toBe(0);
    expect(result.jobs.every((job) => job.outcome === "skipped")).toBe(true);
    expect(result.skipped[0].reason).toContain("Queue-Limit");
  });

  it("ueberspringt Hubs, deren Stufen bereits offen sind", async () => {
    const rows = (["hara", "saas"] as DraftHubId[]).flatMap((hub) =>
      LOOP_STAGES.map((stage) => ({ kind: "content", status: "pending", payload: { hub, loopStage: stage } })),
    );
    const { insertDraft } = recordingInsert("inserted");
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => rows,
      hubs: ["hara", "saas"],
    });

    expect(result.planned).toBe(0);
    expect(result.created).toBe(0);
    expect(result.coverage.completeHubs).toEqual(["hara", "saas"]);
  });

  it("erkennt vorhandene Loop-Entwuerfe am Autopilot-Schluessel", async () => {
    const { insertDraft } = recordingInsert("inserted");
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      dryRun: true,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => [
        { kind: "revenue-loop", status: "pending", payload: { hub: "hara", autopilotKey: "hub-loop:hara:v1" } },
      ],
    });

    expect(result.loopDrafts.planned).toBe(3);
  });

  it("beschraenkt einen Lauf auf einen einzelnen Hub", async () => {
    const { calls, insertDraft } = recordingInsert("inserted");
    const result = await runHubDraftAutopilot({
      now: () => NOW,
      insertDraft: insertDraft as never,
      listOpenDrafts: async () => [],
      hubs: ["b2b"],
    });

    expect(result.planned).toBe(1);
    expect(calls.filter((call) => call.kind === "content")).toHaveLength(1);
    expect(result.coverage.hubs).toHaveLength(1);
  });

  it("liefert in der Vorschau Titel, ohne zu schreiben", async () => {
    const preview = await previewHubDraftAutopilot({ now: () => NOW, listOpenDrafts: async () => [] });
    expect(preview.jobs).toHaveLength(8);
    expect(preview.jobs.every((job) => job.title.includes("·"))).toBe(true);
    expect(preview.loopDrafts).toHaveLength(8);
    expect(preview.coverage.coveragePct).toBe(0);
  });
});
