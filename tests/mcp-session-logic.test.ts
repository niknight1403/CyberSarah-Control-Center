/**
 * Sprint 136 — Tests fuer den MCP-Sitzungs-Cache (lib/mcp-session-logic.ts):
 * TTL-Verwaltung des prozesslokalen Speichers, 404-Klassifikation und die
 * Orchestrierung `runMcpToolCall` mit injizierten Kanal-Fakes — ohne Netzwerk.
 */
import { describe, expect, it } from "vitest";

import {
  createMcpSessionStore,
  isSessionExpiredError,
  MCP_SESSION_TTL_MS,
  runMcpToolCall,
  type McpChannel,
  type McpSendFunction,
} from "@/lib/mcp-session-logic";
import type { JsonRpcNotification, JsonRpcRequest } from "@/lib/mcp-client-logic";

/* ==================== Store ==================== */

describe("Sprint 136: Sitzungs-Store (createMcpSessionStore)", () => {
  it("liefert ohne Eintrag null und speichert/liest Sitzungen je Server-URL", () => {
    const store = createMcpSessionStore();
    expect(store.get("https://a.example/rpc", 1_000)).toBeNull();
    store.set("https://a.example/rpc", "sess-1", 1_000);
    expect(store.get("https://a.example/rpc", 1_500)).toBe("sess-1");
    expect(store.get("https://b.example/rpc", 1_500)).toBeNull();
    expect(store.size()).toBe(1);
  });

  it("laesst Sitzungen nach der TTL ablaufen (gleitend bei jedem set)", () => {
    const store = createMcpSessionStore(MCP_SESSION_TTL_MS);
    store.set("https://a.example/rpc", "sess-1", 1_000);
    expect(store.get("https://a.example/rpc", 1_000 + MCP_SESSION_TTL_MS - 1)).toBe("sess-1");
    // Abgelaufen: Eintrag wird entfernt und null gemeldet.
    expect(store.get("https://a.example/rpc", 1_000 + MCP_SESSION_TTL_MS)).toBeNull();
    expect(store.size()).toBe(0);
    // Ein frisches set erneuert den Zeitstempel (gleitende TTL).
    store.set("https://a.example/rpc", "sess-2", 5_000);
    expect(store.get("https://a.example/rpc", 5_000 + MCP_SESSION_TTL_MS - 1)).toBe("sess-2");
  });

  it("wirft Sitzungen mit clear gezielt weg", () => {
    const store = createMcpSessionStore();
    store.set("https://a.example/rpc", "sess-1", 1_000);
    store.clear("https://a.example/rpc");
    expect(store.get("https://a.example/rpc", 1_100)).toBeNull();
    // clear auf fremde/leere URLs bleibt folgenlos.
    store.clear("https://unbekannt.example/rpc");
    expect(store.size()).toBe(0);
  });

  it("unterstuetzt eine eigene (kuerzere) TTL", () => {
    const store = createMcpSessionStore(1_000);
    store.set("https://a.example/rpc", "sess-1", 0);
    expect(store.get("https://a.example/rpc", 500)).toBe("sess-1");
    expect(store.get("https://a.example/rpc", 1_500)).toBeNull();
  });
});

/* ==================== 404-Klassifikation ==================== */

describe("Sprint 136: Sitzungs-Ablauf erkennen (isSessionExpiredError)", () => {
  it("erkennt HTTP 404 als abgelaufene Sitzung", () => {
    expect(isSessionExpiredError(Object.assign(new Error("HTTP 404"), { status: 404 }))).toBe(true);
  });

  it("andere Status, normale Fehler und Nicht-Fehler sind kein Ablauf", () => {
    expect(isSessionExpiredError(Object.assign(new Error("HTTP 500"), { status: 500 }))).toBe(false);
    expect(isSessionExpiredError(new Error("HTTP 404 ohne status"))).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
    expect(isSessionExpiredError("HTTP 404")).toBe(false);
  });
});

