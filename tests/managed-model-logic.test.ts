import { describe, expect, it } from "vitest";

import { resolveManagedModel } from "../lib/managed-model-logic";

describe("resolveManagedModel (Sprint 85)", () => {
  it("bevorzugt das explizit angeforderte Modell unabhaengig vom Endpoint", () => {
    expect(resolveManagedModel(" gpt-4.1 ", "openai", {})).toBe("gpt-4.1");
    expect(resolveManagedModel("gemini-custom", "gemini", {})).toBe("gemini-custom");
  });

  it("nutzt fuer Gemini-Endpoints ein Gemini-Default-Modell", () => {
    expect(resolveManagedModel(undefined, "gemini", {})).toBe("gemini-flash-latest");
    expect(resolveManagedModel(undefined, "gemini", { AI_GEMINI_MODEL: "gemini-2.5-pro" })).toBe("gemini-2.5-pro");
  });

  it("nutzt fuer Forge/OpenAI-Endpoints die ENV-Kette und gpt-4o-mini als Default", () => {
    expect(resolveManagedModel(undefined, "openai", { AI_MANAGED_MODEL: "managed-a" })).toBe("managed-a");
    expect(
      resolveManagedModel(undefined, "openai", {
        AI_MANAGED_MODEL: "managed-a",
        OPENAI_MODEL: "openai-b",
        AI_OPENAI_MODEL: "ai-openai-c",
      }),
    ).toBe("managed-a");
    expect(
      resolveManagedModel(undefined, "forge", {
        OPENAI_MODEL: "openai-b",
        AI_OPENAI_MODEL: "ai-openai-c",
      }),
    ).toBe("openai-b");
  });

  it("Sprint 108: nutzt fuer Groq-Endpoints das aktive Default-Modell (kein Enterprise-Gate)", () => {
    expect(resolveManagedModel(undefined, "groq", {})).toBe("openai/gpt-oss-20b");
    expect(resolveManagedModel(undefined, "groq", { AI_GROQ_MODEL: "openai/gpt-oss-120b" })).toBe("openai/gpt-oss-120b");
  });

  it("Sprint 108: nutzt fuer OpenRouter-Endpoints ein Free-Tier-Modell", () => {
    expect(resolveManagedModel(undefined, "openrouter", {})).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(
      resolveManagedModel(undefined, "openrouter", { AI_OPENROUTER_MODEL: "google/gemma-3-27b-it:free" }),
    ).toBe("google/gemma-3-27b-it:free");
  });

  it("liefert gpt-4o-mini, wenn weder Anforderung noch ENV ein Modell liefern", () => {
    expect(resolveManagedModel(undefined, "openai", {})).toBe("gpt-4o-mini");
    expect(resolveManagedModel("   ", "forge", { AI_MANAGED_MODEL: "   " })).toBe("gpt-4o-mini");
  });
});
