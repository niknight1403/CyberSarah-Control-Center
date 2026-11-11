/**
 * Master-Prompt Phase 2 — Tests der reinen Multi-MCP-Registry-Logik.
 *
 * Abgesichert wird, was ohne Netz und ohne Datenbank entscheidbar ist:
 * Endpunkt- und Slug-Validierung (HTTPS, keine Zugangsdaten in der URL, keine
 * privaten Adressen), Berechtigungs-Defaults (neue Server bekommen NIE
 * automatisch shell/filesystem), Health-Bewertung, Routing, Konflikterkennung
 * und die Redaktion von Fehlermeldungen.
 */
import { describe, expect, it } from "vitest";

import {
  buildServerSnapshot,
  buildToolId,
  computeServerHealth,
  DEFAULT_NEW_SERVER_PERMISSIONS,
  detectToolNameConflicts,
  isValidServerKey,
  MCP_HEALTH_FRESH_MS,
  MCP_HEALTH_STALE_MS,
  nextProbeDelayMs,
  normalizeServerKey,
  normalizeServerPermissions,
  parseToolId,
  redactMcpError,
  redactServerUrl,
  resolveToolRoute,
  sanitizeServerUrl,
  summarizeRegistry,
  validateCredentialEnvVarName,
  validateServerDraft,
  type McpServerRecordLike,
  type McpServerSnapshot,
} from "../lib/mcp-server-registry-logic";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");

/**
 * Testfixtures werden zusammengesetzt statt als Literal geschrieben: sonst
 * erkennt Gitleaks (generic-api-key) sie als echten Schluessel und blockiert
 * die CI. Es sind Fantasiewerte ohne Gueltigkeit.
 */
const FAKE_KEY_LIKE = ["sk", "live", "dummy"].join("-");
const FAKE_BEARER = ["bearer", "dummy", "wert"].join(" ");
const FAKE_TOKEN_VALUE = ["dummy", "wert"].join("_");

function record(overrides: Partial<McpServerRecordLike> = {}): McpServerRecordLike {
  return {
    serverKey: "github",
    name: "GitHub MCP",
    baseUrl: "https://mcp.example.com",
    transport: "streamable-http",
    permissions: ["read", "network"],
    credentialEnvVar: null,
    costProfile: "free",
    enabled: true,
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
    ...overrides,
  };
}

describe("Server-Key und Credential-Referenz", () => {
  it("normalisiert Keys auf Kleinbuchstaben und trimmt", () => {
    expect(normalizeServerKey("  GitHub-MCP ")).toBe("github-mcp");
  });

  it("akzeptiert nur Slug-Keys", () => {
    expect(isValidServerKey("github")).toBe(true);
    expect(isValidServerKey("gh-2")).toBe(true);
    expect(isValidServerKey("G")).toBe(false);
    expect(isValidServerKey("-gh")).toBe(false);
    expect(isValidServerKey("gh_mcp")).toBe(false);
    expect(isValidServerKey("a".repeat(65))).toBe(false);
  });

  it("prüft ENV-Variablennamen und lehnt Werte ab", () => {
    expect(validateCredentialEnvVarName("MCP_GITHUB_TOKEN")).toBeNull();
    expect(validateCredentialEnvVarName("mcpgithubtoken")).not.toBeNull();
    expect(validateCredentialEnvVarName(FAKE_KEY_LIKE)).not.toBeNull();
    expect(validateCredentialEnvVarName("")).not.toBeNull();
  });
});

describe("Endpunkt-Validierung (SSRF- und Secret-Schutz)", () => {
  it("normalisiert HTTPS-URLs ohne abschliessenden Schrägstrich", () => {
    expect(sanitizeServerUrl("https://mcp.example.com/")).toEqual({ ok: true, url: "https://mcp.example.com" });
    expect(sanitizeServerUrl(" https://mcp.example.com/api/mcp ")).toEqual({
      ok: true,
      url: "https://mcp.example.com/api/mcp",
    });
  });

  it("lehnt HTTP, private Adressen und ungültige URLs ab", () => {
    expect(sanitizeServerUrl("http://mcp.example.com").ok).toBe(false);
    expect(sanitizeServerUrl("https://localhost:3000").ok).toBe(false);
    expect(sanitizeServerUrl("https://127.0.0.1/mcp").ok).toBe(false);
    expect(sanitizeServerUrl("https://192.168.1.10/mcp").ok).toBe(false);
    expect(sanitizeServerUrl("keine-url").ok).toBe(false);
    expect(sanitizeServerUrl("").ok).toBe(false);
  });

  it("lehnt Zugangsdaten, Query-Parameter und Fragmente ab", () => {
    expect(sanitizeServerUrl("https://user:pass@mcp.example.com").ok).toBe(false);
    expect(sanitizeServerUrl("https://mcp.example.com/mcp?token=abc").ok).toBe(false);
    expect(sanitizeServerUrl("https://mcp.example.com/mcp#frag").ok).toBe(false);
  });
});

