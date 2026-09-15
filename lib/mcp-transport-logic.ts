/**
 * Sprint 122 — MCP-Transport: reine, deterministische Logik fuer die
 * Transportschicht des Model Context Protocol (SSE/HTTP), die an die
 * bestehende Registry (lib/mcp-registry-logic.ts) andockt.
 *
 * Zwei Transporte werden modelliert:
 * - "streamable-http" (modernes Protokoll 2025-03-26): ein einziger
 *   Endpunkt, JSON-RPC ueber POST mit optionalem GET-Stream
 * - "sse" (aelterer HTTP+SSE-Transport): GET /sse fuer den Ereignisstrom,
 *   POST /messages fuer Client-zu-Server-Nachrichten — weiterhin
 *   unterstuetzt, aber als Fallback markiert
 *
 * Alles rein: Verhandlung, Endpunkt-Bau, Validierung (HTTPS, keine privaten
 * Adressen — wiederverwendet aus der Registry) und ein deterministischer
 * Reconnect-Plan fuer unterbrochene SSE-Stroeme. Netzwerk bleibt draussen.
 */

import { validateServerEndpoint } from "@/lib/mcp-registry-logic";

export type McpTransportKind = "streamable-http" | "sse";

export const MCP_TRANSPORT_KINDS: readonly McpTransportKind[] = ["streamable-http", "sse"];

export type McpTransportDescriptor = {
  kind: McpTransportKind;
  /** Anzeige-/Dokumentationslabel (deutsch). */
  label: string;
  /** true, wenn der Transport der empfohlene moderne Standard ist. */
  preferred: boolean;
  /** Kurze, tokenfreie Beschreibung fuer die UI. */
  description: string;
};

export const MCP_TRANSPORTS: Record<McpTransportKind, McpTransportDescriptor> = {
  "streamable-http": {
    kind: "streamable-http",
    label: "Streamable HTTP",
    preferred: true,
    description: "Ein Endpunkt für JSON-RPC über POST mit optionalem GET-Stream (Protokoll 2025-03-26).",
  },
  sse: {
    kind: "sse",
    label: "HTTP + SSE (Fallback)",
    preferred: false,
    description: "GET /sse für den Ereignisstrom, POST /messages für Client-Nachrichten — älterer Transport, weiterhin unterstützt.",
  },
};

/** Basiert die Endpunkte eines Transports auf einer Server-Basis-URL. */
export function buildTransportEndpoints(
  baseUrl: string,
  kind: McpTransportKind,
): { ok: true; endpoints: Record<string, string> } | { ok: false; reason: string } {
  const base = baseUrl.trim().replace(/\/+$/, "");
  // Logischer Name "remote": nur die URL wird geprueft (der Hostname enthaelt
  // Punkte und waere als Registry-Server-Slug unzulaessig).
  const check = validateServerEndpoint({ server: "remote", url: base });
  if (!check.ok) return check;
  if (kind === "streamable-http") {
    return { ok: true, endpoints: { rpc: `${base}/mcp`, stream: `${base}/mcp` } };
  }
  return { ok: true, endpoints: { sse: `${base}/sse`, messages: `${base}/messages` } };
}

export type TransportNegotiationInput = {
  /** Vom Client gewuenschter Transport (optional). */
  preferred?: McpTransportKind;
  /** Kompabilitaets-Flags, die der Server in seiner Initialisierungs-Antwort meldet. */
  serverCapabilities?: {
    streamableHttp?: boolean;
    sse?: boolean;
  };
};

export type TransportNegotiation = {
  kind: McpTransportKind;
  /** Ehrlicher Grund (deutsch, tokenfrei) — fuer Logs und UI. */
  reason: string;
};

/**
 * Verhandelt den Transport: Client-Wunsch gewinnt nur, wenn der Server ihn
 * unterstuetzt (oder nichts meldet — dann gilt die Faehigkeit als vorhanden).
 * Ohne Wunsch gilt streamable-http als moderner Standard; meldet der Server
 * nur SSE, faellt die Wahl ehrlich auf sse zurueck.
 */
