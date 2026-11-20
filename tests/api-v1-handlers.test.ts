import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  createApiV1Handlers,
  type ApiV1Deps,
  type ApiUser,
} from "../server/api-v1-handlers";
import { TEMPLATE_AGENTS } from "../lib/usage-metering-logic";

/**
 * Tests fuer die Handler der oeffentlichen v1-API (`server/api-v1-handlers.ts`).
 *
 * Hier fliegt Geld: ein Lauf reserviert Token, bucht nach, erstattet bei
 * Fehlern oder lehnt mit 402 ab. Die Suite lief bisher komplett an dieser Datei
 * vorbei (0 % Lines), weil Handler, SDK und Ledger fest verdrahtet waren.
 *
 * Geprueft wird deshalb das Vertragsverhalten, nicht die Implementierung:
 * welche Antwort der Client sieht, ob Guthaben bewegt wurde und ob ein
 * gescheiterter Lauf garantiert nichts kostet.
 */

const USER: ApiUser = { id: 7, openId: "open-user-1", role: "user", name: "Testnutzer" };

function makeRes(locals: Record<string, unknown> = {}) {
  const res = {
    locals: { ...locals } as Record<string, unknown>,
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

function makeReq(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    protocol: "https",
    get: (name: string) => (name.toLowerCase() === "host" ? "control.example.com" : undefined),
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

type FakeDeps = ApiV1Deps & {
  reserveCredits: ReturnType<typeof vi.fn>;
  settleCredits: ReturnType<typeof vi.fn>;
  invokeLLM: ReturnType<typeof vi.fn>;
  recordAgentExecution: ReturnType<typeof vi.fn>;
  getUserTotalCredits: ReturnType<typeof vi.fn>;
};

function deps(overrides: Partial<ApiV1Deps> = {}): FakeDeps {
  return {
    authenticate: vi.fn(async () => USER),
    getDb: vi.fn(async () => null) as unknown as ApiV1Deps["getDb"],
    invokeLLM: vi.fn(async () => ({
      model: "openai/gpt-4o-mini",
      choices: [{ message: { content: "Antwort" } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    })),
    reserveCredits: vi.fn(async () => ({ ok: true, balanceTokens: 5_000, reason: null })),
    settleCredits: vi.fn(async () => 5_000),
    getUserTotalCredits: vi.fn(async () => 5_000),
    creditPacksForCheckout: () => [
      { id: "credit_pack_small", label: "50.000 Cloud-Tokens", tokens: 50_000, priceEur: 4.99 },
    ],
    recordAgentExecution: vi.fn(async () => true),
    readUsageAnalytics: vi.fn(async () => ({
      available: true,
      summary: { totalRuns: 3 } as never,
    })) as unknown as ApiV1Deps["readUsageAnalytics"],
    readEntitlements: vi.fn(async () => ({
      available: true,
      view: { plan: "free" } as never,
    })) as unknown as ApiV1Deps["readEntitlements"],
    ...overrides,
  } as FakeDeps;
}

const originalBaseUrl = process.env.APP_BASE_URL;

beforeEach(() => {
  delete process.env.APP_BASE_URL;
});

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
});

describe("requireApiUser / attachApiUser", () => {
  it("antwortet ohne Nutzer mit 401 und ruft next nicht auf", async () => {
    const d = deps({ authenticate: vi.fn(async () => null as never) });
    const handlers = createApiV1Handlers(d);
    const res = makeRes();
    const next = vi.fn();

    await handlers.attachApiUser()(makeReq(), res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({ code: "unauthenticated" });
    expect(next).not.toHaveBeenCalled();
    expect(res.locals.user).toBeUndefined();
  });

  it("behandelt eine werfende Sitzungspruefung wie fehlende Anmeldung", async () => {
    const d = deps({
      authenticate: vi.fn(async () => {
        throw new Error("token kaputt");
      }),
    });
    const handlers = createApiV1Handlers(d);
    const res = makeRes();

    await handlers.attachApiUser()(makeReq(), res as unknown as Response, vi.fn());

    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({ code: "unauthenticated" });
  });

  it("legt den Nutzer in res.locals und ruft next auf", async () => {
    const handlers = createApiV1Handlers(deps());
    const res = makeRes();
    const next = vi.fn();

    await handlers.attachApiUser()(makeReq(), res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.user).toMatchObject({ openId: USER.openId });
    expect(res.statusCode).toBe(200);
  });

  it("weist einen Nutzer ohne openId ab, auch wenn die Pruefung ein Objekt liefert", async () => {
    const d = deps({ authenticate: vi.fn(async () => ({ id: 3 }) as never) });
    const handlers = createApiV1Handlers(d);
    const res = makeRes();

    await handlers.attachApiUser()(makeReq(), res as unknown as Response, vi.fn());

    expect(res.statusCode).toBe(401);
  });
});

describe("healthz", () => {
  it("antwortet ohne Datenbank mit 200 und ohne interne Details", () => {
    const handlers = createApiV1Handlers(deps());
    const res = makeRes();

    handlers.healthz(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ ok: true, service: "cybersarah-control-center" });
    expect(typeof payload.time).toBe("number");
    expect(JSON.stringify(payload)).not.toMatch(/token|secret|password/i);
  });
});

describe("runHandler — Eingabepruefung und Auth", () => {
  it("antwortet ohne Nutzer in res.locals mit 401 und ruft das Modell nicht", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes();

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo" } }), res as unknown as Response);

    expect(res.statusCode).toBe(401);
    expect(d.invokeLLM).not.toHaveBeenCalled();
    expect(d.reserveCredits).not.toHaveBeenCalled();
  });

  it("lehnt einen Auftrag ohne verwertbaren Text mit 400 ab, bevor Guthaben angefasst wird", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { messages: [] } }), res as unknown as Response);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ code: "invalid_request" });
    expect(d.reserveCredits).not.toHaveBeenCalled();
    expect(d.invokeLLM).not.toHaveBeenCalled();
    expect(d.recordAgentExecution).not.toHaveBeenCalled();
  });
});

