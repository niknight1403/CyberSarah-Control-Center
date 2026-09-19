import { describe, expect, it } from "vitest";
import {
  GEMINI_OPENAI_COMPAT_URL,
  MANAGED_LLM_NO_KEY_MESSAGE,
  isFreeManagedSource,
  resolveManagedLlmEndpoint,
  resolveManagedLlmEndpoints,
  type ManagedLlmEnv,
} from "../lib/managed-llm-fallback-logic";

describe("resolveManagedLlmEndpoint (Sprint 108 — Zero-Cost-Prioritaet)", () => {
  it("bevorzugt Groq Free Tier vor allen anderen Keys", () => {
    const env: ManagedLlmEnv = {
      groqApiKey: "gsk-key",
      openrouterApiKey: "sk-or-key",
      geminiApiKey: "gem-key",
      forgeApiKey: "forge-key",
      openaiApiKey: "sk-openai-key",
    };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: "gsk-key",
      source: "groq",
    });
  });

  it("waehlt OpenRouter an zweiter Stelle (inkl. Ranking-Header)", () => {
    const env: ManagedLlmEnv = {
      openrouterApiKey: "sk-or-key",
      geminiApiKey: "gem-key",
      forgeApiKey: "forge-key",
    };
    expect(resolveManagedLlmEndpoint(env)).toMatchObject({
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: "sk-or-key",
      source: "openrouter",
    });
    expect(resolveManagedLlmEndpoint(env)?.headers).toMatchObject({
      "X-Title": "CyberSarah Control Center",
    });
  });

  it("Sprint 85: bevorzugt Gemini vor kostenpflichtigen Endpoints", () => {
    const env: ManagedLlmEnv = {
      geminiApiKey: "gem-key",
      forgeApiKey: "forge-key",
      openaiApiKey: "sk-openai-key",
    };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: GEMINI_OPENAI_COMPAT_URL,
      apiKey: "gem-key",
      source: "gemini",
    });
  });

  it("nutzt Forge, sobald kein Gratis-Key vorliegt (auch wenn OpenAI konfiguriert ist)", () => {
    const env: ManagedLlmEnv = {
      forgeApiUrl: "https://forge.example.com/",
      forgeApiKey: "forge-key",
      openaiApiKey: "openai-key",
    };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: "https://forge.example.com/v1/chat/completions",
      apiKey: "forge-key",
      source: "forge",
    });
  });

  it("faellt ohne Forge-Key automatisch auf OpenAI zurueck (Zero-Config)", () => {
    const env: ManagedLlmEnv = { forgeApiKey: undefined, openaiApiKey: "sk-openai-key" };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-openai-key",
      source: "openai",
    });
  });

  it("respektiert AI_OPENAI_BASE_URL als alternativen OpenAI-Endpoint", () => {
    const env: ManagedLlmEnv = {
      forgeApiKey: "",
      openaiBaseUrl: "https://openai-proxy.example.com/v1",
      openaiApiKey: "proxy-key",
    };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: "https://openai-proxy.example.com/v1",
      apiKey: "proxy-key",
      source: "openai",
    });
  });

  it("respektiert AI_GROQ_BASE_URL als alternativen Groq-Endpoint", () => {
    const env: ManagedLlmEnv = { groqApiKey: "gsk-key", groqBaseUrl: "https://groq-proxy.example.com/openai/v1/chat/completions" };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: "https://groq-proxy.example.com/openai/v1/chat/completions",
      apiKey: "gsk-key",
      source: "groq",
    });
  });

  it("liefert null, wenn gar kein Key konfiguriert ist", () => {
    expect(resolveManagedLlmEndpoint({})).toBeNull();
    expect(resolveManagedLlmEndpoint({ forgeApiKey: "  ", openaiApiKey: "" })).toBeNull();
  });

  it("trimmt Leer-Werte und behandelt Defaults korrekt (Forge ohne URL)", () => {
    const env: ManagedLlmEnv = { forgeApiKey: "forge-key" };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: "https://forge.manus.im/v1/chat/completions",
      apiKey: "forge-key",
      source: "forge",
    });
  });
});

