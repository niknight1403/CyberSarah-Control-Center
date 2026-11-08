import { describe, expect, it } from "vitest";

import {
  automatableCandidates,
  buildOpportunityDraft,
  DISCOVERY_SOURCES,
  getDiscoverySource,
  opportunityDedupeKey,
  planDiscoveryRun,
  rankCandidates,
  scoreOpportunity,
  slidingPeriodKey,
  type OpportunityCandidate,
} from "../lib/revenue-discovery-logic";
import { AUTOPILOTS, buildAutopilotOverview } from "../lib/autopilot-registry-logic";

const NOW = Date.UTC(2026, 10, 9, 9, 0, 0);

function candidate(overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  return {
    source: "affiliate-catalog",
    hub: "affiliate",
    subject: "produkt-a",
    title: "Kandidat A",
    revenuePath: "Provision ueber Empfehlung",
    integrationStep: "Persona zuordnen und Angebotsstufe planen",
    signals: { demand: 80, fit: 80, margin: 80, ease: 70, safety: 80 },
    evidenceComplete: true,
    evidenceNotes: ["Score 80", "Provision 40%"],
    ...overrides,
  };
}

describe("Discovery-Quellen", () => {
  it("nennt fuer jede Quelle Herkunft, Ertrag und Beleg", () => {
    expect(DISCOVERY_SOURCES.length).toBeGreaterThanOrEqual(6);
    for (const source of DISCOVERY_SOURCES) {
      expect(source.origin.length).toBeGreaterThan(10);
      expect(source.yields.length).toBeGreaterThan(10);
      expect(source.evidence.length).toBeGreaterThan(5);
      expect(["autopilot", "assisted", "manual"]).toContain(source.automation);
    }
  });

  it("laesst nur automatisierbare Quellen in den Autopilot", () => {
    const candidates = [
      candidate({ source: "affiliate-catalog", subject: "a" }),
      candidate({ source: "marketplace-scan", subject: "b" }),
      candidate({ source: "partner-signal", subject: "c" }),
    ];
    const automatic = automatableCandidates(candidates);
    expect(automatic.map((entry) => entry.subject)).toEqual(["a"]);
    expect(getDiscoverySource("marketplace-scan")?.automation).toBe("assisted");
  });
});

