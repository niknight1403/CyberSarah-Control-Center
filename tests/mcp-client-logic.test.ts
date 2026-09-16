/**
 * Sprint 134 — MCP-Netzwerk-Client: deterministische Tests der reinen
 * JSON-RPC-Logik — Nachrichtenbau, Antwort-Parsing (Id-Matching, Fehler),
 * Tool-Mapping (Schema, Berechtigungen), Ergebnis-Extraktion und die
 * Orchestrierung (initialize -> initialized -> tools/list) mit injiziertem
 * Transport.
 */
import { describe, expect, it } from "vitest";

import {
  buildInitializeRequest,
  buildInitializedNotification,
  buildToolsCallRequest,
  buildToolsListRequest,
  DEFAULT_DISCOVERED_TOOL_PERMISSIONS,
  extractToolCallResult,
  mapDiscoveredTools,
  MCP_CLIENT_NAME,
  MCP_PROTOCOL_VERSION,
  nextJsonRpcId,
  parseJsonRpcResponse,
  parseToolInputSchema,
  runMcpDiscovery,
  type JsonRpcRequest,
} from "@/lib/mcp-client-logic";

/* Helper: Antwort-Objekt fuer parseJsonRpcResponse. */
function rpcResult(id: number, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

describe("Sprint 134: JSON-RPC-Nachrichtenbau", () => {
  it("initialize-Anfrage traegt Protokoll-Version und Client-Info", () => {
    const request = buildInitializeRequest("CyberSarah-Control-Center", "1.3.6", 7);
    expect(request.jsonrpc).toBe("2.0");
    expect(request.id).toBe(7);
    expect(request.method).toBe("initialize");
    const params = request.params as { protocolVersion: string; clientInfo: { name: string; version: string } };
    expect(params.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(params.clientInfo).toEqual({ name: "CyberSarah-Control-Center", version: "1.3.6" });
  });

  it("initialized-Notification hat keine Id", () => {
    const notification = buildInitializedNotification();
    expect(notification.jsonrpc).toBe("2.0");
    expect(notification.method).toBe("notifications/initialized");
    expect("id" in notification).toBe(false);
  });

  it("tools/list und tools/call sind vollstaendig typisiert", () => {
    const list = buildToolsListRequest(3);
    expect(list.method).toBe("tools/list");
    const call = buildToolsCallRequest(4, "search", { query: "expos" });
    expect(call.method).toBe("tools/call");
    expect(call.params).toEqual({ name: "search", arguments: { query: "expos" } });
  });

  it("nextJsonRpcId zaehlt ueber numerische Ids und ignoriert Strings", () => {
    expect(nextJsonRpcId([])).toBe(1);
    expect(nextJsonRpcId([1, 5])).toBe(6);
    expect(nextJsonRpcId(["abc", 2])).toBe(3);
  });
});

describe("Sprint 134: JSON-RPC-Antwort-Parsing", () => {
  it("akzeptiert ein gueltiges result mit passender Id", () => {
    const parsed = parseJsonRpcResponse(rpcResult(1, { tools: [] }), 1);
    expect(parsed.ok).toBe(true);
  });

  it("weist falsche Id, fehlende Version und kaputte Formen ehrlich ab", () => {
    expect(parseJsonRpcResponse(rpcResult(1, {}), 2).ok).toBe(false);
    expect(parseJsonRpcResponse({ id: 1, result: {} }, 1).ok).toBe(false);
    expect(parseJsonRpcResponse("kein objekt", 1).ok).toBe(false);
    expect(parseJsonRpcResponse(null, 1).ok).toBe(false);
  });

  it("uebersetzt Server-Fehler mit Code und Meldung", () => {
    const parsed = parseJsonRpcResponse({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }, 1);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toContain("-32601");
      expect(parsed.reason).toContain("Method not found");
      expect(parsed.error?.code).toBe(-32601);
    }
  });

  it("weist Antworten ohne result und error ab", () => {
    expect(parseJsonRpcResponse({ jsonrpc: "2.0", id: 1 }, 1).ok).toBe(false);
  });
});

describe("Sprint 134: Tool-Schema-Mapping", () => {
  it("uebersetzt JSON-Schema-Typen und required korrekt", () => {
    const schema = parseToolInputSchema({
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" }, flag: { type: "boolean" }, nested: { type: "object" } },
      required: ["query"],
    });
    expect(schema.query).toEqual({ type: "string", required: true });
    expect(schema.limit).toEqual({ type: "number", required: false });
    expect(schema.flag).toEqual({ type: "boolean", required: false });
    expect(schema.nested).toEqual({ type: "object", required: false });
  });

  it("faellt bei unbekannten und Array-Typen ehrlich auf string zurueck", () => {
    const schema = parseToolInputSchema({
      properties: { anything: { type: "null" }, union: { type: ["string", "number"] }, nothing: {} },
    });
    expect(schema.anything).toEqual({ type: "string", required: false });
    expect(schema.union).toEqual({ type: "string", required: false });
    expect(schema.nothing).toEqual({ type: "string", required: false });
  });

  it("liefert bei fehlendem Schema ein leeres Objekt", () => {
    expect(parseToolInputSchema(undefined)).toEqual({});
    expect(parseToolInputSchema("kein schema")).toEqual({});
  });
});

describe("Sprint 134: Discovery-Mapping in Registry-Deskriptoren", () => {
  const toolsResult = {
    tools: [
      { name: "search", description: "Websuche", inputSchema: { properties: { query: { type: "string" } }, required: ["query"] } },
      { name: "alpha", description: "" },
      { name: "", description: "ungueltig" },
      "kein objekt",
    ],
  };

  it("mappt vollqualifizierte Ids, sortiert und filtert ungueltige Eintraege", () => {
    const tools = mapDiscoveredTools("remote", toolsResult);
    expect(tools.map((tool) => tool.name)).toEqual(["alpha", "search"]);
    expect(tools[1].id).toBe("remote::search");
    expect(tools[1].server).toBe("remote");
    expect(tools[1].description).toBe("Websuche");
    expect(tools[1].inputSchema.query).toEqual({ type: "string", required: true });
  });

  it("verleiht remote Tools nur read + network — niemals shell oder filesystem", () => {
    const tools = mapDiscoveredTools("remote", toolsResult);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.permissions).toEqual([...DEFAULT_DISCOVERED_TOOL_PERMISSIONS]);
      expect(tool.permissions).not.toContain("shell");
      expect(tool.permissions).not.toContain("filesystem");
    }
  });

  it("akzeptiert nur Objekte mit tools-Array", () => {
    expect(mapDiscoveredTools("remote", null)).toEqual([]);
    expect(mapDiscoveredTools("remote", { tools: "kein array" })).toEqual([]);
  });
});

