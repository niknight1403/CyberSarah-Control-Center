/**
 * Master-Prompt Phase 2 — Tests des Multi-MCP-Server-Service.
 *
 * Der Service ist die Stelle, an der Registrierung, Healthcheck und
 * Tool-Aufruf zusammenlaufen. Getestet wird er mit einem In-Memory-Store und
 * einem Fake-Kanal: kein Netz, keine Datenbank. Abgesichert sind die
 * ehrlichen Pfade (unbekannt, deaktiviert, ungeprüft, Zugangsdaten fehlen,
 * Transport nicht angebunden) und die Sicherheitszusagen (Berechtigungs-Gate
 * vor dem Aufruf, Redaktion von Fehlermeldungen, keine Secrets in Antworten).
 */
import { describe, expect, it } from "vitest";

import type { McpServerRow } from "../drizzle/schema";
import { createMcpServerService } from "../server/mcp-server-service";
import type { McpServerStore } from "../server/mcp-server-store";
import type { RpcChannel } from "../server/mcp-channel";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");

/** Fantasiewerte, zusammengesetzt statt als Literal (Gitleaks generic-api-key). */
const FAKE_TOKEN = ["dummy", "wert"].join("_");
const FAKE_HEADER = ["bearer", "dummy", "wert"].join(" ");

function row(overrides: Partial<McpServerRow> = {}): McpServerRow {
  return {
    id: 1,
    serverKey: "github",
    name: "GitHub MCP",
    baseUrl: "https://mcp.example.com",
    transport: "streamable-http",
    permissions: ["read", "network"],
    credentialEnvVar: null,
    costProfile: "free",
    enabled: true,
    notes: null,
    healthStatus: "unchecked",
    healthScore: null,
    consecutiveFailures: 0,
    lastCheckedAt: null,
    lastOkAt: null,
    lastErrorAt: null,
    lastError: null,
    serverName: null,
    serverVersion: null,
    tools: [],
    toolsDiscoveredAt: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  } as McpServerRow;
}

function createFakeStore(seed: McpServerRow[] = []) {
  const rows = new Map<string, McpServerRow>(seed.map((entry) => [entry.serverKey, entry]));
  const stats = { upserts: 0, probes: 0, lists: 0 };
  let nextId = seed.length + 1;

  const store: McpServerStore = {
    async list() {
      stats.lists += 1;
      return [...rows.values()];
    },
    async findByKey(key) {
      return rows.get(key) ?? null;
    },
    async upsert(server) {
      stats.upserts += 1;
      const existing = rows.get(server.key);
      const saved = {
        ...(existing ?? row({ id: nextId++, serverKey: server.key })),
        serverKey: server.key,
        name: server.name,
        baseUrl: server.baseUrl,
        transport: server.transport,
        permissions: server.permissions,
        credentialEnvVar: server.credentialEnvVar,
        costProfile: server.costProfile,
        enabled: server.enabled,
        notes: server.notes,
      } as McpServerRow;
      rows.set(server.key, saved);
      return saved;
    },
    async setEnabled(key, enabled) {
      const existing = rows.get(key);
      if (!existing) return null;
      const saved = { ...existing, enabled };
      rows.set(key, saved);
      return saved;
    },
    async remove(key) {
      return rows.delete(key);
    },
    async recordProbe(key, patch) {
      stats.probes += 1;
      const existing = rows.get(key);
      if (!existing) return null;
      const saved = {
        ...existing,
        healthStatus: patch.healthStatus,
        healthScore: patch.healthScore,
        lastCheckedAt: patch.lastCheckedAt,
        consecutiveFailures: patch.consecutiveFailures,
        lastOkAt: patch.lastOkAt !== undefined ? patch.lastOkAt : existing.lastOkAt,
        lastErrorAt: patch.lastErrorAt !== undefined ? patch.lastErrorAt : existing.lastErrorAt,
        lastError: patch.lastError !== undefined ? patch.lastError : existing.lastError,
        serverName: patch.serverName !== undefined ? patch.serverName : existing.serverName,
        serverVersion: patch.serverVersion !== undefined ? patch.serverVersion : existing.serverVersion,
        tools: patch.tools !== undefined ? patch.tools : existing.tools,
        toolsDiscoveredAt:
          patch.toolsDiscoveredAt !== undefined ? patch.toolsDiscoveredAt : existing.toolsDiscoveredAt,
      } as McpServerRow;
      rows.set(key, saved);
      return saved;
    },
  };

  return { store, rows, stats };
}

