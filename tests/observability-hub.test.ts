import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  defaultObservabilityDeps,
  registerObservabilityHub,
  type ObservabilityDeps,
} from "../server/observability-hub";

/**
 * Abdeckung des Observability-Hubs.
 *
 * Der Hub ist der einzige Ort, an dem Umsatz-, Funnel- und Conversion-Daten
 * das System als JSON (Summary) und als Prometheus-Text (Metrics) verlassen.
 * Zwei Eigenschaften sind hier fachlich kritisch und werden deshalb explizit
 * geprueft:
 *
 * 1. Zugriffsschutz: ohne konfigurierten METRICS_TOKEN darf gar nichts
 *    herausgehen (503), mit Token nur bei exakter Uebereinstimmung (401 sonst).
 *    Ein Fehler hier wuerde Umsatzzahlen oeffentlich machen.
 * 2. Ausfallverhalten: Datenbank weg oder Query kaputt darf keinen 500er mit
 *    Stacktrace liefern, sondern ein definiertes 503 mit klarem Fehlercode.
 *
 * Kein supertest, kein Socket: die registrierten Handler werden direkt
 * aufgerufen. Die Datenbank kommt ueber den Deps-Seam, weil die Suite mit
 * isolate:false laeuft und vi.mock in Nachbardateien lecken wuerde.
 */

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

type Layer = {
  route?: { path: string; stack: { handle: Handler }[] };
};

type FakeRes = {
  locals: Record<string, unknown>;
  statusCode: number;
  payload: unknown;
  headers: Record<string, string>;
  contentType: string | null;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
  send(body: unknown): FakeRes;
  setHeader(name: string, value: string): FakeRes;
  type(value: string): FakeRes;
};

function makeRes(): FakeRes {
  const res: FakeRes = {
    locals: {},
    statusCode: 200,
    payload: undefined,
    headers: {},
    contentType: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.payload = body;
      return res;
    },
    send(body: unknown) {
      res.payload = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    type(value: string) {
      res.contentType = value;
      return res;
    },
  };
  return res;
}

function makeApp(deps: ObservabilityDeps) {
  const app = express();
  registerObservabilityHub(app as never, deps);
  const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack;
  return stack.filter((layer) => layer.route);
}

function makeReq(init: { authorization?: string; host?: string } = {}) {
  return {
    protocol: "https",
    get: (name: string) => {
      if (name.toLowerCase() === "host") return init.host ?? "control.example.com";
      return undefined;
    },
    header: (name: string) => {
      if (name.toLowerCase() === "authorization") return init.authorization;
      return undefined;
    },
  };
}

/** Ruft die Handler einer Route der Reihe nach auf, bis einer antwortet. */
async function callRoute(
  layers: Layer[],
  path: string,
  req: unknown,
): Promise<FakeRes> {
  const route = layers.find((layer) => layer.route?.path === path)?.route;
  if (!route) throw new Error(`Route ${path} nicht registriert`);
  const res = makeRes();
  for (const layer of route.stack) {
    let advanced = false;
    await layer.handle(req as Request, res as unknown as Response, () => {
      advanced = true;
    });
    if (!advanced) break;
  }
  return res;
}

function rowsResult(rows: Array<Record<string, unknown>>) {
  return { rows };
}

const TOKEN = "s3cret-metrics-token";

const originalToken = process.env.METRICS_TOKEN;

beforeEach(() => {
  process.env.METRICS_TOKEN = TOKEN;
});

afterEach(() => {
  // Suite laeuft mit isolate:false - Env-Zustand darf nicht in Nachbardateien lecken.
  if (originalToken === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = originalToken;
  vi.restoreAllMocks();
});

describe("registerObservabilityHub", () => {
  it("registriert Summary, Metrics und Autopilot-Vorschlaege", () => {
    const paths = makeApp({ getDb: vi.fn(async () => null) as never }).map(
      (layer) => layer.route!.path,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/observability/summary",
        "/api/observability/metrics",
        "/api/observability/autopilot/proposals",
      ]),
    );
    expect(paths).toHaveLength(3);
  });

  it("nutzt produktiv die echte Datenbank, wenn keine Deps uebergeben werden", () => {
    expect(typeof defaultObservabilityDeps.getDb).toBe("function");
  });
});

