/**
 * Master-Prompt Phase 2 — Multi-MCP-Server-Registry (reine, testbare Logik).
 *
 * Bisher gab es genau einen Remote-Server aus `MCP_SERVER_URL`. Diese Datei
 * modelliert die Verwaltung beliebig vieler Server: Registrierung mit
 * Berechtigungsprofil, Kostenprofil, Health-Bewertung, Routing und
 * Fehler-Redaktion. Netzwerk und Datenbank bleiben draussen — der Server
 * (server/mcp-server-service.ts) injiziert beides.
 *
 * Sicherheitsgrundsaetze, die hier erzwungen werden:
 * - Neue Server bekommen NIE automatisch weitreichende Rechte: Standard ist
 *   `read` + `network`; `write`, `shell` und `filesystem` nur mit expliziter
 *   Freigabe (allowSensitivePermissions).
 * - Zugangsdaten liegen nie in der Registry: `credentialEnvVar` ist ein
 *   Variablenname (Muster ^[A-Z][A-Z0-9_]{2,79}$), kein Wert.
 * - Endpunkte muessen HTTPS sein, ohne Benutzer/Passwort in der URL, ohne
 *   Query-String (dort landen erfahrungsgemaess Tokens) und ohne private
 *   Adressen (SSRF-Schutz aus der Registry, Sprint 79).
 * - Fehlermeldungen werden redigiert, bevor sie gespeichert oder angezeigt
 *   werden (Bearer-Token, typische Key-Praefixe, Query-Strings).
 */

import {
  ALL_MCP_PERMISSIONS,
  validateServerEndpoint,
  type McpPermission,
  type McpToolDescriptor,
} from "@/lib/mcp-registry-logic";
import {
  MCP_TRANSPORT_KINDS,
  type McpTransportKind,
} from "@/lib/mcp-transport-logic";

/* ==================== Konstanten ==================== */

export const MCP_COST_PROFILES = ["free", "metered", "unknown"] as const;
export type McpCostProfile = (typeof MCP_COST_PROFILES)[number];

/** Standard fuer jeden neu registrierten Server. */
export const DEFAULT_NEW_SERVER_PERMISSIONS: readonly McpPermission[] = ["read", "network"];

/** Rechte, die nur mit ausdruecklicher Freigabe vergeben werden. */
export const SENSITIVE_SERVER_PERMISSIONS: readonly McpPermission[] = ["write", "shell", "filesystem"];

export const MCP_SERVER_HEALTH_STATUSES = [
  "unchecked",
  "healthy",
  "degraded",
  "stale",
  "unreachable",
  "disabled",
] as const;
export type McpServerHealthStatus = (typeof MCP_SERVER_HEALTH_STATUSES)[number];

/** Ein Erfolg gilt 24 Stunden als frisch, danach als "stale". */
export const MCP_HEALTH_FRESH_MS = 24 * 60 * 60_000;
/** Nach sieben Tagen ohne Erfolg ist der Zustand nicht mehr belastbar. */
export const MCP_HEALTH_STALE_MS = 7 * 24 * 60 * 60_000;

const SERVER_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]{2,79}$/;

/* ==================== Typen ==================== */

export type McpServerIssue = { field: string; message: string };

export type McpServerDraftInput = {
  key?: unknown;
  name?: unknown;
  baseUrl?: unknown;
  transport?: unknown;
  permissions?: unknown;
  credentialEnvVar?: unknown;
  costProfile?: unknown;
  enabled?: unknown;
  notes?: unknown;
};

export type McpServerNormalized = {
  key: string;
  name: string;
  baseUrl: string;
  transport: McpTransportKind;
  permissions: McpPermission[];
  credentialEnvVar: string | null;
  costProfile: McpCostProfile;
  enabled: boolean;
  notes: string | null;
};

export type McpServerDraftValidation =
  | { ok: true; server: McpServerNormalized; withheldPermissions: McpPermission[] }
  | { ok: false; issues: McpServerIssue[] };