type FakeChannelOptions = {
  fail?: Error | null;
  tools?: { name: string; description?: string }[];
  toolText?: string;
};

function createFakeChannel(options: FakeChannelOptions = {}) {
  const sent: { method: string; id?: number | string }[] = [];
  const channel: RpcChannel = {
    async send(request) {
      const method = (request as { method: string }).method;
      const id = (request as { id?: number | string }).id;
      sent.push({ method, id });
      if (options.fail && method !== "notifications/initialized") throw options.fail;
      if (method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: { protocolVersion: "2025-03-26", serverInfo: { name: "Fake MCP", version: "1.0.0" }, capabilities: {} },
        };
      }
      if (method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: (options.tools ?? [{ name: "search_code", description: "Sucht Code" }]).map((tool) => ({
              name: tool.name,
              description: tool.description ?? "",
              inputSchema: { type: "object" },
            })),
          },
        };
      }
      if (method === "tools/call") {
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: options.toolText ?? "ok" }] } };
      }
      return undefined;
    },
    getSessionId: () => "session-abc",
  };
  return { channel, sent };
}

function buildService(overrides: {
  seed?: McpServerRow[];
  env?: Record<string, string | undefined>;
  channelOptions?: FakeChannelOptions;
}) {
  const fake = createFakeStore(overrides.seed ?? []);
  const sent: { method: string; id?: number | string }[] = [];
  const opened: { rpcUrl: string; credentialToken: string | null; initialSessionId: string | null }[] = [];
  const service = createMcpServerService({
    store: fake.store,
    now: () => NOW,
    env: overrides.env ?? {},
    clientVersion: "test",
    openChannel: (args) => {
      opened.push(args);
      const channel = createFakeChannel(overrides.channelOptions);
      return {
        send: (request) => {
          sent.push(request as { method: string; id?: number | string });
          return channel.channel.send(request);
        },
        getSessionId: channel.channel.getSessionId,
      };
    },
  });
  return { service, ...fake, sent, opened };
}