describe("Bewertung", () => {
  it("stuft einen belegten, passenden Kandidaten als integrierbar ein", () => {
    const result = scoreOpportunity({ demand: 85, fit: 80, margin: 75, ease: 70, safety: 90 }, true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.verdict).toBe("integrate");
    expect(result.blockers).toEqual([]);
  });

  it("verweigert die Integration ohne vollstaendige Belege", () => {
    const result = scoreOpportunity({ demand: 90, fit: 90, margin: 90, ease: 90, safety: 90 }, false);
    expect(result.verdict).toBe("test");
    expect(result.blockers.join(" ")).toContain("Beleg unvollstaendig");
  });

  it("deckelt hohes Risiko auf Test", () => {
    const result = scoreOpportunity({ demand: 95, fit: 90, margin: 90, ease: 80, safety: 20 }, true);
    expect(result.verdict).toBe("test");
    expect(result.blockers.join(" ")).toContain("Risiko");
  });

  it("verwirft schwache Signale statt sie zu ueberzeichnen", () => {
    const result = scoreOpportunity({ demand: 10, fit: 20, margin: 5, ease: 10, safety: 80 }, true);
    expect(result.verdict).toBe("skip");
    expect(result.score).toBeLessThan(30);
  });

  it("gewichtet Nachfrage am staerksten", () => {
    const demandHeavy = scoreOpportunity({ demand: 100, fit: 0, margin: 0, ease: 0, safety: 100 }, true);
    const marginHeavy = scoreOpportunity({ demand: 0, fit: 0, margin: 100, ease: 0, safety: 100 }, true);
    expect(demandHeavy.score).toBeGreaterThan(marginHeavy.score);
  });

  it("normalisiert unsinnige Eingaben statt NaN zu liefern", () => {
    const result = scoreOpportunity({ demand: 900, fit: -50, margin: Number.NaN, ease: 50, safety: 50 }, true);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("Planung", () => {
  it("baut einen stabilen Wochenschluessel", () => {
    expect(slidingPeriodKey(NOW)).toMatch(/^2026-W\d{2}$/);
    expect(slidingPeriodKey(NOW)).toBe(slidingPeriodKey(NOW + 3_600_000));
  });

  it("erzeugt einen lesbaren Dedupe-Schluessel", () => {
    const key = opportunityDedupeKey(candidate({ subject: "Mein Produkt / 2026!" }), "2026-W45");
    expect(key).toBe("discovery:affiliate-catalog:mein-produkt-2026:2026-W45");
  });

  it("sortiert die lohnendsten Kandidaten nach oben", () => {
    const ranked = rankCandidates(
      [
        candidate({ subject: "schwach", signals: { demand: 20, fit: 20, margin: 10, ease: 30, safety: 70 } }),
        candidate({ subject: "stark" }),
        candidate({ subject: "mittel", signals: { demand: 55, fit: 60, margin: 40, ease: 55, safety: 80 } }),
      ],
      NOW,
    );
    expect(ranked[0].subject).toBe("stark");
    expect(ranked[2].subject).toBe("schwach");
  });

  it("legt hoechstens die erlaubte Zahl an Entwuerfen an", () => {
    const plan = planDiscoveryRun(
      Array.from({ length: 6 }, (_, index) => candidate({ subject: `p${index}` })),
      { nowMs: NOW, maxDrafts: 2 },
    );
    expect(plan.toDraft).toHaveLength(2);
    expect(plan.integrate).toHaveLength(6);
  });

  it("ueberspringt Kandidaten, die bereits als Entwurf vorliegen", () => {
    const first = candidate({ subject: "schon-da" });
    const key = opportunityDedupeKey(first, slidingPeriodKey(NOW));
    const plan = planDiscoveryRun([first, candidate({ subject: "neu" })], {
      nowMs: NOW,
      maxDrafts: 4,
      alreadyDrafted: [key],
    });
    expect(plan.toDraft.map((entry) => entry.subject)).toEqual(["neu"]);
  });

  it("nimmt Kandidaten zum Beobachten nicht in die Entwuerfe", () => {
    const plan = planDiscoveryRun(
      [candidate({ signals: { demand: 40, fit: 40, margin: 20, ease: 40, safety: 70 } })],
      { nowMs: NOW },
    );
    expect(plan.review).toHaveLength(1);
    expect(plan.toDraft).toHaveLength(0);
  });
});

describe("Entwurf fuer die Freigabe", () => {
  it("erklaert Quelle, Umsatzweg, naechsten Schritt und Belege", () => {
    const [scored] = rankCandidates([candidate()], NOW);
    const draft = buildOpportunityDraft(scored);
    expect(draft.kind).toBe("idea");
    expect(draft.payload.rationale).toContain("Quelle:");
    expect(draft.payload.rationale).toContain("Umsatzweg:");
    expect(draft.payload.rationale).toContain("Naechster Schritt:");
    expect(draft.payload.rationale).toContain("Belege:");
    expect(draft.title.length).toBeLessThanOrEqual(120);
    expect(draft.payload.rationale.length).toBeLessThanOrEqual(600);
  });

  it("enthaelt keine Umsatzprognose", () => {
    const [scored] = rankCandidates([candidate()], NOW);
    const draft = buildOpportunityDraft(scored);
    expect(draft.payload.rationale).toContain("Keine Umsatzprognose");
    expect(draft.payload.rationale).not.toMatch(/€|EUR\b/);
  });
});

describe("Autopilot-Registry", () => {
  it("beschreibt fuer jeden Lauf Kadenz, Schreibzugriff und Absicherung", () => {
    expect(AUTOPILOTS.length).toBeGreaterThanOrEqual(6);
    for (const entry of AUTOPILOTS) {
      expect(entry.cadence.length).toBeGreaterThan(1);
      expect(entry.writes.length).toBeGreaterThan(5);
      expect(entry.rationale.length).toBeGreaterThan(20);
      expect(entry.gates.length).toBeGreaterThan(0);
    }
  });

  it("nennt Discovery und Hub-Entwuerfe als aktive Laeufe", () => {
    const ids = AUTOPILOTS.filter((entry) => entry.status === "active").map((entry) => entry.id);
    expect(ids).toContain("revenue-discovery");
    expect(ids).toContain("hub-drafts");
  });

  it("begruendet, wo Automatik NICHT sinnvoll ist", () => {
    const priceTuning = AUTOPILOTS.find((entry) => entry.id === "price-tuning");
    expect(priceTuning?.status).toBe("not-useful");
    expect(priceTuning?.rationale).toContain("Messvolumen");
  });

  it("fasst den naechsten sinnvollen Ausbau zusammen", () => {
    const overview = buildAutopilotOverview();
    expect(overview.summary.active).toBeGreaterThan(0);
    expect(overview.summary.recommended).toBeGreaterThan(0);
    expect(overview.nextSensibleStep.length).toBeGreaterThan(20);
  });
});