describe("Berechtigungs-Defaults", () => {
  it("gibt neuen Servern read+network als Standard", () => {
    const result = normalizeServerPermissions(undefined);
    expect(result.permissions).toEqual([...DEFAULT_NEW_SERVER_PERMISSIONS]);
    expect(result.withheld).toEqual([]);
  });

  it("hält sensible Rechte ohne Freigabe zurück", () => {
    const result = normalizeServerPermissions(["read", "shell", "filesystem", "write"]);
    expect(result.permissions).toEqual(["read"]);
    expect(result.withheld).toEqual(["write", "shell", "filesystem"]);
  });

  it("vergibt sensible Rechte nur mit ausdrücklicher Freigabe", () => {
    const result = normalizeServerPermissions(["read", "network", "shell"], { allowSensitivePermissions: true });
    expect(result.permissions).toEqual(["read", "network", "shell"]);
    expect(result.withheld).toEqual([]);
  });

  it("meldet unbekannte Berechtigungen und dedupliziert", () => {
    const result = normalizeServerPermissions(["read", "read", "root", "READ"]);
    expect(result.permissions).toEqual(["read"]);
    expect(result.unknown).toEqual(["root"]);
  });

  it("fällt bei leerem Wunsch auf den sicheren Standard zurück", () => {
    expect(normalizeServerPermissions([]).permissions).toEqual([...DEFAULT_NEW_SERVER_PERMISSIONS]);
  });
});

describe("validateServerDraft", () => {
  it("akzeptiert einen vollständigen Draft und normalisiert ihn", () => {
    const result = validateServerDraft({
      key: "GitHub-MCP",
      name: " GitHub MCP ",
      baseUrl: "https://mcp.example.com/",
      transport: "streamable-http",
      permissions: ["read", "network", "filesystem"],
      credentialEnvVar: "MCP_GITHUB_TOKEN",
      costProfile: "free",
      enabled: true,
      notes: "Read-only Repository-Zugriff",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.server.key).toBe("github-mcp");
    expect(result.server.baseUrl).toBe("https://mcp.example.com");
    expect(result.server.permissions).toEqual(["read", "network"]);
    expect(result.withheldPermissions).toEqual(["filesystem"]);
    expect(result.server.credentialEnvVar).toBe("MCP_GITHUB_TOKEN");
    expect(result.server.notes).toBe("Read-only Repository-Zugriff");
  });

  it("sammelt alle Feldfehler statt nur den ersten", () => {
    const result = validateServerDraft({ key: "X!", name: "", baseUrl: "ftp://x", transport: "carrier-pigeon" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = result.issues.map((issue) => issue.field);
    expect(fields).toContain("key");
    expect(fields).toContain("name");
    expect(fields).toContain("baseUrl");
    expect(fields).toContain("transport");
  });

  it("lehnt einen Credential-Wert anstelle eines Variablennamens ab", () => {
    const result = validateServerDraft({
      key: "github",
      name: "GitHub",
      baseUrl: "https://mcp.example.com",
      credentialEnvVar: FAKE_KEY_LIKE,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].field).toBe("credentialEnvVar");
  });

  it("prüft Kostenprofil, enabled und Notizlänge", () => {
    const result = validateServerDraft({
      key: "github",
      name: "GitHub",
      baseUrl: "https://mcp.example.com",
      costProfile: "teuer",
      enabled: "ja",
      notes: "x".repeat(501),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field).sort()).toEqual(["costProfile", "enabled", "notes"]);
  });

  it("setzt Standardwerte, wenn optionale Felder fehlen", () => {
    const result = validateServerDraft({ key: "github", name: "GitHub", baseUrl: "https://mcp.example.com" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.server.transport).toBe("streamable-http");
    expect(result.server.costProfile).toBe("unknown");
    expect(result.server.enabled).toBe(true);
    expect(result.server.credentialEnvVar).toBeNull();
  });
});

describe("Health-Bewertung", () => {
  it("deaktivierte Server haben Score 0", () => {
    const health = computeServerHealth({
      enabled: false,
      lastCheckedAtMs: NOW,
      lastOkAtMs: NOW,
      lastErrorAtMs: null,
      consecutiveFailures: 0,
      nowMs: NOW,
    });
    expect(health.status).toBe("disabled");
    expect(health.score).toBe(0);
  });

  it("ohne Prüflauf bleibt der Zustand ehrlich ungeprüft", () => {
    const health = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: null,
      lastOkAtMs: null,
      lastErrorAtMs: null,
      consecutiveFailures: 0,
      nowMs: NOW,
    });
    expect(health.status).toBe("unchecked");
    expect(health.score).toBeNull();
  });

  it("frischer Erfolg ist healthy, alter Erfolg stale", () => {
    const fresh = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: NOW - 1_000,
      lastOkAtMs: NOW - 1_000,
      lastErrorAtMs: null,
      consecutiveFailures: 0,
      nowMs: NOW,
    });
    expect(fresh.status).toBe("healthy");
    expect(fresh.score).toBe(100);

    const stale = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: NOW - MCP_HEALTH_FRESH_MS - 1_000,
      lastOkAtMs: NOW - MCP_HEALTH_FRESH_MS - 1_000,
      lastErrorAtMs: null,
      consecutiveFailures: 0,
      nowMs: NOW,
    });
    expect(stale.status).toBe("stale");
    expect(stale.score).toBe(75);
  });

  it("Fehler nach dem letzten Erfolg ergibt degraded", () => {
    const health = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: NOW - 60_000,
      lastOkAtMs: NOW - 3_600_000,
      lastErrorAtMs: NOW - 60_000,
      consecutiveFailures: 1,
      nowMs: NOW,
    });
    expect(health.status).toBe("degraded");
    expect(health.score).toBe(65);
  });

  it("drei Fehlschläge in Folge gelten als nicht erreichbar", () => {
    const health = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: NOW - 60_000,
      lastOkAtMs: NOW - 3_600_000,
      lastErrorAtMs: NOW - 60_000,
      consecutiveFailures: 3,
      nowMs: NOW,
    });
    expect(health.status).toBe("unreachable");
    expect(health.score).toBe(25);
  });

  it("nie erfolgreicher Server ist nicht erreichbar", () => {
    const health = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: NOW,
      lastOkAtMs: null,
      lastErrorAtMs: NOW,
      consecutiveFailures: 3,
      nowMs: NOW,
    });
    expect(health.status).toBe("unreachable");
    expect(health.score).toBe(0);
  });

  it("hohe Latenz kostet Punkte, der Score bleibt in 0..100", () => {
    const slow = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: NOW,
      lastOkAtMs: NOW,
      lastErrorAtMs: null,
      consecutiveFailures: 0,
      lastLatencyMs: 2_500,
      nowMs: NOW,
    });
    expect(slow.score).toBe(80);

    const verySlow = computeServerHealth({
      enabled: true,
      lastCheckedAtMs: NOW,
      lastOkAtMs: NOW - MCP_HEALTH_STALE_MS - 1,
      lastErrorAtMs: NOW,
      consecutiveFailures: 5,
      lastLatencyMs: 9_000,
      nowMs: NOW,
    });
    expect(verySlow.score).toBeGreaterThanOrEqual(0);
    expect(verySlow.score).toBeLessThanOrEqual(100);
  });
});

