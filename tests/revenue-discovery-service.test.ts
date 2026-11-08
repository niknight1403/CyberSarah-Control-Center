import { describe, expect, it, vi } from "vitest";

import { deriveCandidates, runRevenueDiscovery } from "../server/revenue-discovery-service";
import { createRevenueDiscoveryRouter } from "../server/revenue-discovery-router";
import { publicProcedure, router } from "../server/_core/trpc";

const NOW = Date.UTC(2026, 10, 9, 9, 0, 0);

const baseDeps = {
  listAffiliateProducts: async () => [
    { slug: "ki-kurs", title: "KI-Kurs Komplettpaket", score: 88, commissionPercent: 40, platform: "digistore24" },
    { slug: "ohne-daten", title: "Paket ohne Bewertung", score: null, commissionPercent: null, platform: "digistore24" },
  ],
  listOffers: async () => [] as { name: string; kind: string; status: string }[],
  listDraftRows: async () => [
    { kind: "content", status: "pending", payload: { hub: "hara", loopStage: "attention" } },
  ],
  listExistingDiscoveryKeys: async () => [] as string[],
  integrationStatuses: () => [
    { key: "resend", label: "Resend (E-Mail)", readiness: "not_configured", missingEnv: ["RESEND_API_KEY"] },
    { key: "openai", label: "OpenAI", readiness: "ready", missingEnv: [] },
  ],
  now: () => NOW,
};

describe("Signale ableiten", () => {
  it("erzeugt aus Katalog, Luecken und Integrationen nachvollziehbare Kandidaten", () => {
    const candidates = deriveCandidates({
      products: [
        { slug: "ki-kurs", title: "KI-Kurs", score: 88, commissionPercent: 40, platform: "digistore24" },
      ],
      offers: [],
      draftRows: [
        { kind: "content", status: "pending", payload: { hub: "hara", loopStage: "attention" } },
      ],
      integrations: [
        { key: "stripe", label: "Stripe", readiness: "not_configured", missingEnv: ["STRIPE_SECRET_KEY"] },
      ],
    });

    const sources = candidates.map((entry) => entry.source);
    expect(sources).toContain("affiliate-catalog");
    expect(sources).toContain("offer-gap");
    expect(sources).toContain("loop-gap");
    expect(sources).toContain("integration-gap");
    for (const entry of candidates) {
      expect(entry.evidenceNotes.length).toBeGreaterThan(0);
      expect(entry.integrationStep.length).toBeGreaterThan(10);
    }
  });

  it("meldet fehlende Provisionsdaten ehrlich als unvollstaendigen Beleg", () => {
    const [candidate] = deriveCandidates({
      products: [{ slug: "x", title: "X", score: 70, commissionPercent: null, platform: "digistore24" }],
      offers: [],
      draftRows: [],
      integrations: [],
    });
    expect(candidate.evidenceComplete).toBe(false);
    expect(candidate.evidenceNotes).toContain("keine Provision bekannt");
  });

  it("ordnet rote Zahlungsintegrationen dem Funnel-Bereich zu", () => {
    const candidates = deriveCandidates({
      products: [],
      offers: [],
      draftRows: [],
      integrations: [{ key: "stripe", label: "Stripe Checkout", readiness: "not_configured", missingEnv: ["STRIPE_SECRET_KEY"] }],
    });
    expect(candidates[0].hub).toBe("loop");
    expect(candidates[0].integrationStep).toContain("STRIPE_SECRET_KEY");
  });

  it("ignoriert bereite Integrationen", () => {
    const candidates = deriveCandidates({
      products: [],
      offers: [],
      draftRows: [],
      integrations: [{ key: "openai", label: "OpenAI", readiness: "ready", missingEnv: [] }],
    });
    expect(candidates).toEqual([]);
  });

  it("schlaegt kein Angebot vor, wo schon eines aktiv ist", () => {
    const candidates = deriveCandidates({
      products: [],
      offers: [{ name: "Programm", kind: "hara", status: "active" }],
      draftRows: [{ kind: "content", status: "pending", payload: { hub: "hara", loopStage: "trust" } }],
      integrations: [],
    });
    expect(candidates.some((entry) => entry.source === "offer-gap")).toBe(false);
  });
});