describe("resolveManagedLlmEndpoints (Sprint 108 — Zero-Cost-Garantie)", () => {
  it("liefert STANDARDMAESSIG nur die Gratis-Kette: Groq > OpenRouter > Gemini", () => {
    const env: ManagedLlmEnv = {
      groqApiKey: "gsk-key",
      openrouterApiKey: "sk-or-key",
      geminiApiKey: "gem-key",
      forgeApiKey: "forge-key",
      openaiApiKey: "sk-openai-key",
    };
    const chain = resolveManagedLlmEndpoints(env);
    expect(chain.map((e) => e.source)).toEqual(["groq", "openrouter", "gemini"]);
    expect(chain.every((e) => isFreeManagedSource(e.source))).toBe(true);
  });

  it("haengt kostenpflichtige Endpoints NICHT als Standard-Fallback an", () => {
    const env: ManagedLlmEnv = {
      geminiApiKey: "gem-key",
      forgeApiKey: "forge-key",
      openaiApiKey: "sk-openai-key",
    };
    expect(resolveManagedLlmEndpoints(env).map((e) => e.source)).toEqual(["gemini"]);
  });

  it("greift bei explizitem Admin-Override (allowPaidFallback) auf die Paid-Kette zu", () => {
    const env: ManagedLlmEnv = {
      groqApiKey: "gsk-key",
      geminiApiKey: "gem-key",
      forgeApiKey: "forge-key",
      openaiApiKey: "sk-openai-key",
      allowPaidFallback: true,
    };
    expect(resolveManagedLlmEndpoints(env).map((e) => e.source)).toEqual([
      "groq",
      "gemini",
      "forge",
      "openai",
    ]);
  });

  it("Not-Fallback: ohne jeden Gratis-Key bleibt die Zero-Config-Kette erhalten", () => {
    const env: ManagedLlmEnv = { forgeApiKey: "forge-key", openaiApiKey: "sk-openai-key" };
    expect(resolveManagedLlmEndpoints(env).map((e) => e.source)).toEqual(["forge", "openai"]);
  });

  it("laesst unkonfigurierte Stufen einfach aus", () => {
    expect(resolveManagedLlmEndpoints({ geminiApiKey: "gem-key" }).map((e) => e.source)).toEqual([
      "gemini",
    ]);
    expect(resolveManagedLlmEndpoints({ groqApiKey: "gsk-key" }).map((e) => e.source)).toEqual([
      "groq",
    ]);
    expect(resolveManagedLlmEndpoints({})).toEqual([]);
  });
});

describe("isFreeManagedSource (Sprint 108)", () => {
  it("klassifiziert genau die Gratis-Tier-Sources als frei", () => {
    expect(isFreeManagedSource("groq")).toBe(true);
    expect(isFreeManagedSource("openrouter")).toBe(true);
    expect(isFreeManagedSource("gemini")).toBe(true);
    expect(isFreeManagedSource("forge")).toBe(false);
    expect(isFreeManagedSource("openai")).toBe(false);
  });
});

describe("MANAGED_LLM_NO_KEY_MESSAGE", () => {
  it("nennt die erwarteten Konfigurationswege", () => {
    expect(MANAGED_LLM_NO_KEY_MESSAGE).toContain("OPENAI_API_KEY");
    expect(MANAGED_LLM_NO_KEY_MESSAGE).toContain("Groq");
    expect(MANAGED_LLM_NO_KEY_MESSAGE).toContain("OpenRouter");
  });
});

describe("resolveManagedLlmEndpoint (Sprint 194 — Custom-Dev-Route)", () => {
  it("bevorzugt den Custom-Endpoint vor allen Cloud-Keys (Admin-Entscheidung)", () => {
    const env: ManagedLlmEnv = {
      customApiKey: "cus-key",
      customBaseUrl: "https://free-llm.example.com/v1",
      groqApiKey: "gsk-key",
      openaiApiKey: "sk-openai-key",
    };
    expect(resolveManagedLlmEndpoint(env)).toEqual({
      url: "https://free-llm.example.com/v1/chat/completions",
      apiKey: "cus-key",
      source: "custom",
    });
  });

  it("normalisiert trailing slashes in der Custom-Base-URL", () => {
    const env: ManagedLlmEnv = { customApiKey: "cus-key", customBaseUrl: "https://free-llm.example.com/v1///" };
    expect(resolveManagedLlmEndpoint(env)?.url).toBe("https://free-llm.example.com/v1/chat/completions");
  });

  it("ignoriert Custom-Key ohne Base-URL (halbkonfiguriert = unkonfiguriert)", () => {
    expect(resolveManagedLlmEndpoint({ customApiKey: "cus-key", groqApiKey: "gsk-key" })?.source).toBe("groq");
  });
});

describe("resolveManagedLlmEndpoints (Sprint 194 — Custom-Dev-Route)", () => {
  it("leitet die Gratis-Kette mit Custom: Custom > Groq > OpenRouter > Gemini", () => {
    const env: ManagedLlmEnv = {
      customApiKey: "cus-key",
      customBaseUrl: "https://free-llm.example.com/v1",
      groqApiKey: "gsk-key",
      openrouterApiKey: "sk-or-key",
      geminiApiKey: "gem-key",
      forgeApiKey: "forge-key",
      openaiApiKey: "sk-openai-key",
    };
    const chain = resolveManagedLlmEndpoints(env);
    expect(chain.map((e) => e.source)).toEqual(["custom", "groq", "openrouter", "gemini"]);
    expect(chain.every((e) => isFreeManagedSource(e.source))).toBe(true);
  });

  it("liefert Custom allein, wenn keine weiteren Gratis-Keys existieren", () => {
    const env: ManagedLlmEnv = {
      customApiKey: "cus-key",
      customBaseUrl: "https://free-llm.example.com/v1",
      forgeApiKey: "forge-key",
      openaiApiKey: "sk-openai-key",
    };
    expect(resolveManagedLlmEndpoints(env).map((e) => e.source)).toEqual(["custom"]);
  });

  it("list Custom in der No-Key-Fehlermeldung", () => {
    expect(MANAGED_LLM_NO_KEY_MESSAGE).toContain("Custom");
  });
});