/* ==================== Orchestrierung (runMcpToolCall) ==================== */

type RecordedMessage = { request: JsonRpcRequest | JsonRpcNotification; sessionId: string | null };

type FakeChannelOptions = {
  /** Sitzungs-Id, die der Fake bei initialize vergibt. */
  newSessionId?: string;
  /** Wirft tools/call mit diesem Status (z. B. 404) statt einer Antwort. */
  callStatusError?: number;
  /** Antwort auf tools/call (Standard: Text-Ergebnis). */
  callResult?: unknown;
};

function createFakeChannel(options: FakeChannelOptions = {}) {
  const { newSessionId = "sess-neu", callStatusError, callResult } = options;
  const log: RecordedMessage[] = [];
  let sessionId: string | null = null;
  const send: McpSendFunction = async (request) => {
    log.push({ request, sessionId });
    const method = request.method;
    if (method === "initialize") {
      sessionId = newSessionId;
      return {
        jsonrpc: "2.0",
        id: (request as JsonRpcRequest).id,
        result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "Fake", version: "1.0" } },
      };
    }
    if (method === "notifications/initialized") return undefined;
    if (method === "tools/call") {
      if (callStatusError !== undefined) {
        throw Object.assign(new Error(`HTTP ${callStatusError}`), { status: callStatusError });
      }
      return {
        jsonrpc: "2.0",
        id: (request as JsonRpcRequest).id,
        result: callResult ?? { content: [{ type: "text", text: "ergebnis" }] },
      };
    }
    throw new Error(`unerwartete Methode: ${method}`);
  };
  const channel: McpChannel = { send, getSessionId: () => sessionId };
  return { channel, log, setSessionId: (id: string | null) => (sessionId = id) };
}