describe("runHandler — kostenpflichtiger Lauf", () => {
  it("reserviert, bucht auf den Ist-Verbrauch ab und antwortet mit Nutzungsdaten", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(
      makeReq({ body: { messages: [{ role: "user", content: "baue mir ein dashboard" }], model: "gpt-4o-mini" } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      content: "Antwort",
      model: "openai/gpt-4o-mini",
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20, billed: true },
    });
    expect(d.reserveCredits).toHaveBeenCalledTimes(1);
    const reservation = d.reserveCredits.mock.calls[0][0];
    expect(reservation).toMatchObject({ openId: USER.openId, reason: "Agenten-Lauf" });
    expect(reservation.tokens).toBeGreaterThan(20);
    expect(d.settleCredits).toHaveBeenCalledWith(
      expect.objectContaining({ reservedTokens: reservation.tokens, actualTokens: 20 }),
    );
    expect(d.recordAgentExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok", surface: "agent", promptTokens: 12, completionTokens: 8 }),
    );
  });

  it("nutzt die LLM-Kaskade als eigenen Reservierungsgrund", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("llm")(makeReq({ body: { prompt: "hallo" } }), res as unknown as Response);

    expect(d.reserveCredits.mock.calls[0][0].reason).toBe("LLM-Kaskade");
    expect(d.recordAgentExecution).toHaveBeenCalledWith(expect.objectContaining({ surface: "llm" }));
  });

  it("antwortet bei zu wenig Guthaben mit 402 inklusive Handlungsoption und startet den Lauf nicht", async () => {
    const d = deps({
      reserveCredits: vi.fn(async () => ({ ok: false, balanceTokens: 3, reason: "insufficient" })),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo" } }), res as unknown as Response);

    expect(res.statusCode).toBe(402);
    const payload = res.payload as {
      code: string;
      reason: string;
      usage: { remainingTokens: number };
      options: { checkoutUrl: string; creditPacks: unknown[]; upgradePlan: string };
    };
    expect(payload.code).toBe("payment_required");
    expect(payload.reason).toContain("Guthaben reicht");
    expect(payload.usage.remainingTokens).toBe(3);
    expect(payload.options.checkoutUrl).toBe("https://control.example.com/api/billing/stripe/checkout");
    expect(payload.options.creditPacks).toHaveLength(1);
    expect(payload.options.upgradePlan).toBe("pro");
    expect(d.invokeLLM).not.toHaveBeenCalled();
    expect(d.settleCredits).not.toHaveBeenCalled();
    expect(d.recordAgentExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked", errorCode: "payment_required" }),
    );
  });

  it("liest den Kontostand nach, wenn die Reservierung keinen mitliefert", async () => {
    const d = deps({
      reserveCredits: vi.fn(async () => ({ ok: false, balanceTokens: null, reason: "unavailable" })),
      getUserTotalCredits: vi.fn(async () => 42),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo" } }), res as unknown as Response);

    expect(d.getUserTotalCredits).toHaveBeenCalledWith(USER.openId);
    expect(res.payload).toMatchObject({ reason: "Guthaben derzeit nicht prüfbar.", usage: { remainingTokens: 42 } });
  });

  it("faellt auf die eingebaute Paketliste zurueck, wenn der Ledger keine liefert", async () => {
    const d = deps({
      reserveCredits: vi.fn(async () => ({ ok: false, balanceTokens: 0, reason: "insufficient" })),
      creditPacksForCheckout: () => [],
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo" } }), res as unknown as Response);

    const payload = res.payload as { options: { creditPacks: { id: string; tokens: number }[] } };
    expect(payload.options.creditPacks.length).toBeGreaterThan(0);
    expect(payload.options.creditPacks[0]).toMatchObject({ id: expect.any(String), tokens: expect.any(Number) });
  });

  it("verwendet APP_BASE_URL fuer die Checkout-URL, wenn konfiguriert", async () => {
    process.env.APP_BASE_URL = "https://app.cybersarah-ki.com/";
    const d = deps({
      reserveCredits: vi.fn(async () => ({ ok: false, balanceTokens: 0, reason: "insufficient" })),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo" } }), res as unknown as Response);

    expect(res.payload).toMatchObject({
      options: { checkoutUrl: "https://app.cybersarah-ki.com/api/billing/stripe/checkout" },
    });
  });
});

describe("runHandler — kostenfreie und privilegierte Laeufe", () => {
  it("reserviert fuer einen lokalen Ollama-Lauf nichts", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(
      makeReq({ body: { prompt: "hallo", model: "ollama/llama3" } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(d.reserveCredits).not.toHaveBeenCalled();
    expect(d.settleCredits).not.toHaveBeenCalled();
    expect(res.payload).toMatchObject({ usage: { billed: false } });
  });

  it("laesst Admins ohne Reservierung durch und kennzeichnet die Rechnung", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const admin = { ...USER, role: "admin" };
    const res = makeRes({ user: admin });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo", model: "gpt-4o-mini" } }), res as unknown as Response);

    expect(d.reserveCredits).not.toHaveBeenCalled();
    expect(res.payload).toMatchObject({ usage: { billed: false } });
  });

  it("protokolliert Admin-Ablehnungen weiterhin mit Plan 'expert'", async () => {
    const d = deps({
      reserveCredits: vi.fn(async () => ({ ok: false, balanceTokens: null, reason: "insufficient" })),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: { ...USER, role: "admin" } });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo", model: "gpt-4o-mini" } }), res as unknown as Response);

    // Admins werden gar nicht erst reserviert; der Handler laeuft normal durch.
    expect(res.statusCode).toBe(200);
    expect(d.reserveCredits).not.toHaveBeenCalled();
  });
});

describe("runHandler — Fehlerpfade", () => {
  it("gibt bei einem Modellfehler die Reservierung vollstaendig zurueck und antwortet 502", async () => {
    const d = deps({
      invokeLLM: vi.fn(async () => {
        throw new Error("upstream 500");
      }),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo", model: "gpt-4o-mini" } }), res as unknown as Response);

    expect(res.statusCode).toBe(502);
    expect(res.payload).toMatchObject({ code: "provider_error", detail: "upstream 500" });
    const reservation = d.reserveCredits.mock.calls[0][0];
    expect(d.settleCredits).toHaveBeenCalledWith(
      expect.objectContaining({ reservedTokens: reservation.tokens, actualTokens: 0 }),
    );
    expect(d.recordAgentExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorCode: "provider_error" }),
    );
  });

  it("kuerzt die Fehlermeldung im 502-Payload auf 300 Zeichen", async () => {
    const d = deps({
      invokeLLM: vi.fn(async () => {
        throw new Error("x".repeat(1_000));
      }),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo" } }), res as unknown as Response);

    expect((res.payload as { detail: string }).detail).toHaveLength(300);
  });

  it("verzichtet bei einem Fehler ohne Reservierung auf eine Erstattung", async () => {
    const d = deps({
      invokeLLM: vi.fn(async () => {
        throw new Error("upstream weg");
      }),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo", model: "ollama/llama3" } }), res as unknown as Response);

    expect(res.statusCode).toBe(502);
    expect(d.settleCredits).not.toHaveBeenCalled();
  });

  it("faellt bei fehlender Nutzungsangabe auf die Prompt-Schaetzung zurueck", async () => {
    const d = deps({
      invokeLLM: vi.fn(async () => ({ model: "openai/gpt-4o-mini", choices: [] })),
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.runHandler("agent")(makeReq({ body: { prompt: "hallo welt" } }), res as unknown as Response);

    const payload = res.payload as { content: string; usage: { promptTokens: number; completionTokens: number | null } };
    expect(payload.content).toBe("");
    expect(payload.usage.promptTokens).toBeGreaterThan(0);
    expect(payload.usage.completionTokens).toBeNull();
  });
});

describe("entitlements", () => {
  it("liefert die Berechtigungssicht bei verfuegbaren Daten", async () => {
    const handlers = createApiV1Handlers(deps());
    const res = makeRes({ user: USER });

    await handlers.entitlements(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, available: true, plan: "free" });
  });

  it("antwortet mit 207, wenn die Berechtigungen nicht lesbar sind", async () => {
    const d = deps({
      readEntitlements: vi.fn(async () => ({ available: false, view: null })) as never,
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: USER });

    await handlers.entitlements(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(207);
    expect(res.payload).toMatchObject({ ok: false, available: false });
  });

  it("meldet Admins als Expert-Plan an die Berechtigungspruefung", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes({ user: { ...USER, role: "admin" } });

    await handlers.entitlements(makeReq(), res as unknown as Response);

    expect(d.readEntitlements).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
  });
});

describe("usageAnalytics", () => {
  it("liefert Kontostand und Zusammenfassung bei verfuegbaren Daten", async () => {
    const handlers = createApiV1Handlers(deps());
    const res = makeRes();

    await handlers.usageAnalytics(makeReq({ query: { days: "7" } }), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, creditBalanceTokens: 5_000, plan: "free" });
  });

  it("antwortet mit 207 und Hinweis, wenn keine Nutzungsdaten lesbar sind", async () => {
    const d = deps({
      readUsageAnalytics: vi.fn(async () => ({ available: false, summary: {} as never })) as never,
    } as never);
    const handlers = createApiV1Handlers(d);
    const res = makeRes();

    await handlers.usageAnalytics(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(207);
    expect(res.payload).toMatchObject({ ok: false, available: false });
  });

  it("setzt bei unbrauchbaren Tagesangaben den Standard von 30 Tagen", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes();

    await handlers.usageAnalytics(makeReq({ query: { days: "keine-zahl", planValueEurPerMonth: "abc" } }), res as unknown as Response);

    expect(d.readUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30, planValueEurPerMonth: null }),
    );
  });

  it("gibt einen gueltigen Planwert unveraendert weiter", async () => {
    const d = deps();
    const handlers = createApiV1Handlers(d);
    const res = makeRes();

    await handlers.usageAnalytics(
      makeReq({ query: { days: "14", planValueEurPerMonth: "29.99" } }),
      res as unknown as Response,
    );

    expect(d.readUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ days: 14, planValueEurPerMonth: 29.99 }),
    );
  });
});

/** Minimaler DB-Fake fuer Onboarding-Pfade: liest Namen, sammelt Inserts. */
function fakeDb(existingNames: string[]) {
  const inserted: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: async () => existingNames.map((name) => ({ name })),
      }),
    }),
    insert: () => ({
      values: async (rows: unknown[]) => {
        inserted.push(...rows);
        return rows;
      },
    }),
  };
  return { db, inserted };
}

describe("ensureTemplateAgents", () => {

  it("meldet fehlende Datenbank, ohne zu werfen", async () => {
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => null) as never }));

    const result = await handlers.ensureTemplateAgents("open-1");

    expect(result).toEqual({ available: false, created: [], alreadyPresent: [] });
  });

  it("legt alle Vorlagen an, wenn der Nutzer noch keine Agenten hat", async () => {
    const { db, inserted } = fakeDb([]);
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => db) as never }));

    const result = await handlers.ensureTemplateAgents("open-1");

    expect(result.available).toBe(true);
    expect(result.created).toHaveLength(TEMPLATE_AGENTS.length);
    expect(inserted).toHaveLength(TEMPLATE_AGENTS.length);
  });

  it("legt nichts doppelt an, wenn alle Vorlagen bereits existieren", async () => {
    const { db, inserted } = fakeDb(TEMPLATE_AGENTS.map((template) => template.name));
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => db) as never }));

    const result = await handlers.ensureTemplateAgents("open-1");

    expect(result.created).toEqual([]);
    expect(result.alreadyPresent).toHaveLength(TEMPLATE_AGENTS.length);
    expect(inserted).toHaveLength(0);
  });

  it("faengt Datenbankfehler beim Anlegen ab und meldet Unverfuegbarkeit", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => {
            throw new Error("relation fehlt");
          },
        }),
      }),
    };
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => db) as never }));

    const result = await handlers.ensureTemplateAgents("open-1");

    expect(result).toEqual({ available: false, created: [], alreadyPresent: [] });
  });

  it("verlangt eine openId, auch wenn die Datenbank da ist", async () => {
    const { db } = fakeDb([]);
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => db) as never }));

    const result = await handlers.ensureTemplateAgents("");

    expect(result.available).toBe(false);
  });
});

