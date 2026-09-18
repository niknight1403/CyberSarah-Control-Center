import { describe, expect, it } from "vitest";

import { diagnoseLlmPoolFailure, isAuthLikeAttempt } from "../lib/llm-failure-diagnostics";

/**
 * Sprint 153 — Regressionstest: verstaendliche Fehlermeldung, wenn alle
 * LLM-Provider-Keys ungueltig/erschöpft sind (statt kryptischem Roh-Fehler).
 */
describe("isAuthLikeAttempt", () => {
  it("erkennt Auth-Status-Codes", () => {
    expect(isAuthLikeAttempt({ source: "openai", httpStatus: 401, message: "" })).toBe(true);
    expect(isAuthLikeAttempt({ source: "openai", httpStatus: 402, message: "" })).toBe(true);
    expect(isAuthLikeAttempt({ source: "gemini", httpStatus: 403, message: "" })).toBe(true);
  });

  it("erkennt typische Anbieter-Meldungen ungueltiger Keys", () => {
    expect(
      isAuthLikeAttempt({ source: "gemini", httpStatus: 400, message: "API key not valid. Please pass a valid API key." }),
    ).toBe(true);
    expect(
      isAuthLikeAttempt({ source: "openai", httpStatus: 400, message: "Incorrect API key provided: sk-proj-…" }),
    ).toBe(true);
    expect(isAuthLikeAttempt({ source: "openai", httpStatus: 429, message: "You exceeded your current quota" })).toBe(true);
  });

  it("bewertet andere Fehler als NICHT auth-typisch", () => {
    expect(isAuthLikeAttempt({ source: "gemini", httpStatus: 500, message: "internal error" })).toBe(false);
    expect(isAuthLikeAttempt({ source: "groq", httpStatus: 504, message: "gateway timeout" })).toBe(false);
  });
});

describe("diagnoseLlmPoolFailure", () => {
  it("liefert Handlungsanweisung, wenn ALLE Versuche Auth-Fehler sind", () => {
    const result = diagnoseLlmPoolFailure([
      { source: "gemini", httpStatus: 400, message: "API key not valid. Please pass a valid API key." },
      { source: "openai", httpStatus: 401, message: "Incorrect API key provided: sk-proj-…" },
    ]);
    expect(result.allAuthLike).toBe(true);
    expect(result.actionableMessage).toContain("kein gueltiger API-Key");
    expect(result.actionableMessage).toContain("gemini, openai");
    expect(result.actionableMessage).toContain("AI_GEMINI_API_KEY");
  });

  it("liefert KEINE Anweisung, wenn mindestens ein Versuch andersartig scheiterte", () => {
    const result = diagnoseLlmPoolFailure([
      { source: "gemini", httpStatus: 400, message: "API key not valid. Please pass a valid API key." },
      { source: "openai", httpStatus: 500, message: "internal server error" },
    ]);
    expect(result.allAuthLike).toBe(false);
    expect(result.actionableMessage).toBeNull();
  });

  it("liefert KEINE Anweisung bei leerer Versuchsliste", () => {
    expect(diagnoseLlmPoolFailure([]).allAuthLike).toBe(false);
  });
});
