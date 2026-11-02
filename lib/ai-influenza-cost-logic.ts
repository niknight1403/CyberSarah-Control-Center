/**
 * AI Influenza Team — Kostenmessung je Auftrag (Sprint 2).
 *
 * Zweck: Deckungsbeitrag pro Kunde ist nur rechenbar, wenn der Verbrauch des
 * LLM-Aufrufs in Cent umgerechnet wird. Vorher erfasste ein Admin Kosten
 * manuell; diese Datei macht aus dem `usage`-Block des LLM-Antwortobjekts einen
 * Betrag.
 *
 * Wahrheitsregel: Preise sind hinterlegte Annahmen, keine Live-Tarife. Ist das
 * Modell unbekannt, liefert die Funktion `null` statt einer geschaetzten Zahl.
 * Dann wird bewusst KEINE Kostenzeile geschrieben, sondern der Grund im
 * Task-Ergebnis vermerkt.
 */

export type AiInfluenzaTokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
};

export type AiInfluenzaModelPrice = {
  /** Match auf Modell-ID (Teilstring, klein geschrieben). */
  match: string;
  /** Cent pro 1 Mio. Eingabe-Token. */
  inputCentsPerMillion: number;
  /** Cent pro 1 Mio. Ausgabe-Token. */
  outputCentsPerMillion: number;
  /** Quelle/Stand der Annahme. */
  assumption: string;
};

/**
 * Preisannahmen. Bewusst konservativ und offen dokumentiert: es sind
 * Rechenwerte fuer die interne Deckungsbeitragsrechnung, keine Zusage, dass der
 * Anbieter genau das abrechnet. Bei Tarifaenderung hier anpassen.
 */
export const AI_INFLUENZA_LLM_PRICES: readonly AiInfluenzaModelPrice[] = [
  {match: "gpt-oss", inputCentsPerMillion: 15, outputCentsPerMillion: 60, assumption: "Groq Free Tier: 0 EUR, Annahme entspricht Kosten bei Bezahltarif"},
  {match: "qwen", inputCentsPerMillion: 15, outputCentsPerMillion: 60, assumption: "Groq Free Tier: 0 EUR, Annahme entspricht Kosten bei Bezahltarif"},
  {match: "gemma", inputCentsPerMillion: 0, outputCentsPerMillion: 0, assumption: "Gemini Free Tier: 0 EUR laut Anbieter, Limit-begrenzt"},
  {match: "gemini", inputCentsPerMillion: 0, outputCentsPerMillion: 0, assumption: "Gemini Free Tier: 0 EUR laut Anbieter, Limit-begrenzt"},
  {match: "openrouter", inputCentsPerMillion: 0, outputCentsPerMillion: 0, assumption: "OpenRouter :free-Modelle: 0 EUR, Rate-Limit-begrenzt"},
  {match: "llama", inputCentsPerMillion: 0, outputCentsPerMillion: 0, assumption: "Free-Tier-Annahme; bei Bezahltarif neu bewerten"},
] as const;

export type AiInfluenzaCostEstimate = {
  cents: number;
  basis: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

function validTokens(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function priceForAiInfluenzaModel(model: string | null | undefined): AiInfluenzaModelPrice | null {
  const needle = (model ?? "").trim().toLowerCase();
  if (!needle) return null;
  return AI_INFLUENZA_LLM_PRICES.find((price) => needle.includes(price.match)) ?? null;
}

/**
 * Rechnet den Verbrauch eines LLM-Aufrufs in Cent.
 * `null`, wenn Modell oder Verbrauch unbekannt sind — dann keine erfundene Zahl.
 */
export function estimateAiInfluenzaUsageCost(input: {
  model?: string | null;
  usage?: AiInfluenzaTokenUsage | null;
}): AiInfluenzaCostEstimate | null {
  const model = (input.model ?? "").trim();
  const price = priceForAiInfluenzaModel(model);
  if (!price) return null;
  const promptTokens = validTokens(input.usage?.prompt_tokens);
  const completionTokens = validTokens(input.usage?.completion_tokens);
  if (promptTokens === 0 && completionTokens === 0) return null;
  const raw =
    (promptTokens * price.inputCentsPerMillion + completionTokens * price.outputCentsPerMillion) /
    1_000_000;
  // Aufrunden auf den naechsten Cent: jeder Aufruf kostet mindestens 1 Cent,
  // damit viele kleine Aufrufe nicht zu 0 Cent verschwinden.
  const cents = Math.max(1, Math.ceil(raw));
  return {
    cents,
    basis: `${price.match} · ${price.assumption}`,
    model,
    promptTokens,
    completionTokens,
  };
}

/** Deterministischer Event-Key, damit Wiederholungen die Kosten nicht doppeln. */
export function aiInfluenzaTaskCostEventKey(orderId: string, taskJobId: number): string {
  const order = orderId.trim();
  if (!order) throw new Error("orderId fehlt für den Kosten-Event-Key.");
  if (!Number.isInteger(taskJobId) || taskJobId <= 0) throw new Error("taskJobId muss eine positive Ganzzahl sein.");
  return `ai-influenza-cost:${order}:task:${taskJobId}`;
}