export type McpServerHealthInput = {
  enabled: boolean;
  /** Zeitpunkte in Millisekunden (null = nie). */
  lastCheckedAtMs: number | null;
  lastOkAtMs: number | null;
  lastErrorAtMs: number | null;
  consecutiveFailures: number;
  lastLatencyMs?: number | null;
  nowMs: number;
};

export type McpServerHealth = {
  status: McpServerHealthStatus;
  /** 0..100, null solange es keinen einzigen Prueflauf gab. */
  score: number | null;
  /** Ehrlicher Klartext-Grund (deutsch, tokenfrei). */
  reason: string;
};

/** Struktur, die Registry-Logik und UI gemeinsam nutzen (ohne Drizzle-Import). */
export type McpServerRecordLike = {
  serverKey: string;
  name: string;
  baseUrl: string;
  transport: string;
  permissions: string[];
  credentialEnvVar: string | null;
  costProfile: string;
  enabled: boolean;
  healthStatus: string;
  healthScore: number | null;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
  lastOkAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  serverName: string | null;
  serverVersion: string | null;
  tools: Record<string, unknown>[];
  toolsDiscoveredAt: Date | null;
};

export type McpServerSnapshot = {
  key: string;
  name: string;
  baseUrl: string;
  transport: McpTransportKind;
  permissions: McpPermission[];
  costProfile: McpCostProfile;
  enabled: boolean;
  credential: { envVar: string | null; configured: boolean };
  health: McpServerHealth;
  serverInfo: { name: string | null; version: string | null } | null;
  tools: { count: number; discoveredAt: string | null };
  lastCheckedAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
};

/* ==================== Normalisierung & Validierung ==================== */

/** Slug-Normalform (trim + Kleinschreibung); die Pruefung macht isValidServerKey. */
export function normalizeServerKey(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidServerKey(key: string): boolean {
  return SERVER_KEY_PATTERN.test(key);
}

/** ENV-Variablenname als Credential-Referenz — nie ein Wert. */
export function validateCredentialEnvVarName(name: string): McpServerIssue | null {
  const value = name.trim();
  if (!value) return { field: "credentialEnvVar", message: "Leerer Variablenname ist nicht erlaubt." };
  if (!ENV_VAR_PATTERN.test(value)) {
    return {
      field: "credentialEnvVar",
      message: "Nur ein Variablenname ist erlaubt (Grossbuchstaben, Ziffern, Unterstrich; z. B. MCP_GITHUB_TOKEN).",
    };
  }
  return null;
}

/**
 * Endpunkt-Pruefung: HTTPS, kein Benutzer/Passwort in der URL, kein
 * Query-String, keine private Adresse. Liefert die normalisierte URL ohne
 * abschliessenden Schraegstrich.
 */
export function sanitizeServerUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Endpunkt-URL fehlt." };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: `Endpunkt ist keine gueltige URL: ${trimmed}` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Zugangsdaten gehoeren nicht in die URL — nutze credentialEnvVar." };
  }
  if (parsed.search) {
    return { ok: false, reason: "Query-Parameter sind im Endpunkt nicht erlaubt (Tokens gehoeren in credentialEnvVar)." };
  }
  if (parsed.hash) {
    return { ok: false, reason: "Fragmente sind im Endpunkt nicht erlaubt." };
  }
  const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  const check = validateServerEndpoint({ server: "remote", url: normalized });
  if (!check.ok) return { ok: false, reason: check.reason };
  return { ok: true, url: normalized };
}

export type PermissionNormalization = {
  permissions: McpPermission[];
  withheld: McpPermission[];
  unknown: string[];
};

/**
 * Berechtigungen normalisieren: unbekannte Werte werden gemeldet, sensible
 * Rechte ohne Freigabe still zurueckgehalten (nie automatisch vergeben).
 * Reihenfolge ist deterministisch (Katalog-Reihenfolge).
 */
