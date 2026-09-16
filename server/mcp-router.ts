/**
 * Sprint 122 — MCP-Transport: duenne tRPC-Schnittstelle fuer die MCP-
 * Transportschicht (Streamable HTTP + HTTP/SSE-Fallback) aufbauend auf der
 * reinen Logik in lib/mcp-transport-logic.ts und der Registry aus
 * lib/mcp-registry-logic.ts. Admin-geschuetzt wie die gesamte Betriebs-
 * Konfiguration; keine Secrets, alle Meldungen tokenfrei.
 *
 * Sprint 134 — Echter Netzwerk-Client: `connect` und `callTool` fuehren
 * JSON-RPC-Gespraeche gegen den konfigurierten MCP-Server
 * (MCP_SERVER_URL, Streamable HTTP) — mit Session-Header, Timeout und
 * ehrlicher Nicht-konfiguriert-Antwort. Die Protokolllogik liegt rein
 * und getestet in lib/mcp-client-logic.ts.
 */
import { z } from "zod";

import {
  buildToolsCallRequest,
  buildInitializeRequest,
  buildInitializedNotification,
  DEFAULT_DISCOVERED_TOOL_PERMISSIONS,
  extractToolCallResult,
  MCP_CLIENT_NAME,
  parseJsonRpcResponse,
  runMcpDiscovery,
  type JsonRpcNotification,
  type JsonRpcRequest,
} from "../lib/mcp-client-logic";
import {
  buildTransportEndpoints,
  MCP_TRANSPORTS,
  negotiateTransport,
} from "../lib/mcp-transport-logic";
import { assertToolAllowed } from "../lib/mcp-registry-logic";
import { adminProcedure, router } from "./_core/trpc";

/** Request-Timeout fuer MCP-Gespraeche (Sandbox-Ports wuerden haengen). */
const MCP_REQUEST_TIMEOUT_MS = 10_000;

/** Berechtigungen, die Remote-Tools im Betrieb verliehen werden (ENV-Override). */
function grantedToolPermissions() {
  const raw = process.env.MCP_TOOL_PERMISSIONS?.trim();
  const allowed = ["read", "write", "network", "shell", "filesystem"] as const;
  if (!raw) return ["read", "network"] as const;
  const parsed = raw.split(",").map((entry) => entry.trim()).filter((entry): entry is (typeof allowed)[number] =>
    (allowed as readonly string[]).includes(entry));
  return parsed.length > 0 ? parsed : (["read", "network"] as const);
}

type StreamableHttpSend = (request: JsonRpcRequest | JsonRpcNotification) => Promise<unknown>;

/**
 * Baut die send-Funktion fuer Streamable HTTP: POST mit JSON-RPC-Body,
 * Accept fuer JSON und Event-Stream, Session-Header wird aus der ersten
 * Antwort uebernommen, SSE-Antworten werden auf data:-Zeilen reduziert.
 */
function createStreamableHttpSend(rpcUrl: string): StreamableHttpSend {
  let sessionId: string | null = null;
  return async (request) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
    });
    const newSession = response.headers.get("mcp-session-id");
    if (newSession) sessionId = newSession;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    // Notifications beantwortet der Server mit 202 ohne Body.
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
}

/** Liest MCP_SERVER_URL und validiert die Streamable-HTTP-Endpunkte. */
function resolveConfiguredEndpoint():
  | { ok: true; baseUrl: string; rpcUrl: string }
  | { ok: false; reason: string } {
  const baseUrl = process.env.MCP_SERVER_URL?.trim().replace(/\/+$/, "") ?? null;
  if (!baseUrl) {
    return { ok: false, reason: "Kein MCP-Server konfiguriert (MCP_SERVER_URL nicht gesetzt)." };
  }
  const negotiation = negotiateTransport({ preferred: "streamable-http" });
  const endpoints = buildTransportEndpoints(baseUrl, negotiation.kind);
  if (!endpoints.ok) return endpoints;
  const rpcUrl = negotiation.kind === "streamable-http" ? endpoints.endpoints.rpc : endpoints.endpoints.messages;
  return { ok: true, baseUrl, rpcUrl };
}