describe("Registrierung", () => {
  it("legt einen neuen Server mit sicheren Standardrechten an", async () => {
    const { service, rows, stats } = buildService({});
    const result = await service.registerServer({
      key: "GitHub-MCP",
      name: "GitHub MCP",
      baseUrl: "https://mcp.example.com/",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.withheldPermissions).toEqual([]);
    expect(result.server.permissions).toEqual(["read", "network"]);
    expect(result.server.health.status).toBe("unchecked");
    expect(stats.upserts).toBe(1);
    expect(rows.get("github-mcp")?.baseUrl).toBe("https://mcp.example.com");
  });

  it("hält sensible Rechte ohne Freigabe zurück", async () => {
    const { service } = buildService({});
    const result = await service.registerServer({
      key: "shell-server",
      name: "Shell",
      baseUrl: "https://mcp.example.com",
      permissions: ["read", "network", "shell", "filesystem"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.server.permissions).toEqual(["read", "network"]);
    expect(result.withheldPermissions).toEqual(["shell", "filesystem"]);
  });

  it("vergibt sensible Rechte nur mit ausdrücklicher Freigabe", async () => {
    const { service } = buildService({});
    const result = await service.registerServer({
      key: "dev-server",
      name: "Dev",
      baseUrl: "https://mcp.example.com",
      permissions: ["read", "network", "shell"],
      allowSensitivePermissions: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.server.permissions).toContain("shell");
  });

  it("aktualisiert einen bestehenden Server statt ihn zu duplizieren", async () => {
    const { service, rows } = buildService({});
    await service.registerServer({ key: "github", name: "Alt", baseUrl: "https://mcp.example.com" });
    const second = await service.registerServer({
      key: "github",
      name: "Neu",
      baseUrl: "https://mcp2.example.com",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(rows.get("github")?.name).toBe("Neu");
    expect(rows.size).toBe(1);
  });

  it("schreibt bei ungültiger Eingabe nichts", async () => {
    const { service, stats } = buildService({});
    const result = await service.registerServer({ key: "X!", name: "", baseUrl: "http://localhost" });
    expect(result.ok).toBe(false);
    expect(stats.upserts).toBe(0);
  });
});

describe("Registry-Übersicht", () => {
  it("meldet ehrlich, wenn die Datenbank nicht verfügbar ist", async () => {
    const failing: McpServerStore = {
      list: async () => {
        throw new Error("Datenbank nicht verfuegbar");
      },
      findByKey: async () => null,
      upsert: async () => row(),
      setEnabled: async () => null,
      remove: async () => false,
      recordProbe: async () => null,
    };
    const service = createMcpServerService({ store: failing, now: () => NOW, env: {} });
    const result = await service.listServers();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Datenbank");
  });

  it("liefert Snapshots inklusive Konfigurationsstatus der Zugangsdaten", async () => {
    const { service } = buildService({
      seed: [
        row({ serverKey: "github", credentialEnvVar: "MCP_GITHUB_TOKEN", tools: [{ name: "search_code" }] }),
        row({ serverKey: "web", lastOkAt: new Date(NOW), lastCheckedAt: new Date(NOW) }),
      ],
      env: { MCP_GITHUB_TOKEN: FAKE_TOKEN },
    });
    const result = await service.listServers();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const github = result.servers.find((entry) => entry.key === "github");
    const web = result.servers.find((entry) => entry.key === "web");
    expect(github?.credential).toEqual({ envVar: "MCP_GITHUB_TOKEN", configured: true });
    expect(web?.credential.configured).toBe(true);
    expect(web?.health.status).toBe("healthy");
    expect(result.summary.total).toBe(2);
    expect(result.summary.toolCount).toBe(1);
  });
});

describe("Healthcheck (probeServer)", () => {
  it("prüft einen Server, cached Tools und schreibt healthy", async () => {
    const { service, rows, sent, stats } = buildService({
      seed: [row({ serverKey: "github" })],
      channelOptions: { tools: [{ name: "search_code" }, { name: "fetch_file" }] },
    });
    const result = await service.probeServer("github");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tools).toHaveLength(2);
    expect(result.serverInfo).toEqual({ name: "Fake MCP", version: "1.0.0" });
    expect(result.server?.health.status).toBe("healthy");
    expect(sent.map((entry) => entry.method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    const saved = rows.get("github");
    expect(saved?.tools).toHaveLength(2);
    expect(saved?.consecutiveFailures).toBe(0);
    expect(saved?.serverName).toBe("Fake MCP");
    expect(stats.probes).toBe(1);
  });

  it("meldet unbekannte und deaktivierte Server ehrlich", async () => {
    const { service } = buildService({ seed: [row({ serverKey: "github", enabled: false })] });
    const unknown = await service.probeServer("unbekannt");
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.reason).toContain("Unbekannter MCP-Server");

    const disabled = await service.probeServer("github");
    expect(disabled.ok).toBe(false);
    if (disabled.ok) return;
    expect(disabled.reason).toContain("deaktiviert");
  });

  it("sagt ehrlich, dass der SSE-Transport nicht angebunden ist", async () => {
    const { service, stats } = buildService({ seed: [row({ serverKey: "alt", transport: "sse" })] });
    const result = await service.probeServer("alt");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("SSE");
    expect(stats.probes).toBe(0);
  });

  it("protokolliert fehlende ENV-Zugangsdaten als Fehlschlag, ohne Werte zu zeigen", async () => {
    const { service, rows } = buildService({
      seed: [row({ serverKey: "github", credentialEnvVar: "MCP_GITHUB_TOKEN" })],
      env: {},
    });
    const result = await service.probeServer("github");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("MCP_GITHUB_TOKEN");
    const saved = rows.get("github");
    expect(saved?.consecutiveFailures).toBe(1);
    expect(saved?.healthStatus).toBe("degraded");
  });

  it("redigiert Zugangsdaten aus Fehlermeldungen", async () => {
    const { service, rows } = buildService({
      seed: [row({ serverKey: "github", credentialEnvVar: "MCP_GITHUB_TOKEN" })],
      env: { MCP_GITHUB_TOKEN: FAKE_TOKEN },
      channelOptions: { fail: new Error(`401 fuer ${FAKE_HEADER}`) },
    });
    const result = await service.probeServer("github");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).not.toContain(FAKE_TOKEN);
    const saved = rows.get("github");
    expect(saved?.lastError).not.toContain(FAKE_TOKEN);
    expect(saved?.healthStatus).toBe("degraded");
  });

  it("stuft nach drei Fehlschlägen auf nicht erreichbar", async () => {
    const { service, rows } = buildService({
      seed: [
        row({
          serverKey: "github",
          consecutiveFailures: 2,
          lastErrorAt: new Date(NOW - 60_000),
          lastError: "HTTP 500",
          healthStatus: "degraded",
        }),
      ],
      channelOptions: { fail: new Error("HTTP 500") },
    });
    const result = await service.probeServer("github");
    expect(result.ok).toBe(false);
    expect(rows.get("github")?.consecutiveFailures).toBe(3);
    expect(rows.get("github")?.healthStatus).toBe("unreachable");
  });

  it("reicht das Bearer-Token nur als Header-Wert an den Kanal weiter", async () => {
    const { service, opened } = buildService({
      seed: [row({ serverKey: "github", credentialEnvVar: "MCP_GITHUB_TOKEN" })],
      env: { MCP_GITHUB_TOKEN: FAKE_TOKEN },
    });
    await service.probeServer("github");
    expect(opened[0].credentialToken).toBe(FAKE_TOKEN);
    expect(opened[0].rpcUrl).toBe("https://mcp.example.com/mcp");
  });
});

describe("Tool-Aufruf (callTool)", () => {
  function healthyRow(overrides: Partial<McpServerRow> = {}) {
    return row({
      serverKey: "github",
      lastOkAt: new Date(NOW),
      lastCheckedAt: new Date(NOW),
      healthStatus: "healthy",
      healthScore: 100,
      tools: [{ name: "search_code" }],
      ...overrides,
    });
  }

  it("führt ein Tool auf einem gesunden Server aus", async () => {
    const { service, sent } = buildService({
      seed: [healthyRow()],
      channelOptions: { toolText: "gefunden: 3 Treffer" },
    });
    const result = await service.callTool("github", { toolName: "search_code", args: { q: "mcp" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe("gefunden: 3 Treffer");
    expect(result.warning).toBeNull();
    expect(sent.some((entry) => entry.method === "tools/call")).toBe(true);
  });

  it("verweigert den Aufruf ohne passende Server-Berechtigung", async () => {
    const { service, sent } = buildService({ seed: [healthyRow({ permissions: ["write"] })] });
    const result = await service.callTool("github", { toolName: "search_code", args: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Berechtigung fehlt");
    expect(sent).toHaveLength(0);
  });

  it("verweigert den Aufruf auf ungeprüften Servern", async () => {
    const { service } = buildService({ seed: [row({ serverKey: "github", tools: [{ name: "x" }] })] });
    const result = await service.callTool("github", { toolName: "x", args: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("noch nicht geprüft");
  });

  it("meldet unbekannte Server und deaktivierte Server", async () => {
    const { service } = buildService({ seed: [healthyRow({ serverKey: "off", enabled: false })] });
    const unknown = await service.callTool("fehlt", { toolName: "x", args: {} });
    expect(unknown.ok).toBe(false);
    const disabled = await service.callTool("off", { toolName: "x", args: {} });
    expect(disabled.ok).toBe(false);
    if (disabled.ok) return;
    expect(disabled.reason).toContain("deaktiviert");
  });

  it("meldet fehlende Zugangsdaten vor dem Netzwerkaufruf", async () => {
    const { service, sent } = buildService({
      seed: [healthyRow({ credentialEnvVar: "MCP_GITHUB_TOKEN" })],
      env: {},
    });
    const result = await service.callTool("github", { toolName: "search_code", args: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("MCP_GITHUB_TOKEN");
    expect(sent).toHaveLength(0);
  });

  it("redigiert Fehler des Tool-Aufrufs", async () => {
    const { service } = buildService({
      seed: [healthyRow({ credentialEnvVar: "MCP_GITHUB_TOKEN" })],
      env: { MCP_GITHUB_TOKEN: FAKE_TOKEN },
      channelOptions: { fail: new Error(`kaputt mit ${FAKE_HEADER}`) },
    });
    const result = await service.callTool("github", { toolName: "search_code", args: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).not.toContain(FAKE_TOKEN);
  });
});
