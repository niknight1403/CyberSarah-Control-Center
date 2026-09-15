/**
 * Sprint 115 — Provider-Metering: deterministische Tests der reinen Logik —
 * Aufruf-Klassifizierung, Fenster-Aggregation, Quota-Warnschwelle (einmalig
 * je Schwelle), Admin-Overview-Kombination. Kein Netz, keine Datenbank.
 */
import { describe, expect, it } from "vitest";

import {
  aggregateProviderMetering,
  buildProviderMeteringOverview,
  classifyProviderCall,
  evaluateQuotaWarnings,
  METERING_WINDOW_MS,
  type PoolKeyState,
  type ProviderMeteringEvent,
  quotaWarningKey,
} from "../lib/provider-metering-logic";
import {
  evaluateAndNotifyQuotaWarnings,
  getProviderMeteringOverview,
  recordProviderCall,
  recordProviderFailover,
  resetProviderMeteringForTests,
} from "../server/provider-metering";

describe("Sprint 115: Aufruf-Klassifizierung", () => {
  it("HTTP-Status und Netzwerkfehler werden korrekt kategorisiert", () => {
    expect(classifyProviderCall(200, false)).toBe("success");
    expect(classifyProviderCall(429, false)).toBe("http-429");
    expect(classifyProviderCall(401, false)).toBe("http-auth");
    expect(classifyProviderCall(402, false)).toBe("http-auth");
    expect(classifyProviderCall(500, false)).toBe("http-other");
    expect(classifyProviderCall(null, true)).toBe("network");
  });
});

describe("Sprint 115: Fenster-Aggregation", () => {
  const NOW = Date.parse("2026-09-15T12:00:00.000Z");

  it("zählt Aufrufe, 429-Rate und Failover je Quelle im Fenster", () => {
    const events: ProviderMeteringEvent[] = [
      { source: "forge", kind: "success", at: NOW - 1_000, latencyMs: 120 },
      { source: "forge", kind: "success", at: NOW - 2_000, latencyMs: 100 },
      { source: "forge", kind: "http-429", at: NOW - 3_000, latencyMs: 60 },
      { source: "forge", kind: "failover", at: NOW - 3_000, latencyMs: 0 },
      { source: "gemini-1", kind: "success", at: NOW - 500, latencyMs: 900 },
    ];
    const aggregates = aggregateProviderMetering(events, NOW);
    const forge = aggregates.get("forge");
    expect(forge?.callsWindow).toBe(2);
    expect(forge?.http429Window).toBe(1);
    expect(forge?.failoversWindow).toBe(1);
    // 429-Rate = 429 / (Erfolge + 429) = 1/3
    expect(forge?.rate429Window).toBeCloseTo(1 / 3, 5);
    expect(forge?.lastFailoverAt).toBe(NOW - 3_000);
    expect(aggregates.get("gemini-1")?.callsWindow).toBe(1);
  });

  it("Ereignisse außerhalb des 24-h-Fensters werden ignoriert", () => {
    const events: ProviderMeteringEvent[] = [
      { source: "forge", kind: "success", at: NOW - METERING_WINDOW_MS - 1, latencyMs: 100 },
      { source: "forge", kind: "success", at: NOW - 1_000, latencyMs: 100 },
    ];
    const aggregates = aggregateProviderMetering(events, NOW);
    expect(aggregates.get("forge")?.callsWindow).toBe(1);
  });

  it("leeres Ledger liefert leere Aggregation ohne Division durch Null", () => {
    const aggregates = aggregateProviderMetering([], NOW);
    expect(aggregates.size).toBe(0);
  });
});

describe("Sprint 115: Quota-Warnschwelle", () => {
  const key = (id: string, remainingCredits: number | null): PoolKeyState => ({
    id,
    label: `…${id.slice(-4)}`,
    status: "active",
    remainingCredits,
    cooldownUntilMs: null,
  });

  it("warnt bei Überschreiten von 80 % Verbrauch, einmalig je Schwelle", () => {
    const pool = [key("forge", 0.15), key("gemini-1", 0.5)];
    const fired = new Set<string>();
    const first = evaluateQuotaWarnings(pool, fired);
    expect(first.warnings).toHaveLength(1);
    expect(first.warnings[0].keyId).toBe("forge");
    expect(first.warnings[0].message).toContain("85 %");

    first.fired.forEach((id) => fired.add(id));
    // Zweite Pruefung: Schwelle bereits gefeuert → keine zweite Warnung.
    const second = evaluateQuotaWarnings(pool, fired);
    expect(second.warnings).toHaveLength(0);
  });

  it("Keys ohne Restguthaben-Angabe und unter der Schwelle bleiben still", () => {
    const pool = [key("openai", null), key("forge", 0.4)];
    const result = evaluateQuotaWarnings(pool, new Set());
    expect(result.warnings).toHaveLength(0);
  });

  it("quotaWarningKey ist stabil (Key-ID + Schwelle)", () => {
    expect(quotaWarningKey("forge", 0.8)).toBe("forge:0.8");
  });
});

