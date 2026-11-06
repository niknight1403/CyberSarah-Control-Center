import { describe, expect, it } from "vitest";

import { MIN_PAID_FOR_MEASURED_FORECAST, STATIC_ASSUMPTIONS, forecast, projectNewCustomers } from "../lib/revenue-forecast-logic";
import { isBusinessDomain, prioritizeIntroLeads, scoreLeadPriority, outreachQueueFromLeads } from "../lib/b2b-lead-priority-logic";
import { outreachStatus } from "../server/outreach-worker-service";

const totals = { checkouts_started: 20, checkouts_completed: 5, intro_requests: 10, intro_calls_held: 4 };
const keineRaten = { checkoutToPaid: null, requestToCall: null, callToPaid: null };

describe("Prognose", () => {
  it("rechnet ohne Kaeufe mit offengelegten Annahmen", () => {
    const result = forecast({ totals, measured: keineRaten, paidCustomers: 0 });
    expect(result.basis).toBe("annahmen");
    expect(result.usedRateSource.checkoutToPaid).toBe("annahme");
    expect(result.notes.join(" ")).toContain("Annahmen");
  });

  it("stellt ab drei Kunden auf gemessene Raten um", () => {
    const measured = { checkoutToPaid: 0.5, requestToCall: 0.5, callToPaid: 0.5 };
    const vorher = forecast({ totals, measured, paidCustomers: 2 });
    expect(vorher.usedRateSource.checkoutToPaid).toBe("annahme");
    const nachher = forecast({ totals, measured, paidCustomers: MIN_PAID_FOR_MEASURED_FORECAST });
    expect(nachher.basis).toBe("gemessen");
    expect(nachher.usedRateSource.checkoutToPaid).toBe("gemessen");
    expect(nachher.scenarios[0].newCustomers).toBeGreaterThan(vorher.scenarios[0].newCustomers);
  });

  it("beschoenigt eine gemessene Null nicht", () => {
    const result = forecast({ totals, measured: { checkoutToPaid: 0, requestToCall: 0, callToPaid: 0 }, paidCustomers: 5 });
    expect(result.scenarios[0].newCustomers).toBe(0);
    expect(result.scenarios[0].mrrCents).toBe(0);
    expect(result.notes.join(" ")).toContain("Erst Funnel");
  });

  it("liefert drei Szenarien mit steigendem Umsatz", () => {
    const result = forecast({ totals, measured: keineRaten, paidCustomers: 0 });
    expect(result.scenarios.map((scenario) => scenario.months)).toEqual([1, 3, 6]);
    expect(result.scenarios[2].cumulativeRevenueCents).toBeGreaterThan(result.scenarios[0].cumulativeRevenueCents);
  });

  it("nennt ARPU und Kuendigungsquote offen", () => {
    const result = forecast({ totals, measured: keineRaten, paidCustomers: 0 });
    expect(result.notes.join(" ")).toContain(String(STATIC_ASSUMPTIONS.arpuCents / 100));
    expect(result.notes.join(" ")).toContain("Kuendigungsquote");
  });

  it("rechnet Anfragen und Checkouts getrennt", () => {
    const projection = projectNewCustomers({ totals, measured: keineRaten, paidCustomers: 0 });
    expect(projection.fromCheckouts).toBe(Math.floor(20 * STATIC_ASSUMPTIONS.checkoutToPaid));
    expect(projection.fromCalls).toBe(
      Math.floor(10 * STATIC_ASSUMPTIONS.requestToCall * STATIC_ASSUMPTIONS.callToPaid),
    );
  });
});

