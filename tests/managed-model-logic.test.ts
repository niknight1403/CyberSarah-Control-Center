import { describe, expect, it } from "vitest";

import {
  GROQ_MODEL_CANDIDATES,
  OPENROUTER_FREE_MODEL_CANDIDATES,
  resolveManagedModel,
  resolveManagedModelCandidates,
} from "../lib/managed-model-logic";

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

  it("Sprint 108/385: nutzt fuer OpenRouter-Endpoints ein live verifiziertes Free-Tier-Modell", () => {
    // Sprint 385: das alte Default (llama-3.3-70b-instruct:free) wurde von
    // OpenRouter zurueckgezogen; erster Kandidat ist die neue Nummer eins.
    expect(resolveManagedModel(undefined, "openrouter", {})).toBe(OPENROUTER_FREE_MODEL_CANDIDATES[0]);
    expect(OPENROUTER_FREE_MODEL_CANDIDATES).not.toContain("meta-llama/llama-3.3-70b-instruct:free");
    expect(
      resolveManagedModel(undefined, "openrouter", { AI_OPENROUTER_MODEL: "google/gemma-3-27b-it:free" }),
    ).toBe("google/gemma-3-27b-it:free");
  });

  it("Sprint 385: liefert geordnete Modell-Kandidaten je Source (ENV-Override fuehrt solo)", () => {
    expect(resolveManagedModelCandidates("openrouter", {})).toEqual([...OPENROUTER_FREE_MODEL_CANDIDATES]);
    expect(resolveManagedModelCandidates("openrouter", { AI_OPENROUTER_MODEL: "x:free" })).toEqual(["x:free"]);
    expect(resolveManagedModelCandidates("groq", {})).toEqual([...GROQ_MODEL_CANDIDATES]);
    expect(resolveManagedModelCandidates("groq", { AI_GROQ_MODEL: "groq-custom" })).toEqual(["groq-custom"]);
    expect(resolveManagedModelCandidates("gemini", {})).toEqual(["gemini-flash-latest"]);
    expect(resolveManagedModelCandidates("gemini", { AI_GEMINI_MODEL: "gemini-2.5-pro" })).toEqual(["gemini-2.5-pro"]);
    expect(resolveManagedModelCandidates("openai", { AI_MANAGED_MODEL: "managed-a" })).toEqual(["managed-a"]);
    expect(resolveManagedModelCandidates("openai", {})).toEqual(["gpt-4o-mini"]);
  });

  it("liefert gpt-4o-mini, wenn weder Anforderung noch ENV ein Modell liefern", () => {
    expect(resolveManagedModel(undefined, "openai", {})).toBe("gpt-4o-mini");
    expect(resolveManagedModel("   ", "forge", { AI_MANAGED_MODEL: "   " })).toBe("gpt-4o-mini");
  });
});

describe("resolveManagedModel (Sprint 194 — Custom-Route)", () => {
  it("loest das Modell fuer den Custom-Endpoint aus AI_CUSTOM_MODEL", () => {
    expect(resolveManagedModel(undefined, "custom", { AI_CUSTOM_MODEL: "my-free-model" })).toBe("my-free-model");
  });

  it("verwendet einen explizit angeforderten Modellnamen zuerst", () => {
    expect(resolveManagedModel("requested", "custom", { AI_CUSTOM_MODEL: "my-free-model" })).toBe("requested");
  });

  it("faellt ohne AI_CUSTOM_MODEL auf die Managed/OpenAI-Defaults zurueck", () => {
    expect(resolveManagedModel(undefined, "custom", { OPENAI_MODEL: "fallback-model" })).toBe("fallback-model");
  });
});
