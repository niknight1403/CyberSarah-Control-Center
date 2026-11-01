/**
 * Freundliche Fehlererklärung fuer LLM-Aufrufe (rein, testbar).
 *
 * Anlass: Der Superagent-Chat zeigte rohe Provider-Fehler wie
 *   {"error":{"message":"You have no credits remaining...","code":"credit_balance_exhausted"}}
 * direkt an — verständlich nur für Entwickler, nicht für den Nutzer.
 * Diese Funktion erkennt bekannte Fehlerklassen (Guthaben/Quota erschöpft,
 * kein Provider konfiguriert, Rate-Limit) und liefert eine kurze,
 * handlungsleitende deutsche Meldung statt der rohen API-Antwort.
 */

const QUOTA_PATTERNS: RegExp[] = [
  /insufficient_quota/i,
  /credit_balance_exhausted/i,
  /you have no credits remaining/i,
  /quota exceeded/i,
  /\b429\b/,
  /rate.?limit/i,
];

const NO_PROVIDER_PATTERNS: RegExp[] = [
  /openai_api_key is not configured/i,
  /kein llm konfiguriert/i,
  /weder groq-, openrouter-/i,
];

const MAX_LENGTH = 400;

export function describeLlmError(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();

  if (QUOTA_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Kein LLM-Provider mit verfügbarem Guthaben erreichbar. Bitte OpenAI-Guthaben aufladen (platform.openai.com → Billing) oder einen weiteren Provider-Key (Groq, OpenRouter, Gemini) hinterlegen.";
  }

  if (NO_PROVIDER_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Es ist noch kein LLM-Provider konfiguriert. Bitte einen API-Key (OpenAI, Groq, OpenRouter oder Gemini) in den Umgebungsvariablen hinterlegen.";
  }

  if (text.length === 0) return "Unbekannter Fehler.";
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}
