import { describe, expect, it } from "vitest";
import {
  PROVIDER_PRICES,
  TEMPLATE_AGENTS,
  aggregateUsage,
  buildPaymentRequiredPayload,
  estimateCostEur,
  estimatePromptTokens,
  missingTemplateAgents,
  resolveUsageProvider,
} from "../lib/usage-metering-logic";

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const DAY = 86_400_000;

function row(overrides: Partial<Parameters<typeof aggregateUsage>[0][number]> = {}) {
  return {
    agentId: "agent-1",
    provider: "groq",
    model: "llama-3.3-70b",
    status: "ok" as const,
    promptTokens: 1000,
    completionTokens: 500,
    costEur: 0.0001,
    durationMs: 400,
    createdAt: NOW - DAY,
    ...overrides,
  };
}

describe("estimatePromptTokens", () => {
  it("rechnet 4 Zeichen als ein Token", () => {
    expect(estimatePromptTokens("abcd")).toBe(1);
    expect(estimatePromptTokens("a".repeat(400))).toBe(100);
  });

  it("gibt für leeren Text 0 statt einer Scheinzahl", () => {
    expect(estimatePromptTokens("")).toBe(0);
    expect(estimatePromptTokens("   ")).toBe(0);
  });
});

describe("estimateCostEur", () => {
  it("rechnet Eingabe und Ausgabe getrennt", () => {
    const million = estimateCostEur({ provider: "groq", promptTokens: 1_000_000, completionTokens: 0 });
    expect(million).toBeCloseTo(PROVIDER_PRICES.groq.inputEurPerMillion, 4);
  });

  it("kostet lokal nichts", () => {
    expect(estimateCostEur({ provider: "ollama", promptTokens: 900_000, completionTokens: 100_000 })).toBe(0);
  });

  it("liefert null ohne Messwerte statt 0", () => {
    expect(estimateCostEur({ provider: "groq", promptTokens: null, completionTokens: null })).toBeNull();
  });

  it("nimmt unbekannte Provider konservativ an", () => {
    const unknown = estimateCostEur({ provider: "unknown", promptTokens: 1_000_000, completionTokens: 1_000_000 });
    const priced = (PROVIDER_PRICES.unknown.inputEurPerMillion + PROVIDER_PRICES.unknown.outputEurPerMillion);
    expect(unknown).toBeCloseTo(priced, 4);
  });
});

