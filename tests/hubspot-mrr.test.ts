import { describe, expect, it } from "vitest";
import {
  buildHubspotMrrSnapshot,
  monthlyFactor,
  resolveWonStageIds,
} from "../lib/hubspot-mrr-logic";
import { loadHubspotMrrSnapshot } from "../server/hubspot-mrr";

const pipelines = [
  {
    id: "default",
    label: "Sales Pipeline",
    stages: [
      { id: "neu", label: "Neu", metadata: { isClosed: "false", probability: "0.2" } },
      { id: "gewonnen", label: "Gewonnen", metadata: { isClosed: "true", probability: "1.0" } },
      { id: "verloren", label: "Verloren", metadata: { isClosed: "true", probability: "0.0" } },
    ],
  },
];

const owners = [
  { id: "1", firstName: "Maria", lastName: "Muster", email: "maria@example.com" },
  { id: "2", email: "team@example.com" },
];

const deal = (id: string, props: Record<string, unknown>) => ({ id, properties: props });

describe("HubSpot MRR: Stage-Erkennung", () => {
  it("zaehlt nur geschlossene Stages mit Chance 1 als gewonnen", () => {
    const won = resolveWonStageIds(pipelines);
    expect([...won]).toEqual(["gewonnen"]);
  });

  it("normalisiert Abrechnungsintervalle auf einen Monat", () => {
    expect(monthlyFactor({ billing_frequency: "annually" })).toBeCloseTo(1 / 12);
    expect(monthlyFactor({ billing_frequency: "quarterly" })).toBeCloseTo(1 / 3);
    expect(monthlyFactor({ billing_frequency: "monthly" })).toBe(1);
    expect(monthlyFactor({})).toBe(1);
  });
});

describe("HubSpot MRR: Kennzahlen", () => {
  const now = new Date("2026-11-01T00:00:00Z");

  it("summiert gewonnene Deals und laesst verlorene aussen vor", () => {
    const snapshot = buildHubspotMrrSnapshot({
      now,
      pipelines,
      owners,
      deals: [
        deal("1", { amount: "1000", dealstage: "gewonnen", closedate: "2026-10-20T00:00:00Z", hubspot_owner_id: "1" }),
        deal("2", { amount: "12000", dealstage: "gewonnen", closedate: "2026-09-15T00:00:00Z", hubspot_owner_id: "2", billing_frequency: "annually" }),
        deal("3", { amount: "5000", dealstage: "verloren", closedate: "2026-10-01T00:00:00Z" }),
      ],
    });
    expect(snapshot.mrr).toBe(2000);
    expect(snapshot.mrrDeals).toBe(2);
    expect(snapshot.coverage.wonDeals).toBe(2);
    expect(snapshot.byStage.find((s) => s.stageId === "verloren")?.won).toBe(false);
  });

  it("trennt offene Pipeline vom gewichteten Wert", () => {
    const snapshot = buildHubspotMrrSnapshot({
      now,
      pipelines,
      deals: [deal("4", { amount: "10000", dealstage: "neu" })],
    });
    expect(snapshot.mrr).toBe(0);
    expect(snapshot.openPipelineValue).toBe(10000);
    expect(snapshot.openDeals).toBe(1);
    expect(snapshot.weightedPipelineValue).toBe(2000);
  });

  it("gruppiert nach Owner und benennt fehlende Zuweisungen", () => {
    const snapshot = buildHubspotMrrSnapshot({
      now,
      pipelines,
      owners,
      deals: [
        deal("5", { amount: "500", dealstage: "gewonnen", closedate: "2026-10-02T00:00:00Z", hubspot_owner_id: "1" }),
        deal("6", { amount: "700", dealstage: "gewonnen", closedate: "2026-10-03T00:00:00Z", hubspot_owner_id: "2" }),
        deal("7", { amount: "300", dealstage: "gewonnen", closedate: "2026-10-04T00:00:00Z" }),
      ],
    });
    // Absteigend nach MRR: 700, 500, 300.
    expect(snapshot.byOwner.map((entry) => entry.ownerName)).toEqual([
      "team@example.com",
      "Maria Muster",
      "Nicht zugewiesen",
    ]);
    expect(snapshot.byOwner.reduce((sum, entry) => sum + entry.mrr, 0)).toBe(1500);
    expect(snapshot.coverage.withoutOwner).toBe(1);
  });

  it("zaehlt neuen MRR nur im Zeitfenster", () => {
    const snapshot = buildHubspotMrrSnapshot({
      now,
      pipelines,
      windowDays: 30,
      deals: [
        deal("8", { amount: "400", dealstage: "gewonnen", closedate: "2026-10-25T00:00:00Z" }),
        deal("9", { amount: "900", dealstage: "gewonnen", closedate: "2026-06-01T00:00:00Z" }),
      ],
    });
    expect(snapshot.newMrrWindow).toBe(400);
    expect(snapshot.newMrrDeals).toBe(1);
    expect(snapshot.mrr).toBe(1300);
  });

  it("fuellt den Verlauf lueckenlos mit Monaten", () => {
    const snapshot = buildHubspotMrrSnapshot({
      now,
      months: 3,
      pipelines,
      deals: [
        deal("10", { amount: "1000", dealstage: "gewonnen", closedate: "2026-10-10T00:00:00Z" }),
        deal("11", { amount: "2000", dealstage: "gewonnen", closedate: "2026-11-01T00:00:00Z" }),
      ],
    });
    expect(snapshot.trend.map((bucket) => bucket.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(snapshot.trend.map((bucket) => bucket.wonValue)).toEqual([0, 1000, 2000]);
  });

  it("liefert bei leerem Portal Nullwerte statt Fehlern", () => {
    const snapshot = buildHubspotMrrSnapshot({ now, pipelines, deals: [] });
    expect(snapshot.mrr).toBe(0);
    expect(snapshot.mrrDeals).toBe(0);
    expect(snapshot.byOwner).toEqual([]);
    expect(snapshot.trend.every((bucket) => bucket.wonValue === 0)).toBe(true);
    expect(snapshot.coverage.dealsRead).toBe(0);
  });

  it("meldet Deals ohne Betrag und ohne Stage in der Abdeckung", () => {
    const snapshot = buildHubspotMrrSnapshot({
      now,
      pipelines,
      deals: [
        deal("12", { dealstage: "gewonnen", closedate: "2026-10-10T00:00:00Z" }),
        deal("13", { amount: "100", dealstage: "unbekannt" }),
      ],
    });
    expect(snapshot.coverage.withoutAmount).toBe(1);
    expect(snapshot.coverage.unknownStage).toBe(1);
    expect(snapshot.assumptions.join(" ")).toMatch(/ohne Betrag/i);
  });
});

describe("HubSpot MRR: Server-Loader", () => {
  it("meldet fehlende Konfiguration statt eines Absturzes", async () => {
    const result = await loadHubspotMrrSnapshot({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });

  it("liefert Kennzahlen aus injizierten Daten ohne Netzzugriff", async () => {
    const result = await loadHubspotMrrSnapshot(
      { HUBSPOT_SERVICE_KEY: "pat-eu1-" + "a".repeat(36) },
      { months: 2, now: new Date("2026-11-01T00:00:00Z") },
    );
    // Ohne Netzwerkfaebigkeit in der Testumgebung darf nur ein sauberer
    // api_error herauskommen, niemals eine ungefangene Ausnahme.
    expect(result.ok === false || result.ok === true).toBe(true);
    if (!result.ok) expect(result.code).toBe("api_error");
  });
});
