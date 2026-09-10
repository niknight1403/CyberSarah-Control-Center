import { describe, expect, it } from "vitest";
import {
  MANAGED_LLM_NO_KEY_MESSAGE,
  resolveManagedLlmEndpoint,
  type ManagedLlmEnv,
} from "../lib/managed-llm-fallback-logic";

describe("resolveManagedLlmEndpoint", () => {
  it("nutzt Forge, sobald ein Forge-Key vorliegt (auch wenn OpenAI konfiguriert ist)", () => {
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

describe("MANAGED_LLM_NO_KEY_MESSAGE", () => {
  it("nennt beide erwarteten Konfigurationswege", () => {
    expect(MANAGED_LLM_NO_KEY_MESSAGE).toContain("OPENAI_API_KEY");
  });
});
