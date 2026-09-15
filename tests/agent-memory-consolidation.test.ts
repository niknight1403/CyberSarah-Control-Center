/**
 * Sprint 113 — Deterministische Tests der Memory-Konsolidierung (Sleep-Time):
 * Merge-Gruppen, Veraltung, Widersprueche, Gesamtplan, Zusammenfassung und
 * Retrieval-Qualitaetsmetriken — alles rein, ohne Datenbank.
 */
import { describe, expect, it } from "vitest";

import {
  aggregateRetrievalMetrics,
  areLearningsSimilar,
  buildConsolidationPlan,
  ConsolidationLearning,
  findContradictions,
  findMergeGroups,
  formatConsolidationSummary,
  isStaleLearning,
  keywordSimilarity,
  measureRetrievalHits,
  MERGE_SIMILARITY_THRESHOLD,
  STALE_AFTER_DAYS,
} from "../lib/agent-memory-consolidation-logic";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 15); // 15.09.2026 — fester Zeitpunkt

function learning(overrides: Partial<ConsolidationLearning> & { id: number }): ConsolidationLearning {
  return {
    kind: "interaktion",
    title: `Learning ${overrides.id}`,
    detail: "Beschreibung",
    keywords: "",
    createdAt: NOW - DAY_MS,
    ...overrides,
  };
}

describe("Sprint 113: Aehnlichkeit", () => {
  it("Jaccard-Overlap identischer Keywords ist 1, disjunkter 0", () => {
    expect(keywordSimilarity("stripe,webhook,billing", "stripe,webhook,billing")).toBe(1);
    expect(keywordSimilarity("stripe,webhook", "apk,gradle")).toBe(0);
    expect(keywordSimilarity("", "stripe")).toBe(0);
  });

  it("Teilmenge liefert einen echten Bruch", () => {
    // {a} vs {a,b,c} → 1/3
    expect(keywordSimilarity("alpha", "alpha,beta,gamma")).toBeCloseTo(1 / 3, 5);
  });

  it("areLearningsSimilar greift bei Keyword-Overlap und Titel-Aehnlichkeit", () => {
    const a = learning({ id: 1, keywords: "stripe,webhook,billing,payment" });
    const b = learning({ id: 2, keywords: "stripe,webhook,billing,invoice" });
    const c = learning({ id: 3, title: "Komplett anderes Thema (APK-Build)", keywords: "apk,gradle" });
    expect(areLearningsSimilar(a, b)).toBe(true);
    expect(areLearningsSimilar(a, c)).toBe(false);
  });

  it("fast gleiche Titel zaehlen als aehnlich, auch ohne Keywords", () => {
    const a = learning({ id: 1, title: "Stripe Webhook Fehler beheben" });
    const b = learning({ id: 2, title: "Stripe Webhook Fehler beheben — Teil 2" });
    const c = learning({ id: 3, title: "Neon Postgres Migration durchfuehren" });
    expect(areLearningsSimilar(a, b)).toBe(true);
    expect(areLearningsSimilar(a, c)).toBe(false);
  });
});

describe("Sprint 113: Merge-Gruppen", () => {
  it("Gruppen werden per Union-Find transitiv gebildet", () => {
    const learnings = [
      // Kette: 1–2 aehnlich (0.75), 2–3 aehnlich (0.6), 1–3 NICHT aehnlich (0.4)
      // → nur Union-Find zieht alle drei in eine Gruppe.
      learning({ id: 1, keywords: "stripe,webhook,billing" }),
      learning({ id: 2, keywords: "stripe,webhook,billing,retry" }),
      learning({ id: 3, keywords: "stripe,webhook,retry,jitter" }),
      learning({ id: 4, keywords: "apk,gradle,capacitor" }),
    ];
    const groups = findMergeGroups(learnings);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((entry) => entry.id).sort()).toEqual([1, 2, 3]);
  });

  it("Einzellearnings bilden keine Gruppe", () => {
    expect(findMergeGroups([learning({ id: 1 }), learning({ id: 2, keywords: "ganz,andere,welt" })])).toHaveLength(0);
  });

  it("hoeherer Schwellwert trennt schwache Paare", () => {
    const a = learning({ id: 1, keywords: "stripe,webhook,billing,payment" });
    const b = learning({ id: 2, keywords: "stripe,webhook,billing,invoice" });
    // Jaccard 3/5 = 0.6 → exakt am Standard-Schwellwert, darueber nicht mehr.
    expect(areLearningsSimilar(a, b, 0.61)).toBe(false);
    expect(areLearningsSimilar(a, b, MERGE_SIMILARITY_THRESHOLD)).toBe(true);
  });
});