describe("Discovery-Lauf", () => {
  it("schreibt im Trockenlauf nichts und meldet die Bewertung", async () => {
    const insertDraft = vi.fn();
    const result = await runRevenueDiscovery({ ...baseDeps, insertDraft: insertDraft as never, dryRunWrite: true });

    expect(result.dryRun).toBe(true);
    expect(result.created).toBe(0);
    expect(insertDraft).not.toHaveBeenCalled();
    expect(result.evaluated).toBeGreaterThan(0);
    expect(result.drafts.length).toBeGreaterThan(0);
    expect(result.note).toContain("Trockenlauf");
  });

  it("legt Ideen-Entwuerfe mit Dedupe-Schluessel an", async () => {
    const calls: { title: string; dedupeKey: string }[] = [];
    const insertDraft = vi.fn(async (title: string, _payload: unknown, dedupeKey: string) => {
      calls.push({ title, dedupeKey });
      return "inserted" as const;
    });
    const result = await runRevenueDiscovery({ ...baseDeps, insertDraft: insertDraft as never });

    expect(result.created).toBe(calls.length);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.dedupeKey.startsWith("discovery:"))).toBe(true);
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it("zaehlt Duplikate, statt doppelt zu schreiben", async () => {
    const result = await runRevenueDiscovery({
      ...baseDeps,
      insertDraft: (async () => "duplicate") as never,
    });
    expect(result.created).toBe(0);
    expect(result.duplicates).toBeGreaterThan(0);
  });

  it("respektiert bereits vorgelegte Kandidaten", async () => {
    const first = await runRevenueDiscovery({ ...baseDeps, dryRunWrite: true });
    const keys = first.drafts.map((draft) => draft.dedupeKey);
    const second = await runRevenueDiscovery({
      ...baseDeps,
      listExistingDiscoveryKeys: async () => keys,
      dryRunWrite: true,
    });
    expect(second.drafts).toEqual([]);
    expect(second.note).toContain("Trockenlauf");
  });

  it("bleibt ohne Datenbank nutzbar (leere Quellen)", async () => {
    const result = await runRevenueDiscovery({
      listAffiliateProducts: async () => [],
      listOffers: async () => [],
      listDraftRows: async () => [],
      listExistingDiscoveryKeys: async () => [],
      integrationStatuses: () => [],
      dryRunWrite: true,
    });
    expect(result.ok).toBe(true);
    expect(result.evaluated).toBe(0);
    expect(result.created).toBe(0);
  });
});

describe("revenueDiscovery-Router", () => {
  type TrpcContext = import("../server/_core/context").TrpcContext;

  function context(role: "user" | "admin" | null): TrpcContext {
    const user = role === null ? null : {
      id: 1, openId: "u", email: "u@example.com", name: "U", loginMethod: "manus",
      passwordHash: null, stripeCustomerId: null, role, designTheme: null,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    };
    return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
  }

  const runResult = {
    ok: true, dryRun: true, startedAt: "2026-11-09T08:00:00.000Z", periodKey: "2026-W45",
    evaluated: 3, integrate: 1, test: 1, review: 1, skip: 0, created: 0, duplicates: 0,
    drafts: [], top: [], skipped: [], note: "Trockenlauf.",
  };

  function testRouter(run = vi.fn(async () => runResult)) {
    return {
      run,
      caller: router({
        revenueDiscovery: createRevenueDiscoveryRouter({
          run: run as never,
          preview: (async () => ({ plan: { periodKey: "2026-W45", integrate: [], test: [], review: [], skip: [], toDraft: [] }, sources: 0 })) as never,
        }),
        probe: router({ ping: publicProcedure.query(() => "ok") }),
      }),
    };
  }

  it("verlangt Anmeldung", async () => {
    const { caller } = testRouter();
    await expect(caller.createCaller(context(null)).revenueDiscovery.sources()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("nennt die Quellen und Gewichte", async () => {
    const { caller } = testRouter();
    const result = await caller.createCaller(context("user")).revenueDiscovery.sources();
    expect(result.sources.length).toBeGreaterThanOrEqual(6);
    expect(result.weights.demand).toBeGreaterThan(result.weights.safety);
  });

  it("rechnet eine Bewertung durch", async () => {
    const { caller } = testRouter();
    const result = await caller.createCaller(context("user")).revenueDiscovery.score({
      signals: { demand: 90, fit: 85, margin: 80, ease: 70, safety: 90 },
    });
    expect(result.verdict).toBe("integrate");
  });

  it("startet standardmaessig einen Trockenlauf", async () => {
    const { caller, run } = testRouter();
    await caller.createCaller(context("admin")).revenueDiscovery.run();
    expect(run).toHaveBeenCalledWith({ dryRunWrite: true });
  });

  it("schreibt nur mit dryRun false und Adminrecht", async () => {
    const { caller, run } = testRouter();
    await caller.createCaller(context("admin")).revenueDiscovery.run({ dryRun: false });
    expect(run).toHaveBeenCalledWith({ dryRunWrite: false });
    await expect(caller.createCaller(context("user")).revenueDiscovery.run({ dryRun: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