describe("aggregateUsage", () => {
  it("zählt Läufe, Tokens, Kosten und Erfolgsquote", () => {
    const summary = aggregateUsage(
      [row(), row({ status: "error", durationMs: 100 }), row({ status: "blocked", promptTokens: 0, completionTokens: 0, costEur: 0 })],
      { now: NOW, windowDays: 30 },
    );
    expect(summary.runs).toBe(3);
    expect(summary.okRuns).toBe(1);
    expect(summary.errorRuns).toBe(1);
    expect(summary.blockedRuns).toBe(1);
    expect(summary.successRatePct).toBeCloseTo(33.3, 1);
    expect(summary.tokens.prompt).toBe(2000);
    expect(summary.tokens.completion).toBe(1000);
    expect(summary.tokens.total).toBe(3000);
    expect(summary.costEur).toBeCloseTo(0.0002, 4);
  });

  it("gibt bei null Läufen keine erfundenen Kennzahlen aus", () => {
    const summary = aggregateUsage([], { now: NOW, windowDays: 7 });
    expect(summary.runs).toBe(0);
    expect(summary.successRatePct).toBeNull();
    expect(summary.costPerRunEur).toBeNull();
    expect(summary.avgDurationMs).toBeNull();
    expect(summary.p95DurationMs).toBeNull();
    expect(summary.roi.costEurPerMonth).toBeNull();
    expect(summary.roi.valueEurPerMonth).toBeNull();
    expect(summary.daily).toHaveLength(7);
  });

  it("ignoriert Läufe außerhalb des Zeitfensters", () => {
    const summary = aggregateUsage([row({ createdAt: NOW - 40 * DAY })], { now: NOW, windowDays: 30 });
    expect(summary.runs).toBe(0);
  });

  it("bildet eine vollständige Tagesreihe und ordnet die Läufe zu", () => {
    const summary = aggregateUsage([row(), row({ createdAt: NOW })], { now: NOW, windowDays: 3 });
    expect(summary.daily.map((day) => day.runs)).toEqual([0, 1, 1]);
    const firstDay = summary.daily[0];
    const lastDay = summary.daily[summary.daily.length - 1];
    expect(firstDay.date < lastDay.date).toBe(true);
  });

  it("gruppiert nach Provider und Agent, Provider absteigend", () => {
    const summary = aggregateUsage(
      [row(), row(), row({ provider: "openrouter", costEur: 0.002 })],
      { now: NOW, windowDays: 30 },
    );
    expect(summary.byProvider[0]).toMatchObject({ provider: "groq", runs: 2 });
    expect(summary.byProvider[1]).toMatchObject({ provider: "openrouter", runs: 1 });
    expect(summary.byAgent[0]).toMatchObject({ agentId: "agent-1", runs: 3 });
  });

  it("rechnet die ROI-Sicht nur mit bekanntem Planpreis", () => {
    const withPlan = aggregateUsage([row(), row()], { now: NOW, windowDays: 30, planValueEurPerMonth: 29.99 });
    expect(withPlan.roi.valueEurPerMonth).toBe(29.99);
    expect(withPlan.roi.costEurPerMonth).toBeCloseTo(0.0002, 4);

    const withoutPlan = aggregateUsage([row()], { now: NOW, windowDays: 30 });
    expect(withoutPlan.roi.valueEurPerMonth).toBeNull();
    expect(withoutPlan.roi.note).toContain("Kein Planpreis");
  });

  it("berechnet das 95-Prozent-Perzentil über die Dauern", () => {
    const rows = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((durationMs, index) =>
      row({ durationMs, createdAt: NOW - index * 1000 }),
    );
    const summary = aggregateUsage(rows, { now: NOW, windowDays: 30 });
    expect(summary.avgDurationMs).toBe(550);
    expect(summary.p95DurationMs).toBe(1000);
  });

  it("begrenzt das Zeitfenster auf sinnvolle Werte", () => {
    expect(aggregateUsage([], { now: NOW, windowDays: 0 }).windowDays).toBe(1);
    expect(aggregateUsage([], { now: NOW, windowDays: 9999 }).windowDays).toBe(365);
  });
});

describe("buildPaymentRequiredPayload", () => {
  it("nennt Guthaben, Pakete und Upgrade-Ziel", () => {
    const payload = buildPaymentRequiredPayload({
      plan: "free",
      reason: "Guthaben reicht für diesen Lauf nicht.",
      requiredTokens: 1500,
      remainingTokens: 200,
      checkoutUrl: "https://app.example/api/billing/stripe/checkout",
      creditPacks: [{ id: "credits_small", label: "50.000 Cloud-Tokens", tokens: 50_000, priceEur: 4.99 }],
      upgradePlan: "pro",
    });
    expect(payload.code).toBe("payment_required");
    expect(payload.usage.requiredTokens).toBe(1500);
    expect(payload.usage.remainingTokens).toBe(200);
    expect(payload.options.checkoutUrl).toContain("/api/billing/stripe/checkout");
    expect(payload.options.creditPacks[0].tokens).toBe(50_000);
    expect(payload.options.upgradePlan).toBe("pro");
  });

  it("sagt offen, wenn das Guthaben unbekannt ist", () => {
    const payload = buildPaymentRequiredPayload({
      plan: "free",
      reason: "Guthaben derzeit nicht prüfbar.",
      requiredTokens: 10,
      remainingTokens: null,
      checkoutUrl: "https://app.example/x",
      creditPacks: [],
    });
    expect(payload.usage.remainingTokens).toBeNull();
    expect(payload.hint).toContain("unbekannt");
  });

  it("rundet negativ gemeldetes Guthaben auf 0", () => {
    const payload = buildPaymentRequiredPayload({
      plan: "free",
      reason: "leer",
      requiredTokens: 10,
      remainingTokens: -50,
      checkoutUrl: "https://app.example/x",
      creditPacks: [],
    });
    expect(payload.usage.remainingTokens).toBe(0);
  });
});