describe("B2B-Priorisierung", () => {
  it("erkennt Geschaeftsdomains und Freemail", () => {
    expect(isBusinessDomain("chef@musterbetrieb.de", null)).toBe(true);
    expect(isBusinessDomain("chef@gmail.com", null)).toBe(false);
    expect(isBusinessDomain(null, "kanzlei-partner.de")).toBe(true);
    expect(isBusinessDomain(null, null)).toBe(false);
  });

  it("bewertet einen Betrieb hoeher als eine Einzelperson", () => {
    const betrieb = scoreLeadPriority({
      company: "Musterbetrieb GmbH",
      email: "leitung@musterbetrieb.de",
      goal: "Wir wollen unsere Kampagne auf mehrere Standorte ausrollen",
      packageId: "business",
    });
    const einzelperson = scoreLeadPriority({ email: "hobby@gmx.de", goal: "mal ausprobieren" });
    expect(betrieb.priorityScore).toBeGreaterThan(einzelperson.priorityScore);
    expect(betrieb.band).toBe("hot");
    expect(einzelperson.band).toBe("kalt");
    expect(betrieb.expectedMonthlyCents).toBeGreaterThan(einzelperson.expectedMonthlyCents);
  });

  it("macht jedes Signal nachvollziehbar", () => {
    const result = scoreLeadPriority({ company: "Muster GmbH", email: "a@muster.de" });
    const ids = result.signals.map((signal) => signal.id);
    expect(ids).toContain("firmenprofil");
    expect(ids).toContain("geschaeftsdomain");
    expect(ids).toContain("betrieb-belegt");
    expect(result.reason).toContain("hot");
    expect(result.recommendedAction.length).toBeGreaterThan(10);
  });

  it("sortiert heisse Leads nach oben und vergibt Raenge", () => {
    const { leads, summary } = prioritizeIntroLeads([
      { id: "kalt", email: "privat@gmx.de", createdAt: "2026-11-05T10:00:00.000Z" },
      {
        id: "heiss",
        company: "Kanzlei Nord GmbH",
        email: "partner@kanzlei-nord.de",
        packageId: "business",
        createdAt: "2026-11-04T10:00:00.000Z",
      },
      { id: "warm", company: "Blumen Meier", email: "info@blumen-meier.de", createdAt: "2026-11-03T10:00:00.000Z" },
    ]);
    expect(leads[0].id).toBe("heiss");
    expect(leads[0].rank).toBe(1);
    expect(leads[2].id).toBe("kalt");
    expect(summary.total).toBe(3);
    expect(summary.hot).toBeGreaterThanOrEqual(1);
    expect(summary.expectedMonthlyCents).toBeGreaterThan(0);
    expect(summary.starterEquivalent).toBeGreaterThan(0);
  });

  it("stellt bei gleichem Score die neuere Anfrage nach vorn", () => {
    const { leads } = prioritizeIntroLeads([
      { id: "alt", email: "a@firma-a.de", company: "Firma A", createdAt: "2026-11-01T10:00:00.000Z" },
      { id: "neu", email: "b@firma-b.de", company: "Firma B", createdAt: "2026-11-05T10:00:00.000Z" },
    ]);
    expect(leads[0].id).toBe("neu");
  });

  it("laesst kalte Leads aus der Anruf-Warteschlange", () => {
    const queue = outreachQueueFromLeads([
      { id: "kalt", email: "privat@gmx.de" },
      { id: "betrieb", company: "Muster GmbH", email: "a@muster.de" },
      { id: "ohne-mail", company: "Ohne Mail GmbH" },
    ]);
    expect(queue.map((lead) => lead.id)).toEqual(["betrieb"]);
  });
});

describe("Outreach-Handbremse", () => {
  it("sendet nichts, solange niemand freischaltet", () => {
    const status = outreachStatus({});
    expect(status.mode).toBe("trockenlauf");
    expect(status.reasons.join(" ")).toContain("OUTREACH_LIVE");
  });

  it("sendet auch freigeschaltet nicht ohne Abmelde-Link", () => {
    const status = outreachStatus({ OUTREACH_LIVE: "1" });
    expect(status.mode).toBe("trockenlauf");
    expect(status.reasons.join(" ")).toContain("Abmelde-Link");
  });

  it("geht nur mit Freigabe und Abmeldemöglichkeit live", () => {
    const status = outreachStatus({
      OUTREACH_LIVE: "1",
      OUTREACH_UNSUBSCRIBE_BASE_URL: "https://app.cybersarah-ki.com/api/outreach/unsubscribe",
    });
    expect(status.mode).toBe("live");
    expect(status.reasons).toEqual([]);
    expect(status.dailyCap).toBeGreaterThan(0);
  });
});

describe("Abmeldung", () => {
  it("schliesst den Live-Versand ohne Abmelde-Ziel aus", () => {
    // Der Live-Modus verlangt genau dieses Ziel: /api/outreach/unsubscribe
    const ohneZiel = outreachStatus({ OUTREACH_LIVE: "1" });
    expect(ohneZiel.mode).toBe("trockenlauf");
    const mitZiel = outreachStatus({
      OUTREACH_LIVE: "1",
      OUTREACH_UNSUBSCRIBE_BASE_URL: "https://app.cybersarah-ki.com/api/outreach/unsubscribe",
    });
    expect(mitZiel.mode).toBe("live");
    expect(mitZiel.unsubscribeConfigured).toBe(true);
  });
});