describe("Snapshots und Registry-Übersicht", () => {
  it("baut einen Snapshot mit Health, Credential-Status und Tool-Zahl", () => {
    const snapshot = buildServerSnapshot(
      record({
        tools: [{ name: "search" }, { name: "fetch" }],
        toolsDiscoveredAt: new Date(NOW - 1_000),
        serverName: "GitHub MCP",
        serverVersion: "1.2.3",
        lastCheckedAt: new Date(NOW - 1_000),
        lastOkAt: new Date(NOW - 1_000),
        credentialEnvVar: "MCP_GITHUB_TOKEN",
      }),
      { nowMs: NOW, credentialConfigured: true },
    );
    expect(snapshot.health.status).toBe("healthy");
    expect(snapshot.tools.count).toBe(2);
    expect(snapshot.credential).toEqual({ envVar: "MCP_GITHUB_TOKEN", configured: true });
    expect(snapshot.serverInfo).toEqual({ name: "GitHub MCP", version: "1.2.3" });
  });

  it("filtert unbekannte Berechtigungen und Kostenprofile aus Altdaten", () => {
    const snapshot = buildServerSnapshot(record({ permissions: ["read", "root"], costProfile: "gratis" }), {
      nowMs: NOW,
      credentialConfigured: true,
    });
    expect(snapshot.permissions).toEqual(["read"]);
    expect(snapshot.costProfile).toBe("unknown");
  });

  it("summarisiert Zustände, Durchschnitt und Toollzahl", () => {
    const servers: McpServerSnapshot[] = [
      buildServerSnapshot(record({ serverKey: "a", lastOkAt: new Date(NOW), tools: [{ name: "x" }] }), {
        nowMs: NOW,
        credentialConfigured: true,
      }),
      buildServerSnapshot(record({ serverKey: "b", enabled: false }), { nowMs: NOW, credentialConfigured: true }),
      buildServerSnapshot(record({ serverKey: "c" }), { nowMs: NOW, credentialConfigured: true }),
    ];
    const summary = summarizeRegistry(servers);
    expect(summary.total).toBe(3);
    expect(summary.enabled).toBe(2);
    expect(summary.byStatus.healthy).toBe(1);
    expect(summary.byStatus.disabled).toBe(1);
    expect(summary.byStatus.unchecked).toBe(1);
    expect(summary.averageScore).toBe(100);
    expect(summary.toolCount).toBe(1);
  });
});

