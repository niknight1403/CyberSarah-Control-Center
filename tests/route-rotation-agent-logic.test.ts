import { describe, expect, it } from "vitest";

import {
  appendRouteRotationLedger,
  FREE_ROUTE_SOURCES,
  isRouteHealthy,
  MAX_ROUTE_ROTATION_LEDGER,
  normalizeRouteRotationLedger,
  planRouteRotation,
  type RouteRotationCandidate,
} from "@/lib/route-rotation-agent-logic";

const NOW = 1_700_000_000_000;

const candidate = (overrides: Partial<RouteRotationCandidate>): RouteRotationCandidate => ({
  source: "groq",
  configured: true,
  poolStatus: "active",
  cooldownUntilMs: null,
  probe: null,
  ...overrides,
});

describe("route-rotation-agent-logic", () => {
  describe("FREE_ROUTE_SOURCES", () => {
    it("haelt die Zero-Cost-Prioritaet der Gratis-Kette fest", () => {
      expect(FREE_ROUTE_SOURCES).toEqual(["custom", "groq", "openrouter", "gemini", "local-ollama", "local-lmstudio"]);
    });
  });

  describe("isRouteHealthy", () => {
    it("erkennt eine gesunde aktive Route", () => {
      expect(isRouteHealthy(candidate({}), NOW)).toBe(true);
    });

    it("lehnt unkonfigurierte, erschöpfte und abgekühlte Routen ab", () => {
      expect(isRouteHealthy(candidate({ configured: false }), NOW)).toBe(false);
      expect(isRouteHealthy(candidate({ poolStatus: "exhausted" }), NOW)).toBe(false);
      expect(isRouteHealthy(candidate({ poolStatus: "cooling", cooldownUntilMs: NOW + 5_000 }), NOW)).toBe(false);
    });

    it("akzeptiert abgelaufene Cooldowns wieder", () => {
      expect(isRouteHealthy(candidate({ poolStatus: "cooling", cooldownUntilMs: NOW - 1 }), NOW)).toBe(true);
    });

    it("lehnt aktive Proben-Fehler ab, ignoriert fehlende Proben", () => {
      expect(isRouteHealthy(candidate({ probe: { reachable: false, latencyMs: 120 } }), NOW)).toBe(false);
      expect(isRouteHealthy(candidate({ probe: { reachable: true, latencyMs: 120 } }), NOW)).toBe(true);
      expect(isRouteHealthy(candidate({ probe: null }), NOW)).toBe(true);
    });
  });

  describe("planRouteRotation", () => {
    it("behält eine gesunde aktive Route (keep)", () => {
      const decision = planRouteRotation(
        [candidate({ source: "groq" }), candidate({ source: "openrouter" })],
        "groq",
        NOW,
      );
      expect(decision.action).toBe("keep");
      expect(decision.primary).toBe("groq");
    });

    it("rotiert bei Erschöpfung auf die nächste gesunde Gratis-Route (Priorität vor Latenz)", () => {
      const decision = planRouteRotation(
        [
          candidate({ source: "groq", poolStatus: "exhausted" }),
          candidate({ source: "openrouter", probe: { reachable: true, latencyMs: 900 } }),
          candidate({ source: "gemini", probe: { reachable: true, latencyMs: 100 } }),
        ],
        "groq",
        NOW,
      );
      expect(decision.action).toBe("rotate");
      expect(decision.primary).toBe("openrouter"); // Zero-Cost-Prioritaet schlägt Latenz.
      expect(decision.previous).toBe("groq");
      expect(decision.reason).toContain("erschöpft");
    });

    it("rotiert bei aktivem Cooldown", () => {
      const decision = planRouteRotation(
        [
          candidate({ source: "custom", poolStatus: "cooling", cooldownUntilMs: NOW + 30_000 }),
          candidate({ source: "groq" }),
        ],
        "custom",
        NOW,
      );
      expect(decision.action).toBe("rotate");
      expect(decision.primary).toBe("groq");
      expect(decision.reason).toContain("Cooldown");
    });

    it("rotiert bei nicht erreichbarer Route (Probe)", () => {
      const decision = planRouteRotation(
        [
          candidate({ source: "custom", probe: { reachable: false, latencyMs: 2_500 } }),
          candidate({ source: "groq", probe: { reachable: true, latencyMs: 200 } }),
        ],
        "custom",
        NOW,
      );
      expect(decision.action).toBe("rotate");
      expect(decision.primary).toBe("groq");
      expect(decision.reason).toContain("nicht erreichbar");
    });

    it("rotiert, wenn die aktive Route dekonfiguriert wurde", () => {
      const decision = planRouteRotation(
        [candidate({ source: "custom", configured: false }), candidate({ source: "groq" })],
        "custom",
        NOW,
      );
      expect(decision.action).toBe("rotate");
      expect(decision.primary).toBe("groq");
    });

    it("bevorzugt bei gleicher Prioritaetsstufe die schnellere Route", () => {
      const decision = planRouteRotation(
        [
          candidate({ source: "gemini", poolStatus: "exhausted" }),
          candidate({ source: "local-ollama", probe: { reachable: true, latencyMs: 800 } }),
          candidate({ source: "local-lmstudio", probe: { reachable: true, latencyMs: 50 } }),
        ],
        "gemini",
        NOW,
      );
      expect(decision.action).toBe("rotate");
      expect(decision.primary).toBe("local-ollama"); // Hoehere Zero-Cost-Prioritaet gewinnt.
    });

    it("degraded statt Rotation, wenn keine Route gesund ist (Kette bleibt Best-Effort)", () => {
      const decision = planRouteRotation(
        [
          candidate({ source: "groq", poolStatus: "exhausted" }),
          candidate({ source: "openrouter", poolStatus: "cooling", cooldownUntilMs: NOW + 45_000 }),
          candidate({ source: "gemini", probe: { reachable: false, latencyMs: 2_500 } }),
        ],
        "groq",
        NOW,
      );
      expect(decision.action).toBe("degraded");
      expect(decision.primary).toBe("groq");
      expect(decision.reason).toContain("fruehester Cooldown");
    });

    it("waehlt NIE eine ungesunde Alternative", () => {
      const decision = planRouteRotation(
        [
          candidate({ source: "groq", poolStatus: "exhausted" }),
          candidate({ source: "openrouter", probe: { reachable: false, latencyMs: 2_500 } }),
          candidate({ source: "gemini" }),
        ],
        "groq",
        NOW,
      );
      expect(decision.action).toBe("rotate");
      expect(decision.primary).toBe("gemini");
    });
  });

  describe("Ledger", () => {
    it("haengt Entscheidungen neuestens-first an und begrenzt den Ring", () => {
      let ledger: ReturnType<typeof appendRouteRotationLedger> = [];
      for (let index = 0; index < MAX_ROUTE_ROTATION_LEDGER + 5; index += 1) {
        ledger = appendRouteRotationLedger(
          ledger,
          { action: "rotate", primary: "groq", previous: "openrouter", reason: `Rotation ${index}` },
          NOW + index,
        );
      }
      expect(ledger).toHaveLength(MAX_ROUTE_ROTATION_LEDGER);
      expect(ledger[0].reason).toBe(`Rotation ${MAX_ROUTE_ROTATION_LEDGER + 4}`);
      expect(ledger[0].from).toBe("openrouter");
      expect(ledger[0].to).toBe("groq");
      expect(ledger[0].action).toBe("rotate");
    });

    it("filtert ungueltige Persistenz-Reste heraus (normalize)", () => {
      const normalized = normalizeRouteRotationLedger([
        null,
        "ungültig",
        { at: "2026-09-20T00:00:00.000Z", action: "rotate", from: "groq", to: "openrouter", reason: "Test" },
        { at: "2026-09-20T00:01:00.000Z", action: "ungueltig", from: "groq", to: "openrouter", reason: "Test" },
        42,
      ]);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].to).toBe("openrouter");
    });
  });
});
