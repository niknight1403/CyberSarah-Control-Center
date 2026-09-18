/**
 * Sprint 153 — Verstaendliche Fehlermeldung statt Roh-Fehler bei
 * unbrauchbaren LLM-API-Keys.
 *
 * Kontext: Der Superagent eskalierte mit undifferenzierbaren Roh-Fehlern
 * ("LLM invoke failed: 400 Bad Request – { error ... Please pass a valid
 * API key }"), wenn ALLE konfigurierten Provider-Keys ungültig oder
 * erschöpft sind. Fuer den Administrator ist daraus nicht ersichtlich,
 * dass es KEIN Code-Problem ist, sondern ein Konfigurationsproblem:
 * Es muss nur ein gueltiger API-Key hinterlegt werden.
 *
 * Diese reine Logik klassifiziert die Endpunkt-Fehlversuche einer
 * invokeLLM-Runde und baut — wenn alle Versuche auf Auth-/Guthaben-
 * Problemen beruhen — eine klare Handlungsanweisung.
 */

export type LlmEndpointAttempt = {
  /** Quell-ID des Endpunkts (z. B. "gemini", "openai", "groq", "openrouter"). */
  source: string;
  /** HTTP-Status des Fehlversuchs; null bei Netzwerk-/Parsing-Fehler. */
  httpStatus: number | null;
  /** Fehlermeldung des Versuchs (bereinigt, fuer die Muster-Erkennung). */
  message: string;
};

/** Status-Codes, die auf Auth-/Guthaben-Probleme schliessen lassen. */
const AUTH_LIKE_HTTP_STATUSES = new Set([401, 402, 403]);

/** Text-Muster, die Anbieter bei ungueltigen/erschöpften Keys senden. */
const AUTH_LIKE_MESSAGE_PATTERNS: RegExp[] = [
  /please pass a valid api key/i,
  /incorrect api key/i,
  /api key not valid/i,
  /api_key_invalid/i,
  /invalid_api_key/i,
  /insufficient_quota/i,
  /credit_balance_exhausted/i,
  /exceeded your current quota/i,
  /invalid x-api-key/i,
  /unauthori[sz]ed/i,
];

/** true, wenn ein einzelner Versuch wie ein Auth-/Guthaben-Problem aussieht. */
export function isAuthLikeAttempt(attempt: LlmEndpointAttempt): boolean {
  if (attempt.httpStatus != null && AUTH_LIKE_HTTP_STATUSES.has(attempt.httpStatus)) {
    return true;
  }
  return AUTH_LIKE_MESSAGE_PATTERNS.some((pattern) => pattern.test(attempt.message));
}

export type LlmFailureDiagnostics = {
  /** Alle Versuche beruhen auf Auth-/Guthaben-Problemen. */
  allAuthLike: boolean;
  /** Klare, handlungsleitende Fehlermeldung (nur sinnvoll bei allAuthLike). */
  actionableMessage: string | null;
};

/** Bereinigt eine Roh-Fehlermeldung fuer die Anzeige (einzeilig, gekuerzt). */
function summarize(message: string, maxLength = 160): string {
  const flattened = message.replace(/\s+/g, " ").trim();
  return flattened.length <= maxLength ? flattened : `${flattened.slice(0, maxLength)}…`;
}

/**
 * Klassifiziert die Fehlversuche EINER invokeLLM-Runde. Sind ALLE Versuche
 * Auth-/Guthaben-Fehler, liefert diagnostics.actionableMessage eine
 * verstaendliche Handlungsanweisung fuer den Administrator; andernfalls null
 * (dann soll der letzte Roh-Fehler wie bisher geworfen werden, denn dann
 * liegt vermutlich ein anderes, code-seitiges Problem vor).
 */
export function diagnoseLlmPoolFailure(attempts: LlmEndpointAttempt[]): LlmFailureDiagnostics {
  if (attempts.length === 0 || !attempts.every(isAuthLikeAttempt)) {
    return { allAuthLike: false, actionableMessage: null };
  }
  const failedSources = [...new Set(attempts.map((attempt) => attempt.source))].join(", ");
  const lastMessage = summarize(attempts[attempts.length - 1].message);
  return {
    allAuthLike: true,
    actionableMessage:
      `Alle konfigurierten LLM-Anbieter sind mit Authentifizierungs- oder Guthaben-Fehlern gescheitert ` +
      `(betroffen: ${failedSources}). Das ist kein Code-Problem: Es ist kein gueltiger API-Key hinterlegt. ` +
      `Bitte einen aktuellen Key hinterlegen (z. B. AI_GEMINI_API_KEY oder AI_GROQ_API_KEY als Render-Umgebungsvariable) ` +
      `und den Dienst neu starten. Letzte Anbietermeldung: ${lastMessage}`,
  };
}
