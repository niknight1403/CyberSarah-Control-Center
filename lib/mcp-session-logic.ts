/**
 * Sprint 136 — MCP-Sitzungs-Cache: Wiederverwendung etablierter Streamable-
 * HTTP-Sitzungen fuer Tool-Aufrufe. Ohne Cache baut jeder `mcp.callTool` ein
 * frisches JSON-RPC-Gespraech auf (initialize -> initialized -> tools/call);
 * mit Cache entfallen Handshake und einer von zwei Netzwerk-Roundtrips.
 *
 * Rein und deterministisch: Der Cache ist eine einfache Map mit injizierbarer
 * Uhr (TTL), die Orchestrierung nimmt eine injizierte Kanal-Fabrik — Netzwerk
 * bleibt draussen, die Tests stecken Fakes rein. Abgelaufene Sitzungen
 * (Server-Antwort HTTP 404 gemaess Streamable-HTTP-Spezifikation) fuehren zu
 * genau einem frischen Handshake mit Wiederholung, danach ehrliches Scheitern.
 *
 * Grenzen (bewusst): Der Cache ist prozesslokal (Neustart = frischer Handshake,
 * unkritisch), je konfiguriertem Server maximal eine Sitzung, keine
 * Persistenz — MCP-Sitzungen sind billig und kurzlebig.
 */
import {
  buildInitializeRequest,
  buildInitializedNotification,
  buildToolsCallRequest,
  extractToolCallResult,
  MCP_CLIENT_NAME,
  parseJsonRpcResponse,
  type JsonRpcNotification,
  type JsonRpcRequest,
} from "@/lib/mcp-client-logic";

/* ==================== Sitzungs-Cache ==================== */

/** Sitzungen ruhen nach dieser Muessigkeit aus (15 Minuten, konservativ). */
export const MCP_SESSION_TTL_MS = 15 * 60_000;

export type McpSessionEntry = { sessionId: string; establishedAtMs: number };

export type McpSessionStore = {
  /** Frische Sitzungs-Id oder null (abgelaufene Eintraege werden entfernt). */
  get(serverUrl: string, nowMs: number): string | null;
  /** Sitzung setzen (aktualisiert auch den Zeitstempel — gleitende TTL). */
  set(serverUrl: string, sessionId: string, nowMs: number): void;
  /** Sitzung verwerfen (z. B. nach Server-seitigem Ablauf, HTTP 404). */
  clear(serverUrl: string): void;
  /** Anzahl gehaltener Sitzungen (Diagnose/Tests). */
  size(): number;
};

/** Prozesslokaler Sitzungs-Cache mit gleitender TTL, je Server-URL eine Sitzung. */
export function createMcpSessionStore(ttlMs: number = MCP_SESSION_TTL_MS): McpSessionStore {
  const entries = new Map<string, McpSessionEntry>();
  return {
    get(serverUrl, nowMs) {
      const entry = entries.get(serverUrl);
      if (!entry) return null;
      if (nowMs - entry.establishedAtMs >= ttlMs) {
        entries.delete(serverUrl);
        return null;
      }
      return entry.sessionId;
    },
    set(serverUrl, sessionId, nowMs) {
      entries.set(serverUrl, { sessionId, establishedAtMs: nowMs });
    },
    clear(serverUrl) {
      entries.delete(serverUrl);
    },
    size() {
      return entries.size;
    },
  };
}

/* ==================== Fehler-Klassifikation ==================== */

/** Netzwerkfehler mit HTTP-Status (der Router haengt `status` an fetch-Fehler). */
export type McpNetworkError = Error & { status?: number };

/** HTTP 404 bedeutet in der Streamable-HTTP-Spezifikation: Sitzung abgelaufen. */
export function isSessionExpiredError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as McpNetworkError).status === 404
  );
}

/* ==================== Tool-Aufruf mit Sitzungs-Wiederverwendung ==================== */

export type McpSendFunction = (request: JsonRpcRequest | JsonRpcNotification) => Promise<unknown>;