describe("Zugriffsschutz", () => {
  const routes = [
    "/api/observability/summary",
    "/api/observability/metrics",
    "/api/observability/autopilot/proposals",
  ] as const;

  it.each(routes)(
    "%s antwortet ohne konfigurierten METRICS_TOKEN mit 503 statt Daten",
    async (path) => {
      delete process.env.METRICS_TOKEN;
      const getDb = vi.fn(async () => null);
      const res = await callRoute(makeApp({ getDb } as never), path, makeReq());
      expect(res.statusCode).toBe(503);
      expect(res.payload).toMatchObject({ error: "metrics_token_not_configured" });
      expect(getDb).not.toHaveBeenCalled();
    },
  );

  it.each(routes)("%s weist einen Aufruf ohne Token mit 401 ab", async (path) => {
    const getDb = vi.fn(async () => null);
    const res = await callRoute(makeApp({ getDb } as never), path, makeReq());
    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({ error: "metrics_auth_required" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each(routes)("%s weist ein falsches Token mit 401 ab", async (path) => {
    const getDb = vi.fn(async () => null);
    const res = await callRoute(
      makeApp({ getDb } as never),
      path,
      makeReq({ authorization: "Bearer falsch" }),
    );
    expect(res.statusCode).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("weist ein Token gleicher Laenge aber anderen Inhalts ab", async () => {
    const gleichLang = "x".repeat(TOKEN.length);
    const getDb = vi.fn(async () => null);
    const res = await callRoute(
      makeApp({ getDb } as never),
      "/api/observability/summary",
      makeReq({ authorization: gleichLang }),
    );
    expect(res.statusCode).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("akzeptiert das Token auch ohne Bearer-Praefix", async () => {
    const db = { execute: vi.fn(async () => rowsResult([])) };
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/summary",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(200);
  });
});

describe("/api/observability/summary", () => {
  function dbWith(sequence: Array<unknown>) {
    const execute = vi.fn();
    sequence.forEach((value) => execute.mockResolvedValueOnce(value));
    return { execute };
  }

  it("aggregiert Tagesumsatz, Funnel- und Conversion-Daten", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const db = dbWith([
      rowsResult([
        { day: today, clicks: 5, conversions: 1, revenueCents: 499 },
        { day: "2026-11-20", clicks: 9, conversions: 2, revenueCents: 1000 },
      ]),
      rowsResult([{ status: "active", campaigns: 3, views: 100, clicks: 12 }]),
      rowsResult([{ currency: "eur", eventType: "sale", events: 2, amountCents: 499, commissionCents: 50 }]),
    ]);
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/summary",
      makeReq({ authorization: `Bearer ${TOKEN}` }),
    );

    expect(res.statusCode).toBe(200);
    const body = res.payload as Record<string, any>;
    expect(body.source).toBe("cybersarah_primary_database");
    expect(body.revenue.todayCents).toBe(499);
    // Tagesreihe kommt absteigend aus der Query und wird fuer die Anzeige gedreht.
    expect(body.revenue.daily.map((row: { day: string }) => row.day)).toEqual([
      "2026-11-20",
      today,
    ]);
    expect(body.revenue.last30Days).toHaveLength(1);
    expect(body.funnels).toHaveLength(1);
    expect(body.privacy).toEqual({
      customerEmailsIncluded: false,
      rawWebhookPayloadsIncluded: false,
    });
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("meldet 0 Tagesumsatz, wenn fuer heute keine Zeile existiert", async () => {
    const db = dbWith([rowsResult([]), rowsResult([]), rowsResult([])]);
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/summary",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(200);
    expect((res.payload as Record<string, any>).revenue.todayCents).toBe(0);
  });

  it("antwortet mit 503, wenn keine Datenbank verbunden ist", async () => {
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => null) as never }),
      "/api/observability/summary",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({ error: "database_unavailable" });
  });

  it("faengt Query-Fehler ab und meldet einen definierten Fehlercode", async () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { execute: vi.fn(async () => { throw new Error("relation missing"); }) };
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/summary",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({ error: "observability_query_failed" });
    expect(fehler).toHaveBeenCalled();
  });
});

describe("/api/observability/metrics", () => {
  it("liefert Prometheus-Text mit Umsatz- und Funnel-Werten", async () => {
    const db = {
      execute: vi.fn(async () =>
        rowsResult([
          { revenue_cents: "12345", funnel_clicks: 42, funnel_conversions: 7 },
        ]),
      ),
    };
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/metrics",
      makeReq({ authorization: TOKEN }),
    );

    expect(res.statusCode).toBe(200);
    expect(res.contentType).toContain("text/plain");
    const text = String(res.payload);
    expect(text).toContain("cybersarah_process_uptime_seconds");
    expect(text).toContain("cybersarah_process_resident_memory_bytes");
    expect(text).toContain("cybersarah_revenue_30d_cents 12345");
    expect(text).toContain("cybersarah_funnel_clicks_30d 42");
    expect(text).toContain("cybersarah_funnel_conversions_30d 7");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("meldet 0-Werte, wenn die Query keine Zeile liefert", async () => {
    const db = { execute: vi.fn(async () => rowsResult([])) };
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/metrics",
      makeReq({ authorization: TOKEN }),
    );
    const text = String(res.payload);
    expect(text).toContain("cybersarah_revenue_30d_cents 0");
    expect(text).toContain("cybersarah_funnel_clicks_30d 0");
  });

  it("antwortet als Text mit 503, wenn keine Datenbank verbunden ist", async () => {
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => null) as never }),
      "/api/observability/metrics",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toBe("database_unavailable\n");
  });

  it("antwortet als Text mit 503, wenn die Query scheitert", async () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { execute: vi.fn(async () => { throw new Error("timeout"); }) };
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/metrics",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toBe("metrics_query_failed\n");
    expect(fehler).toHaveBeenCalled();
  });
});

describe("/api/observability/autopilot/proposals", () => {
  it("liefert Wachstumsvorschlaege im Modus 'nur Vorschlag'", async () => {
    const db = {
      execute: vi.fn(async () =>
        rowsResult([
          { kind: "growth_seo", status: "pending", payload: { title: "Blogpost" }, updated_at: "2026-11-21T02:00:00Z" },
        ]),
      ),
    };
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/autopilot/proposals",
      makeReq({ authorization: TOKEN }),
    );

    expect(res.statusCode).toBe(200);
    const body = res.payload as Record<string, any>;
    expect(body.mode).toBe("proposal-only");
    expect(body.approvalRequired).toBe(true);
    expect(body.proposals).toHaveLength(1);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("antwortet mit 503, wenn keine Datenbank verbunden ist", async () => {
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => null) as never }),
      "/api/observability/autopilot/proposals",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({ error: "database_unavailable" });
  });

  it("faengt Query-Fehler ab", async () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { execute: vi.fn(async () => { throw new Error("boom"); }) };
    const res = await callRoute(
      makeApp({ getDb: vi.fn(async () => db) as never }),
      "/api/observability/autopilot/proposals",
      makeReq({ authorization: TOKEN }),
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({ error: "autopilot_proposals_unavailable" });
    expect(fehler).toHaveBeenCalled();
  });
});
