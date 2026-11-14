import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_TOKENS,
  MAX_MAX_TOKENS,
  MAX_PROMPT_CHARS,
  MIN_MAX_TOKENS,
  computeEstimatedTokens,
  isBillableProvider,
  readRequestMessages,
  resolveAgentId,
  resolveMaxTokens,
  resolveRequestedModel,
} from "../lib/api-v1-request-logic";

/**
 * Tests fuer die Anfrage-Normalisierung der oeffentlichen v1-API.
 *
 * Diese Funktionen entscheiden ueber Geld und Sicherheit: sie bestimmen den
 * Prompt, das Antwortbudget und damit den reservierten Token-Betrag einer
 * Route, die fremdes Guthaben abbucht. Fehler hier sind entweder teuer
 * (unbemerkt zu hohe Reservierung) oder ein Sicherheitsloch (Rollen-/
 * Laengen-Grenzen umgangen).
 */

describe("readRequestMessages — messages-Array", () => {
  it("uebernimmt gueltige Nachrichten mit Rolle und Inhalt", () => {
    const result = readRequestMessages({
      messages: [
        { role: "system", content: "du bist knapp" },
        { role: "user", content: "hallo" },
        { role: "assistant", content: "hi" },
      ],
    });
    expect(result).toEqual([
      { role: "system", content: "du bist knapp" },
      { role: "user", content: "hallo" },
      { role: "assistant", content: "hi" },
    ]);
  });

  it("setzt unbekannte oder fehlende Rollen auf 'user' (kein system-Einschmuggel)", () => {
    const result = readRequestMessages({
      messages: [
        { role: "root", content: "a" },
        { content: "b" },
        { role: 42, content: "c" },
        { role: "tool", content: "d" },
        { role: "function", content: "e" },
      ],
    });
    expect(result?.map((message) => message.role)).toEqual(["user", "user", "user", "user", "user"]);
  });

  it("verwirft leere, nicht-string und nicht-objekt Eintraege", () => {
    const result = readRequestMessages({
      messages: [
        { role: "user", content: "  " },
        { role: "user", content: "" },
        { role: "user" },
        null,
        undefined,
        "nur ein string",
        7,
        { role: "user", content: "bleibt" },
      ],
    });
    expect(result).toEqual([{ role: "user", content: "bleibt" }]);
  });

  it("wandelt Nicht-String-Inhalte in Text um, statt sie zu verwerfen", () => {
    const result = readRequestMessages({ messages: [{ role: "user", content: 1234 }] });
    expect(result).toEqual([{ role: "user", content: "1234" }]);
  });

  it("kuerzt Inhalte auf MAX_PROMPT_CHARS", () => {
    const result = readRequestMessages({ messages: [{ role: "user", content: "x".repeat(MAX_PROMPT_CHARS + 500) }] });
    expect(result?.[0].content).toHaveLength(MAX_PROMPT_CHARS);
  });

  it("liefert null, wenn nach dem Filtern nichts uebrig bleibt", () => {
    expect(readRequestMessages({ messages: [] })).toBeNull();
    expect(readRequestMessages({ messages: [{ role: "user", content: "   " }] })).toBeNull();
    expect(readRequestMessages({ messages: "kein array" })).toBeNull();
  });
});

