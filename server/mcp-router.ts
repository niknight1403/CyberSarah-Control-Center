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
 *
 * Sprint 136 — Sitzungs-Cache: `connect` und `callTool` verwendenden gemeinsamen
 * prozesslokalen Sitzungs-Cache (lib/mcp-session-logic.ts). callTool nutzt die
 * Sitzung aus dem Cache (kein Handshake); laeuft sie serverseitig ab (HTTP 404),
 * gibt es genau einen frischen Handshake mit Wiederholung.
 */
import { z } from "zod";

import {
  DEFAULT_DISCOVERED_TOOL_PERMISSIONS,
  runMcpDiscovery,
} from "../lib/mcp-client-logic";
import {
  buildTransportEndpoints,
  MCP_TRANSPORTS,
  negotiateTransport,
} from "../lib/mcp-transport-logic";
import { assertToolAllowed } from "../lib/mcp-registry-logic";
import { createMcpSessionStore, runMcpToolCall } from "../lib/mcp-session-logic";
import { createStreamableHttpSend } from "./mcp-channel";
import { drizzleMcpServerStore } from "./mcp-server-store";
import { createMcpServerService, type GovernanceGate } from "./mcp-server-service";
import { createMcpGovernanceService } from "./mcp-governance-service";
import { drizzleApprovalStore, drizzleToolGovernanceStore } from "./mcp-governance-store";
import { createMcpCredentialService } from "./mcp-credential-service";
import { drizzleCredentialStore } from "./mcp-credential-store";
import { createMcpSupervisorService } from "./mcp-supervisor-service";
import { drizzleCircuitStore } from "./mcp-supervisor-store";
import { decryptSecret, encryptSecret } from "../lib/provider-admin-logic";
import { CAPABILITY_TAGS, type GovernanceMode } from "../lib/mcp-governance-logic";
import { getToolProxyQueue } from "./_core/tool-proxy-queue";
import { adminProcedure, router } from "./_core/trpc";

/** Berechtigungen, die Remote-Tools im Betrieb verliehen werden (ENV-Override). */
function grantedToolPermissions() {
  const raw = process.env.MCP_TOOL_PERMISSIONS?.trim();
  const allowed = ["read", "write", "network", "shell", "filesystem"] as const;
  if (!raw) return ["read", "network"] as const;
  const parsed = raw.split(",").map((entry) => entry.trim()).filter((entry): entry is (typeof allowed)[number] =>
    (allowed as readonly string[]).includes(entry));
  return parsed.length > 0 ? parsed : (["read", "network"] as const);
}

/** Prozesslokaler Sitzungs-Cache (Sprint 136): je Server-URL eine Sitzung. */
const mcpSessionStore = createMcpSessionStore();

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


/** Service-Instanz je Aufruf: Store ist zustandslos, der Sitzungs-Cache lebt im Service. */
let multiServerService: ReturnType<typeof createMcpServerService> | null = null;
let governanceService: ReturnType<typeof createMcpGovernanceService> | null = null;
let credentialService: ReturnType<typeof createMcpCredentialService> | null = null;
let supervisorService: ReturnType<typeof createMcpSupervisorService> | null = null;

function getSupervisorService() {
  if (!supervisorService) {
    supervisorService = createMcpSupervisorService({ store: drizzleCircuitStore });
  }
  return supervisorService;
}

/**
 * Schluessel fuer die Vault-Verschluesselung: identisch zur Secret-Ablage
 * (Sprint 167), damit es nur einen Crypto-Pfad gibt. Fehlt das Secret, wird
 * ehrlich geworfen statt mit einem Default zu verschluesseln.
 */
function credentialEncryptionSecret(): string {
  const secret = (process.env.PROVIDER_KEY_ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error(
      "Kein Server-Secret fuer die Vault-Verschluesselung verfuegbar. Setze JWT_SECRET oder PROVIDER_KEY_ENCRYPTION_SECRET.",
    );
  }
  return secret;
}

function getCredentialService() {
  if (!credentialService) {
    credentialService = createMcpCredentialService({
      store: drizzleCredentialStore,
      encrypt: (plaintext) => encryptSecret(plaintext, credentialEncryptionSecret()),
      decrypt: (payload) => decryptSecret(payload, credentialEncryptionSecret()),
      requestToken: async ({ url, headers, body }) => {
        const response = await fetch(url, { method: "POST", headers, body, redirect: "error" });
        const text = await response.text();
        let payload: unknown = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = { error: "Antwort ist kein JSON" };
        }
        return { status: response.status, payload };
      },
    });
  }
  return credentialService;
}

/**
 * Governance-Service mit der Registry als Serverquelle. Der Modus je Server
 * kommt aus `mcp_servers.governance_mode` (Default: assisted).
 */