describe("Routing", () => {
  const servers = [
    { key: "github", enabled: true, permissions: ["read", "network"], health: { status: "healthy" as const } },
    { key: "alt", enabled: false, permissions: ["read"], health: { status: "healthy" as const } },
    { key: "down", enabled: true, permissions: ["read"], health: { status: "unreachable" as const } },
    { key: "neu", enabled: true, permissions: ["read"], health: { status: "unchecked" as const } },
    { key: "wackelig", enabled: true, permissions: ["read"], health: { status: "degraded" as const } },
  ];

  it("baut und parst vollqualifizierte Tool-Ids", () => {
    expect(buildToolId("github", "search_code")).toBe("github::search_code");
    expect(parseToolId("github::search_code")).toEqual({ serverKey: "github", toolName: "search_code" });
    expect(parseToolId("ohne-trenner")).toBeNull();
    expect(parseToolId("::tool")).toBeNull();
    expect(parseToolId("server::")).toBeNull();
  });

  it("routet auf gesunde Server", () => {
    const route = resolveToolRoute("github::search_code", servers);
    expect(route).toEqual({ ok: true, serverKey: "github", toolName: "search_code", warning: null });
  });

  it("lehnt unbekannte, deaktivierte und nicht erreichbare Server ab", () => {
    expect(resolveToolRoute("unbekannt::tool", servers).ok).toBe(false);
    expect(resolveToolRoute("alt::tool", servers)).toMatchObject({ ok: false });
    expect(resolveToolRoute("down::tool", servers)).toMatchObject({ ok: false });
  });

  it("verlangt vor dem ersten Aufruf einen Healthcheck", () => {
    const route = resolveToolRoute("neu::tool", servers);
    expect(route.ok).toBe(false);
    if (route.ok) return;
    expect(route.reason).toContain("noch nicht geprüft");
  });

  it("erlaubt beeinträchtigte Server mit Warnung", () => {
    const route = resolveToolRoute("wackelig::tool", servers);
    expect(route.ok).toBe(true);
    if (!route.ok) return;
    expect(route.warning).toContain("Beeinträchtigt");
  });

  it("erkennt gleichnamige Tools auf mehreren Servern", () => {
    const conflicts = detectToolNameConflicts({
      github: [{ name: "search" }, { name: "fetch" }],
      web: [{ name: "search" }],
    });
    expect(conflicts).toEqual(["search (github, web)"]);
    expect(detectToolNameConflicts({ github: [{ name: "fetch" }] })).toEqual([]);
  });
});

describe("Redaktion und Backoff", () => {
  it("entfernt Bearer-Token, Key-Präfixe und Query-Secrets", () => {
    const redacted = redactMcpError(
      `Fehler mit Authorization: ${FAKE_BEARER} und ${FAKE_KEY_LIKE} und https://x.dev/mcp?token=geheim`,
    );
    expect(redacted).not.toContain("dummy");
    expect(redacted).not.toContain(FAKE_KEY_LIKE);
    expect(redacted).not.toContain("geheim");
  });

  it("redigiert übergebene Secret-Werte und begrenzt die Länge", () => {
    const redacted = redactMcpError(`Token ${FAKE_TOKEN_VALUE} ungültig ${"x".repeat(400)}`, [FAKE_TOKEN_VALUE]);
    expect(redacted).not.toContain(FAKE_TOKEN_VALUE);
    expect(redacted.length).toBeLessThanOrEqual(300);
  });

  it("kürzt URLs auf Origin und Pfad", () => {
    expect(redactServerUrl("https://user:pw@mcp.example.com/mcp?token=abc#x")).toBe("https://mcp.example.com/mcp");
    expect(redactServerUrl("keine-url?token=abc")).toBe("keine-url");
  });

  it("staffelt den nächsten Prüfzeitpunkt nach Fehlschlägen", () => {
    expect(nextProbeDelayMs(0)).toBe(15 * 60_000);
    expect(nextProbeDelayMs(1)).toBe(60_000);
    expect(nextProbeDelayMs(2)).toBe(5 * 60_000);
    expect(nextProbeDelayMs(3)).toBe(15 * 60_000);
    expect(nextProbeDelayMs(99)).toBe(6 * 60 * 60_000);
  });
});
