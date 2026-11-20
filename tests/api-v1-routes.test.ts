import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { registerApiV1Routes, type ApiV1Deps } from "../server/api-v1-handlers";

/**
 * Verdrahtungstest der oeffentlichen v1-API.
 *
 * Der Handler-Vertrag ist in `api-v1-handlers.test.ts` abgedeckt. Hier geht es
 * um das, was dazwischen liegt und dort nicht sichtbar ist: Sind alle Routen
 * registriert, und greift die Reihenfolge Auth -> Guthaben-Vorpruefung ->
 * Lauf wirklich? Ein Fehler an dieser Stelle wuerde entweder unangemeldete
 * Aufrufe durchlassen oder Guthaben pruefen, bevor der Nutzer bekannt ist.
 *
 * Kein supertest, kein Socket: die registrierten Handler werden direkt
 * nacheinander aufgerufen, wie Express es taete.
 */

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

type Layer = {
  route?: { path: string; stack: { handle: Handler }[] };
};

function makeDeps(overrides: Partial<ApiV1Deps> = {}) {
  return {
    authenticate: vi.fn(async () => ({ id: 1, openId: "o", role: "user" })),
    getDb: vi.fn(async () => null),
    invokeLLM: vi.fn(async () => ({
      model: "openai/gpt-4o-mini",
      choices: [{ message: { content: "Antwort" } }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    })),
    reserveCredits: vi.fn(async () => ({ ok: true, balanceTokens: 5_000, reason: null })),
    settleCredits: vi.fn(async () => 5_000),
    getUserTotalCredits: vi.fn(async () => 5_000),
    creditPacksForCheckout: () => [],
    recordAgentExecution: vi.fn(async () => true),
    readUsageAnalytics: vi.fn(async () => ({ available: true, summary: {} })),
    readEntitlements: vi.fn(async () => ({ available: true, view: { plan: "free" } })),
    ...overrides,
  } as unknown as ApiV1Deps;
}

function makeApp(deps: ApiV1Deps) {
  const app = express();
  app.use(express.json());
  registerApiV1Routes(app as never, deps);
  const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack;
  return stack.filter((layer) => layer.route);
}

function makeRes() {
  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.payload = body;
      return res;
    },
  };
  return res;
}

/** Ruft die Handler einer Route der Reihe nach auf, bis einer antwortet. */
async function callRoute(layers: Layer[], path: string, req: unknown) {
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

describe("registerApiV1Routes", () => {
  it("registriert alle oeffentlichen Routen", () => {
    const routes = makeApp(makeDeps()).map((layer) => layer.route!.path);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/healthz",
        "/api/v1/agent/run",
        "/api/v1/llm/cascade",
        "/api/v1/entitlements",
        "/api/v1/analytics/usage",
        "/api/v1/onboarding/seed",
        "/api/v1/agents",
      ]),
    );
  });

  it("weist einen Aufruf ohne Sitzung mit 401 ab, bevor Guthaben gelesen wird", async () => {
    const deps = makeDeps({ authenticate: vi.fn(async () => null) as unknown as ApiV1Deps["authenticate"] });
    const res = await callRoute(makeApp(deps), "/api/v1/agent/run", {
      protocol: "https",
      get: () => "control.example.com",
      body: { messages: [{ role: "user", content: "Hallo" }] },
    });
    expect(res.statusCode).toBe(401);
    expect(deps.getUserTotalCredits).not.toHaveBeenCalled();
    expect(deps.invokeLLM).not.toHaveBeenCalled();
  });

  it("antwortet bei leerem Guthaben mit 402 und startet den Lauf nicht", async () => {
    const deps = makeDeps({ getUserTotalCredits: vi.fn(async () => 0) as never });
    const res = await callRoute(makeApp(deps), "/api/v1/llm/cascade", {
      protocol: "https",
      get: () => "control.example.com",
      body: { prompt: "Hallo" },
    });
    expect(res.statusCode).toBe(402);
    expect(deps.reserveCredits).not.toHaveBeenCalled();
    expect(deps.invokeLLM).not.toHaveBeenCalled();
  });

  it("laesst einen zahlungsfaehigen Nutzer bis zum Modellaufruf durch", async () => {
    const deps = makeDeps();
    const res = await callRoute(makeApp(deps), "/api/v1/agent/run", {
      protocol: "https",
      get: () => "control.example.com",
      body: { messages: [{ role: "user", content: "Hallo" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.invokeLLM).toHaveBeenCalledTimes(1);
    expect(deps.recordAgentExecution).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "agent", status: "ok" }),
    );
  });

  it("prueft fuer Admins kein Guthaben, laesst sie aber durch", async () => {
    const deps = makeDeps({
      authenticate: vi.fn(async () => ({ id: 1, openId: "o", role: "admin" })) as unknown as ApiV1Deps["authenticate"],
      getUserTotalCredits: vi.fn(async () => 0) as never,
    });
    const res = await callRoute(makeApp(deps), "/api/v1/agent/run", {
      protocol: "https",
      get: () => "control.example.com",
      body: { messages: [{ role: "user", content: "Hallo" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.getUserTotalCredits).not.toHaveBeenCalled();
  });
});
