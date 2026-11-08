import { describe, expect, it, vi } from "vitest";
import { runControlCenterAutopilot } from "../server/control-center-autopilot";

describe("control center autopilot", () => {
  const revenue = vi.fn(async () => ({ status: "healthy" as const, generated: 2, skipped: [], opportunities: [] }));
  const drafts = vi.fn(async () => ({
    plan: [],
    generated: { content: 6, idea: 2, "revenue-loop": 1 },
    skipped: [],
  }));
  const learnInfluencers = vi.fn(async () => ({
    evolutions: [{ personaId: "juno" }],
    plan: { queue: [{ personaId: "juno", dimension: "platform", value: "linkedin" }] },
    windowDays: 30,
  })) as never;
  const b2bOverview = vi.fn(async () => ({
    counts: { nodes: 12, edges: 9, qualified: 3, customers: 2, partners: 2, optedOut: 0 },
    priorities: [], edges: [], autonomy: { discoveryAndScoring: true, unsolicitedOutreach: false, externalSendRequiresApproval: true },
  })) as never;
  const growthPulse = vi.fn(async () => ({
    generated: 1, skipped: null, focus: "REACH",
    plan: { focus: "REACH" }, externalActionsExecuted: 0,
    executedAt: "2026-10-30T00:00:00.000Z",
  })) as never;
  const throughput = vi.fn(async () => ({
    status:"scale" as const,blockers:[],priorities:[],
    currentMrrEur:1200,activeSubscriptions:20,
    mrrVelocity:{available:false as const,projectedMrrEur:null,reason:"history missing"},
    revenueVelocity:{recent7RevenueEur:700,previous7RevenueEur:600,changePct:16.67,monthlyRunRateEur:3000,recent7Conversions:7,previous7Conversions:6,conversionChangePct:16.67},
    funnel:[],bottleneck:null,
    payments:{stripeConnected:true,stripeWebhookConfigured:true,digistoreIpnConfigured:true,digistoreApiConfigured:true,stripeCheckoutSuccessRate:80,invoiceSuccessRate:99},
    infrastructure:{databaseReady:true,providerCircuitsOpen:0,providerCircuitsTotal:3},
    generatedAt:"2026-11-01T00:00:00.000Z",evidence:{dailyRevenueRows:14,stripeCheckedAt:null,stripeStatus:"connected",mrrSource:"test",revenueVelocitySource:"test"},
  })) as never;
  // Sprint 3: der AI-Influenza-Schritt ist eine eigene Abhaengigkeit. Ohne diesen
  // Fake wuerde der Test gegen eine echte Datenbank laufen.
  const aiInfluenza = async () => ({ considered: 0, advanced: 0, waiting: 0, failed: 0, details: [], error: null });
  // Katalog-Schritt ebenfalls als Fake: er wuerde sonst Plaene aus der
  // Umgebung bauen und den Test von Secrets abhaengig machen.
  const salesCatalog = async () => ({ dryRun: true, plans: 0, executed: 0, skipped: 0, needsReview: 0, created: [], reused: [], blocked: [], error: null });
  // Hub-Entwuerfe ebenfalls gefaked: der echte Lauf braucht die Entwurfs-Queue
  // in der Datenbank und wuerde den Test an ein laufendes Postgres binden.
  const hubDrafts = (async () => ({
    ok: true, dryRun: false, startedAt: "2026-11-09T08:00:00.000Z",
    planned: 8, created: 3, duplicates: 0, skipped: [],
    loopDrafts: { planned: 4, created: 1, duplicates: 0 },
    jobs: [], note: "Nur pending-Entwuerfe erzeugt.",
    coverage: { hubs: [], totalStages: 32, coveredStages: 11, coveragePct: 34, completeHubs: ["hara", "saas"], emptyHubs: [] },
  })) as never;
  // Discovery ebenfalls gefaked: der echte Lauf liest Katalog und Entwuerfe
  // aus der Datenbank.
  const discovery = (async () => ({
    ok: true, dryRun: false, startedAt: "2026-11-09T08:00:00.000Z", periodKey: "2026-W45",
    evaluated: 5, integrate: 1, test: 2, review: 1, skip: 1, created: 1, duplicates: 0,
    drafts: [{ title: "Kandidat", score: 74, verdict: "integrate", dedupeKey: "discovery:x", hub: "loop" }],
    top: [], skipped: [], note: "Ideen-Entwuerfe angelegt.",
  })) as never;
  const growthDeps = { learnInfluencers, b2bOverview, growth: growthPulse, throughput, aiInfluenza, salesCatalog, hubDrafts, discovery };

  it("orchestriert echte Scans, Revenue und Drafts in einem Lauf", async () => {
    const scan = vi.fn(async () => ({ accepted: true, completed: false, background: true }));
    const result = await runControlCenterAutopilot({ scan, revenue, drafts, ...growthDeps });
    expect(scan).toHaveBeenCalledWith("hara/scan");
    expect(scan).toHaveBeenCalledWith("expansion/scan");
    expect(revenue).toHaveBeenCalledWith(5);
    expect(drafts).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.deferred).toEqual([]);
    expect(result.realActions.join(" ")).toContain("Creator-Content");
    expect(result.realActions.join(" ")).toContain("Revenue");
    expect(result.growth).toMatchObject({ influencerPersonasLearned: 1, influencerExperimentsQueued: 1, b2bNodes: 12, b2bQualified: 3, b2bPartners: 2 });
    expect(result.growthPulse?.generated).toBe(1);
    expect(result.realActions.join(" ")).toContain("Reichweiten");
    expect(result.realActions.join(" ")).toContain("Influencer-Personas");
    expect(result.realActions.join(" ")).toContain("Hub-Entwuerfe erzeugt");
    expect(result.decision.action).toBe("VERIFY");
  });

  it("meldet angelegte Katalogpreise als echte Aktion und Trockenlauf als Wartestand", async () => {
    const scan = vi.fn(async () => ({ accepted: true, completed: false, background: true }));
    const executed = async () => ({
      dryRun: false, plans: 6, executed: 2, skipped: 1, needsReview: 3,
      created: [],
      reused: [{ channel: "stripe" as const, packageId: "growth" as const, priceId: "price_bestehend", envTarget: "STRIPE_AI_INFLUENZA_PRICE_ID_GROWTH" }],
      blocked: ["digistore24/starter: DIGISTORE24_API_KEY fehlt."],
      error: null,
    });
    const result = await runControlCenterAutopilot({ scan, revenue, drafts, ...growthDeps, salesCatalog: executed });
    // ok bleibt false, solange etwas wartet: der Katalog ist noch nicht fertig.
    expect(result.ok).toBe(false);
    expect(result.blocked).toEqual([]);
    expect(result.realActions.join(" ")).toContain("2 Stripe-Katalogpreis(e) autonom angelegt");
    expect(result.deferred.join(" ")).toContain("1 offener Punkt");
    expect(result.deferred.join(" ")).toContain("3 Zahlungsplan-Entwürfe warten");
    expect(result.deferred.join(" ")).toContain("1 vorhandene(r) Stripe-Preis(e) wiederverwendet");
    expect(result.blocked).toEqual([]);
  });

  it("behandelt Provider-Quota ehrlich als verschobene Arbeit", async () => {
    const limitedDrafts = vi.fn(async () => ({ plan: [], generated: {}, skipped: [{ kind: "content" as const, reason: "LLM 429 Too Many Requests quota exceeded" }] }));
    const scan = vi.fn(async () => ({ accepted: true, completed: false, background: true }));
    const result = await runControlCenterAutopilot({ scan, revenue, drafts: limitedDrafts, ...growthDeps });
    expect(result.ok).toBe(false);
    expect(result.deferred.join(" ")).toContain("429");
    expect(result.blocked).toEqual([]);
    expect(result.decision.action).toBe("RETRY");
  });

  it("meldet Growth-Ausfaelle als echte Blockade statt falschen Erfolg", async () => {
    const scan = vi.fn(async () => ({ accepted: true, completed: false, background: true }));
    const growth = vi.fn(async () => { throw new Error("Growth DB offline"); }) as never;
    const result = await runControlCenterAutopilot({ scan, revenue, drafts, learnInfluencers, b2bOverview, growth, aiInfluenza });
    expect(result.ok).toBe(false);
    expect(result.growthPulse).toBeNull();
    expect(result.blocked.join(" ")).toContain("Growth DB offline");
  });

  it("meldet reale Blockaden statt sie als Erfolg zu simulieren", async () => {
    const scan = vi.fn()
      .mockRejectedValueOnce(new Error("Relay offline"))
      .mockResolvedValueOnce({ accepted: true, completed: false, background: true });
    const result = await runControlCenterAutopilot({ scan, revenue, drafts, ...growthDeps });
    expect(result.ok).toBe(false);
    expect(result.blocked.join(" ")).toContain("Relay offline");
    expect(result.decision.action).toBe("HEAL");
  });
});
