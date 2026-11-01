import { describe, expect, it } from "vitest";

import { describeLlmError } from "@/lib/llm-error-logic";

describe("describeLlmError", () => {
  it("Der Fall aus dem Screenshot: OpenAI credit_balance_exhausted -> klare Guthaben-Meldung", () => {
    const raw = `LLM-API HTTP 429: {"error":{"message":"You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.","type":"insufficient_quota","param":null,"code":"credit_balance_exhausted"}}`;
    const result = describeLlmError(raw);
    expect(result).toContain("Guthaben");
    expect(result).not.toContain("credit_balance_exhausted");
    expect(result).not.toContain("insufficient_quota");
  });

  it("erkennt Rate-Limit/429 auch ohne Quota-Wortlaut", () => {
    expect(describeLlmError("LLM-API HTTP 429: Too Many Requests")).toContain("Guthaben");
  });

  it("erkennt fehlende Provider-Konfiguration", () => {
    expect(describeLlmError("OPENAI_API_KEY is not configured (weder Groq-, OpenRouter-...)")).toContain("noch kein LLM-Provider konfiguriert");
    expect(describeLlmError("Kein LLM konfiguriert: weder OPENAI_API_KEY noch OLLAMA_BASE_URL gesetzt.")).toContain("noch kein LLM-Provider konfiguriert");
  });

  it("laesst unbekannte Fehler durch (gekürzt), ohne zu erfinden", () => {
    expect(describeLlmError("Netzwerk-Timeout nach 60s")).toBe("Netzwerk-Timeout nach 60s");
    const long = "x".repeat(500);
    expect(describeLlmError(long)).toHaveLength(401);
    expect(describeLlmError(long).endsWith("…")).toBe(true);
  });

  it("null/undefined/leer -> 'Unbekannter Fehler.'", () => {
    expect(describeLlmError(null)).toBe("Unbekannter Fehler.");
    expect(describeLlmError(undefined)).toBe("Unbekannter Fehler.");
    expect(describeLlmError("   ")).toBe("Unbekannter Fehler.");
  });
});