export function normalizeServerPermissions(
  requested: readonly string[] | undefined,
  options: { allowSensitivePermissions?: boolean } = {},
): PermissionNormalization {
  if (requested === undefined) {
    return { permissions: [...DEFAULT_NEW_SERVER_PERMISSIONS], withheld: [], unknown: [] };
  }
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const entry of requested) {
    const value = typeof entry === "string" ? entry.trim().toLowerCase() : "";
    if (!(ALL_MCP_PERMISSIONS as readonly string[]).includes(value)) {
      if (value) unknown.push(value);
      continue;
    }
    seen.add(value);
  }
  const withheld: McpPermission[] = [];
  const permissions = ALL_MCP_PERMISSIONS.filter((permission) => {
    if (!seen.has(permission)) return false;
    if (
      !options.allowSensitivePermissions &&
      (SENSITIVE_SERVER_PERMISSIONS as readonly string[]).includes(permission)
    ) {
      withheld.push(permission);
      return false;
    }
    return true;
  });
  // Ein leerer Wunsch ergibt den sicheren Standard, nicht "keine Rechte".
  return {
    permissions: permissions.length > 0 ? permissions : [...DEFAULT_NEW_SERVER_PERMISSIONS],
    withheld,
    unknown,
  };
}

/**
 * Vollstaendige Draft-Pruefung. `existingKeys` dient nur der Kollisionsmeldung
 * (Update vs. Neuanlage entscheidet der Service).
 */
export function validateServerDraft(
  input: McpServerDraftInput,
  options: { allowSensitivePermissions?: boolean; existingKeys?: readonly string[] } = {},
): McpServerDraftValidation {
  const issues: McpServerIssue[] = [];

  const key = typeof input.key === "string" ? normalizeServerKey(input.key) : "";
  if (!key) issues.push({ field: "key", message: "Server-Key fehlt." });
  else if (!isValidServerKey(key)) {
    issues.push({
      field: "key",
      message: "Server-Key: 2–64 Zeichen, nur Kleinbuchstaben, Ziffern und Bindestriche, beginnend mit Buchstabe/Ziffer.",
    });
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) issues.push({ field: "name", message: "Anzeigename fehlt." });
  else if (name.length > 120) issues.push({ field: "name", message: "Anzeigename ist laenger als 120 Zeichen." });

  const rawUrl = typeof input.baseUrl === "string" ? input.baseUrl : "";
  const urlResult = sanitizeServerUrl(rawUrl);
  if (!urlResult.ok) issues.push({ field: "baseUrl", message: urlResult.reason });

  let transport: McpTransportKind = "streamable-http";
  if (input.transport !== undefined) {
    if (
      typeof input.transport === "string" &&
      (MCP_TRANSPORT_KINDS as readonly string[]).includes(input.transport)
    ) {
      transport = input.transport as McpTransportKind;
    } else {
      issues.push({ field: "transport", message: `Unbekannter Transport — erlaubt: ${MCP_TRANSPORT_KINDS.join(", ")}.` });
    }
  }

  const rawPermissions = Array.isArray(input.permissions)
    ? input.permissions.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const permissionInfo = normalizeServerPermissions(rawPermissions, {
    allowSensitivePermissions: options.allowSensitivePermissions,
  });
  if (permissionInfo.unknown.length > 0) {
    issues.push({
      field: "permissions",
      message: `Unbekannte Berechtigung(en): ${permissionInfo.unknown.join(", ")}. Erlaubt: ${ALL_MCP_PERMISSIONS.join(", ")}.`,
    });
  }

  let credentialEnvVar: string | null = null;
  if (input.credentialEnvVar !== undefined && input.credentialEnvVar !== null && input.credentialEnvVar !== "") {
    if (typeof input.credentialEnvVar !== "string") {
      issues.push({ field: "credentialEnvVar", message: "credentialEnvVar muss ein Variablenname sein." });
    } else {
      const credentialIssue = validateCredentialEnvVarName(input.credentialEnvVar);
      if (credentialIssue) issues.push(credentialIssue);
      else credentialEnvVar = input.credentialEnvVar.trim();
    }
  }

  let costProfile: McpCostProfile = "unknown";
  if (input.costProfile !== undefined) {
    if (
      typeof input.costProfile === "string" &&
      (MCP_COST_PROFILES as readonly string[]).includes(input.costProfile)
    ) {
      costProfile = input.costProfile as McpCostProfile;
    } else {
      issues.push({ field: "costProfile", message: `Unbekanntes Kostenprofil — erlaubt: ${MCP_COST_PROFILES.join(", ")}.` });
    }
  }

  let enabled = true;
  if (input.enabled !== undefined) {
    if (typeof input.enabled === "boolean") enabled = input.enabled;
    else issues.push({ field: "enabled", message: "enabled muss ein Boolean sein." });
  }

  let notes: string | null = null;
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== "string") issues.push({ field: "notes", message: "Notizen muessen Text sein." });
    else if (input.notes.length > 500) issues.push({ field: "notes", message: "Notizen sind laenger als 500 Zeichen." });
    else notes = input.notes.trim() || null;
  }

  if (issues.length > 0) return { ok: false, issues };
  if (!urlResult.ok) return { ok: false, issues }; // unreachable, nur fuer TypeScript

  return {
    ok: true,
    server: {
      key,
      name,
      baseUrl: urlResult.url,
      transport,
      permissions: permissionInfo.permissions,
      credentialEnvVar,
      costProfile,
      enabled,
      notes,
    },
    withheldPermissions: permissionInfo.withheld,
  };
}

