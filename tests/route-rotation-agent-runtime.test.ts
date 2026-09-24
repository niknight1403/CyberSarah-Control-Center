/**
 * Sprint 196 — Laufzeit-Regressionstest des autonomen Route-Rotations-Agenten.
 *
 * Verifiziert den vollen Tick-Zyklus gegen die In-Memory-KV (Sprint 191
 * Test-Hook) und gesteuerte Probes (global.fetch gestubb): Der Agent waehlt
 * autonom die naechste gesunde KOSTENFREIE Route, persistiert Primaerroute
 * und Ledger, respektiert den Administrator-Zwang nur solange die erzwungene
 * Route gesund ist und laesst sich pausieren (Admin-Vollzugriff).
 *
 * Der Managed-Pool bleibt in diesem Test bewusst leer (kein echter LLM-
 * Aufruf): Die Gesundheit entscheidet sich allein ueber die Probes — der
 * Pool-Einfluss ist deterministisch in route-rotation-agent-logic.test.ts
 * abgedeckt.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setModelRouterKvForTests } from "../server/db";
import { getRouteRotationPrimary, resetRouteRotationStateForTests } from "../server/_core/route-rotation-state";
import {
  forceRouteRotation,
  getRouteRotationStatus,
  resetRouteRotationAgentForTests,
  runRouteRotationTick,
  setRouteRotationEnabled,
} from "../server/route-rotation-agent";

const kv = new Map<string, unknown>();

// Sprint 191: KV via zentralen Test-Hook statt vi.mock (isolate:false).
beforeAll(() => {
  setModelRouterKvForTests(kv);
});
afterAll(() => {
  setModelRouterKvForTests(null);
  // Root-Cause-Fix (Serie G): Bei isolate:false teilen sich Testdateien den
  // Worker-Prozess. Dieser Datei-State (Modul-Spiegel + Env) WUERDE in die
  // naechste Suite leaken und dort die Kette umsortieren (Sprint-85-Flaky).
  resetRouteRotationStateForTests();
  resetRouteRotationAgentForTests();
  delete process.env.AI_GROQ_API_KEY;
  delete process.env.AI_OPENROUTER_API_KEY;
  delete process.env.AI_ROUTE_ROTATION;
  delete process.env.AI_CUSTOM_API_KEY;
  delete process.env.AI_CUSTOM_BASE_URL;
});

/** Antwort-Matrix der Probes: URL-Suchteil → HTTP-Status. */
function stubProbes(byUrlPart: Record<string, number>) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    const match = Object.entries(byUrlPart).find(([part]) => url.includes(part));
    const status = match ? match[1] : 200;
    return { ok: status >= 200 && status < 300, status, statusText: "Test" };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("route-rotation-agent (Laufzeit)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    kv.clear();
    resetRouteRotationStateForTests();
    resetRouteRotationAgentForTests();
    // Deterministische Gratis-Kette: nur Groq + OpenRouter konfiguriert.
    process.env.AI_GROQ_API_KEY = "test-groq-key";
    process.env.AI_OPENROUTER_API_KEY = "test-openrouter-key";
    delete process.env.AI_CUSTOM_API_KEY;
    delete process.env.AI_CUSTOM_BASE_URL;
    delete process.env.AI_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.AI_ROUTE_ROTATION = "true";
  });

  it("rotiert autonom auf die naechste erreichbare Gratis-Route und persistiert Zustand + Ledger", async () => {
    // Groq nicht erreichbar (500), OpenRouter erreichbar.
    stubProbes({ groq: 500, openrouter: 200 });

    await runRouteRotationTick({ now: 1_000 });

    // Default-Primaerroute ist Groq (hoechste konfigurierte Prioritaet);
    // dessen Probe schlaegt fehl → autonome Rotation auf OpenRouter.
    expect(getRouteRotationPrimary()).toBe("openrouter");
    expect(kv.get("routeRotation.primary")).toBe("openrouter");

    const ledger = kv.get("routeRotation.ledger") as { action: string; from: string; to: string; reason: string }[];
    expect(ledger).toHaveLength(1);
    expect(ledger[0].action).toBe("rotate");
    expect(ledger[0].from).toBe("groq");
    expect(ledger[0].to).toBe("openrouter");
    expect(ledger[0].reason).toContain("nicht erreichbar");

    const probes = kv.get("routeRotation.lastProbes") as Record<string, { reachable: boolean }>;
    expect(probes.groq.reachable).toBe(false);
    expect(probes.openrouter.reachable).toBe(true);
  });

  it("bleibt bei gesunder aktiver Route ruhig (kein Rotations-Churn, kein Ledger-Eintrag)", async () => {
    stubProbes({ groq: 200, openrouter: 200 });

    await runRouteRotationTick({ now: 10_000 }); // Initial: Groq gesund → keep (kein Ledger).
    const ledgerAfterFirst = kv.get("routeRotation.ledger") as unknown[];
    expect(getRouteRotationPrimary()).toBe("groq");
    expect(ledgerAfterFirst ?? []).toHaveLength(0);

    await runRouteRotationTick({ now: 20_000 }); // Zweiter Tick: weiterhin gesund.
    expect(getRouteRotationPrimary()).toBe("groq");
    const ledgerAfterSecond = kv.get("routeRotation.ledger") as unknown[];
    expect(ledgerAfterSecond ?? []).toHaveLength(0); // keep erzeugt KEINE Ledger-Eintraege.
  });

  it("respektiert den Administrator-Zwang nur solange die erzwungene Route gesund ist", async () => {
    stubProbes({ groq: 200, openrouter: 200 });
    await runRouteRotationTick({ now: 10_000 }); // Primaerroute: Groq.

    // Admin erzwingt OpenRouter (manuelle Wahl hat Vorrang).
    const forced = await forceRouteRotation({ to: "openrouter" });
    expect(forced.forced).toBe("openrouter");
    expect(getRouteRotationPrimary()).toBe("openrouter");
    expect(kv.get("routeRotation.forcedPrimary")).toBe("openrouter");

    // Erzwungene Route gesund → Agent greift nicht ein.
    await runRouteRotationTick({ now: 20_000 });
    expect(getRouteRotationPrimary()).toBe("openrouter");
    expect(kv.get("routeRotation.forcedPrimary")).toBe("openrouter");

    // Erzwungene Route degradiert → Autonomie uebernimmt, Zwang faellt.
    stubProbes({ groq: 200, openrouter: 503 });
    await runRouteRotationTick({ now: 30_000 });
    expect(getRouteRotationPrimary()).toBe("groq");
    expect(kv.get("routeRotation.forcedPrimary")).toBeNull();

    const ledger = kv.get("routeRotation.ledger") as { action: string; reason: string }[];
    const forcedEntry = ledger.find((entry) => entry.reason.includes("Erzwungene Route"));
    expect(forcedEntry).toBeTruthy();
    expect(forcedEntry?.action).toBe("rotate");

    // Zwang aufheben ('auto') → reiner Autonomie-Modus.
    await forceRouteRotation({ to: "auto" });
    expect(kv.get("routeRotation.forcedPrimary")).toBeNull();
  });

  it("laesst sich pausieren (Admin-Vollzugriff) und nimmt den Betrieb danach wieder auf", async () => {
    stubProbes({ groq: 500, openrouter: 200 });
    await runRouteRotationTick({ now: 10_000 });
    const firstTickAt = kv.get("routeRotation.lastTickAt");
    expect(getRouteRotationPrimary()).toBe("openrouter");

    // Pause: Tick aendert nichts mehr.
    expect(await setRouteRotationEnabled(false)).toBe(false);
    expect(kv.get("routeRotation.enabled")).toBe(false);
    stubProbes({ groq: 200, openrouter: 500 }); // Wuerde rotieren — ist aber pausiert.
    await runRouteRotationTick({ now: 20_000 });
    expect(getRouteRotationPrimary()).toBe("openrouter");
    expect(kv.get("routeRotation.lastTickAt")).toBe(firstTickAt);

    // Fortsetzen: sofortiger Kontroll-Tick rotiert auf die gesunde Route.
    expect(await setRouteRotationEnabled(true)).toBe(true);
    await runRouteRotationTick({ now: 30_000 });
    expect(getRouteRotationPrimary()).toBe("groq");
  });

  it("meldet den vollstaendigen Status (Routen, Gesundheit, Ledger, Takt)", async () => {
    stubProbes({ groq: 200, openrouter: 200 });
    await runRouteRotationTick({ now: 10_000 });

    const status = await getRouteRotationStatus();
    expect(status.enabled).toBe(true);
    expect(status.primary).toBe("groq");
    expect(status.forced).toBeNull();
    expect(status.ledger).toEqual([]);
    expect(status.lastTickAt).toBe(new Date(10_000).toISOString());
    const groqRoute = status.routes.find((route) => route.source === "groq");
    const openrouterRoute = status.routes.find((route) => route.source === "openrouter");
    expect(groqRoute).toMatchObject({ configured: true, healthy: true });
    expect(openrouterRoute).toMatchObject({ configured: true, healthy: true });
    // Unkonfigurierte Quellen werden transparent gefuehrt (nicht gewaehlt).
    const geminiRoute = status.routes.find((route) => route.source === "gemini");
    expect(geminiRoute).toMatchObject({ configured: false, healthy: false });
  });

  it("lehnt ungueltige Ziell-Routen mit klarer Fehlermeldung ab (nie ausserhalb der Gratis-Kette)", async () => {
    await expect(forceRouteRotation({ to: "openai" as never })).rejects.toThrow("UNGUELTIGE_ROUTE");
  });
});
