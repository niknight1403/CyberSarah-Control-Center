/**
 * Master-Prompt Phase 2 — Multi-MCP-Server-Service.
 *
 * Orchestriert Registrierung, Health-Pruefung und Tool-Aufrufe ueber beliebig
 * viele MCP-Server. Alle Entscheidungen (Validierung, Health-Score, Routing,
 * Redaktion) liegen rein in lib/mcp-server-registry-logic.ts; Persistenz in
 * server/mcp-server-store.ts; der JSON-RPC-Kanal in server/mcp-channel.ts.
 * Diese Datei verdrahtet die drei — mit injizierbaren Abhaengigkeiten, damit
 * die Tests echte Probe-/Aufrufpfade ohne Netz und ohne Datenbank fahren.
 *
 * Ehrlichkeitsgrenzen:
 * - Kein Server wird ohne erfolgreiche Pruefung als "healthy" gefuehrt.
 * - Fehlende ENV-Zugangsdaten werden als Fehlschlag protokolliert, nicht
 *   kaschiert; der Variablenname erscheint, nie der Wert.
 * - SSE-Transport ist registrierbar, aber nicht angebunden (klare Meldung).
 */
import type { McpServerRow } from "../drizzle/schema";
import {
  buildServerSnapshot,
  computeServerHealth,
  detectToolNameConflicts,
  normalizeServerKey,
  redactMcpError,
  resolveToolRoute,
  summarizeRegistry,
  validateServerDraft,
  type McpRegistrySummary,
  type McpServerDraftInput,
  type McpServerIssue,
  type McpServerSnapshot,
} from "../lib/mcp-server-registry-logic";
import { runMcpDiscovery } from "../lib/mcp-client-logic";
import { assertToolAllowed, type McpPermission, type McpToolDescriptor } from "../lib/mcp-registry-logic";
import { createMcpSessionStore, runMcpToolCall, type McpSessionStore } from "../lib/mcp-session-logic";
import { createStreamableHttpSend, resolveRpcUrl, type RpcChannel } from "./mcp-channel";
import type { McpServerStore } from "./mcp-server-store";

export type McpServerServiceDeps = {
  store: McpServerStore;
  /** Uhr fuer Health-Bewertung (Tests: deterministisch). */
  now?: () => number;
  env?: Record<string, string | undefined>;
  /** Kanal-Fabrik — im Betrieb server/mcp-channel.ts, in Tests ein Fake. */
  openChannel?: (args: {
    rpcUrl: string;
    credentialToken: string | null;
    initialSessionId: string | null;
  }) => RpcChannel;
  /** Sitzungs-Cache je Server (Standard: prozesslokal, je Server eine Map). */
  sessionStoreFor?: (serverKey: string) => McpSessionStore;
  clientVersion?: string;
  /**
   * Governance-Gateway (Sprint 3). Fehlt es, verhaelt sich der Service wie
   * bisher — die Registry bleibt nutzbar, ohne Governance zu erzwingen.
   */
  governance?: GovernanceGate;
  /**
   * Credential-Aufloesung (Sprint 4). Wird nur befragt, wenn die
   * ENV-Variable fehlt oder gar keine referenziert ist.
   */
  resolveCredential?: (input: { serverKey: string; envVarName?: string | null }) => Promise<
    { ok: true; token: string; source: "vault" | "env" } | { ok: false; reason: string }
  >;
};

/**
 * Minimale Sicht des Services auf das Governance-Gateway. Bewusst strukturell
 * typisiert, damit Registry und Governance nicht zirkulaer importieren.
 */
export type GovernanceGate = {
  evaluateCall(input: {
    serverKey: string;
    toolName: string;
    args: Record<string, unknown>;
    requestedBy?: string | null;
  }): Promise<{
    decision: "allow" | "approval_required" | "block";
    riskLevel: string;
    reasons: string[];
    approvalId: number | null;
    args: Record<string, unknown> | null;
  }>;
  indexServerTools(serverKey: string): Promise<{ ok: boolean }>;
};

export type RegisterResult =
  | {
      ok: true;
      created: boolean;
      withheldPermissions: McpPermission[];
      server: McpServerSnapshot;
    }
  | { ok: false; issues: McpServerIssue[] };

export type ProbeResult =
  | {
      ok: true;
      latencyMs: number;
      tools: McpToolDescriptor[];
      serverInfo: { name: string | null; version: string | null } | null;
      server: McpServerSnapshot | null;
    }
  | { ok: false; reason: string; server: McpServerSnapshot | null };

export type CallToolResult =
  | { ok: true; text: string; serverKey: string; toolName: string; warning: string | null }
  | {
      ok: false;
      reason: string;
      /** Nur gesetzt, wenn eine menschliche Freigabe den Aufruf blockiert. */
      approvalRequired?: { approvalId: number; riskLevel: string; reasons: string[] };
    };