function getGovernanceService() {
  if (!governanceService) {
    governanceService = createMcpGovernanceService({
      toolStore: drizzleToolGovernanceStore,
      approvalStore: drizzleApprovalStore,
      loadServers: async () => {
        const rows = await drizzleMcpServerStore.list();
        return rows.map((row) => ({
          serverKey: row.serverKey,
          tools: (row.tools ?? []).map((tool) => ({
            name: String(tool.name ?? ""),
            description: typeof tool.description === "string" ? tool.description : "",
            inputSchema: tool.inputSchema,
          })),
          permissions: row.permissions ?? [],
          governanceMode: (row.governanceMode ?? "assisted") as GovernanceMode,
          enabled: row.enabled,
        }));
      },
    });
  }
  return governanceService;
}

function getServerService() {
  if (!multiServerService) {
    multiServerService = createMcpServerService({
      store: drizzleMcpServerStore,
      governance: getGovernanceService() as GovernanceGate,
      resolveCredential: (input) => getCredentialService().resolve(input),
      supervisor: getSupervisorService(),
    });
  }
  return multiServerService;
}

/** Eingabe-Schema der Multi-Server-Verwaltung (Fachvalidierung liegt in der lib). */
const serverDraftSchema = z.object({
  key: z.string().min(2).max(64),
  name: z.string().min(1).max(120),
  baseUrl: z.string().min(8).max(500),
  transport: z.enum(["streamable-http", "sse"]).optional(),
  permissions: z.array(z.enum(["read", "write", "network", "shell", "filesystem"])).optional(),
  credentialEnvVar: z.string().max(80).nullable().optional(),
  costProfile: z.enum(["free", "metered", "unknown"]).optional(),
  enabled: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
  /** Nur mit dieser ausdruecklichen Freigabe werden write/shell/filesystem vergeben. */
  allowSensitivePermissions: z.boolean().optional(),
});

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
      const channel = createStreamableHttpSend(endpoint.rpcUrl);
      const discovery = await runMcpDiscovery({
        serverName: "remote",
        clientVersion: process.env.APP_VERSION ?? "0.0.0",
        send: channel.send,
      });
      if (!discovery.ok) {
        return { connected: false, reason: discovery.reason, tools: [], serverInfo: null };
      }
      // Sprint 136: Etablierte Sitzung cachen — der erste callTool danach
      // spart sich den Handshake.
      const sessionId = channel.getSessionId();
      if (sessionId) mcpSessionStore.set(endpoint.rpcUrl, sessionId, Date.now());
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
   * Sprint 134/136 — Fuehrt ein Remote-Tool aus (Berechtigungs-Gate vor dem
   * Netzwerkaufruf; alle Tools duerfen nur die via MCP_TOOL_PERMISSIONS
   * verliehenen Berechtigungen nutzen). Die Sitzungs-Orchestrierung (Cache,
   * Erneuerung nach Ablauf) liegt rein in lib/mcp-session-logic.ts.
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

      // Sprint 136: Orchestrierung mit Sitzungs-Cache liegt rein und
      // getestet in lib/mcp-session-logic.ts (Handshake nur ohne frische
      // Sitzung; HTTP 404 => ein frischer Handshake mit Wiederholung).
      // Sprint 196: Remote-Tool-Aufrufe durchlaufen die Tool-Proxy-Queue
      // (Concurrency-Limit, 429-Retry mit Backoff) — schuetzt den Remote-Server.
      return getToolProxyQueue().enqueue(() => runMcpToolCall({
        toolName: input.toolName,
        args: input.args,
        serverUrl: endpoint.rpcUrl,
        store: mcpSessionStore,
        nowMs: () => Date.now(),
        clientVersion: process.env.APP_VERSION ?? "0.0.0",
        openSession: (sessionId) => createStreamableHttpSend(endpoint.rpcUrl, { initialSessionId: sessionId }),
      }));
    }),
  /**
   * Master-Prompt Phase 2 — Multi-MCP-Server-Registry.
   *
   * Jeder Server traegt eigenes Berechtigungsprofil, Kostenprofil und einen
   * nachweisbaren Health-Zustand. Neue Server erhalten nie automatisch
   * weitreichende Rechte (Standard read+network, sensible Rechte nur mit
   * allowSensitivePermissions). Zugangsdaten bleiben ENV-Referenzen.
   */
  servers: router({
    list: adminProcedure.query(async () => getServerService().listServers()),

    register: adminProcedure
      .input(serverDraftSchema)
      .mutation(async ({ input }) => getServerService().registerServer(input)),

    setEnabled: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64), enabled: z.boolean() }))
      .mutation(async ({ input }) => getServerService().setEnabled(input.serverKey, input.enabled)),

    /** Freigabemodus: manual | assisted | autonomous. */
    setGovernanceMode: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64), mode: z.enum(["manual", "assisted", "autonomous"]) }))
      .mutation(async ({ input }) => getServerService().setGovernanceMode(input.serverKey, input.mode)),

    remove: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64) }))
      .mutation(async ({ input }) => getServerService().removeServer(input.serverKey)),

    /** Healthcheck + Tool-Discovery; Ergebnis wird persistiert (Health-Score). */
    probe: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64) }))
      .mutation(async ({ input }) =>
        getToolProxyQueue().enqueue(() => getServerService().probeServer(input.serverKey)),
      ),

    /** Tool-Aufruf ueber die Server-Id — Berechtigungs-Gate vor dem Netzwerk. */
    callTool: adminProcedure
      .input(
        z.object({
          serverKey: z.string().min(2).max(64),
          toolName: z.string().min(1).max(120),
          args: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .mutation(async ({ input }) =>
        getToolProxyQueue().enqueue(() =>
          getServerService().callTool(input.serverKey, { toolName: input.toolName, args: input.args }),
        ),
      ),
  }),
  /**
   * Sprint 3 — Governance-Gateway.
   *
   * Fähigkeitsprofile und Risikostufen entstehen aus `tools/list`, nicht aus
   * einer gepflegten Liste. Entscheidungen sind nachvollziehbar (Gründe) und
   * an die Schema-Signatur gebunden: ändert der Server ein Tool, muss neu
   * entschieden werden.
   */
  governance: router({
    list: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64).optional() }).optional())
      .query(async ({ input }) => getGovernanceService().listGovernance(input?.serverKey)),

    index: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64) }))
      .mutation(async ({ input }) => getGovernanceService().indexServerTools(input.serverKey)),

    /** Semantische Werkzeugsuche über alle aktiven Server. */
    search: adminProcedure
      .input(
        z.object({
          query: z.string().min(2).max(200),
          limit: z.number().int().min(1).max(50).optional(),
          capability: z.enum(CAPABILITY_TAGS as unknown as [string, ...string[]]).optional(),
          serverKey: z.string().min(2).max(64).optional(),
        }),
      )
      .query(async ({ input }) =>
        getGovernanceService().search(input.query, {
          limit: input.limit,
          capability: input.capability as (typeof CAPABILITY_TAGS)[number] | undefined,
          serverKey: input.serverKey,
        }),
      ),

    /** Trockenlauf des Gates: legt bei Bedarf eine Freigabeanfrage an. */
    evaluate: adminProcedure
      .input(
        z.object({
          serverKey: z.string().min(2).max(64),
          toolName: z.string().min(1).max(120),
          args: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        getGovernanceService().evaluateCall({
          serverKey: input.serverKey,
          toolName: input.toolName,
          args: input.args,
          requestedBy: ctx.user?.openId ?? null,
        }),
      ),
  }),

  /** Freigaben (Human-in-the-Loop) für kritische Werkzeuge. */
  approvals: router({
    list: adminProcedure
      .input(z.object({ status: z.enum(["pending", "approved", "rejected", "expired"]).optional() }).optional())
      .query(async ({ input }) => getGovernanceService().listApprovals(input?.status)),

    decide: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          decision: z.enum(["approved", "rejected"]),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        getGovernanceService().decideApproval({
          id: input.id,
          decision: input.decision,
          decidedBy: ctx.user?.openId ?? "admin",
        }),
      ),

    expire: adminProcedure.mutation(async () => ({ expired: await getGovernanceService().expireStaleApprovals() })),
  }),
  /**
   * Sprint 4 — Credential Vault.
   *
   * Werte werden ausschliesslich verschluesselt gespeichert und nur maskiert
   * zurueckgegeben. Die Aufloesung (Vault vor ENV) passiert im Aufrufpfad,
   * nicht im UI.
   */
  credentials: router({
    list: adminProcedure.query(async () => getCredentialService().list()),

    setBearer: adminProcedure
      .input(
        z.object({
          serverKey: z.string().min(2).max(64),
          kind: z.enum(["bearer", "api_key"]).default("bearer"),
          secret: z.string().min(8).max(8192),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        getCredentialService().setStatic({
          serverKey: input.serverKey,
          kind: input.kind,
          secret: input.secret,
          actor: ctx.user?.openId ?? null,
        }),
      ),

    setOAuth: adminProcedure
      .input(
        z.object({
          serverKey: z.string().min(2).max(64),
          tokenUrl: z.string().url().max(500),
          clientId: z.string().min(1).max(200),
          clientSecret: z.string().min(8).max(8192),
          scopes: z.array(z.string().min(1).max(120)).max(20).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        getCredentialService().setOAuthClient({ ...input, actor: ctx.user?.openId ?? null }),
      ),

    remove: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64) }))
      .mutation(async ({ input }) => getCredentialService().remove(input.serverKey)),
  }),
  /** Sprint 5 — Circuit Breaker: Zustand anzeigen und zuruecksetzen. */
  supervisor: router({
    status: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64).optional() }).optional())
      .query(async ({ input }) => getSupervisorService().status(input?.serverKey)),

    reset: adminProcedure
      .input(z.object({ serverKey: z.string().min(2).max(64), toolName: z.string().min(1).max(120).optional() }))
      .mutation(async ({ input }) => {
        await getSupervisorService().reset(input.serverKey, input.toolName ?? null);
        return { ok: true };
      }),
  }),
});