describe("readRequestMessages — prompt/system-Kurzform", () => {
  it("baut aus prompt eine user-Nachricht", () => {
    expect(readRequestMessages({ prompt: "erklaere das" })).toEqual([
      { role: "user", content: "erklaere das" },
    ]);
  });

  it("stellt system voran, wenn gesetzt", () => {
    expect(readRequestMessages({ prompt: "frage", system: "regeln" })).toEqual([
      { role: "system", content: "regeln" },
      { role: "user", content: "frage" },
    ]);
  });

  it("ignoriert leeres system", () => {
    expect(readRequestMessages({ prompt: "frage", system: "   " })).toEqual([
      { role: "user", content: "frage" },
    ]);
  });

  it("kuerzt prompt und system auf MAX_PROMPT_CHARS", () => {
    const result = readRequestMessages({
      prompt: "p".repeat(MAX_PROMPT_CHARS + 10),
      system: "s".repeat(MAX_PROMPT_CHARS + 10),
    });
    expect(result?.[0].content).toHaveLength(MAX_PROMPT_CHARS);
    expect(result?.[1].content).toHaveLength(MAX_PROMPT_CHARS);
  });

  it("liefert null ohne verwertbaren Text oder bei falschem Typ", () => {
    expect(readRequestMessages({ prompt: "   " })).toBeNull();
    expect(readRequestMessages({ prompt: 42 })).toBeNull();
    expect(readRequestMessages({})).toBeNull();
    expect(readRequestMessages(null)).toBeNull();
    expect(readRequestMessages(undefined)).toBeNull();
    expect(readRequestMessages("text")).toBeNull();
  });

  it("bevorzugt messages gegenueber prompt, wenn beide gesetzt sind", () => {
    const result = readRequestMessages({
      messages: [{ role: "user", content: "aus messages" }],
      prompt: "aus prompt",
    });
    expect(result).toEqual([{ role: "user", content: "aus messages" }]);
  });
});

describe("resolveMaxTokens", () => {
  it("nimmt ein plausibles Budget unveraendert", () => {
    expect(resolveMaxTokens(1200)).toBe(1200);
    expect(resolveMaxTokens("256")).toBe(256);
  });

  it("begrenzt nach unten und oben", () => {
    expect(resolveMaxTokens(1)).toBe(MIN_MAX_TOKENS);
    expect(resolveMaxTokens(-500)).toBe(MIN_MAX_TOKENS);
    expect(resolveMaxTokens(0)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(999_999)).toBe(MAX_MAX_TOKENS);
  });

  it("faellt bei fehlenden oder nicht-numerischen Werten auf den Default", () => {
    expect(resolveMaxTokens(undefined)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(null)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens("viele")).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(NaN)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(Infinity)).toBe(DEFAULT_MAX_TOKENS);
  });

  it("schneidet Nachkommastellen ab", () => {
    expect(resolveMaxTokens(500.9)).toBe(500);
  });
});

describe("resolveRequestedModel / resolveAgentId", () => {
  it("trimmt den Modellnamen und ignoriert Nicht-Strings", () => {
    expect(resolveRequestedModel("  groq/llama-3  ")).toBe("groq/llama-3");
    expect(resolveRequestedModel(undefined)).toBe("");
    expect(resolveRequestedModel(42)).toBe("");
    expect(resolveRequestedModel("   ")).toBe("");
  });

  it("liefert die Agenten-ID nur als String, sonst null", () => {
    expect(resolveAgentId("agent-7")).toBe("agent-7");
    expect(resolveAgentId("")).toBe("");
    expect(resolveAgentId(7)).toBeNull();
    expect(resolveAgentId(undefined)).toBeNull();
  });
});

describe("computeEstimatedTokens", () => {
  const estimator = (text: string) => Math.ceil(text.length / 4);

  it("summiert Prompt-Token und Antwortbudget", () => {
    const result = computeEstimatedTokens({
      messages: [
        { role: "system", content: "1234" },
        { role: "user", content: "12345678" },
      ],
      maxTokens: 100,
      estimatePromptTokens: estimator,
    });
    expect(result).toEqual({ promptTokens: 3, estimatedTokens: 103 });
  });

  it("reserviert auch ohne Prompt-Text das Antwortbudget", () => {
    expect(
      computeEstimatedTokens({ messages: [], maxTokens: 900, estimatePromptTokens: estimator }),
    ).toEqual({ promptTokens: 0, estimatedTokens: 900 });
  });
});

describe("isBillableProvider", () => {
  it("rechnet lokale Provider nicht ab", () => {
    expect(isBillableProvider("ollama")).toBe(false);
  });

  it("rechnet alle anderen Provider ab, auch unbekannte Modelle", () => {
    expect(isBillableProvider("groq")).toBe(true);
    expect(isBillableProvider("openrouter")).toBe(true);
    expect(isBillableProvider("gemini")).toBe(true);
    expect(isBillableProvider("unknown")).toBe(true);
  });
});
