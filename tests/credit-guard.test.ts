import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireCredits, type CreditGuardDeps } from "../server/credit-guard";

/**
 * Tests fuer den Guthaben-Waechter der oeffentlichen API (`requireCredits`).
 *
 * Der Waechter entscheidet, ob eine Route ueberhaupt starten darf. Fehler hier
 * sind teuer: ein zu grosszuegiger Waechter verbrennt fremdes Guthaben, ein zu
 * strenger sperrt zahlende Nutzer aus. Die I/O-Abhaengigkeiten kommen ueber
 * das Deps-Seam (siehe Modulkommentar), damit kein Test eine Datenbank braucht.
 */

function makeRes(locals: Record<string, unknown> = {}) {
  const res = {
    locals,
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
    ...overrides,
  } as unknown as Request;
}

function deps(overrides: Partial<CreditGuardDeps> = {}): CreditGuardDeps & { readBalance: ReturnType<typeof vi.fn> } {
  const readBalance = vi.fn(async () => 1_000 as number | null);
  return {
    readBalance,
    creditPacks: () => [{ id: "credit_pack_small", label: "50.000 Cloud-Tokens", tokens: 50_000, priceEur: 4.99 }],
    ...overrides,
  } as CreditGuardDeps & { readBalance: ReturnType<typeof vi.fn> };
}

async function run(
  guard: ReturnType<typeof requireCredits>,
  req: Request,
  res: ReturnType<typeof makeRes>,
) {
  const next = vi.fn() as unknown as NextFunction;
  await guard(req, res as unknown as Response, next);
  return next as unknown as ReturnType<typeof vi.fn>;
}

const originalBaseUrl = process.env.APP_BASE_URL;

beforeEach(() => {
  delete process.env.APP_BASE_URL;
});

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
});