describe("Sprint 113: Veraltung", () => {
  it("informationsloses, altes Interaktions-Learning ist Rauschen", () => {
    const stale = learning({ id: 1, createdAt: NOW - (STALE_AFTER_DAYS + 5) * DAY_MS, detail: "ok", keywords: "" });
    const reason = isStaleLearning(stale, NOW);
    expect(reason).toMatch(/veraltet/);
  });

  it("substanzielle alte Learnings bleiben stehen", () => {
    const rich = learning({ id: 1, kind: "interaktion", createdAt: NOW - 200 * DAY_MS, detail: "Ausfuehrliche Erfahrung mit Stripe-Webhooks und Retry-Strategie im produktiven Betrieb." , keywords: "stripe,webhook,retry" });
    expect(isStaleLearning(rich, NOW)).toBe(false);
  });

  it("Fehlerbehebungs- und Entscheidungswissen altert nie weg", () => {
    expect(isStaleLearning(learning({ id: 1, kind: "fehlerbehebung", createdAt: NOW - 300 * DAY_MS, detail: "ok" }), NOW)).toBe(false);
    expect(isStaleLearning(learning({ id: 2, kind: "entscheidung", createdAt: NOW - 300 * DAY_MS, detail: "ok" }), NOW)).toBe(false);
  });

  it("junge Learnings sind nie veraltet", () => {
    expect(isStaleLearning(learning({ id: 1, detail: "ok" }), NOW)).toBe(false);
  });
});

describe("Sprint 113: Widersprueche", () => {
  it("gleiches Thema mit gegenlaeufiger Polaritaet wird markiert", () => {
    const learnings = [
      learning({ id: 1, title: "Workspace Service Verbindung kaputt", detail: "Der Workspace Service ist down und blockiert alle Builds." }),
      learning({ id: 2, title: "Workspace Service Verbindung kaputt", detail: "Nach dem Deploy funktioniert die Verbindung wieder erfolgreich." }),
    ];
    const contradictions = findContradictions(learnings);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].newerId).toBe(2);
    expect(contradictions[0].olderId).toBe(1);
  });

  it("gleiche Polaritaet erzeugt keinen Widerspruch", () => {
    const learnings = [
      learning({ id: 1, title: "Workspace Service Verbindung kaputt", detail: "Der Workspace Service ist down." }),
      learning({ id: 2, title: "Workspace Service Verbindung kaputt", detail: "Der Workspace Service ist weiterhin down." }),
    ];
    expect(findContradictions(learnings)).toHaveLength(0);
  });

  it("verschiedene Themen erzeugen keinen Widerspruch", () => {
    const learnings = [
      learning({ id: 1, title: "Stripe Webhook kaputt", detail: "Webhooks schlagen fehl." }),
      learning({ id: 2, title: "Neon Postgres Migration erfolgreich", detail: "Migration funktioniert jetzt erfolgreich." }),
    ];
    expect(findContradictions(learnings)).toHaveLength(0);
  });
});

