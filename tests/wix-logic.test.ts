/**
 * Sprint 187 — Wix-API: deterministische Tests der reinen Logik —
 * Header-Aufbau, Fehlerklassifikation (alle Live-Fehler aus 2026-09-19),
 * Normalisierung, Status-Snapshot, Maskierung. Kein Netz, keine Env.
 */
import { describe, expect, it } from "vitest";

import {
  buildWixRequestHeaders,
  buildWixStatusSnapshot,
  classifyWixFailure,
  isWixUuidFormat,
  maskWixToken,
  normalizeWixOrders,
  normalizeWixSiteProperties,
  normalizeWixSites,
} from "../lib/wix-logic";

const ACCOUNT_ID = "ae403255-f2e1-48b9-91ab-36840f6609fa";
const SITE_ID = "84e957e4-079c-412d-bf5a-816aa2f0722d";

describe("Sprint 187: Header-Aufbau", () => {
  it("Account-Level: nur Authorization + Accept + Content-Type (kein wix-site-id)", () => {
    const headers = buildWixRequestHeaders({ token: " ABC " });
    expect(headers.Authorization).toBe("ABC");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["wix-site-id"]).toBeUndefined();
  });

  it("Site-Level: wix-site-id gesetzt, Token getrimmt", () => {
    const headers = buildWixRequestHeaders({ token: "T", siteId: ` ${SITE_ID} ` });
    expect(headers["wix-site-id"]).toBe(SITE_ID);
  });

  it("json=false lässt Content-Type weg (GET)", () => {
    const headers = buildWixRequestHeaders({ token: "T", json: false });
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

describe("Sprint 187: Fehlerklassifikation (Live-Fehler 2026-09-19)", () => {
  it("HTML-403 (Bot-Schutz ohne Accept) wird als html_blocked erkannt", () => {
    const failure = classifyWixFailure(403, "text/html", "<html><head>403</head>");
    expect(failure.kind).toBe("html_blocked");
    expect(failure.hint).toContain("Accept");
  });

  it("READ_ORDER_FORBIDDEN wird als scope_missing mit Scope-Hinweis erkannt", () => {
    const body = JSON.stringify({
      message: "read order: permission denied",
      details: { applicationError: { code: "READ_ORDER_FORBIDDEN" } },
    });
    const failure = classifyWixFailure(403, "application/json", body);
    expect(failure.kind).toBe("scope_missing");
    expect(failure.errorCode).toBe("READ_ORDER_FORBIDDEN");
    expect(failure.hint).toContain("Orders → Read");
  });

  it("META_SITE_NOT_FOUND (404) verweist auf falsches Konto", () => {
    const body = JSON.stringify({
      message: `meta-site ${SITE_ID} not found`,
      details: { applicationError: { code: "Not Found", description: "meta-site … not found" } },
    });
    const failure = classifyWixFailure(404, "application/json", body);
    expect(failure.kind).toBe("meta_site_not_found");
    expect(failure.hint).toContain("Konto");
  });

  it("META_SITE_NOT_FOUND (401) wird genauso erkannt — Kode schlägt HTTP-Status", () => {
    const body = JSON.stringify({
      message: "MetaSiteId was not found on request",
      details: { applicationError: { code: "META_SITE_NOT_FOUND" } },
    });
    const failure = classifyWixFailure(401, "application/json", body);
    expect(failure.kind).toBe("meta_site_not_found");
  });

  it("Controller-not-found (v1 statt v4) wird als endpoint_not_found erkannt", () => {
    const body = JSON.stringify({
      errorCode: -404,
      errorDescription:
        "[business][RECOVERABLE][Dispatcher] Controller mapped to /site-properties-service/v1/properties was not found",
      success: false,
    });
    const failure = classifyWixFailure(404, "application/json", body);
    expect(failure.kind).toBe("endpoint_not_found");
  });

  it("5xx wird als server_error klassifiziert", () => {
    expect(classifyWixFailure(500, "application/json", "{}").kind).toBe("server_error");
  });

  it("429 wird als rate_limited klassifiziert", () => {
    expect(classifyWixFailure(429, "application/json", "{}").kind).toBe("rate_limited");
  });
});

describe("Sprint 187: Normalisierung", () => {
  it("Site-Liste wird normalisiert, leere/ungültige Koerper liefern []", () => {
    const body = {
      sites: [
        {
          id: SITE_ID,
          name: "cybersarah",
          displayName: "CyberSarah",
          domain: "cybersarah.com",
          published: true,
          createdDate: "2026-01-02T03:04:05Z",
          updatedDate: "2026-02-03T04:05:06Z",
        },
      ],
      metadata: { count: 1, hasNext: false },
    };
    const sites = normalizeWixSites(body);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toEqual({
      id: SITE_ID,
      name: "cybersarah",
      displayName: "CyberSarah",
      domain: "cybersarah.com",
      published: true,
      createdDate: "2026-01-02T03:04:05Z",
      updatedDate: "2026-02-03T04:05:06Z",
    });
    expect(normalizeWixSites({ sites: [] })).toEqual([]);
    expect(normalizeWixSites(null)).toEqual([]);
  });

  it("Orders werden normalisiert (Nummer, Status, Summe, E-Mail)", () => {
    const body = {
      orders: [
        {
          id: "ord-1",
          number: 1042,
          createdDate: "2026-09-01T10:00:00Z",
          status: "PAID",
          buyerInfo: { email: "kunde@example.com" },
          priceSummary: { total: { amount: 49.9, currencyCode: "EUR" } },
        },
      ],
      metadata: { hasNext: false },
    };
    const { orders, hasNext } = normalizeWixOrders(body);
    expect(hasNext).toBe(false);
    expect(orders[0]).toEqual({
      id: "ord-1",
      number: 1042,
      createdDate: "2026-09-01T10:00:00Z",
      status: "PAID",
      buyerEmail: "kunde@example.com",
      currency: "EUR",
      totalAmount: 49.9,
    });
  });

  it("Site-Properties werden defensiv normalisiert", () => {
    const body = {
      properties: {
        profile: { businessName: "CyberSarah UG", siteName: "CyberSarah" },
        language: "de",
        currencies: { currency: "EUR", timeZone: "Europe/Berlin" },
        businessContact: { emails: ["info@cybersarah.com"], phones: ["+49…"] },
      },
    };
    const props = normalizeWixSiteProperties(body);
    expect(props.businessName).toBe("CyberSarah UG");
    expect(props.currency).toBe("EUR");
    expect(props.timeZone).toBe("Europe/Berlin");
    expect(props.email).toBe("info@cybersarah.com");
    expect(normalizeWixSiteProperties({}).businessName).toBeNull();
  });
});

describe("Sprint 187: Status-Snapshot (ehrliche Zustaende)", () => {
  it("ohne Token: not_configured", () => {
    const snap = buildWixStatusSnapshot({ token: null, accountId: ACCOUNT_ID, siteId: SITE_ID });
    expect(snap.state).toBe("not_configured");
    expect(snap.tokenMasked).toBeNull();
    expect(snap.tokenSource).toBe("none");
    expect(snap.nextStep).toContain("WIX_API_TOKEN");
  });

  it("mit Token, ohne Site-ID: site_id_missing mit Dashboard-Hinweis", () => {
    const token = "eyJhbGciOiJSUzI1NiJ9.payload.sig";
    const snap = buildWixStatusSnapshot({ token, accountId: ACCOUNT_ID, siteId: null });
    expect(snap.state).toBe("site_id_missing");
    expect(snap.nextStep).toContain("Dashboard-URL");
    expect(snap.tokenMasked).toContain("…");
  });

  it("ungültige Site-ID: site_id_invalid", () => {
    const snap = buildWixStatusSnapshot({
      token: "verylongtokenvalue123",
      accountId: ACCOUNT_ID,
      siteId: "not-a-uuid",
    });
    expect(snap.state).toBe("site_id_invalid");
  });

  it("alles gesetzt: ready", () => {
    const snap = buildWixStatusSnapshot({
      token: "verylongtokenvalue123",
      accountId: ACCOUNT_ID,
      siteId: SITE_ID,
    });
    expect(snap.state).toBe("ready");
    expect(snap.siteId).toBe(SITE_ID);
    expect(snap.tokenSource).toBe("env");

    const fromStore = buildWixStatusSnapshot({
      token: "verylongtokenvalue123",
      accountId: ACCOUNT_ID,
      siteId: SITE_ID,
      tokenSource: "admin_store",
    });
    expect(fromStore.tokenSource).toBe("admin_store");
  });
});

describe("Sprint 187: Maskierung + UUID-Prüfung", () => {
  it("Token wird maskiert, Klartext taucht nie auf", () => {
    const token = "eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjoiIn0.sig";
    const masked = maskWixToken(token);
    expect(masked).not.toContain(token.slice(6, -7));
    expect(maskWixToken("short")).toBe("***");
  });

  it("Site-/Account-IDs werden als UUID geprüft", () => {
    expect(isWixUuidFormat(SITE_ID)).toBe(true);
    expect(isWixUuidFormat(ACCOUNT_ID)).toBe(true);
    expect(isWixUuidFormat("84e957e4079c412dbf5a816aa2f0722d")).toBe(false);
    expect(isWixUuidFormat("")).toBe(false);
  });
});