describe("requireCredits", () => {
  it("laesst kostenlose Routen ohne Guthabenpruefung durch", async () => {
    const d = deps();
    const res = makeRes();
    const next = await run(requireCredits({ requiredTokens: 10, free: true }, d), makeReq(), res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(d.readBalance).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("weist ohne Nutzer mit 401 ab und liest kein Guthaben", async () => {
    const d = deps();
    const res = makeRes();
    const next = await run(requireCredits({ requiredTokens: 1 }, d), makeReq(), res);

    expect(next).not.toHaveBeenCalled();
    expect(d.readBalance).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Authentifizierung erforderlich.", code: "unauthenticated" });
  });

  it("nimmt die Nutzerkennung aus res.locals und akzeptiert sie als String", async () => {
    const d = deps({ readBalance: vi.fn(async () => 500) as unknown as CreditGuardDeps["readBalance"] });
    const res = makeRes({ user: { openId: "user-1", role: "user" } });
    const next = await run(requireCredits({ requiredTokens: 100 }, d), makeReq(), res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(d.readBalance).toHaveBeenCalledWith("user-1");
    expect(res.locals.creditBalanceTokens).toBe(500);
  });

  it("faellt auf req.user zurueck, wenn res.locals leer ist", async () => {
    const d = deps({ readBalance: vi.fn(async () => 500) as unknown as CreditGuardDeps["readBalance"] });
    const res = makeRes();
    const req = makeReq({ user: { openId: "req-user" } });
    const next = await run(requireCredits({ requiredTokens: 1 }, d), req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(d.readBalance).toHaveBeenCalledWith("req-user");
  });

  it("behandelt eine nicht-string openId wie fehlende Anmeldung", async () => {
    const d = deps();
    const res = makeRes({ user: { openId: 42 } });
    const next = await run(requireCredits({ requiredTokens: 1 }, d), makeReq(), res);

    expect(next).not.toHaveBeenCalled();
    expect(d.readBalance).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("laesst Admins ohne Guthabenabfrage passieren", async () => {
    const d = deps();
    const res = makeRes({ user: { openId: "admin-1", role: "admin" } });
    const next = await run(requireCredits({ requiredTokens: 1_000_000 }, d), makeReq(), res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(d.readBalance).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("meldet 402 mit strukturiertem Payload, wenn das Guthaben nicht lesbar ist", async () => {
    const d = deps({ readBalance: vi.fn(async () => null) as unknown as CreditGuardDeps["readBalance"] });
    const res = makeRes({ user: { openId: "user-2", role: "user" } });
    const next = await run(requireCredits({ requiredTokens: 5 }, d), makeReq(), res);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(402);
    const payload = res.payload as {
      code: string;
      reason: string;
      usage: { requiredTokens: number; remainingTokens: number | null };
      options: { checkoutUrl: string; creditPacks: unknown[]; upgradePlan: string | null };
    };
    expect(payload.code).toBe("payment_required");
    expect(payload.reason).toBe("Guthaben derzeit nicht prüfbar.");
    expect(payload.usage).toEqual({ requiredTokens: 5, remainingTokens: null, resetsAt: null });
    expect(payload.options.upgradePlan).toBe("pro");
    expect(payload.options.checkoutUrl).toBe("https://control.example.com/api/billing/stripe/checkout");
    expect(payload.options.creditPacks).toHaveLength(1);
  });

  it("weist bei zu wenig Guthaben mit Restbetrag und Upgrade-Ziel ab", async () => {
    const d = deps({ readBalance: vi.fn(async () => 40) as unknown as CreditGuardDeps["readBalance"] });
    const res = makeRes({ user: { openId: "user-3", role: "user" } });
    const next = await run(requireCredits({ requiredTokens: 100.4, upgradePlan: "business" }, d), makeReq(), res);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(402);
    const payload = res.payload as {
      reason: string;
      usage: { requiredTokens: number; remainingTokens: number | null };
      options: { upgradePlan: string | null };
    };
    expect(payload.reason).toBe("Guthaben reicht für diesen Lauf nicht.");
    // Angeforderte Tokens werden aufgerundet, der Reststand abgerundet.
    expect(payload.usage).toEqual({ requiredTokens: 101, remainingTokens: 40, resetsAt: null });
    expect(payload.options.upgradePlan).toBe("business");
  });

  it("akzeptiert genau den benoetigten Betrag als ausreichend", async () => {
    const d = deps({ readBalance: vi.fn(async () => 100) as unknown as CreditGuardDeps["readBalance"] });
    const res = makeRes({ user: { openId: "user-4", role: "user" } });
    const next = await run(requireCredits({ requiredTokens: 100 }, d), makeReq(), res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.creditBalanceTokens).toBe(100);
  });

  it("bereinigt einen abschliessenden Slash in APP_BASE_URL", async () => {
    process.env.APP_BASE_URL = "https://app.example.com/";
    const d = deps({ readBalance: vi.fn(async () => 0) as unknown as CreditGuardDeps["readBalance"] });
    const res = makeRes({ user: { openId: "user-5", role: "user" } });
    await run(requireCredits({ requiredTokens: 1 }, d), makeReq(), res);

    const payload = res.payload as { options: { checkoutUrl: string } };
    expect(payload.options.checkoutUrl).toBe("https://app.example.com/api/billing/stripe/checkout");
  });

  it("baut die Checkout-URL ohne Host aus localhost", async () => {
    const d = deps({ readBalance: vi.fn(async () => 0) as unknown as CreditGuardDeps["readBalance"] });
    const res = makeRes({ user: { openId: "user-6", role: "user" } });
    const req = { protocol: "http", get: () => undefined } as unknown as Request;
    await run(requireCredits({ requiredTokens: 1 }, d), req, res);

    const payload = res.payload as { options: { checkoutUrl: string } };
    expect(payload.options.checkoutUrl).toBe("http://localhost/api/billing/stripe/checkout");
  });

  it("reicht Fehler der Guthabenabfrage weiter, statt sie zu verschlucken", async () => {
    const d = deps({
      readBalance: vi.fn(async () => {
        throw new Error("db down");
      }) as unknown as CreditGuardDeps["readBalance"],
    });
    const res = makeRes({ user: { openId: "user-7", role: "user" } });

    await expect(run(requireCredits({ requiredTokens: 1 }, d), makeReq(), res)).rejects.toThrow("db down");
  });
});
