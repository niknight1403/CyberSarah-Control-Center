/**
 * Sprint 134 — MCP-Netzwerk-Client: reine, deterministische JSON-RPC-Logik
 * fuer echte Verbindungen zu MCP-Servern (Streamable HTTP, Protokoll
 * 2025-03-26). Dockt an die Transport-Endpunkte aus Sprint 122
 * (lib/mcp-transport-logic.ts) und die Registry aus Sprint 79
 * (lib/mcp-registry-logic.ts) an.
 *
 * Netzwerk bleibt draussen: alle Funktionen nehmen eine injizierte
 * `send`-Funktion (sendet ein JSON-RPC-Objekt, liefert das geparste
 * Antwort-JSON zurueck). Der Server-Router steckt dort sein echtes
 * fetch hinein — die Tests stecken Fakes rein.
 */
import type { McpPermission, McpToolDescriptor, McpToolInputSchema } from "@/lib/mcp-registry-logic";

/** Aktuelles MCP-Protokoll (Streamable HTTP, wie in Sprint 122 modelliert). */
export const MCP_PROTOCOL_VERSION = "2025-03-26";

/** Berechtigungen, die entdeckten Remote-Tools konservativ verliehen werden. */
export const DEFAULT_DISCOVERED_TOOL_PERMISSIONS: readonly McpPermission[] = ["read", "network"];

export const MCP_CLIENT_NAME = "CyberSarah-Control-Center";

/* ==================== JSON-RPC 2.0 Nachrichtenbau ==================== */

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

/** Naechste freie JSON-RPC-Id (sequenziell, deterministisch ab 1). */
export function nextJsonRpcId(usedIds: readonly (number | string)[]): number {
  return usedIds.filter((id): id is number => typeof id === "number").reduce((max, id) => Math.max(max, id), 0) + 1;
}

export function buildInitializeRequest(clientName: string, clientVersion: string, id: number | string): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: clientVersion },
    },
  };
}

export function buildInitializedNotification(): JsonRpcNotification {
  return { jsonrpc: "2.0", method: "notifications/initialized" };
}

export function buildToolsListRequest(id: number | string): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method: "tools/list", params: {} };
}

export function buildToolsCallRequest(id: number | string, toolName: string, args: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: toolName, arguments: args } };
}

/* ==================== Antwort-Parsing ==================== */

export type JsonRpcError = { code: number; message: string };

export type JsonRpcParseResult =
  | { ok: true; id: number | string; result: unknown }
  | { ok: false; reason: string; error?: JsonRpcError };

/**
 * Validiert eine JSON-RPC-2.0-Antwort: Form, Id-Matching und Fehlersaal.
 * Notifications (Antwort ohne id, z. B. HTTP 202) sind ehrlich ungueltig.
 */
export function parseJsonRpcResponse(raw: unknown, expectedId: number | string): JsonRpcParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "Antwort ist kein JSON-Objekt." };
  }
  const response = raw as Record<string, unknown>;
  if (response.jsonrpc !== "2.0") {
    return { ok: false, reason: "Antwort ist keine JSON-RPC-2.0-Nachricht." };
  }
  if (response.id !== expectedId) {
    return { ok: false, reason: `Antwort-Id ${String(response.id)} passt nicht zur Anfrage-Id ${String(expectedId)}.` };
  }
  if (response.error !== undefined) {
    const error = response.error as JsonRpcError;
    return {
      ok: false,
      reason: `Server-Fehler ${error?.code ?? "?"}: ${error?.message ?? "unbekannt"}`,
      error,
    };
  }
  if (response.result === undefined) {
    return { ok: false, reason: "Antwort enthaelt weder result noch error." };
  }
  return { ok: true, id: expectedId, result: response.result };
}

/* ==================== Tool-Mapping (Server -> Registry) ==================== */

type RawJsonSchemaProperty = { type?: string | string[] };

/**
 * Uebersetzt ein JSON-Schema der Server-Antwort in das typisierte
 * Eingabeschema der Registry. Unbekannte Typen fallen ehrlich auf "string"
 * zurueck (statt zu raten); fehlende Properties liefern ein leeres Schema.
 */
export function parseToolInputSchema(rawSchema: unknown): McpToolInputSchema {
  if (typeof rawSchema !== "object" || rawSchema === null) return {};
  const schema = rawSchema as { properties?: Record<string, RawJsonSchemaProperty>; required?: unknown };
  const properties = schema.properties ?? {};
  const requiredList = Array.isArray(schema.required) ? (schema.required as unknown[]).filter((r): r is string => typeof r === "string") : [];
  const mapped: McpToolInputSchema = {};
  for (const [key, property] of Object.entries(properties)) {
    const rawType = Array.isArray(property?.type) ? property.type[0] : property?.type;
    const type =
      rawType === "string" || rawType === "number" || rawType === "boolean" || rawType === "object"
        ? rawType
        : "string";
    mapped[key] = { type, required: requiredList.includes(key) };
  }
  return mapped;
}

/**
 * Uebersetzt das `tools/list`-Ergebnis eines Servers in Registry-Deskriptoren.
 * Berechtigungen bleiben konservativ (read + network) — Shell- oder
 * Dateisystemzugriff wird remote Tools nie automatisch verliehen.
 */
