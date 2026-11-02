import { describe, expect, it } from "vitest";
import {
  buildRevenueLoopDigest,
  computeNetworkUpdate,
  computeReachUpdate,
  deriveNetworkStages,
  reachFromSnapshot,
  evaluateLoopOutcome,
  revenueLoopSummaryLines,
  selectLever,
  B2B_STAGES,
  NETWORK_STALE_DAYS,
  REVENUE_LOOP_DISCLAIMER,
  type RevenueLoopDigest,
} from "../lib/revenue-loop-orchestrator-logic";
import type { RevenueAutopilotSnapshot, RevenueOpportunity } from "../lib/revenue-autopilot-logic";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 2, 6, 0, 0);

function snapshot(overrides: Partial<RevenueAutopilotSnapshot> = {}): RevenueAutopilotSnapshot {
  return {
    landingViews: 1000,
    signups: 100,
    checkoutStarts: 40,
    upgrades: 20,
    stripeCheckoutStarted: 40,
    stripeCheckoutCompleted: 28,
    stripeCheckoutSuccessRate: 70,
    invoiceSuccessRate: 95,
    invoiceAttempts: 40,
    mrrEur: 1000,
    activeSubscriptions: 20,
    affiliateClicks: 100,
    affiliateConversions: 3,
    crossSellRecommended: 10,
    crossSellConverted: 1,
    validatedExpansionOpportunities: 2,
    haraOpenProposals: 0,
    ...overrides,
  };
}

function opportunity(overrides: Partial<RevenueOpportunity> = {}): RevenueOpportunity {
  return {
    key: "funnel.checkout",
    hub: "umsatz",
    title: "Checkout-Abschluss",
    score: 80,
    evidence: "high",
    metric: "checkout_success_rate",
    baseline: "70 %",
    target: "≥ 70 %",
    rationale: "Abbruch im Checkout kostet direkten Umsatz.",
    stages: ["A/B-Test der Zahlungsseite"],
    ...overrides,
  } as RevenueOpportunity;
}

describe("computeReachUpdate", () => {
  it("rechnet die Trichterraten und findet die schwächste Stufe", () => {
    const reach = computeReachUpdate({ impressions: 10000, visits: 1000, signups: 100, activations: 20 });
    expect(reach.available).toBe(true);
    expect(reach.visitRatePct).toBe(10);
    expect(reach.signupRatePct).toBe(10);
    expect(reach.activationRatePct).toBe(20);
    expect(reach.weakestStage).toBe("visits");
  });

  it("bleibt ohne Daten ehrlich leer statt zu schätzen", () => {
    const reach = computeReachUpdate(null);
    expect(reach.available).toBe(false);
    expect(reach.visitRatePct).toBeNull();
    expect(reach.weakestStage).toBeNull();
    expect(reach.note).toContain("Keine Reichweiten-Daten");
  });

  it("liefert keine Rate, wenn die Basis 0 oder unbekannt ist", () => {
    const reach = computeReachUpdate({ impressions: 0, visits: 5, signups: null, activations: 1 });
    expect(reach.visitRatePct).toBeNull();
    expect(reach.signupRatePct).toBeNull();
    // Aktivierungen werden an Signups gemessen; ohne Signup-Basis keine Rate.
    expect(reach.activationRatePct).toBeNull();
  });
});

describe("computeNetworkUpdate", () => {
  it("zählt nach Stufe und erkennt festgefahrene Kontakte", () => {
    const network = computeNetworkUpdate(
      [
        { key: "agentur-nord", stage: "contacted", lastTouchAt: NOW - 30 * DAY, estimatedValueCents: 500000 },
        { key: "saas-sued", stage: "replied", lastTouchAt: NOW - 2 * DAY, estimatedValueCents: 200000 },
        { key: "kunde-a", stage: "active", lastTouchAt: NOW - 90 * DAY },
      ],
      NOW,
    );
    expect(network.total).toBe(3);
    expect(network.byStage.contacted).toBe(1);
    expect(network.byStage.replied).toBe(1);
    expect(network.byStage.active).toBe(1);
    expect(network.staleCount).toBe(1);
    expect(network.stale[0].nodeKey).toBe("agentur-nord");
    expect(network.stale[0].requiresApproval).toBe(true);
    expect(network.activeCount).toBe(1);
  });

  it("wertet aktive Kunden nicht als festgefahren", () => {
    const network = computeNetworkUpdate([{ key: "kunde-a", stage: "active", lastTouchAt: NOW - 400 * DAY }], NOW);
    expect(network.staleCount).toBe(0);
  });

  it("sortiert offene Kontakte nach Wert und dann alphabetisch", () => {
    const network = computeNetworkUpdate(
      [
        { key: "b-klein", stage: "meeting", lastTouchAt: NOW, estimatedValueCents: 10000 },
        { key: "a-gross", stage: "meeting", lastTouchAt: NOW, estimatedValueCents: 900000 },
      ],
      NOW,
    );
    expect(network.nextActions.map((action) => action.nodeKey)).toEqual(["a-gross", "b-klein"]);
  });

  it("verwirft ungültige Stufen und Dubletten", () => {
    const network = computeNetworkUpdate(
      [
        { key: "x", stage: "kontakt" as never },
        { key: "y", stage: "pilot" },
        { key: "y", stage: "pilot" },
        { key: "", stage: "pilot" },
      ],
      NOW,
    );
    expect(network.total).toBe(1);
    expect(network.byStage.pilot).toBe(1);
    expect(B2B_STAGES).toContain("pilot");
  });

  it("lässt den Pipeline-Wert offen, wenn ein Kontakt keinen Wert hat", () => {
    const network = computeNetworkUpdate(
      [
        { key: "a", stage: "contacted", estimatedValueCents: 100000 },
        { key: "b", stage: "contacted" },
      ],
      NOW,
    );
    expect(network.pipelineValueCents).toBeNull();
  });

  it("meldet fehlendes Netzwerk verständlich", () => {
    expect(computeNetworkUpdate([], NOW).note).toContain("Kein B2B-Netzwerk");
  });
});