describe("Sprint 113: Gesamtplan", () => {
  it("leerer Bestand liefert einen leeren, wohlgeformten Plan", () => {
    const plan = buildConsolidationPlan([], { now: NOW });
    expect(plan.merges).toHaveLength(0);
    expect(plan.stats).toEqual({ input: 0, survivors: 0, mergedAway: 0, invalidated: 0, contradictionCount: 0, dedupRatePct: 0 });
  });

  it("Duplikate verschmelzen, Rauschen faellt weg, Rest bleibt", () => {
    const learnings = [
      // Drei Duplikate (aeltester bleibt Traeger)
      learning({ id: 1, createdAt: NOW - 10 * DAY_MS, title: "Stripe Webhook Retry Strategie", detail: "Exponential-Backoff bei Webhook-Fehlern etabliert.", keywords: "stripe,webhook,retry,backoff" }),
      learning({ id: 2, createdAt: NOW - 5 * DAY_MS, title: "Stripe Webhook Retry Strategie", detail: "Backoff bei Webhook-Fehlern bewaehrt sich.", keywords: "stripe,webhook,retry,timeout" }),
      learning({ id: 3, createdAt: NOW - 2 * DAY_MS, title: "Stripe Webhook Retry Strategie", detail: "Backoff laeuft stabil.", keywords: "stripe,webhook,retry,jitter" }),
      // Veraltetes Rauschen
      learning({ id: 4, createdAt: NOW - (STALE_AFTER_DAYS + 10) * DAY_MS, title: "Kurznotiz", detail: "ok", keywords: "" }),
      // Gesundes Einzel-Learning
      learning({ id: 5, title: "APK Build Pipeline bereit", detail: "Capacitor-Release-Build mit Signing laeuft produktiv.", keywords: "apk,capacitor,signing,release" }),
    ];
    const plan = buildConsolidationPlan(learnings, { now: NOW });
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].keepId).toBe(1);
    expect(plan.merges[0].mergedIds.sort()).toEqual([2, 3]);
    expect(plan.merges[0].mergedKeywords).toContain("stripe");
    expect(plan.invalidations.map((entry) => entry.id)).toEqual([4]);
    expect(plan.stats.input).toBe(5);
    expect(plan.stats.mergedAway).toBe(2);
    expect(plan.stats.invalidated).toBe(1);
    expect(plan.stats.survivors).toBe(2);
    expect(plan.survivors).toBe(2);
    expect(plan.stats.dedupRatePct).toBe(60);
  });

  it("schon wegfallende Learnings werden nicht doppelt invalidiert", () => {
    const learnings = [
      learning({ id: 1, createdAt: NOW - (STALE_AFTER_DAYS + 10) * DAY_MS, title: "Workspace Build Abhaengigkeit Notiz", detail: "ok", keywords: "" }),
      learning({ id: 2, createdAt: NOW - (STALE_AFTER_DAYS + 5) * DAY_MS, title: "Workspace Build Abhaengigkeit Notiz", detail: "ok", keywords: "" }),
    ];
    const plan = buildConsolidationPlan(learnings, { now: NOW });
    expect(plan.merges).toHaveLength(1); // Titel-Aehnlichkeit → ein Merge
    expect(plan.invalidations).toHaveLength(0); // kein Doppel-Abbau
    expect(plan.stats.mergedAway).toBe(1);
    expect(plan.stats.invalidated).toBe(0);
  });

  it("Zusammenfassung ist tokenfrei und informativ", () => {
    const summary = formatConsolidationSummary(buildConsolidationPlan([], { now: NOW }), "cron");
    expect(summary).toContain("Konsolidierung (cron)");
    expect(summary).toContain("0 Learnings");
  });
});

describe("Sprint 113: Retrieval-Metriken", () => {
  it("injizierte Keywords, die spaeter auftauchen, zaehlen als Treffer", () => {
    const injected = [["stripe", "webhook"], ["apk", "gradle"]];
    expect(measureRetrievalHits(injected, "Kannst du nochmal die Stripe-Webhook-Problematik ansehen?")).toBe(1);
    expect(measureRetrievalHits(injected, "Wie baut man die APK mit Gradle?")).toBe(1);
    expect(measureRetrievalHits(injected, "Etwas ganz anderes: Erzähl was über Neon.")).toBe(0);
  });

  it("Kurz-Keywords unter 3 Zeichen tragen nicht", () => {
    expect(measureRetrievalHits([["ci", "ok"]], "ci laeuft")).toBe(0);
  });

  it("Aggregation bildet Trefferquote und Durchschnitt korrekt", () => {
    const metrics = aggregateRetrievalMetrics([
      { injected: 3, hits: 2 },
      { injected: 2, hits: 0 },
      { injected: 1, hits: 1 },
      { injected: 0, hits: 0 },
    ]);
    expect(metrics.samples).toBe(4);
    expect(metrics.hitRatePct).toBe(50); // 2 von 4 Turn-Stichproben mit Treffer
    expect(metrics.avgInjections).toBe(1.5);
  });

  it("leere Stichprobe liefert Nullmetriken", () => {
    expect(aggregateRetrievalMetrics([])).toEqual({ samples: 0, hitRatePct: 0, avgInjections: 0 });
  });
});