/* ==================== Health-Bewertung ==================== */

/**
 * Health aus den letzten Prueflaeufen. Bewusst konservativ: ohne Erfolg ist
 * ein Server nie "healthy", und drei Fehlschlaege in Folge gelten als
 * nicht erreichbar (Routing zieht ihn dann aus dem Verkehr).
 */
export function computeServerHealth(input: McpServerHealthInput): McpServerHealth {
  const { enabled, nowMs } = input;
  if (!enabled) {
    return { status: "disabled", score: 0, reason: "Server ist deaktiviert." };
  }

  const failures = Math.max(0, Math.trunc(input.consecutiveFailures));
  const lastOk = input.lastOkAtMs;
  const lastError = input.lastErrorAtMs;

  if (lastOk === null && lastError === null) {
    return { status: "unchecked", score: null, reason: "Noch kein Prueflauf — Zustand unbekannt." };
  }
  if (lastOk === null) {
    return {
      status: failures >= 3 ? "unreachable" : "degraded",
      score: failures >= 3 ? 0 : 25,
      reason: "Noch kein erfolgreicher Lauf.",
    };
  }

  const age = Math.max(0, nowMs - lastOk);
  const failedSinceOk = lastError !== null && lastError > lastOk;

  let status: McpServerHealthStatus;
  if (failures >= 3) status = "unreachable";
  else if (failedSinceOk) status = "degraded";
  else if (age > MCP_HEALTH_FRESH_MS) status = "stale";
  else status = "healthy";

  let score = 100;
  if (failures > 0) score -= Math.min(60, failures * 20);
  const latency = input.lastLatencyMs ?? null;
  if (latency !== null) {
    if (latency > 2_000) score -= 20;
    else if (latency > 1_000) score -= 10;
  }
  if (failedSinceOk) score -= 15;
  if (age > MCP_HEALTH_FRESH_MS) score -= age > MCP_HEALTH_STALE_MS ? 45 : 25;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const reason =
    status === "healthy"
      ? `Letzter erfolgreicher Lauf vor ${formatAge(age)}.`
      : status === "degraded"
        ? `Letzter Lauf fehlgeschlagen (${formatAge(nowMs - (lastError ?? nowMs))} her), ${failures} Fehlschlag(e) in Folge.`
        : status === "stale"
          ? `Letzter erfolgreicher Lauf vor ${formatAge(age)} — Nachweis ist veraltet.`
          : `${failures} Fehlschlaege in Folge — Server gilt als nicht erreichbar.`;

  return { status, score, reason };
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "weniger als einer Minute";
  if (minutes < 60) return `${minutes} Minute(n)`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} Stunde(n)`;
  return `${Math.floor(hours / 24)} Tag(en)`;
}

export const MCP_HEALTH_LABELS: Record<McpServerHealthStatus, string> = {
  unchecked: "Ungeprüft",
  healthy: "Healthy",
  degraded: "Beeinträchtigt",
  stale: "Nachweis veraltet",
  unreachable: "Nicht erreichbar",
  disabled: "Deaktiviert",
};

/* ==================== Snapshots & Registry-Übersicht ==================== */

export function buildServerSnapshot(
  row: McpServerRecordLike,
  context: { nowMs: number; credentialConfigured: boolean },
): McpServerSnapshot {
  const transport = (MCP_TRANSPORT_KINDS as readonly string[]).includes(row.transport)
    ? (row.transport as McpTransportKind)
    : "streamable-http";
  const permissions = row.permissions.filter((entry): entry is McpPermission =>
    (ALL_MCP_PERMISSIONS as readonly string[]).includes(entry),
  );
  const costProfile = (MCP_COST_PROFILES as readonly string[]).includes(row.costProfile)
    ? (row.costProfile as McpCostProfile)
    : "unknown";

  return {
    key: row.serverKey,
    name: row.name,
    baseUrl: row.baseUrl,
    transport,
    permissions,
    costProfile,
    enabled: row.enabled,
    credential: { envVar: row.credentialEnvVar, configured: context.credentialConfigured },
    health: computeServerHealth({
      enabled: row.enabled,
      lastCheckedAtMs: row.lastCheckedAt ? row.lastCheckedAt.getTime() : null,
      lastOkAtMs: row.lastOkAt ? row.lastOkAt.getTime() : null,
      lastErrorAtMs: row.lastErrorAt ? row.lastErrorAt.getTime() : null,
      consecutiveFailures: row.consecutiveFailures,
      nowMs: context.nowMs,
    }),
    serverInfo:
      row.serverName || row.serverVersion
        ? { name: row.serverName, version: row.serverVersion }
        : null,
    tools: {
      count: Array.isArray(row.tools) ? row.tools.length : 0,
      discoveredAt: row.toolsDiscoveredAt ? row.toolsDiscoveredAt.toISOString() : null,
    },
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    consecutiveFailures: row.consecutiveFailures,
    lastError: row.lastError,
  };
}

export type McpRegistrySummary = {
  total: number;
  enabled: number;
  byStatus: Record<McpServerHealthStatus, number>;
  averageScore: number | null;
  toolCount: number;
  /** Tool-Namen, die auf mehreren Servern vorkommen. */
  conflicts: string[];
};

export function summarizeRegistry(snapshots: readonly McpServerSnapshot[]): McpRegistrySummary {
  const byStatus = MCP_SERVER_HEALTH_STATUSES.reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {} as Record<McpServerHealthStatus, number>,
  );
  let scoreSum = 0;
  let scoreCount = 0;
  let toolCount = 0;
  for (const snapshot of snapshots) {
    byStatus[snapshot.health.status] += 1;
    // Deaktivierte Server verzerren den Durchschnitt nicht (Score 0 waere
    // eine Betriebsaussage, obwohl der Server absichtlich aus ist).
    if (snapshot.enabled && snapshot.health.score !== null) {
      scoreSum += snapshot.health.score;
      scoreCount += 1;
    }
    toolCount += snapshot.tools.count;
  }
  return {
    total: snapshots.length,
    enabled: snapshots.filter((snapshot) => snapshot.enabled).length,
    byStatus,
    averageScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    toolCount,
    conflicts: [],
  };
}

/* ==================== Routing ==================== */

export type McpToolId = `${string}::${string}`;

export function buildToolId(serverKey: string, toolName: string): McpToolId {
  return `${serverKey}::${toolName}`;
}

export function parseToolId(toolId: string): { serverKey: string; toolName: string } | null {
  const separator = toolId.indexOf("::");
  if (separator <= 0) return null;
  const serverKey = toolId.slice(0, separator).trim();
  const toolName = toolId.slice(separator + 2).trim();
  if (!serverKey || !toolName) return null;
  return { serverKey, toolName };
}

export type RoutingServer = {
  key: string;
  enabled: boolean;
  permissions: readonly string[];
  health: Pick<McpServerHealth, "status">;
};

export type ToolRoute =
  | { ok: true; serverKey: string; toolName: string; warning: string | null }
  | { ok: false; reason: string };

/**
 * Routing einer vollqualifizierten Tool-Id ("server::tool"). Deaktivierte und
 * als nicht erreichbar bewertete Server werden ehrlich abgelehnt, statt einen
 * Aufruf ins Leere laufen zu lassen. `degraded`/`stale` sind erlaubt, aber mit
 * Warnung.
 */
export function resolveToolRoute(toolId: string, servers: readonly RoutingServer[]): ToolRoute {
  const parsed = parseToolId(toolId);
  if (!parsed) {
    return { ok: false, reason: `Tool-Id muss "<server>::<tool>" sein, erhalten: ${toolId}` };
  }
  const server = servers.find((entry) => entry.key === parsed.serverKey);
  if (!server) {
    return { ok: false, reason: `Unbekannter MCP-Server: ${parsed.serverKey}` };
  }
  if (!server.enabled) {
    return { ok: false, reason: `MCP-Server "${parsed.serverKey}" ist deaktiviert.` };
  }
  if (server.health.status === "unreachable") {
    return { ok: false, reason: `MCP-Server "${parsed.serverKey}" ist aktuell nicht erreichbar.` };
  }
  if (server.health.status === "unchecked") {
    return {
      ok: false,
      reason: `MCP-Server "${parsed.serverKey}" wurde noch nicht geprüft — bitte zuerst einen Healthcheck ausführen.`,
    };
  }
  const warning =
    server.health.status === "degraded" || server.health.status === "stale"
      ? `Server "${parsed.serverKey}" ist ${MCP_HEALTH_LABELS[server.health.status]} — Aufruf wird versucht.`
      : null;
  return { ok: true, serverKey: parsed.serverKey, toolName: parsed.toolName, warning };
}

/** Tools mit gleichem Namen auf mehreren Servern — sichtbar machen, nicht verstecken. */
export function detectToolNameConflicts(
  toolsByServer: Record<string, readonly Pick<McpToolDescriptor, "name">[]>,
): string[] {
  const owners = new Map<string, Set<string>>();
  for (const [serverKey, tools] of Object.entries(toolsByServer)) {
    for (const tool of tools) {
      const set = owners.get(tool.name) ?? new Set<string>();
      set.add(serverKey);
      owners.set(tool.name, set);
    }
  }
  return [...owners.entries()]
    .filter(([, servers]) => servers.size > 1)
    .map(([name, servers]) => `${name} (${[...servers].sort().join(", ")})`)
    .sort();
}

/* ==================== Redaktion & Backoff ==================== */

const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bghp_[A-Za-z0-9]{8,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /([?&](?:token|key|secret|access_token|api_key)=)[^&\s]+/gi,
];

/**
 * Fehlermeldungen redigieren: bekannte Secret-Werte, typische Key-Muster,
 * Query-Strings. Ergebnis ist auf 300 Zeichen begrenzt (Spaltenbreite).
 */
export function redactMcpError(message: string, secrets: readonly string[] = []): string {
  let text = String(message ?? "");
  for (const secret of secrets) {
    const value = secret.trim();
    if (value.length >= 6) text = text.split(value).join("***");
  }
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix?: string) =>
      typeof prefix === "string" ? `${prefix}***` : "***",
    );
  }
  text = text.replace(/https?:\/\/[^\s"']+/g, (url) => redactServerUrl(url));
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/** URL ohne Query, Fragment und Zugangsdaten — fuer Logs und UI. */
export function redactServerUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return raw.replace(/\?.*$/, "");
  }
}

/**
 * Naechster Pruefzeitpunkt nach Fehlschlaegen (exponentiell, gedeckelt).
 * 0 Fehlschlaege = Regelbetrieb (15 Minuten), danach 1, 5, 15, 60, 360 Minuten.
 */
export function nextProbeDelayMs(consecutiveFailures: number): number {
  const steps = [15 * 60_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
  const index = Math.min(Math.max(0, Math.trunc(consecutiveFailures)), steps.length - 1);
  return steps[index];
}