export type SetModeResult = { ok: true; server: McpServerSnapshot } | { ok: false; reason: string };

export type ListResult =
  | { ok: true; servers: McpServerSnapshot[]; summary: McpRegistrySummary; conflicts: string[] }
  | { ok: false; reason: string };

export function createMcpServerService(deps: McpServerServiceDeps) {
  const now = deps.now ?? (() => Date.now());
  const env = deps.env ?? process.env;
  const clientVersion = deps.clientVersion ?? env.APP_VERSION ?? "0.0.0";
  const sessionStores = new Map<string, McpSessionStore>();
  const sessionStoreFor =
    deps.sessionStoreFor ??
    ((serverKey: string) => {
      const existing = sessionStores.get(serverKey);
      if (existing) return existing;
      const created = createMcpSessionStore();
      sessionStores.set(serverKey, created);
      return created;
    });
  const openChannel =
    deps.openChannel ??
    ((args: { rpcUrl: string; credentialToken: string | null; initialSessionId: string | null }) =>
      createStreamableHttpSend(args.rpcUrl, {
        initialSessionId: args.initialSessionId,
        credentialToken: args.credentialToken,
      }));

  function tokenFor(row: McpServerRow): string | null {
    if (!row.credentialEnvVar) return null;
    const value = env[row.credentialEnvVar];
    return value && value.trim() ? value.trim() : null;
  }

  function snapshot(row: McpServerRow): McpServerSnapshot {
    const configured = row.credentialEnvVar ? Boolean(tokenFor(row)) : true;
    return buildServerSnapshot(row, { nowMs: now(), credentialConfigured: configured });
  }

  async function listServers(): Promise<ListResult> {
    try {
      const rows = await deps.store.list();
      const servers = rows.map(snapshot);
      const summary = summarizeRegistry(servers);
      const toolsByServer: Record<string, { name: string }[]> = {};
      for (const row of rows) {
        toolsByServer[row.serverKey] = (row.tools ?? [])
          .map((tool) => ({ name: typeof tool.name === "string" ? tool.name : "" }))
          .filter((tool) => tool.name.length > 0);
      }
      const conflicts = detectToolNameConflicts(toolsByServer);
      return { ok: true, servers, summary: { ...summary, conflicts }, conflicts };
    } catch (error) {
      return { ok: false, reason: redactMcpError(errorMessage(error)) };
    }
  }

  async function registerServer(
    input: McpServerDraftInput & { allowSensitivePermissions?: boolean },
  ): Promise<RegisterResult> {
    let existingKeys: string[] = [];
    try {
      existingKeys = (await deps.store.list()).map((row) => row.serverKey);
    } catch {
      existingKeys = [];
    }
    const validation = validateServerDraft(input, {
      allowSensitivePermissions: input.allowSensitivePermissions === true,
      existingKeys,
    });
    if (!validation.ok) return { ok: false, issues: validation.issues };

    const created = !existingKeys.includes(validation.server.key);
    try {
      const row = await deps.store.upsert(validation.server);
      return {
        ok: true,
        created,
        withheldPermissions: validation.withheldPermissions,
        server: snapshot(row),
      };
    } catch (error) {
      return {
        ok: false,
        issues: [{ field: "store", message: redactMcpError(errorMessage(error)) }],
      };
    }
  }

  async function setEnabled(serverKey: string, enabled: boolean): Promise<{ ok: boolean; reason?: string; server?: McpServerSnapshot }> {
    const key = normalizeServerKey(serverKey);
    try {
      const row = await deps.store.setEnabled(key, enabled);
      if (!row) return { ok: false, reason: `Unbekannter MCP-Server: ${key}` };
      return { ok: true, server: snapshot(row) };
    } catch (error) {
      return { ok: false, reason: redactMcpError(errorMessage(error)) };
    }
  }

  async function removeServer(serverKey: string): Promise<{ ok: boolean; reason?: string }> {
    const key = normalizeServerKey(serverKey);
    try {
      const removed = await deps.store.remove(key);
      return removed ? { ok: true } : { ok: false, reason: `Unbekannter MCP-Server: ${key}` };
    } catch (error) {
      return { ok: false, reason: redactMcpError(errorMessage(error)) };
    }
  }

  /** Health-Pruefung: initialize -> tools/list; Ergebnis wird persistiert. */
  async function probeServer(serverKey: string): Promise<ProbeResult> {
    const key = normalizeServerKey(serverKey);
    let row: McpServerRow | null;
    try {
      row = await deps.store.findByKey(key);
    } catch (error) {
      return { ok: false, reason: redactMcpError(errorMessage(error)), server: null };
    }
    if (!row) return { ok: false, reason: `Unbekannter MCP-Server: ${key}`, server: null };
    if (!row.enabled) {
      return { ok: false, reason: `MCP-Server "${key}" ist deaktiviert.`, server: snapshot(row) };
    }

    const rpc = resolveRpcUrl(row.baseUrl, row.transport === "sse" ? "sse" : "streamable-http");
    if (!rpc.ok) return { ok: false, reason: rpc.reason, server: snapshot(row) };

    const token = tokenFor(row);
    if (row.credentialEnvVar && !token) {
      const reason = `Zugangsdaten fehlen: ENV ${row.credentialEnvVar} ist nicht gesetzt.`;
      const updated = await recordFailure(row, reason);
      return { ok: false, reason, server: updated };
    }

    const startedAt = Date.now();
    try {
      const channel = openChannel({ rpcUrl: rpc.rpcUrl, credentialToken: token, initialSessionId: null });
      const discovery = await runMcpDiscovery({
        serverName: key,
        clientVersion,
        send: channel.send,
      });
      const latencyMs = Date.now() - startedAt;

      if (!discovery.ok) {
        const updated = await recordFailure(row, discovery.reason);
        return { ok: false, reason: redactMcpError(discovery.reason), server: updated };
      }

      const sessionId = channel.getSessionId();
      if (sessionId) sessionStoreFor(key).set(key, sessionId, now());

      const checkedAt = new Date(now());
      const health = computeServerHealth({
        enabled: true,
        lastCheckedAtMs: checkedAt.getTime(),
        lastOkAtMs: checkedAt.getTime(),
        lastErrorAtMs: row.lastErrorAt ? row.lastErrorAt.getTime() : null,
        consecutiveFailures: 0,
        lastLatencyMs: latencyMs,
        nowMs: checkedAt.getTime(),
      });
      const serverInfo = readServerInfo(discovery.serverInfo);
      const tools = discovery.tools as unknown as Record<string, unknown>[];
      const updated = await deps.store.recordProbe(key, {
        healthStatus: health.status,
        healthScore: health.score,
        lastCheckedAt: checkedAt,
        lastOkAt: checkedAt,
        consecutiveFailures: 0,
        lastError: null,
        serverName: serverInfo?.name ?? null,
        serverVersion: serverInfo?.version ?? null,
        tools,
        toolsDiscoveredAt: checkedAt,
      });

      // Governance-Index nach jedem erfolgreichen Handshake erneuern: neue
      // Tools werden bewertet, verschwundene Einträge entfernt.
      if (deps.governance) {
        try {
          await deps.governance.indexServerTools(key);
        } catch {
          // Index-Fehler dürfen den Healthcheck nicht als fehlgeschlagen melden;
          // der Zustand bleibt "healthy", der Index wird beim nächsten Lauf erneuert.
        }
      }

      return {
        ok: true,
        latencyMs,
        tools: discovery.tools,
        serverInfo,
        server: updated ? snapshot(updated) : null,
      };
    } catch (error) {
      const updated = await recordFailure(row, errorMessage(error));
      return { ok: false, reason: redactMcpError(errorMessage(error)), server: updated };
    }
  }

  async function recordFailure(row: McpServerRow, rawReason: string): Promise<McpServerSnapshot | null> {
    const checkedAt = new Date(now());
    const failures = Math.max(0, row.consecutiveFailures) + 1;
    const health = computeServerHealth({
      enabled: row.enabled,
      lastCheckedAtMs: checkedAt.getTime(),
      lastOkAtMs: row.lastOkAt ? row.lastOkAt.getTime() : null,
      lastErrorAtMs: checkedAt.getTime(),
      consecutiveFailures: failures,
      nowMs: checkedAt.getTime(),
    });
    try {
      const updated = await deps.store.recordProbe(row.serverKey, {
        healthStatus: health.status,
        healthScore: health.score,
        lastCheckedAt: checkedAt,
        lastErrorAt: checkedAt,
        lastError: redactMcpError(rawReason),
        consecutiveFailures: failures,
      });
      return updated ? snapshot(updated) : null;
    } catch {
      return null;
    }
  }

  /** Freigabemodus je Server (manual | assisted | autonomous). */
  async function setGovernanceMode(serverKey: string, mode: string): Promise<SetModeResult> {
    const allowed = ["manual", "assisted", "autonomous"];
    if (!allowed.includes(mode)) {
      return { ok: false, reason: `Unbekannter Governance-Modus: ${mode}` };
    }
    const key = normalizeServerKey(serverKey);
    const updated = await deps.store.setGovernanceMode(key, mode);
    if (!updated) return { ok: false, reason: `Unbekannter MCP-Server: ${key}` };
    return { ok: true, server: snapshot(updated) };
  }

  /** Tool-Aufruf ueber die Server-Id — Berechtigungs-Gate vor dem Netzwerk. */
  async function callTool(
    serverKey: string,
    input: { toolName: string; args: Record<string, unknown> },
  ): Promise<CallToolResult> {
    const key = normalizeServerKey(serverKey);
    let row: McpServerRow | null;
    try {
      row = await deps.store.findByKey(key);
    } catch (error) {
      return { ok: false, reason: redactMcpError(errorMessage(error)) };
    }
    if (!row) return { ok: false, reason: `Unbekannter MCP-Server: ${key}` };

    const route = resolveToolRoute(
      `${key}::${input.toolName}`,
      [
        {
          key: row.serverKey,
          enabled: row.enabled,
          permissions: row.permissions,
          health: { status: snapshot(row).health.status },
        },
      ],
    );
    if (!route.ok) return { ok: false, reason: route.reason };

    const rpc = resolveRpcUrl(row.baseUrl, row.transport === "sse" ? "sse" : "streamable-http");
    if (!rpc.ok) return { ok: false, reason: rpc.reason };

    const permissions = row.permissions.filter((entry): entry is McpPermission =>
      ["read", "write", "network", "shell", "filesystem"].includes(entry),
    );
    const descriptor = {
      id: `${key}::${input.toolName}`,
      server: key,
      name: input.toolName,
      description: "",
      inputSchema: {},
      permissions: ["read", "network"] as McpPermission[],
    };
    const gate = assertToolAllowed(descriptor, permissions);
    if (!gate.allowed) return { ok: false, reason: gate.reason };

    let token = tokenFor(row);
    if (!token && deps.resolveCredential) {
      const resolved = await deps.resolveCredential({ serverKey: key, envVarName: row.credentialEnvVar });
      if (resolved.ok) {
        token = resolved.token;
      } else if (row.credentialEnvVar) {
        // Vault und ENV sind beide leer: den konkreten Grund nennen, nicht raten.
        return { ok: false, reason: resolved.reason };
      }
    }
    if (row.credentialEnvVar && !token) {
      return { ok: false, reason: `Zugangsdaten fehlen: ENV ${row.credentialEnvVar} ist nicht gesetzt.` };
    }

    // Governance-Gate: Argumente, Least Privilege und Freigabestatus werden
    // VOR dem Netzwerkaufruf geprüft. Ohne Gate bleibt das alte Verhalten.
    let callArgs = input.args;
    if (deps.governance) {
      const evaluation = await deps.governance.evaluateCall({
        serverKey: key,
        toolName: input.toolName,
        args: input.args,
      });
      if (evaluation.decision === "block") {
        return { ok: false, reason: `Governance: ${evaluation.reasons.join("; ")}` };
      }
      if (evaluation.decision === "approval_required") {
        return {
          ok: false,
          reason: `Freigabe erforderlich (${evaluation.riskLevel}): ${evaluation.reasons.join("; ")}`,
          approvalRequired: {
            approvalId: evaluation.approvalId ?? 0,
            riskLevel: evaluation.riskLevel,
            reasons: evaluation.reasons,
          },
        };
      }
      if (evaluation.args) callArgs = evaluation.args;
    }

    try {
      const outcome = await runMcpToolCall({
        toolName: input.toolName,
        args: callArgs,
        // Cache-Schluessel ist der Server-Key (nicht die URL), damit zwei
        // Server mit gleicher URL keine Sitzung teilen.
        serverUrl: key,
        store: sessionStoreFor(key),
        nowMs: () => now(),
        clientVersion,
        openSession: (sessionId) =>
          openChannel({ rpcUrl: rpc.rpcUrl, credentialToken: token, initialSessionId: sessionId }),
      });
      if (!outcome.ok) return { ok: false, reason: redactMcpError(outcome.reason) };
      return { ok: true, text: outcome.text, serverKey: key, toolName: input.toolName, warning: route.warning };
    } catch (error) {
      return { ok: false, reason: redactMcpError(errorMessage(error)) };
    }
  }

  return { listServers, registerServer, setEnabled, setGovernanceMode, removeServer, probeServer, callTool };
}

export type McpServerService = ReturnType<typeof createMcpServerService>;

/**
 * Server-Selbstauskunft aus `initialize` ist per Vertrag `unknown` — hier
 * fehlertolerant gelesen, nie geraten: fehlt ein String, bleibt das Feld null.
 */
function readServerInfo(raw: unknown): { name: string | null; version: string | null } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : null;
  const version = typeof record.version === "string" && record.version.trim() ? record.version.trim() : null;
  if (!name && !version) return null;
  return { name, version };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