describe("Sprint 134: Tool-Ergebnis-Extraktion", () => {
  it("fuegt Text-Bloecke zusammen", () => {
    const outcome = extractToolCallResult({ content: [{ type: "text", text: "Zeile 1" }, { type: "text", text: "Zeile 2" }, { type: "image", data: "x" }] });
    expect(outcome).toEqual({ ok: true, text: "Zeile 1\nZeile 2" });
  });

  it("meldet isError als Fehlschlag", () => {
    const outcome = extractToolCallResult({ isError: true, content: [{ type: "text", text: "boom" }] });
    expect(outcome.ok).toBe(false);
  });

  it("faellt auf structuredContent und zuletzt JSON zurueck", () => {
    expect(extractToolCallResult({ structuredContent: { value: 42 } })).toEqual({ ok: true, text: '{"value":42}' });
    expect(extractToolCallResult({ irgendwas: true })).toEqual({ ok: true, text: '{"irgendwas":true}' });
  });

  it("weist Nicht-Objekte ab", () => {
    expect(extractToolCallResult("text").ok).toBe(false);
  });
});

describe("Sprint 134: Discovery-Orchestrierung mit injiziertem Transport", () => {
  function fakeSend(
    responses: Record<number, unknown>,
    log: JsonRpcRequest[],
  ): (request: { id?: number | string; method: string }) => Promise<unknown> {
    return async (request) => {
      log.push(request as JsonRpcRequest);
      const id = typeof request.id === "number" ? request.id : -1;
      if (id === -1) return undefined; // Notification: Server antwortet 202/leer
      if (!(id in responses)) throw new Error(`unerwartete id ${id}`);
      return responses[id];
    };
  }

  it("laeuft initialize -> initialized -> tools/list in korrekter Reihenfolge", async () => {
    const log: JsonRpcRequest[] = [];
    const outcome = await runMcpDiscovery({
      serverName: "remote",
      clientVersion: "1.3.6",
      send: fakeSend(
        {
          1: rpcResult(1, { serverInfo: { name: "Test-Server", version: "1.0" } }),
          2: rpcResult(2, { tools: [{ name: "search", description: "Suche" }] }),
        },
        log,
      ),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.serverInfo).toEqual({ name: "Test-Server", version: "1.0" });
      expect(outcome.tools.map((tool) => tool.id)).toEqual(["remote::search"]);
    }
    expect(log.map((entry) => entry.method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  });

  it("bricht ehrlich ab, wenn initialize fehlschlaegt", async () => {
    const outcome = await runMcpDiscovery({
      serverName: "remote",
      send: fakeSend({ 1: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Server startet" } } }, []),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("initialize");
  });

  it("bricht ab, wenn tools/list fehlschlaegt", async () => {
    const outcome = await runMcpDiscovery({
      serverName: "remote",
      send: fakeSend(
        {
          1: rpcResult(1, {}),
          2: { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "Method not found" } },
        },
        [],
      ),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("tools/list");
  });

  it("toleriert abgewiesene Initialized-Notification (Verbindung steht trotzdem)", async () => {
    const outcome = await runMcpDiscovery({
      serverName: "remote",
      send: async (request) => {
        if (request.method === "notifications/initialized") throw new Error("202 No Content");
        if (request.method === "initialize") return rpcResult(1, {});
        return rpcResult(2, { tools: [] });
      },
    });
    expect(outcome.ok).toBe(true);
  });

  it("nutzt CyberSarah als Standard-Client-Namen", async () => {
    const log: JsonRpcRequest[] = [];
    await runMcpDiscovery({
      serverName: "remote",
      send: fakeSend({ 1: rpcResult(1, {}), 2: rpcResult(2, { tools: [] }) }, log),
    });
    const init = log[0].params as { clientInfo: { name: string } };
    expect(init.clientInfo.name).toBe(MCP_CLIENT_NAME);
  });
});