/** Ein geoeffneter Kanal: send-Funktion + Zugriff auf die aktuelle Sitzungs-Id. */
export type McpChannel = {
  send: McpSendFunction;
  getSessionId: () => string | null;
};

export type McpToolCallOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export type RunMcpToolCallOptions = {
  toolName: string;
  args: Record<string, unknown>;
  serverUrl: string;
  store: McpSessionStore;
  nowMs: () => number;
  clientVersion: string;
  /** Oeffnet einen Kanal mit ( optional ) bekannter Sitzungs-Id. */
  openSession: (sessionId: string | null) => McpChannel;
};

async function runHandshake(
  channel: McpChannel,
  clientVersion: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const initResponse = await channel.send(buildInitializeRequest(MCP_CLIENT_NAME, clientVersion, 1));
  const parsedInit = parseJsonRpcResponse(initResponse, 1);
  if (!parsedInit.ok) return { ok: false, reason: `initialize fehlgeschlagen: ${parsedInit.reason}` };
  try {
    await channel.send(buildInitializedNotification());
  } catch {
    // Notification ist best effort (manche Server antworten HTTP 202 ohne Body).
  }
  return { ok: true };
}

/**
 * Fuehrt ein Remote-Tool aus und nutzt dabei eine frische Sitzung aus dem
 * Cache: Ohne Cache erst Handshake, dann Aufruf (Ids 1/2); mit Cache direkt
 * der Aufruf (Id 1). Laeuft die gecachte Sitzung serverseitig ab (HTTP 404),
 * gibt es genau einen frischen Handshake mit Wiederholung. Erfolge
 * aktualisieren den Cache (gleitende TTL), Misserfolge lassen ihn unberuehrt.
 */
export async function runMcpToolCall(options: RunMcpToolCallOptions): Promise<McpToolCallOutcome> {
  const { toolName, args, serverUrl, store, nowMs, clientVersion, openSession } = options;

  const sendCall = async (channel: McpChannel, callId: number): Promise<McpToolCallOutcome> => {
    const callResponse = await channel.send(buildToolsCallRequest(callId, toolName, args));
    const parsedCall = parseJsonRpcResponse(callResponse, callId);
    if (!parsedCall.ok) return { ok: false, reason: `tools/call fehlgeschlagen: ${parsedCall.reason}` };
    const outcome = extractToolCallResult(parsedCall.result);
    return outcome.ok ? { ok: true, text: outcome.text } : { ok: false, reason: outcome.reason };
  };

  const persist = (channel: McpChannel): void => {
    const sessionId = channel.getSessionId();
    if (sessionId) store.set(serverUrl, sessionId, nowMs());
  };

  try {
    const cachedSessionId = store.get(serverUrl, nowMs());
    const usedCache = cachedSessionId !== null;
    const channel = openSession(cachedSessionId);

    if (!usedCache) {
      const handshake = await runHandshake(channel, clientVersion);
      if (!handshake.ok) return { ok: false, reason: handshake.reason };
    }

    const outcome = await sendCall(channel, usedCache ? 1 : 2);
    if (!outcome.ok) return outcome;
    persist(channel);
    return outcome;
  } catch (error) {
    if (isSessionExpiredError(error)) {
      // Sitzung am Server abgelaufen: Cache verwerfen, einmal neu verhandeln.
      store.clear(serverUrl);
      try {
        const freshChannel = openSession(null);
        const handshake = await runHandshake(freshChannel, clientVersion);
        if (!handshake.ok) return { ok: false, reason: handshake.reason };
        const retry = await sendCall(freshChannel, 2);
        if (!retry.ok) return retry;
        persist(freshChannel);
        return retry;
      } catch (retryError) {
        return {
          ok: false,
          reason: `Aufruf nach Sitzungs-Erneuerung fehlgeschlagen: ${
            retryError instanceof Error ? retryError.message : "unbekannter Fehler"
          }`,
        };
      }
    }
    return {
      ok: false,
      reason: `Aufruf fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
    };
  }
}