describe("onboardingSeed", () => {
  it("antwortet mit 201, wenn Agenten angelegt wurden", async () => {
    const { db } = fakeDb([]);
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => db) as never }));
    const res = makeRes();

    await handlers.onboardingSeed(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(201);
    expect((res.payload as { created: string[] }).created).toHaveLength(TEMPLATE_AGENTS.length);
  });

  it("antwortet mit 200, wenn nichts zu tun war", async () => {
    const { db } = fakeDb(TEMPLATE_AGENTS.map((template) => template.name));
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => db) as never }));
    const res = makeRes();

    await handlers.onboardingSeed(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect((res.payload as { created: string[] }).created).toEqual([]);
  });

  it("antwortet mit 503, wenn keine Datenbank verfuegbar ist", async () => {
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => null) as never }));
    const res = makeRes();

    await handlers.onboardingSeed(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({ code: "unavailable" });
  });
});

describe("listAgents", () => {
  it("antwortet mit 503 ohne Datenbank", async () => {
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => null) as never }));
    const res = makeRes();

    await handlers.listAgents(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(503);
  });

  it("liefert die Agenten des Nutzers", async () => {
    const rows = [{ id: 1, name: "Vertrieb", status: "aktiv", isDefault: true, lastActiveAt: null }];
    const db = {
      select: () => ({
        from: () => ({
          where: async () => rows,
        }),
      }),
    };
    const handlers = createApiV1Handlers(deps({ getDb: vi.fn(async () => db) as never }));
    const res = makeRes();

    await handlers.listAgents(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, agents: rows });
  });
});