describe("Sprint 136: runMcpToolCall", () => {
  it("macht ohne Cache einen Handshake und ruft dann auf (Ids 1/2); Sitzung wird gecacht", async () => {
    const store = createMcpSessionStore();
    const fake = createFakeChannel();
    let now = 10_000;
    const outcome = await runMcpToolCall({
      toolName: "rechnen",
      args: { x: 1 },
      serverUrl: "https://remote.example/rpc",
      store,
      nowMs: () => now,
      clientVersion: "1.2.3",
      openSession: () => fake.channel,
    });
    expect(outcome).toEqual({ ok: true, text: "ergebnis" });
    expect(fake.log.map((entry) => entry.request.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
    expect(fake.log[2].request).toMatchObject({ id: 2, method: "tools/call" });
    expect(store.get("https://remote.example/rpc", now)).toBe("sess-neu");
  });

  it("nutzt eine frische Cache-Sitzung ohne Handshake (Aufruf-Id 1) und aktualisiert die TTL", async () => {
    const store = createMcpSessionStore();
    store.set("https://remote.example/rpc", "sess-cache", 1_000);
    const fake = createFakeChannel();
    fake.setSessionId("sess-cache");
    let now = 2_000;
    const outcome = await runMcpToolCall({
      toolName: "rechnen",
      args: {},
      serverUrl: "https://remote.example/rpc",
      store,
      nowMs: () => now,
      clientVersion: "1.2.3",
      openSession: () => fake.channel,
    });
    expect(outcome.ok).toBe(true);
    // Kein initialize, kein notification — nur der Aufruf.
    expect(fake.log.map((entry) => entry.request.method)).toEqual(["tools/call"]);
    expect(fake.log[0]).toMatchObject({ sessionId: "sess-cache" });
    // Gleitende TTL: Zeitstempel wurde auf jetzt (2_000) angehoben.
    expect(store.get("https://remote.example/rpc", now + MCP_SESSION_TTL_MS - 1)).toBe("sess-cache");
  });

  it("erneuert nach serverseitigem Ablauf (HTTP 404 auf gecachter Sitzung) genau einmal", async () => {
    const store = createMcpSessionStore();
    store.set("https://remote.example/rpc", "sess-alt", 1_000);
    const abgelaufen = createFakeChannel({ callStatusError: 404 });
    abgelaufen.setSessionId("sess-alt");
    const frisch = createFakeChannel({ newSessionId: "sess-frisch" });
    const opened: string[] = [];
    let now = 2_000;
    const outcome = await runMcpToolCall({
      toolName: "rechnen",
      args: {},
      serverUrl: "https://remote.example/rpc",
      store,
      nowMs: () => now,
      clientVersion: "1.2.3",
      openSession: (sessionId) => {
        opened.push(sessionId ?? "<keine>");
        return sessionId === "sess-alt" ? abgelaufen.channel : frisch.channel;
      },
    });
    expect(outcome).toEqual({ ok: true, text: "ergebnis" });
    expect(opened).toEqual(["sess-alt", "<keine>"]);
    // Neuer Kanal: Handshake + Wiederholung, dann gecachte neue Sitzung.
    expect(frisch.log.map((entry) => entry.request.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
    expect(store.get("https://remote.example/rpc", now)).toBe("sess-frisch");
  });

  it("scheitert ehrlich, wenn auch der erneuerte Aufruf (404) abgelehnt wird — ohne Endlosschleife", async () => {
    const store = createMcpSessionStore();
    store.set("https://remote.example/rpc", "sess-alt", 1_000);
    const abgelaufen = createFakeChannel({ callStatusError: 404 });
    const auchAbgelaufen = createFakeChannel({ callStatusError: 404 });
    let versuche = 0;
    const outcome = await runMcpToolCall({
      toolName: "rechnen",
      args: {},
      serverUrl: "https://remote.example/rpc",
      store,
      nowMs: () => 2_000,
      clientVersion: "1.2.3",
      openSession: (sessionId) => {
        versuche += 1;
        return sessionId === "sess-alt" ? abgelaufen.channel : auchAbgelaufen.channel;
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("fehlgeschlagen");
    expect(versuche).toBe(2);
    expect(store.size()).toBe(0);
  });

  it("meldet initialize-Fehler ohne Cache ehrlich (kein Aufruf, kein Cache-Eintrag)", async () => {
    const store = createMcpSessionStore();
    const kaputt = {
      channel: {
        getSessionId: () => null,
        send: (async () => ({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "kaputt" } })) as McpSendFunction,
      },
      log: [] as RecordedMessage[],
    };
    const outcome = await runMcpToolCall({
      toolName: "rechnen",
      args: {},
      serverUrl: "https://remote.example/rpc",
      store,
      nowMs: () => 2_000,
      clientVersion: "1.2.3",
      openSession: () => kaputt.channel,
    });
    expect(outcome).toEqual({ ok: false, reason: "initialize fehlgeschlagen: Server-Fehler -32000: kaputt" });
    expect(store.size()).toBe(0);
  });

  it("uebersetzt tools/call-Fehler und isError-Ergebnisse ehrlich, Cache bleibt unberuehrt", async () => {
    const store = createMcpSessionStore();
    store.set("https://remote.example/rpc", "sess-cache", 1_000);
    const fehlerKanal = createFakeChannel({
      callResult: { content: [{ type: "text", text: "boom" }], isError: true },
    });
    fehlerKanal.setSessionId("sess-cache");
    const outcome = await runMcpToolCall({
      toolName: "rechnen",
      args: {},
      serverUrl: "https://remote.example/rpc",
      store,
      nowMs: () => 2_000,
      clientVersion: "1.2.3",
      openSession: () => fehlerKanal.channel,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("isError");
    // Fehlgeschlagener Aufruf aktualisiert die TTL nicht (Zeitstempel bleibt 1_000).
    expect(store.get("https://remote.example/rpc", 1_000 + MCP_SESSION_TTL_MS - 1)).toBe("sess-cache");
  });
});
