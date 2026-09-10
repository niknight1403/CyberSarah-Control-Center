import { describe, expect, it } from "vitest";

import {
  COOLDOWN_BASE_MS,
  COOLDOWN_MAX_MS,
  RATE_LIMIT_COOLDOWN_MS,
  ROUTER_PROVIDER_IDS,
  buildProviderOrder,
  classifyPrompt,
  emptyProviderHealth,
  estimateTokens,
  healthSnapshot,
  providerBlockedReason,
  recordProviderOutcome,
  shouldAutoRoute,
} from "../lib/model-router-logic";

const NOW = 1_000_000;
const ALL_CONFIGURED = [...ROUTER_PROVIDER_IDS];

describe("model-router-logic — Prompt-Klassifikation", () => {
  it("erkennt Code-Auftraege", () => {
    const result = classifyPrompt("Erweitere diese Funktion:\n```ts\nconst x = 1;\nfunction foo() {}\n```");
    expect(result.taskType).toBe("code");
    expect(result.complexity).toBe("medium");
  });

  it("stuft Refactor-Auftraege als heavy ein", () => {
    const result = classifyPrompt("Refactor dieses Modul und pruefe die Architektur.");
    expect(result.complexity).toBe("heavy");
  });

  it("erkennt System-Audits als reasoning + heavy", () => {
    const result = classifyPrompt("Führe einen vollständigen Architektur- und Risiko-Audit des Systems durch.");
    expect(result.taskType).toBe("reasoning");
    expect(result.complexity).toBe("heavy");
  });

  it("erkennt UI-/Design-Auftraege", () => {
    const result = classifyPrompt("Verbessere das Layout und die Farbauswahl des Dashboards, schöneres Design.");
    expect(result.taskType).toBe("ui");
  });

  it("stuft kurze Begruesung als light/chat ein", () => {
    const result = classifyPrompt("Hi!");
    expect(result.taskType).toBe("chat");
    expect(result.complexity).toBe("light");
    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("markiert lange Prompts als heavy", () => {
    const long = "Analysiere diesen Verlauf: " + "x".repeat(6000);
    const result = classifyPrompt(long);
    expect(result.complexity).toBe("heavy");
  });
});

describe("model-router-logic — Kandidaten-Reihenfolge", () => {
  it("bevorzugt starke Provider fuer Code heavy", () => {
    const order = buildProviderOrder({
      taskType: "code",
      complexity: "heavy",
      health: {},
      configuredProviders: ALL_CONFIGURED,
      now: NOW,
    });
    expect(order[0].available).toBe(true);
    expect(order[0].provider).toBe("anthropic");
    const openaiRank = order.findIndex((entry) => entry.provider === "openai");
    const huggingfaceRank = order.findIndex((entry) => entry.provider === "huggingface");
    expect(openaiRank).toBeLessThan(huggingfaceRank);
  });

  it("respektiert bevorzugte Admin-Reihenfolge", () => {
    const order = buildProviderOrder({
      taskType: "chat",
      complexity: "light",
      preferredOrder: ["managed", "openai"],
      health: {},
      configuredProviders: ALL_CONFIGURED,
      now: NOW,
    });
    expect(order[0].provider).toBe("managed");
    expect(order[1].provider).toBe("openai");
  });

  it("sortiert Cooldown-Provider ans Ende und markiert sie blockiert", () => {
    const health = {
      anthropic: { ...emptyProviderHealth(), status: "cooldown" as const, cooldownUntil: NOW + 60_000 },
    };
    const order = buildProviderOrder({
      taskType: "code",
      complexity: "medium",
      health,
      configuredProviders: ALL_CONFIGURED,
      now: NOW,
    });
    const anthropic = order.find((entry) => entry.provider === "anthropic");
    expect(anthropic?.available).toBe(false);
    expect(anthropic?.blockedReason).toBe("cooldown");
    expect(order[0].provider).not.toBe("anthropic");
    expect(providerBlockedReason(health, "anthropic", NOW)).toBe("cooldown");
  });

  it("markiert unkonfigurierte Provider", () => {
    const order = buildProviderOrder({
      taskType: "code",
      complexity: "medium",
      health: {},
      configuredProviders: ["managed"],
      now: NOW,
    });
    expect(order.find((entry) => entry.provider === "openai")?.blockedReason).toBe("unconfigured");
    expect(order.find((entry) => entry.provider === "managed")?.available).toBe(true);
  });
});

describe("model-router-logic — Failover-Zustandsmaschine", () => {
  it("setzt Erfolg zurueck auf ready", () => {
    let health = recordProviderOutcome({}, "openai", { kind: "failure", retryable: true, rateLimited: false }, NOW);
    health = recordProviderOutcome(health, "openai", { kind: "success", latencyMs: 420 }, NOW + 1);
    expect(health.openai?.status).toBe("ready");
    expect(health.openai?.consecutiveFailures).toBe(0);
    expect(health.openai?.cooldownUntil).toBeNull();
    expect(health.openai?.lastLatencyMs).toBe(420);
  });

  it("verdoppelt Cooldown exponentiell bis zum Deckel", () => {
    let health = {} as ReturnType<typeof recordProviderOutcome>;
    health = recordProviderOutcome(health, "openai", { kind: "failure", retryable: true, rateLimited: false }, NOW);
    expect(health.openai?.cooldownUntil).toBe(NOW + COOLDOWN_BASE_MS);
    health = recordProviderOutcome(health, "openai", { kind: "failure", retryable: true, rateLimited: false }, NOW + 1);
    expect(health.openai?.cooldownUntil).toBe(NOW + 1 + COOLDOWN_BASE_MS * 2);
    health = recordProviderOutcome(health, "openai", { kind: "timeout" }, NOW + 2);
    health = recordProviderOutcome(health, "openai", { kind: "timeout" }, NOW + 3);
    health = recordProviderOutcome(health, "openai", { kind: "timeout" }, NOW + 4);
    expect(health.openai?.cooldownUntil! - (NOW + 4)).toBeLessThanOrEqual(COOLDOWN_MAX_MS);
  });

  it("belegt Rate-Limits sofort mit 60 s Cooldown", () => {
    const health = recordProviderOutcome({}, "groq", { kind: "failure", retryable: true, rateLimited: true }, NOW);
    expect(health.groq?.cooldownUntil).toBe(NOW + RATE_LIMIT_COOLDOWN_MS);
    expect(health.groq?.status).toBe("cooldown");
  });

  it("erzeugt stabile Health-Snapshots fuer die Admin-UI", () => {
    const health = recordProviderOutcome({}, "gemini", { kind: "failure", retryable: true, rateLimited: true }, NOW);
    const snapshot = healthSnapshot(health, ["gemini", "openai"], NOW + 100);
    const gemini = snapshot.find((entry) => entry.provider === "gemini");
    const openai = snapshot.find((entry) => entry.provider === "openai");
    expect(gemini?.status).toBe("cooldown");
    expect(openai?.status).toBe("unknown");
    expect(snapshot.find((entry) => entry.provider === "anthropic")?.status).toBe("unconfigured");
  });

  it("aktiviert Auto-Routing ausschliesslich fuer Administratoren", () => {
    expect(shouldAutoRoute("admin")).toBe(true);
    expect(shouldAutoRoute("user")).toBe(false);
    expect(shouldAutoRoute(null)).toBe(false);
  });
});
