import { describe, expect, it } from "vitest";

import {
  CONNECTOR_CATALOG,
  buildHubspotSyncPlan,
  buildLeadScrapePlan,
  buildMeteredUsageEvent,
  buildOutreachDispatchPlan,
  evaluateConnectorReadiness,
  summarizeConnectorReadiness,
} from "@/lib/revenue-connectors-logic";

const ENV = {
  HUBSPOT_PRIVATE_APP_TOKEN: "pat-eu1-1234567890abcdef",
  FIRECRAWL_API_KEY: "fc-1234567890abcdef",
  RESEND_API_KEY: "re_1234567890abcdef",
  OUTREACH_FROM_ADDRESS: "team@example.com",
  STRIPE_SECRET_KEY: "sk_test_1234567890",
  STRIPE_METER_EVENT_NAME: "api_call",
};

describe("Connector-Katalog", () => {
  it("enthaelt die fuenf benoetigten Konnektoren", () => {
    expect(CONNECTOR_CATALOG.map((item) => item.key)).toEqual(["hubspot", "firecrawl", "outreach", "stripe_metered", "apollo"]);
  });

  it("meldet fehlende Zugangsdaten einzeln", () => {
    const hubspot = evaluateConnectorReadiness("hubspot", {});
    expect(hubspot.configured).toBe(false);
    expect(hubspot.missingEnv).toEqual(["HUBSPOT_PRIVATE_APP_TOKEN"]);
  });

  it("zaehlt bereite Konnektoren korrekt", () => {
    const summary = summarizeConnectorReadiness(ENV);
    expect(summary.total).toBe(5);
    expect(summary.ready).toBe(4);
  });
});

describe("HubSpot-Synchronisation", () => {
  it("blockiert ohne Zugangsdaten", () => {
    const plan = buildHubspotSyncPlan({ contacts: 10, deals: 5 }, {});
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toBe("hubspot-not-configured");
    expect(plan.batches).toEqual([]);
  });

  it("teilt grosse Synchronisationen in 100er-Batches", () => {
    const plan = buildHubspotSyncPlan({ contacts: 250, deals: 0 }, ENV);
    expect(plan.allowed).toBe(true);
    expect(plan.batches).toEqual([
      { object: "contacts", limit: 100, cursor: 0 },
      { object: "contacts", limit: 100, cursor: 100 },
      { object: "contacts", limit: 50, cursor: 200 },
    ]);
  });

  it("begrenzt unplausible Mengen", () => {
    const plan = buildHubspotSyncPlan({ contacts: 99_999, deals: 0 }, ENV);
    const total = plan.batches.reduce((sum, batch) => sum + batch.limit, 0);
    expect(total).toBe(10_000);
  });
});

describe("Scraping-Schutz", () => {
  it("erlaubt nur oeffentliche HTTPS-Adressen", () => {
    expect(buildLeadScrapePlan("https://example.com/team", ENV).allowed).toBe(true);
    expect(buildLeadScrapePlan("http://example.com", ENV).reason).toBe("nur-https");
  });

  it("blockiert interne Adressen", () => {
    for (const url of ["https://localhost/admin", "https://127.0.0.1:3000", "https://192.168.1.5", "https://10.0.0.2/x"]) {
      expect(buildLeadScrapePlan(url, ENV).reason).toBe("interne-adresse");
    }
  });

  it("verlangt immer eine menschliche Pruefung", () => {
    expect(buildLeadScrapePlan("https://example.com", ENV).requiresHumanReview).toBe(true);
  });
});

describe("Outreach-Planung", () => {
  it("versendet nichts ohne Einwilligung", () => {
    const plan = buildOutreachDispatchPlan(
      [{ email: "a@example.com", companyDomain: "example.com", consentGiven: false }],
      ENV,
    );
    expect(plan.queued).toHaveLength(0);
    expect(plan.rejected[0].reason).toBe("keine-einwilligung");
  });

  it("filtert gesperrte und Wegwerf-Adressen", () => {
    const plan = buildOutreachDispatchPlan(
      [
        { email: "a@example.com", companyDomain: "example.com", consentGiven: true },
        { email: "b@example.com", companyDomain: "example.com", consentGiven: true, suppressed: true },
        { email: "c@mailinator.com", companyDomain: "mailinator.com", consentGiven: true },
      ],
      ENV,
    );
    expect(plan.queued.map((item) => item.email)).toEqual(["a@example.com"]);
    expect(plan.rejected.map((item) => item.reason)).toEqual(["gesperrt", "wegwerf-domain"]);
  });

  it("blockiert den Versand ohne konfiguriertes Gateway", () => {
    const plan = buildOutreachDispatchPlan(
      [{ email: "a@example.com", companyDomain: "example.com", consentGiven: true }],
      {},
    );
    expect(plan.queued).toHaveLength(0);
    expect(plan.rejected[0].reason).toBe("outreach-not-configured");
  });
});

describe("Stripe-Metering", () => {
  it("erzeugt ein idempotentes Ereignis", () => {
    const first = buildMeteredUsageEvent({ customerId: "cus_ABC123", meterEventName: "api_call", quantity: 5, idempotencySeed: "seed-1" }, ENV);
    const second = buildMeteredUsageEvent({ customerId: "cus_ABC123", meterEventName: "api_call", quantity: 5, idempotencySeed: "seed-1" }, ENV);
    expect(first.valid).toBe(true);
    expect(first.event?.identifier).toBe(second.event?.identifier);
  });

  it("lehnt ungueltige Kunden und Mengen ab", () => {
    expect(buildMeteredUsageEvent({ customerId: "kunde-1", quantity: 1 }, ENV).reason).toBe("ungueltige-kunden-id");
    expect(buildMeteredUsageEvent({ customerId: "cus_ABC123", quantity: 0 }, ENV).reason).toBe("ungueltige-menge");
  });

  it("meldet fehlende Stripe-Konfiguration", () => {
    expect(buildMeteredUsageEvent({ customerId: "cus_ABC123", quantity: 1 }, {}).reason).toBe("stripe-not-configured");
  });
});