export function negotiateTransport(input: TransportNegotiationInput = {}): TransportNegotiation {
  const capabilities = {
    streamableHttp: input.serverCapabilities?.streamableHttp ?? true,
    sse: input.serverCapabilities?.sse ?? true,
  };
  if (input.preferred) {
    const supported = input.preferred === "streamable-http" ? capabilities.streamableHttp : capabilities.sse;
    if (supported) {
      return {
        kind: input.preferred,
        reason: input.preferred === "streamable-http"
          ? "Client-Wunsch streamable-http, Server unterstützt ihn."
          : "Client-Wunsch SSE, Server unterstützt ihn.",
      };
    }
  }
  if (capabilities.streamableHttp) {
    return {
      kind: "streamable-http",
      reason: input.preferred
        ? `Wunsch ${input.preferred} nicht unterstützt — moderner Standard streamable-http gewählt.`
        : "Kein Client-Wunsch — moderner Standard streamable-http.",
    };
  }
  if (capabilities.sse) {
    return {
      kind: "sse",
      reason: "Server unterstützt streamable-http nicht — Fallback auf HTTP + SSE.",
    };
  }
  // Beide Flags explizit false: ehrlich abweisern, kein Erraten.
  return {
    kind: "streamable-http",
    reason: "Server meldet keinen unterstützten Transport — streamable-http als letzte Wahl, Verbindung wird vermutlich scheitern.",
  };
}

/* ==================== Reconnect-Plan (SSE-Resubscribe) ==================== */

/** Maximale Wartezeit zwischen Reconnect-Versuchen (Sekunden). */
export const MCP_RECONNECT_MAX_DELAY_SECONDS = 16;

/**
 * Deterministischer Reconnect-Plan: exponentiell 1, 2, 4, 8, dann Deckel
 * bei 16 s — Versuch 0 (erster Reconnect) wartet 1 s.
 */
export function reconnectDelaySeconds(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const raw = 2 ** safeAttempt;
  return Math.min(raw, MCP_RECONNECT_MAX_DELAY_SECONDS);
}

/* ==================== Verbindungs-Zustand ==================== */

export type TransportConnectionState =
  | "getrennt"
  | "verbindet"
  | "verbunden"
  | "reconnect";

export type TransportConnectionSnapshot = {
  state: TransportConnectionState;
  kind: McpTransportKind | null;
  /** Epoch-ms des letzten erfolgreichen Connects (null = noch nie). */
  lastConnectedAt: number | null;
};

export function emptyConnectionSnapshot(): TransportConnectionSnapshot {
  return { state: "getrennt", kind: null, lastConnectedAt: null };
}

/** Setzt den Zustand nach einem Ereignis (unveränderlich, Kopie). */
export function applyTransportEvent(
  snapshot: TransportConnectionSnapshot,
  event:
    | { type: "connect-started"; kind: McpTransportKind }
    | { type: "connected" }
    | { type: "disconnected" }
    | { type: "reconnect-scheduled"; kind: McpTransportKind },
  nowMs: number,
): TransportConnectionSnapshot {
  switch (event.type) {
    case "connected":
      return { state: "verbunden", kind: snapshot.kind, lastConnectedAt: nowMs };
    case "connect-started":
      return { state: "verbindet", kind: event.kind, lastConnectedAt: snapshot.lastConnectedAt };
    case "disconnected":
      return { state: "getrennt", kind: snapshot.kind, lastConnectedAt: snapshot.lastConnectedAt };
    case "reconnect-scheduled":
      return { state: "reconnect", kind: event.kind, lastConnectedAt: snapshot.lastConnectedAt };
  }
}

/** Kompakte deutsche Verbindungsdauer ("vor 3 Min.") fuer die Anzeige. */
export function formatConnectedSince(lastConnectedAt: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - lastConnectedAt) / 60_000));
  if (minutes < 1) return "gerade verbunden";
  return `seit ${minutes} Min.`;
}