export function mapDiscoveredTools(serverName: string, toolsResult: unknown): McpToolDescriptor[] {
  if (typeof toolsResult !== "object" || toolsResult === null) return [];
  const tools = (toolsResult as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    if (typeof tool !== "object" || tool === null) return [];
    const entry = tool as { name?: unknown; description?: unknown; inputSchema?: unknown };
    if (typeof entry.name !== "string" || entry.name.length === 0) return [];
    const name = entry.name;
    return [{
      id: `${serverName}::${name}`,
      server: serverName,
      name,
      description: typeof entry.description === "string" ? entry.description : "",
      inputSchema: parseToolInputSchema(entry.inputSchema),
      permissions: [...DEFAULT_DISCOVERED_TOOL_PERMISSIONS],
    }];
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
}

/* ==================== Tool-Ergebnis-Extraktion ==================== */

export type McpToolCallOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** Extrahiert lesbaren Text aus einem `tools/call`-Ergebnis (Content-Bloecke). */
export function extractToolCallResult(result: unknown): McpToolCallOutcome {
  if (typeof result !== "object" || result === null) {
    return { ok: false, reason: "tools/call lieferte kein Objekt." };
  }
  const outcome = result as { isError?: unknown; content?: unknown; structuredContent?: unknown };
  if (outcome.isError === true) {
    return { ok: false, reason: "Der MCP-Server meldete einen Werkzeugfehler (isError)." };
  }
  const blocks = Array.isArray(outcome.content) ? outcome.content : [];
  const text = blocks
    .filter((block): block is { type: string; text?: unknown } => typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text")
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
  if (text.length > 0) return { ok: true, text };
  // Strukturierte Inhalte oder leere Antworten ehrlich als JSON serialisieren.
  if (outcome.structuredContent !== undefined) {
    return { ok: true, text: JSON.stringify(outcome.structuredContent) };
  }
  return { ok: true, text: JSON.stringify(result) };
}

/* ==================== Orchestrierung (injizierter Transport) ==================== */

export type McpSendFunction = (request: JsonRpcRequest | JsonRpcNotification) => Promise<unknown>;

export type McpDiscoveryOutcome =
  | { ok: true; serverInfo: unknown; tools: McpToolDescriptor[] }
  | { ok: false; reason: string };

/**
 * Fuehrt einen kompletten Discovery-Lauf aus: initialize ->
 * notifications/initialized -> tools/list. Reihenfolge wird ueber die
 * injizierte send-Funktion deterministisch vorgegeben und getestet.
 */
export async function runMcpDiscovery(input: {
  serverName: string;
  clientName?: string;
  clientVersion?: string;
  send: McpSendFunction;
}): Promise<McpDiscoveryOutcome> {
  const { serverName, send } = input;
  const clientName = input.clientName ?? MCP_CLIENT_NAME;
  const clientVersion = input.clientVersion ?? "0.0.0";

  const initResponse = await send(buildInitializeRequest(clientName, clientVersion, 1));
  const parsedInit = parseJsonRpcResponse(initResponse, 1);
  if (!parsedInit.ok) return { ok: false, reason: `initialize fehlgeschlagen: ${parsedInit.reason}` };

  // Notifications erhalten keine Antwort (Server antwortet 202) — Fehler hier
  // sind tolerierbar; die Verbindung ist trotzdem etabliert.
  try {
    await send(buildInitializedNotification());
  } catch {
    // bewusst ignoriert
  }

  const listResponse = await send(buildToolsListRequest(2));
  const parsedList = parseJsonRpcResponse(listResponse, 2);
  if (!parsedList.ok) return { ok: false, reason: `tools/list fehlgeschlagen: ${parsedList.reason}` };

  const initializeResult = parsedInit.result as { serverInfo?: unknown } | null;
  return {
    ok: true,
    serverInfo: initializeResult && typeof initializeResult === "object" ? initializeResult.serverInfo ?? null : null,
    tools: mapDiscoveredTools(serverName, parsedList.result),
  };
}

/* ==================== Anzeige (Sprint 135) ==================== */

/** Ergebnis von `mcp.connect` (Server-Router) fuer die Kachel-Aufbereitung. */
export type McpConnectReport = {
  connected: boolean;
  reason: string;
  tools: McpToolDescriptor[];
  serverInfo: unknown;
};

export type McpDiscoverySummary = {
  /** Kopfzeile: Tool-Anzahl oder der ehrliche Scheiter-Grund. */
  statusLabel: string;
  /** "Server-Name v1.0" aus serverInfo (null, wenn der Server nichts meldet). */
  serverLabel: string | null;
  /** Maximal drei Tool-Kurznamen als Vorschau. */
  toolNames: string[];
  /** Anzahl weiterer Tools jenseits der Vorschau. */
  moreCount: number;
};

function formatServerInfo(serverInfo: unknown): string | null {
  if (typeof serverInfo !== "object" || serverInfo === null) return null;
  const info = serverInfo as { name?: unknown; version?: unknown };
  const name = typeof info.name === "string" && info.name.length > 0 ? info.name : null;
  const version = typeof info.version === "string" && info.version.length > 0 ? info.version : null;
  if (name && version) return `${name} v${version}`;
  return name;
}

/**
 * Bereitet ein `mcp.connect`-Ergebnis fuer die Dashboard-Kachel auf:
 * verbunden → Tool-Anzahl, Server-Label und Namens-Vorschau; getrennt oder
 * nie konfiguriert → der ehrliche Grund als Kopfzeile (Sprint-122-Stil).
 */
export function summarizeMcpDiscovery(report: McpConnectReport): McpDiscoverySummary {
  if (!report.connected) {
    return { statusLabel: report.reason, serverLabel: null, toolNames: [], moreCount: 0 };
  }
  const count = report.tools.length;
  const statusLabel = count === 0
    ? "Verbunden — der Server meldet keine Tools."
    : `Verbunden — ${count} Tool${count === 1 ? "" : "s"} entdeckt.`;
  const names = report.tools.map((tool) => tool.name);
  return {
    statusLabel,
    serverLabel: formatServerInfo(report.serverInfo),
    toolNames: names.slice(0, 3),
    moreCount: Math.max(0, names.length - 3),
  };
}
