/**
 * Sprint 324 — Observability: reine, deterministische Logik fuer
 * strukturierte Server-Logs mit Korrelations-ID.
 *
 * Datenfluss:
 *   Jede Log-Zeile entsteht aus Level, Meldung, Korrelations-ID und
 *   Kontext; Serialisierung ist reine JSON-Zeile. Secrets werden VOR
 *   dem Schreiben maskiert.
 *
 * Ehrlichkeits-Grenze: Maskierte Felder werden als MASKIERT markiert,
 *   nie geloescht (man sieht, DASS etwas war). Eine Zeile ohne
 *   Korrelations-ID wird abgelehnt — nicht stillschweigend durchgelassen.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Feldnamen, die niemals im Klartext landen duerfen. */
export const SENSITIVE_FIELD_HINTS = [
  "key",
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
] as const;

export type LogContext = Record<string, unknown>;

export type LogEntry = {
  level: LogLevel;
  message: string;
  correlationId: string;
  context: LogContext;
  at: number;
};

/** Korrelations-ID-Format: mind. 8 Zeichen alphanumerisch. */
export function isValidCorrelationId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

/** Neue Korrelations-ID ableiten (reine Funktion ueber eine Zufallsquelle). */
export function deriveCorrelationId(randomHex: string): string {
  return randomHex.replace(/[^a-f0-9]/g, "").slice(0, 16).padEnd(16, "0") || "0000000000000000";
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_FIELD_HINTS.some((hint) => lower.includes(hint));
}

/** Kontext maskieren: sensitive Werte -> "MASKIERT", Rest bleibt. */
export function maskContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, isSensitiveKey(key) ? "MASKIERT" : value]),
  );
}

/** Log-Eintrag bauen — ohne gueltige Korrelations-ID: null (ehrlich). */
export function buildLogEntry(
  level: LogLevel,
  message: string,
  correlationId: string,
  context: LogContext,
  at: number,
): LogEntry | null {
  if (!isValidCorrelationId(correlationId)) return null;
  return { level, message, correlationId, context: maskContext(context), at };
}

/** Level-Gate: wird dieser Level ueberhaupt geloggt? */
export function passesLevelFilter(entry: LogEntry, minLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[entry.level] >= LOG_LEVEL_ORDER[minLevel];
}

/** JSON-Zeile (stabile Key-Ordnung fuer grep-bare Logs). */
export function serializeLogLine(entry: LogEntry): string {
  return JSON.stringify({
    at: entry.at,
    level: entry.level,
    correlationId: entry.correlationId,
    message: entry.message,
    context: entry.context,
  });
}

/** Alle Zeilen einer Korrelations-ID herausfiltern (Debugging-Abfrage). */
export function filterByCorrelationId(lines: string[], correlationId: string): string[] {
  return lines.filter((line) => {
    try {
      return JSON.parse(line).correlationId === correlationId;
    } catch {
      return false;
    }
  });
}