export const mcpRouter = router({
  /** Verfuegbare Transporte (statisch, rein) + konfigurierte Endpunkte. */
  transports: adminProcedure.query(() => {
    const baseUrl = process.env.MCP_SERVER_URL?.trim().replace(/\/+$/, "") ?? null;
    const transports = Object.values(MCP_TRANSPORTS).map((descriptor) => {
      // Ohne konfigurierte Basis-URL bleiben die Endpunkte ehrlich null —
      // der Transport existiert, ist aber nicht angeschlossen.
      const endpoints = baseUrl
        ? buildTransportEndpoints(baseUrl, descriptor.kind)
        : null;
      return {
        ...descriptor,
        configured: endpoints !== null && endpoints.ok,
        endpoints: endpoints && endpoints.ok ? endpoints.endpoints : null,
        invalidReason: endpoints && !endpoints.ok ? endpoints.reason : null,
      };
    });
    return {
      baseUrl,
      transports,
    };
  }),
  /** Verhandelt den Transport fuer einen Server (reine Logik, deterministisch). */
  negotiate: adminProcedure
    .input(
      z
        .object({
          preferred: z.enum(["streamable-http", "sse"]).optional(),
          serverCapabilities: z
            .object({
              streamableHttp: z.boolean().optional(),
              sse: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
    )
    .mutation(({ input }) => negotiateTransport(input)),
  /**
   * Sprint 134 — Echter Discovery-Lauf gegen den konfigurierten MCP-Server:
   * initialize -> initialized -> tools/list. Ohne MCP_SERVER_URL wird
   * ehrlich "nicht angeschlossen" gemeldet, Netzwerkfehler als Grund.
   */
  connect: adminProcedure.mutation(async () => {
    const endpoint = resolveConfiguredEndpoint();
    if (!endpoint.ok) return { connected: false, reason: endpoint.reason, tools: [], serverInfo: null };
    try {
      const discovery = await runMcpDiscovery({
        serverName: "remote",
        clientVersion: process.env.APP_VERSION ?? "0.0.0",
        send: createStreamableHttpSend(endpoint.rpcUrl),
      });
      if (!discovery.ok) {
        return { connected: false, reason: discovery.reason, tools: [], serverInfo: null };
      }
      return {
        connected: true,
        reason: `Verbunden über Streamable HTTP — ${discovery.tools.length} Tools entdeckt.`,
        tools: discovery.tools,
        serverInfo: discovery.serverInfo,
      };
    } catch (error) {
      return {
        connected: false,
        reason: `Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
        tools: [],
        serverInfo: null,
      };
    }
  }),
  /**
   * Sprint 134 — Fuehrt ein Remote-Tool aus (Berechtigungs-Gate vor dem
   * Netzwerkaufruf; alle Tools duerfen nur die via MCP_TOOL_PERMISSIONS
   * verliehenen Berechtigungen nutzen).
   */
  callTool: adminProcedure
    .input(
      z.object({
        toolName: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .mutation(async ({ input }) => {
      const endpoint = resolveConfiguredEndpoint();
      if (!endpoint.ok) return { ok: false as const, reason: endpoint.reason };

      // Konservativer Deskriptor: Remote-Tools brauchen immer read + network
      // (siehe lib/mcp-client-logic.ts) — assertToolAllowed prueft, ob die
      // konfigurierten Grants das abdecken; mehr wird nie verliehen.
      const toolDescriptor = {
        id: `remote::${input.toolName}`,
        server: "remote",
        name: input.toolName,
        description: "",
        inputSchema: {},
        permissions: [...DEFAULT_DISCOVERED_TOOL_PERMISSIONS],
      };
      const permissionCheck = assertToolAllowed(toolDescriptor, grantedToolPermissions());
      if (!permissionCheck.allowed) {
        return { ok: false as const, reason: permissionCheck.reason };
      }

      const send = createStreamableHttpSend(endpoint.rpcUrl);
      try {
        const initResponse = await send(buildInitializeRequest(MCP_CLIENT_NAME, process.env.APP_VERSION ?? "0.0.0", 1));
        const parsedInit = parseJsonRpcResponse(initResponse, 1);
        if (!parsedInit.ok) return { ok: false as const, reason: `initialize fehlgeschlagen: ${parsedInit.reason}` };
        try {
          await send(buildInitializedNotification());
        } catch {
          // Notification ist best effort.
        }
        const callResponse = await send(buildToolsCallRequest(2, input.toolName, input.args));
        const parsedCall = parseJsonRpcResponse(callResponse, 2);
        if (!parsedCall.ok) return { ok: false as const, reason: `tools/call fehlgeschlagen: ${parsedCall.reason}` };
        const outcome = extractToolCallResult(parsedCall.result);
        return outcome.ok
          ? { ok: true as const, text: outcome.text }
          : { ok: false as const, reason: outcome.reason };
      } catch (error) {
        return {
          ok: false as const,
          reason: `Aufruf fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
        };
      }
    }),
});
