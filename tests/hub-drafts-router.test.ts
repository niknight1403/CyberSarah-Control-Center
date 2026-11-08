import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHubDraftsRouter } from "../server/hub-drafts-router";
import { publicProcedure, router } from "../server/_core/trpc";

const mocks = {
  runHubDraftAutopilot: vi.fn(),
  previewHubDraftAutopilot: vi.fn(),
};

/**
 * Eigene Router-Instanz mit eingespeisten Abhaengigkeiten statt Modul-Mock:
 * `isolate: false` teilt die Modul-Registry ueber Testdateien hinweg, ein
 * vi.mock auf `server/hub-draft-autopilot` wuerde je nach Dateireihenfolge
 * andere Suiten treffen.
 */
function testRouter() {
  return router({
    hubDrafts: createHubDraftsRouter({
      pendingRows: async () => [],
      runAutopilot: mocks.runHubDraftAutopilot as never,
      previewAutopilot: mocks.previewHubDraftAutopilot as never,
    }),
    probe: router({ ping: publicProcedure.query(() => "ok") }),
  });
}

type TrpcContext = import("../server/_core/context").TrpcContext;

function context(role: "user" | "admin" | null): TrpcContext {
  const user =
    role === null
      ? null
      : {
          id: 1,
          openId: "sample-user",
          email: "sample@example.com",
          name: "Sample User",
          loginMethod: "manus",
          passwordHash: null,
          stripeCustomerId: null,
          role,
          designTheme: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
}

const runResult = {
  ok: true,
  dryRun: true,
  startedAt: "2026-11-09T08:00:00.000Z",
  planned: 8,
  created: 0,
  duplicates: 0,
  skipped: [],
  loopDrafts: { planned: 4, created: 0, duplicates: 0 },
  jobs: [],
  coverage: { hubs: [], totalStages: 32, coveredStages: 8, coveragePct: 25, completeHubs: [], emptyHubs: [] },
  note: "Nur pending-Entwuerfe erzeugt.",
};

describe("hubDrafts-Router", () => {
  beforeEach(() => {
    mocks.runHubDraftAutopilot.mockReset();
    mocks.previewHubDraftAutopilot.mockReset();
    mocks.runHubDraftAutopilot.mockResolvedValue(runResult);
  });

  it("verlangt eine Anmeldung", async () => {
    const caller = testRouter().createCaller(context(null));
    await expect(caller.hubDrafts.hubs()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("liefert alle Bereiche mit ihren vier Loop-Stufen", async () => {
    const caller = testRouter().createCaller(context("user"));
    const hubs = await caller.hubDrafts.hubs();
    expect(hubs).toHaveLength(8);
    expect(hubs[0].stages).toHaveLength(4);
    expect(hubs.every((hub) => hub.personas.length > 0)).toBe(true);
  });

  it("zeigt Loop-Engineering-Moeglichkeiten ohne Prognosezahlen", async () => {
    const caller = testRouter().createCaller(context("user"));
    const loops = await caller.hubDrafts.loops();
    expect(loops).toHaveLength(8);
    expect(loops.every((loop) => loop.hypotheses.length === 4)).toBe(true);
    expect(loops.every((loop) => typeof loop.measurementGap === "string")).toBe(true);
    expect(JSON.stringify(loops)).not.toMatch(/€/);
  });

  it("ordnet KI-Persoenlichkeiten ihren Bereichen zu", async () => {
    const caller = testRouter().createCaller(context("user"));
    const mapping = await caller.hubDrafts.personas();
    expect(mapping.personas.length).toBeGreaterThanOrEqual(6);
    expect(mapping.personas.every((persona) => persona.disclosure.length > 10)).toBe(true);
    // Jeder Bereich muss von mindestens einer Persona bespielt werden.
    const covered = new Set(mapping.personas.flatMap((persona) => persona.hubs.map((hub) => hub.id)));
    expect(covered.size).toBe(8);
    expect(mapping.unassignedHubs).toEqual([]);
  });

  it("startet ohne Angabe einen Trockenlauf", async () => {
    const caller = testRouter().createCaller(context("admin"));
    await caller.hubDrafts.run();
    expect(mocks.runHubDraftAutopilot).toHaveBeenCalledWith({ dryRun: true, hubs: undefined });
  });

  it("schreibt nur auf ausdrueckliche Anweisung", async () => {
    const caller = testRouter().createCaller(context("admin"));
    await caller.hubDrafts.run({ dryRun: false });
    expect(mocks.runHubDraftAutopilot).toHaveBeenCalledWith({ dryRun: false, hubs: undefined });
  });

  it("beschraenkt einen Lauf auf einen Hub und meldet den Umfang", async () => {
    const caller = testRouter().createCaller(context("admin"));
    const result = await caller.hubDrafts.run({ dryRun: false, hub: "trading" });
    expect(mocks.runHubDraftAutopilot).toHaveBeenCalledWith({ dryRun: false, hubs: ["trading"] });
    expect(result.scope).toEqual({ hub: "trading", label: "Finanzbildung & Marktlesen" });
  });

  it("erlaubt Nicht-Admins keinen Lauf", async () => {
    const caller = testRouter().createCaller(context("user"));
    await expect(caller.hubDrafts.run({ dryRun: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
