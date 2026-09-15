import { describe, expect, it, beforeAll } from "vitest";

/**
 * Sprint 128 — Regressionstest fuer den Auth-Bugfix in server/_core/sdk.ts.
 *
 * Root Cause (siehe Live-Vorfall 2026-09-16): verifySession verwarf eine
 * sonst gueltige Session hart, wenn das rein kosmetische "name"-Feld leer
 * war. Da die Rolle/Autorisierung ausschliesslich per "openId" aus der DB
 * kommt (server/_core/trpc.ts requireUser -> ctx.user.role), durfte ein
 * fehlender Name niemals eine gueltige Session invalidieren. Dieser Bug
 * liess JEDE protectedProcedure-Abfrage (Dashboard, Agenten-Status,
 * Task-Ledger) fehlschlagen, sobald eine Session ohne Namen zustande kam.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-fuer-session-auth-logic";
process.env.VITE_APP_ID = process.env.VITE_APP_ID || "test-app-id";

describe("Sessionverifikation ohne Namen bleibt gueltig", () => {
  let sdk: typeof import("../server/_core/sdk").sdk;

  beforeAll(async () => {
    ({ sdk } = await import("../server/_core/sdk"));
  });

  it("akzeptiert eine Session mit leerem Namen, solange openId und appId vorhanden sind", async () => {
    const token = await sdk.signSession({ openId: "local_abc123", appId: "test-app-id", name: "" });
    const session = await sdk.verifySession(token);
    expect(session).not.toBeNull();
    expect(session?.openId).toBe("local_abc123");
    expect(session?.appId).toBe("test-app-id");
    expect(session?.name).toBe("");
  });

  it("verwirft eine Session ohne openId", async () => {
    const token = await sdk.signSession({ openId: "", appId: "test-app-id", name: "Jemand" });
    const session = await sdk.verifySession(token);
    expect(session).toBeNull();
  });

  it("verwirft eine Session ohne appId", async () => {
    const token = await sdk.signSession({ openId: "local_abc123", appId: "", name: "Jemand" });
    const session = await sdk.verifySession(token);
    expect(session).toBeNull();
  });

  it("verwirft undefined/leere Cookies weiterhin", async () => {
    expect(await sdk.verifySession(undefined)).toBeNull();
    expect(await sdk.verifySession("")).toBeNull();
  });
});
