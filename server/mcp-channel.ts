/**
 * Master-Prompt Phase 2 — MCP-Kanal (Streamable HTTP) fuer mehrere Server.
 *
 * Bis Sprint 194 lag dieser Code direkt im `mcp-router.ts` und kannte genau
 * eine URL. Fuer die Multi-Server-Registry braucht ihn auch der Service
 * (server/mcp-server-service.ts); deshalb liegt er hier als eigenes Modul —
 * mit denselben Garantien: Timeout je Anfrage, Uebernahme des Session-Headers,
 * SSE-Antworten werden auf `data:`-Zeilen reduziert, Fehler tragen den
 * HTTP-Status (404 = Sitzung abgelaufen).
 *
 * Zugangsdaten: Der Aufrufer uebergibt den Token-WERT (aus der benannten
 * ENV-Variable). Er landet ausschliesslich im Authorization-Header und wird
 * weder geloggt noch in Fehlermeldungen weitergereicht.
 */
import type { JsonRpcNotification, JsonRpcRequest } from "../lib/mcp-client-logic";
import { buildTransportEndpoints, type McpTransportKind } from "../lib/mcp-transport-logic";

/** Request-Timeout fuer MCP-Gespraeche (haengende Ports wuerden sonst blockieren). */
export const MCP_REQUEST_TIMEOUT_MS = 10_000;

export type RpcSend = (request: JsonRpcRequest | JsonRpcNotification) => Promise<unknown>;

export type RpcChannel = {
  send: RpcSend;
  getSessionId: () => string | null;
};

export type ChannelOptions = {
  initialSessionId?: string | null;
  /** Bearer-Token aus der konfigurierten ENV-Variable (nie persistiert). */
  credentialToken?: string | null;
  timeoutMs?: number;
  /** Testbar: fetch austauschbar. */
  fetchImpl?: typeof fetch;
};

/**
 * Baut den Kanal fuer Streamable HTTP: POST mit JSON-RPC-Body, Accept fuer
 * JSON und Event-Stream, Session-Header wird uebernommen, SSE-Antworten
 * werden auf die letzte `data:`-Zeile reduziert. 202 = Notification quittiert.
 */
export function createStreamableHttpSend(rpcUrl: string, options: ChannelOptions = {}): RpcChannel {
  let sessionId: string | null = options.initialSessionId ?? null;
  const token = options.credentialToken?.trim() || null;
  const timeoutMs = options.timeoutMs ?? MCP_REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  const send: RpcSend = async (request) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const newSession = response.headers.get("mcp-session-id");
    if (newSession) sessionId = newSession;
    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    }
    if (response.status === 202) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    if (contentType.includes("text/event-stream")) {
      const dataLines = body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter((line) => line.length > 0);
      if (dataLines.length === 0) return undefined;
      return JSON.parse(dataLines[dataLines.length - 1]);
    }
    if (!body) return undefined;
    return JSON.parse(body);
  };

  return { send, getSessionId: () => sessionId };
}

/**
 * Loest die JSON-RPC-URL eines Servers auf. SSE ist registrierbar, aber noch
 * nicht angebunden — das wird hier ehrlich gesagt, statt eine Verbindung zu
 * simulieren.
 */
export function resolveRpcUrl(
  baseUrl: string,
  transport: McpTransportKind,
): { ok: true; rpcUrl: string } | { ok: false; reason: string } {
  if (transport !== "streamable-http") {
    return {
      ok: false,
      reason: "SSE-Transport ist noch nicht angebunden — bitte Streamable HTTP verwenden.",
    };
  }
  const endpoints = buildTransportEndpoints(baseUrl, transport);
  if (!endpoints.ok) return { ok: false, reason: endpoints.reason };
  return { ok: true, rpcUrl: endpoints.endpoints.rpc };
}
