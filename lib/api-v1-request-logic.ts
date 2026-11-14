/**
 * Sprint 189 — Anfrage-Normalisierung der oeffentlichen v1-API (rein, ohne I/O).
 *
 * Warum ein eigenes Modul: `server/api-v1.ts` enthielt die Eingabe-Pruefung der
 * Ausfuehrungsrouten (`/api/v1/agent/run`, `/api/v1/llm/cascade`) direkt im
 * Route-Handler. Dort war sie nur ueber den Express-Stack erreichbar und blieb
 * in der Node-Suite ungetestet (0 % Lines). Genau diese Funktionen entscheiden
 * aber ueber Geld: sie bestimmen, welche Nachrichten an das Modell gehen und
 * welcher Token-Betrag reserviert wird.
 *
 * Regeln, die hier festgehalten sind:
 *  - Ein Auftrag ohne verwertbaren Text ist ungueltig (HTTP 400), statt einen
 *    leeren Lauf zu reservieren.
 *  - Inhalte werden auf `MAX_PROMPT_CHARS` gekuerzt, damit ein einzelner Aufruf
 *    die Reservierung nicht durch riesige Prompts sprengt.
 *  - Unbekannte Rollen fallen auf `user` zurueck (kein `system`-Einschmuggel
 *    ueber ein manipuliertes `role`-Feld).
 *  - `maxTokens` wird auf 64...4000 begrenzt, damit weder 0-Token-Laeufe noch
 *    unbezahlbare Riesenantworten entstehen.
 */

/** Obergrenze je einzelner Nachricht (Zeichen). */
export const MAX_PROMPT_CHARS = 24_000;
/** Antwortbudget, wenn der Client keines mitschickt. */
export const DEFAULT_MAX_TOKENS = 900;
/** Untergrenze des Antwortbudgets (kleinere Werte werden angehoben). */
export const MIN_MAX_TOKENS = 64;
/** Obergrenze des Antwortbudgets. */
export const MAX_MAX_TOKENS = 4_000;

const ALLOWED_ROLES = ["system", "user", "assistant"] as const;
export type RequestRole = (typeof ALLOWED_ROLES)[number];

export interface RequestMessage {
  role: RequestRole;
  content: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeRole(value: unknown): RequestRole {
  const role = String(value ?? "");
  return (ALLOWED_ROLES as readonly string[]).includes(role) ? (role as RequestRole) : "user";
}

/**
 * Liest `messages` (Array) oder `prompt` (+ optional `system`) aus dem Body.
 * Gibt `null` zurueck, wenn kein verwertbarer Text uebrig bleibt.
 */
export function readRequestMessages(body: unknown): RequestMessage[] | null {
  const payload = asRecord(body);
  if (!payload) return null;

  if (Array.isArray(payload.messages)) {
    const messages = payload.messages
      .map(asRecord)
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => ({
        role: normalizeRole(entry.role),
        content: String(entry.content ?? "").slice(0, MAX_PROMPT_CHARS),
      }))
      .filter((message) => message.content.trim().length > 0);
    return messages.length > 0 ? messages : null;
  }

  if (typeof payload.prompt === "string" && payload.prompt.trim()) {
    const messages: RequestMessage[] = [];
    if (typeof payload.system === "string" && payload.system.trim()) {
      messages.push({ role: "system", content: payload.system.slice(0, MAX_PROMPT_CHARS) });
    }
    messages.push({ role: "user", content: payload.prompt.slice(0, MAX_PROMPT_CHARS) });
    return messages;
  }

  return null;
}

/**
 * Antwortbudget aus dem Body, begrenzt auf [MIN_MAX_TOKENS, MAX_MAX_TOKENS].
 *
 * Fehlende, nicht-numerische und explizit 0/null-Werte fallen auf
 * `DEFAULT_MAX_TOKENS` zurueck (bewusst wie bisher: `Number(null)` ist 0 und
 * darf keinen 64-Token-Lauf erzeugen, nur weil ein Feld nicht gesetzt wurde).
 * Negative Zahlen werden auf die Untergrenze angehoben.
 */
export function resolveMaxTokens(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return DEFAULT_MAX_TOKENS;
  return Math.max(MIN_MAX_TOKENS, Math.min(MAX_MAX_TOKENS, Math.trunc(parsed)));
}

/** Modellname aus dem Body: getrimmt, sonst leerer String. */
export function resolveRequestedModel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Agenten-ID aus dem Body: nur Strings, sonst `null`. */
export function resolveAgentId(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Reservierungsbetrag eines Laufs: geschaetzte Prompt-Token plus Antwortbudget.
 * `estimatePromptTokens` wird injiziert, damit dieses Modul I/O-frei bleibt.
 */
export function computeEstimatedTokens(input: {
  messages: RequestMessage[];
  maxTokens: number;
  estimatePromptTokens: (text: string) => number;
}): { promptTokens: number; estimatedTokens: number } {
  const promptTokens = input.messages.reduce(
    (sum, message) => sum + input.estimatePromptTokens(message.content),
    0,
  );
  return { promptTokens, estimatedTokens: promptTokens + input.maxTokens };
}

/**
 * Lokale/eigene Provider (Ollama) kosten nichts und werden nicht reserviert.
 * Alles andere — inklusive unbekannter Modelle ueber den Aggregator — ist
 * kostenpflichtig, damit ein Tippfehler im Modellnamen nicht kostenlos laeuft.
 */
export function isBillableProvider(provider: string): boolean {
  return provider !== "ollama";
}