describe("missingTemplateAgents", () => {
  it("liefert alle drei Vorlagen bei leerem Bestand", () => {
    expect(missingTemplateAgents([])).toHaveLength(3);
  });

  it("erkennt vorhandene Vorlagen unabhängig von Groß-/Kleinschreibung", () => {
    const missing = missingTemplateAgents([TEMPLATE_AGENTS[0].name.toUpperCase(), "  Lead-Gen-Agent  "]);
    expect(missing.map((agent) => agent.key)).not.toContain("lead-gen");
    expect(missing).toHaveLength(2);
  });

  it("liefert nichts, wenn alle Vorlagen vorhanden sind", () => {
    expect(missingTemplateAgents(TEMPLATE_AGENTS.map((agent) => agent.name))).toHaveLength(0);
  });

  it("jede Vorlage hat einen Arbeitsauftrag", () => {
    for (const template of TEMPLATE_AGENTS) {
      expect(template.prompt.length).toBeGreaterThan(60);
      expect(template.purpose.length).toBeGreaterThan(20);
    }
  });
});

describe("resolveUsageProvider", () => {
  it("ordnet Router-Präfixe dem Aggregator zu, auch bei Familien-Teilstrings", () => {
    expect(resolveUsageProvider("openrouter/meta-llama/llama-3.1-70b")).toBe("openrouter");
    expect(resolveUsageProvider("openrouter/anthropic/claude-3.5-sonnet")).toBe("openrouter");
  });

  it("bucht Llama-Modelle einheitlich als groq", () => {
    // Der eigentliche Fix: zuvor galt llama-3.3-70b beim Reservieren als groq,
    // beim Messen aber als unknown (teuerster Satz).
    expect(resolveUsageProvider("llama-3.3-70b")).toBe("groq");
    expect(resolveUsageProvider("meta-llama/llama-3.3-70b-versatile")).toBe("groq");
    expect(resolveUsageProvider("groq/llama-3.3-70b")).toBe("groq");
  });

  it("erkennt Gemini und Google sowie lokale Modelle", () => {
    expect(resolveUsageProvider("gemini-2.0-flash")).toBe("gemini");
    expect(resolveUsageProvider("google/gemini-pro")).toBe("gemini");
    expect(resolveUsageProvider("ollama/qwen2.5:14b")).toBe("ollama");
    expect(resolveUsageProvider("local-mixtral")).toBe("ollama");
  });

  it("behandelt Pfadformen ohne bekannten Anbieter als Aggregator", () => {
    expect(resolveUsageProvider("anthropic/claude-3.5-sonnet")).toBe("openrouter");
    expect(resolveUsageProvider("mistralai/mistral-large")).toBe("openrouter");
  });

  it("fällt bei fehlender oder unklarer Angabe konservativ auf unknown zurück", () => {
    expect(resolveUsageProvider(undefined)).toBe("unknown");
    expect(resolveUsageProvider(null)).toBe("unknown");
    expect(resolveUsageProvider("")).toBe("unknown");
    expect(resolveUsageProvider("   ")).toBe("unknown");
    expect(resolveUsageProvider("gpt-4o-mini")).toBe("unknown");
  });

  it("normalisiert Schreibweise und Leerraum", () => {
    expect(resolveUsageProvider("  GROQ/Llama-3.3-70B  ")).toBe("groq");
    expect(resolveUsageProvider("Gemini-2.0-Flash")).toBe("gemini");
  });

  it("liefert für jeden Provider einen Preis aus der Tabelle", () => {
    for (const provider of ["groq", "openrouter", "gemini", "ollama", "unknown"] as const) {
      expect(PROVIDER_PRICES[provider]).toBeDefined();
    }
    expect(resolveUsageProvider("ollama/llama3")).toBe("ollama");
    expect(PROVIDER_PRICES[resolveUsageProvider("ollama/llama3")].inputEurPerMillion).toBe(0);
  });
});
