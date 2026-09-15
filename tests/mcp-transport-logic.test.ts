/**
 * Sprint 122 — MCP-Transport: deterministische Tests der reinen Logik —
 * Endpunkt-Bau inkl. Sicherheits-Validierung, Transport-Verhandlung
 * (Client-Wunsch, Server-Faehigkeiten, Fallback), Reconnect-Plan,
 * Verbindungs-Zustandsmaschine, Anzeige-Formatierung.
 */
import { describe, expect, it } from "vitest";

import {
  applyTransportEvent,
  buildTransportEndpoints,
  emptyConnectionSnapshot,
  formatConnectedSince,
  MCP_RECONNECT_MAX_DELAY_SECONDS,
  MCP_TRANSPORT_KINDS,
  MCP_TRANSPORTS,
  negotiateTransport,
  reconnectDelaySeconds,
  type TransportConnectionSnapshot,
} from "@/lib/mcp-transport-logic";

describe("Sprint 122: Transport-Katalog", () => {
  it("genau zwei Transporte: Streamable HTTP (bevorzugt) und SSE (Fallback)", () => {
    expect(MCP_TRANSPORT_KINDS).toEqual(["streamable-http", "sse"]);
    expect(MCP_TRANSPORTS["streamable-http"].preferred).toBe(true);
    expect(MCP_TRANSPORTS.sse.preferred).toBe(false);
    expect(MCP_TRANSPORTS["streamable-http"].description).toContain("POST");
    expect(MCP_TRANSPORTS.sse.description).toContain("unterstützt");
  });
});

describe("Sprint 122: Endpunkt-Bau", () => {
  it("Streamable HTTP: RPC und Stream zeigen auf denselben /mcp-Endpunkt", () => {
    const result = buildTransportEndpoints("https://mcp.example.com/", "streamable-http");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.endpoints.rpc).toBe("https://mcp.example.com/mcp");
      expect(result.endpoints.stream).toBe("https://mcp.example.com/mcp");
    }
  });

  it("SSE: Ereignisstrom auf /sse, Nachrichten auf /messages", () => {
    const result = buildTransportEndpoints("https://mcp.example.com", "sse");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.endpoints.sse).toBe("https://mcp.example.com/sse");
      expect(result.endpoints.messages).toBe("https://mcp.example.com/messages");
    }
  });

  it("unsichere oder private Adressen werden abgelehnt (HTTPS-Pflicht, keine privaten Hosts)", () => {
    expect(buildTransportEndpoints("http://mcp.example.com", "sse").ok).toBe(false);
    const local = buildTransportEndpoints("https://localhost:3000", "sse");
    expect(local.ok).toBe(false);
    if (!local.ok) expect(local.reason).toContain("nicht erlaubt");
    expect(buildTransportEndpoints("https://192.168.1.5", "sse").ok).toBe(false);
  });
});

describe("Sprint 122: Transport-Verhandlung", () => {
  it("ohne Wunsch und ohne gemeldete Faehigkeiten: moderner Standard streamable-http", () => {
    const result = negotiateTransport();
    expect(result.kind).toBe("streamable-http");
    expect(result.reason).toContain("Standard");
  });

  it("Client-Wunsch gewinnt, wenn der Server unterstuetzt", () => {
    expect(negotiateTransport({ preferred: "sse" }).kind).toBe("sse");
    expect(negotiateTransport({ preferred: "sse", serverCapabilities: { sse: true } }).kind).toBe("sse");
  });

  it("Client-Wunsch wird ehrlich ueberstimmt, wenn der Server nicht unterstuetzt", () => {
    const result = negotiateTransport({
      preferred: "sse",
      serverCapabilities: { streamableHttp: true, sse: false },
    });
    expect(result.kind).toBe("streamable-http");
    expect(result.reason).toContain("nicht unterstützt");
  });

  it("Server ohne streamable-http faellt auf SSE zurueck", () => {
    const result = negotiateTransport({ serverCapabilities: { streamableHttp: false, sse: true } });
    expect(result.kind).toBe("sse");
    expect(result.reason).toContain("Fallback");
  });

  it("Server ohne jeglichen Transport wird ehrlich abgewiesen statt geraten", () => {
    const result = negotiateTransport({
      serverCapabilities: { streamableHttp: false, sse: false },
    });
    expect(result.reason).toContain("keinen unterstützten Transport");
  });
});

describe("Sprint 122: Reconnect-Plan", () => {
  it("exponentiell 1, 2, 4, 8 mit Deckel bei 16 s", () => {
    expect(reconnectDelaySeconds(0)).toBe(1);
    expect(reconnectDelaySeconds(1)).toBe(2);
    expect(reconnectDelaySeconds(2)).toBe(4);
    expect(reconnectDelaySeconds(3)).toBe(8);
    expect(reconnectDelaySeconds(4)).toBe(MCP_RECONNECT_MAX_DELAY_SECONDS);
    expect(reconnectDelaySeconds(50)).toBe(MCP_RECONNECT_MAX_DELAY_SECONDS);
  });

  it("negative Versuche werden auf Versuch 0 gezwungen", () => {
    expect(reconnectDelaySeconds(-3)).toBe(1);
  });
});

describe("Sprint 122: Verbindungs-Zustandsmaschine", () => {
  it("Ereignisfolge verbinden -> verbunden -> getrennt mit Kopie-Semantik", () => {
    let state: TransportConnectionSnapshot = emptyConnectionSnapshot();
    expect(state.state).toBe("getrennt");
    expect(state.lastConnectedAt).toBeNull();

    state = applyTransportEvent(state, { type: "connect-started", kind: "streamable-http" }, 1_000);
    expect(state.state).toBe("verbindet");
    expect(state.kind).toBe("streamable-http");

    state = applyTransportEvent(state, { type: "connected" }, 5_000);
    expect(state.state).toBe("verbunden");
    expect(state.lastConnectedAt).toBe(5_000);

    state = applyTransportEvent(state, { type: "disconnected" }, 9_000);
    expect(state.state).toBe("getrennt");
    expect(state.lastConnectedAt).toBe(5_000); // Verlauf bleibt erhalten

    state = applyTransportEvent(state, { type: "reconnect-scheduled", kind: "sse" }, 10_000);
    expect(state.state).toBe("reconnect");
    expect(state.kind).toBe("sse"); // Transport-Wechsel im Reconnect moeglich
    expect(state.lastConnectedAt).toBe(5_000);
  });
});

describe("Sprint 122: Anzeige-Formatierung", () => {
  it("Verbindungsdauer: 'gerade verbunden' unter 1 Minute, sonst Minuten", () => {
    expect(formatConnectedSince(10_000, 20_000)).toBe("gerade verbunden");
    expect(formatConnectedSince(10_000, 10_000 + 3 * 60_000)).toBe("seit 3 Min.");
  });

  it("Zukunft/Uhrdrift bleibt bei 'gerade verbunden'", () => {
    expect(formatConnectedSince(20_000, 10_000)).toBe("gerade verbunden");
  });
});