describe("selectLever", () => {
  it("nimmt den höchsten Score und bei Gleichstand alphabetisch", () => {
    expect(selectLever([opportunity({ key: "b", score: 50 }), opportunity({ key: "a", score: 50 })])?.key).toBe("a");
    expect(selectLever([opportunity({ key: "b", score: 90 }), opportunity({ key: "a", score: 50 })])?.key).toBe("b");
  });

  it("liefert null ohne Chancen", () => {
    expect(selectLever([])).toBeNull();
  });
});

describe("buildRevenueLoopDigest", () => {
  it("verbindet Umsatz, Reichweite und Netzwerk in einem Durchlauf", () => {
    const digest = buildRevenueLoopDigest({
      snapshot: snapshot(),
      reach: { impressions: 5000, visits: 500, signups: 40, activations: 4 },
      b2b: [{ key: "agentur-nord", stage: "contacted", lastTouchAt: NOW - 20 * DAY, estimatedValueCents: 500000 }],
      now: NOW,
    });
    expect(digest.revenue.mrrEur).toBe(1000);
    expect(digest.reach.weakestStage).not.toBeNull();
    expect(digest.network.total).toBe(1);
    expect(digest.actions.some((action) => action.area === "network")).toBe(true);
    expect(digest.disclaimer).toBe(REVENUE_LOOP_DISCLAIMER);
  });

  it("markiert fehlende Messquellen als Blocker, ohne Zahlen zu erfinden", () => {
    const digest = buildRevenueLoopDigest({
      snapshot: snapshot({ mrrEur: null, landingViews: 0, signups: 0, checkoutStarts: 0 }),
      reach: null,
      b2b: null,
      now: NOW,
    });
    expect(digest.revenue.mrrEur).toBeNull();
    expect(digest.blockers.length).toBeGreaterThanOrEqual(2);
    expect(digest.blockers.join(" ")).toContain("MRR");
    expect(digest.status).toBe("instrument");
  });

  it("ist deterministisch bei gleicher Eingabe", () => {
    const input = {
      snapshot: snapshot(),
      reach: { impressions: 900, visits: 90, signups: 9, activations: 1 },
      b2b: [
        { key: "z", stage: "identified" as const, estimatedValueCents: 20000 },
        { key: "a", stage: "pilot" as const, estimatedValueCents: 20000 },
      ],
      now: NOW,
    };
    expect(JSON.stringify(buildRevenueLoopDigest(input))).toBe(JSON.stringify(buildRevenueLoopDigest(input)));
  });

  it("kappt Aktionen auf ein prüfbares Maß", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      key: `kunde-${index}`,
      stage: "contacted" as const,
      lastTouchAt: NOW - 30 * DAY,
      estimatedValueCents: 1000 * index,
    }));
    const digest = buildRevenueLoopDigest({ snapshot: snapshot(), b2b: many, now: NOW });
    const networkActions = digest.actions.filter((action) => action.area === "network");
    expect(networkActions.length).toBeLessThanOrEqual(5);
    expect(digest.network.staleCount).toBe(40);
  });

  it("verweist bei erkanntem Stillstand auf einen Strategiewechsel", () => {
    const digest = buildRevenueLoopDigest({
      snapshot: snapshot(),
      signals: {
        iterationCount: 7,
        signatures: ["analyze:funnel", "analyze:funnel", "analyze:funnel"],
        progressSamples: [12, 12, 12, 12],
        consecutiveFailures: 0,
      },
      now: NOW,
    });
    expect(["alternate-strategy", "continue", "retry"]).toContain(digest.directive.action);
    expect(digest.directive.reason.length).toBeGreaterThan(0);
  });
});

