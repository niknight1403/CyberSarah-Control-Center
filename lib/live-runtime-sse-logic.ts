/**
 * Sprint 67 — SSE-Parse-Logik fuer das Live-Panel: fetch-basiertes
 * Server-Sent-Events-Parsing mit Auth-Header (EventSource kann keine
 * Header senden — fetch-Streaming kann es, auch chunk-weise).
 *
 * Deterministisch, ohne I/O: Textstuecke aus einem Response-Stream werden
 * zu vollstaendigen `data:`-Ereignissen zusammengefuegt; Kommentare
 * (`: heartbeat`) und leere Zeilen werden uebersprungen.
 */

export interface ParsedSseResult {
  events: string[];
  remainder: string;
}

/** Verarbeitet einen Textchunk und gibt fertige data-Ereignisse zurueck. */
export function parseSseChunk(buffer: string, chunk: string): ParsedSseResult {
  const combined = `${buffer}${chunk}`;
  const parts = combined.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events: string[] = [];
  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload !== "") events.push(payload);
      }
    }
  }
  return { events, remainder };
}

/** SSE-Content-Type-Pruefung (nur text/event-stream akzeptieren). */
export function isSseContentType(contentType: string | null | undefined): boolean {
  return String(contentType ?? "").toLowerCase().startsWith("text/event-stream");
}

export interface LiveRuntimeLogEntry {
  id: string;
  level: "info" | "warn" | "error" | "success";
  source: string;
  message: string;
  atMs: number;
}

/** Sichere Deserialisierung eines data-Payloads (feindliche Eingaben ok). */
export function decodeSseLogEvent(payload: string): LiveRuntimeLogEntry | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<LiveRuntimeLogEntry>;
    if (typeof candidate.id !== "string" || typeof candidate.message !== "string") {
      return null;
    }
    const level = (["info", "warn", "error", "success"] as const).includes(
      candidate.level as "info",
    )
      ? (candidate.level as LiveRuntimeLogEntry["level"])
      : "info";
    return {
      id: candidate.id.slice(0, 64),
      level,
      source: String(candidate.source ?? "server").slice(0, 64),
      message: candidate.message.slice(0, 2000),
      atMs: Number.isFinite(candidate.atMs) ? Math.floor(Number(candidate.atMs)) : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Begrenzte Zusammenfuehrung neuer Logzeilen mit bekannten (Duplikate entfernt). */
export function mergeRuntimeLogs(
  existing: LiveRuntimeLogEntry[],
  incoming: LiveRuntimeLogEntry[],
  maxEntries = 200,
): LiveRuntimeLogEntry[] {
  const seen = new Set(existing.map((entry) => entry.id));
  const merged = [...existing];
  for (const entry of incoming) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged.length > maxEntries
    ? merged.slice(merged.length - maxEntries)
    : merged;
}

/** Formatiert Logzeitstempel als HH:MM:SS (deutsch 24h, deterministisch). */
export function formatLogTime(atMs: number): string {
  const date = new Date(atMs);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** Uptime-Menschenleser (z. B. "2 min 5 s"). */
export function formatUptime(uptimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(uptimeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}