describe("Sprint 115: Admin-Overview", () => {
  const NOW = Date.parse("2026-09-15T12:00:00.000Z");

  it("kombiniert Pool-Zustaende, Fallback-Pfad und Cooldown-Restzeit", () => {
    const pool: PoolKeyState[] = [
      { id: "forge", label: "…ab12", status: "active", remainingCredits: null, cooldownUntilMs: null },
      { id: "gemini-1", label: "…cd34", status: "cooling", remainingCredits: null, cooldownUntilMs: NOW + 45_000 },
      { id: "openai", label: "…ef56", status: "exhausted", remainingCredits: 0, cooldownUntilMs: null },
    ];
    const events: ProviderMeteringEvent[] = [
      { source: "forge", kind: "success", at: NOW - 100, latencyMs: 150 },
      { source: "gemini-1", kind: "http-429", at: NOW - 100, latencyMs: 50 },
    ];
    const overview = buildProviderMeteringOverview(pool, events, new Set(["openai:0.8"]), NOW);
    expect(overview.providers).toHaveLength(3);
    expect(overview.providers.find((provider) => provider.source === "gemini-1")?.cooldownRemainingSec).toBe(45);
    expect(overview.providers.find((provider) => provider.source === "forge")?.activePath).toEqual(["forge"]);
    expect(overview.firedWarnings).toEqual(["openai:0.8"]);
    expect(overview.windowHours).toBe(24);
  });
});

describe("Sprint 115: Server-Adapter (Ledger + Einmal-Warnung)", () => {
  it("recordProviderCall/recordProviderFailover füllen das rollierende Ledger", () => {
    resetProviderMeteringForTests();
    const now = Date.now();
    recordProviderCall({ source: "forge", httpStatus: 200, networkError: false, latencyMs: 120, nowMs: now - 2_000 });
    recordProviderCall({ source: "forge", httpStatus: 429, networkError: false, latencyMs: 60, nowMs: now - 1_000 });
    recordProviderFailover({ source: "forge", failoverTo: "gemini-1", nowMs: now - 1_000 });
    const pool: PoolKeyState[] = [
      { id: "forge", label: "…ab12", status: "cooling", remainingCredits: null, cooldownUntilMs: Date.now() + 30_000 },
    ];
    const overview = getProviderMeteringOverview(pool);
    const forge = overview.providers.find((provider) => provider.source === "forge");
    expect(forge?.http429Window).toBe(1);
    expect(forge?.failoversWindow).toBe(1);
    expect(forge?.cooldownRemainingSec).toBeGreaterThanOrEqual(29);
  });

  it("evaluateAndNotifyQuotaWarnings benachrichtigt genau einmal je Schwelle", async () => {
    resetProviderMeteringForTests();
    const sent: string[] = [];
    const notify = async (message: string) => {
      sent.push(message);
    };
    const pool: PoolKeyState[] = [
      { id: "gemini-1", label: "…cd34", status: "active", remainingCredits: 0.1, cooldownUntilMs: null },
    ];
    const first = await evaluateAndNotifyQuotaWarnings(pool, notify);
    expect(first.fired).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("90 %");

    const second = await evaluateAndNotifyQuotaWarnings(pool, notify);
    expect(second.fired).toHaveLength(0);
    expect(sent).toHaveLength(1); // keine zweite Benachrichtigung
  });

  it("gescheiterter Versand markiert notified ehrlich als nicht zugestellt", async () => {
    resetProviderMeteringForTests();
    const pool: PoolKeyState[] = [
      { id: "openai", label: "…ef56", status: "active", remainingCredits: 0.05, cooldownUntilMs: null },
    ];
    const failing = async () => {
      throw new Error("webhook down");
    };
    const result = await evaluateAndNotifyQuotaWarnings(pool, failing);
    expect(result.fired).toHaveLength(1);
    expect(result.notified).toBe(false);
  });
});
