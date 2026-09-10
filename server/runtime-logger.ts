import {
  MAX_RUNTIME_LOG_ENTRIES,
  type LogLevel,
  type RuntimeLogEntry,
  normalizeRuntimeLogEntry,
  pushRuntimeLog,
} from "../lib/live-status-logic";

/**
 * Sprint 66 — Runtime-Logger: faengt stdout/stderr-Konsolenausgaben des
 * Serverprozesses in einen gebundenen Ringpuffer (lib/live-status-logic)
 * und benachrichtigt SSE-Abonnenten in Echtzeit.
 *
 * Bewusst klein und seiteneffektarm: Das Patchen von process.stdout
 * passiert nur einmal (installRuntimeLogger ist idempotent), eigene
 * Ausgaben werden nicht geloopt (busy-guard), und der Puffer ist rein
 * im Speicher — Logs ueberleben keinen Restart (dafuer Render-Logs).
 */

type LogListener = (entry: RuntimeLogEntry) => void;

const buffer: RuntimeLogEntry[] = [];
const listeners = new Set<LogListener>();
let installed = false;
let entryCounter = 0;
let busy = false;

function emit(level: LogLevel, source: string, message: string) {
  if (busy) return; // Rekursionsschutz
  busy = true;
  try {
    entryCounter += 1;
    const entry = normalizeRuntimeLogEntry(
      { level, source, message, atMs: Date.now() },
      `rt-${Date.now().toString(36)}-${entryCounter}`,
    );
    buffer.splice(0, buffer.length, ...pushRuntimeLog(buffer, entry));
    for (const listener of listeners) {
      try {
        listener(entry);
      } catch {
        // Listener-Fehler duerfen den Logger nie mitreissen.
      }
    }
  } finally {
    busy = false;
  }
}

function patchStream(stream: NodeJS.WriteStream, level: LogLevel) {
  const originalWrite = stream.write.bind(stream);
  stream.write = function patchedWrite(
    chunk: unknown,
    ...rest: unknown[]
  ): boolean {
    if (typeof chunk === "string" && chunk.trim() !== "") {
      emit(level, "server", chunk.replace(/\n$/, ""));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalWrite as any)(chunk, ...(rest as any[]));
  };
}

/** Installiert den Logger (idempotent) — stdout=info, stderr=error. */
export function installRuntimeLogger() {
  if (installed) return;
  installed = true;
  patchStream(process.stdout, "info");
  patchStream(process.stderr, "error");
  emit("success", "runtime", "Live-Log-Streaming aktiviert (Ringpuffer 500).");
}

/** Aktueller Pufferstand (Kopie — Mutation von aussen wirkungslos). */
export function getRuntimeLogs(): RuntimeLogEntry[] {
  return [...buffer];
}

/** Leert den Puffer (Admin-Aktion) und meldet die entfernte Menge. */
export function clearRuntimeLogs(): number {
  const removed = buffer.length;
  buffer.splice(0, buffer.length);
  emit("info", "runtime", `Konsolenpuffer geleert (${removed} Eintraege).`);
  return removed;
}

/** SSE-/WebSocket-Abonnement; Rueckgabe ist die Abmeldefunktion. */
export function subscribeRuntimeLogs(listener: LogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Nur fuer Tests: Puffer und Installation ruecksetzen. */
export function __resetRuntimeLoggerForTests() {
  buffer.splice(0, buffer.length);
  listeners.clear();
  installed = false;
  entryCounter = 0;
}