describe("evaluateLoopOutcome", () => {
  const base = (mrr: number | null): RevenueLoopDigest =>
    buildRevenueLoopDigest({ snapshot: snapshot({ mrrEur: mrr }), now: NOW });

  it("skaliert bei deutlichem Wachstum", () => {
    const outcome = evaluateLoopOutcome(base(1000), base(1100));
    expect(outcome.verdict).toBe("scale");
    expect(outcome.deltaPct).toBe(10);
  });

  it("stoppt bei deutlichem Rückgang", () => {
    const outcome = evaluateLoopOutcome(base(1000), base(900));
    expect(outcome.verdict).toBe("stop");
    expect(outcome.deltaPct).toBe(-10);
  });

  it("entscheidet im Rauschband von ±2 % nicht", () => {
    expect(evaluateLoopOutcome(base(1000), base(1010)).verdict).toBe("iterate");
    expect(evaluateLoopOutcome(base(1000), base(995)).verdict).toBe("iterate");
  });

  it("bleibt ohne Baseline nicht messbar", () => {
    const outcome = evaluateLoopOutcome(base(null), base(500));
    expect(outcome.measurable).toBe(false);
    expect(outcome.deltaPct).toBeNull();
    expect(outcome.verdict).toBe("iterate");
  });
});

describe("revenueLoopSummaryLines", () => {
  it("erzeugt fünf knappe Zeilen ohne Rohdaten", () => {
    const lines = revenueLoopSummaryLines(buildRevenueLoopDigest({ snapshot: snapshot(), now: NOW }));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("MRR: 1000 EUR");
    expect(lines[3]).toContain("freigabepflichtig");
  });

  it("kennzeichnet fehlende Kennzahlen klar", () => {
    const lines = revenueLoopSummaryLines(
      buildRevenueLoopDigest({ snapshot: snapshot({ mrrEur: null }), now: NOW }),
    );
    expect(lines[0]).toContain("MRR: n/a");
  });
});

describe("Stale-Schwelle", () => {
  it("nutzt 14 Tage als Standard", () => {
    expect(NETWORK_STALE_DAYS).toBe(14);
    const fresh = computeNetworkUpdate([{ key: "a", stage: "contacted", lastTouchAt: NOW - 13 * DAY }], NOW);
    const old = computeNetworkUpdate([{ key: "a", stage: "contacted", lastTouchAt: NOW - 15 * DAY }], NOW);
    expect(fresh.staleCount).toBe(0);
    expect(old.staleCount).toBe(1);
  });
});

describe("deriveNetworkStages", () => {
  it("nimmt die stärkste Kante als Stufe", () => {
    const nodes = deriveNetworkStages(
      [{ nodeKey: "agentur-nord", kind: "lead", relationshipStrength: 10 }],
      [
        { fromNodeKey: "agentur-nord", toNodeKey: "wir", stage: "discovered", strength: 10 },
        { fromNodeKey: "agentur-nord", toNodeKey: "wir", stage: "engaged", strength: 60 },
      ],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].stage).toBe("meeting");
  });

  it("leitet ohne Kante aus Art und Beziehungsstärke ab", () => {
    const nodes = deriveNetworkStages([
      { nodeKey: "kunde", kind: "customer", relationshipStrength: 5 },
      { nodeKey: "partner", kind: "partner", relationshipStrength: 5 },
      { nodeKey: "warm", kind: "lead", relationshipStrength: 70 },
      { nodeKey: "kontakt", kind: "lead", relationshipStrength: 35 },
      { nodeKey: "kalt", kind: "lead", relationshipStrength: 5 },
    ]);
    expect(nodes.map((node) => node.stage)).toEqual(["active", "contract", "replied", "contacted", "identified"]);
  });

  it("führt abgemeldete Kontakte nicht", () => {
    const nodes = deriveNetworkStages([{ nodeKey: "abgemeldet", kind: "lead", relationshipStrength: 90, optedOut: true }]);
    expect(nodes).toHaveLength(0);
  });

  it("ignoriert unbekannte Kantenstufen und leere Schlüssel", () => {
    const nodes = deriveNetworkStages(
      [
        { nodeKey: "a", kind: "lead", relationshipStrength: 0 },
        { nodeKey: "  ", kind: "lead", relationshipStrength: 90 },
      ],
      [{ fromNodeKey: "a", toNodeKey: "", stage: "erfunden", strength: 100 }],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].stage).toBe("identified");
  });
});

describe("reachFromSnapshot", () => {
  it("übernimmt gemessene Funnel-Werte und lässt Impressionen offen", () => {
    const reach = reachFromSnapshot(snapshot());
    expect(reach.visits).toBe(1000);
    expect(reach.signups).toBe(100);
    expect(reach.activations).toBe(20);
    expect(reach.impressions).toBeNull();
  });

  it("macht aus fehlenden Werten null statt 0", () => {
    const reach = reachFromSnapshot(snapshot({ landingViews: null, signups: null, upgrades: null }));
    expect(reach.visits).toBeNull();
    expect(reach.signups).toBeNull();
    expect(reach.activations).toBeNull();
  });
});
