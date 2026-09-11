/**
 * MCP-Client-Modell & erweiterbare Connector-Registry (rein, testbar).
 *
 * Modelliert die dynamische Tool-Discovery des Model Context Protocol:
 * Server melden Tool-Deskriptoren mit Eingabeschema und Berechtigungsprofil;
 * die Registry fuehrt Connectoren (Websuche, Ausfuehrungsumgebungen,
 * Filesystem-Bridges, Custom-APIs) mit denselben Berechtigungs-Flags.
 *
 * Alles deterministisch und ohne Netzwerk — die eigentliche Transportschicht
 * (SSE/HTTP) dockt an diesen Typen an.
 */

export type McpPermission = "read" | "write" | "network" | "shell" | "filesystem";

export const ALL_MCP_PERMISSIONS: readonly McpPermission[] = ["read", "write", "network", "shell", "filesystem"];

export type McpToolInputSchema = Record<string, { type: "string" | "number" | "boolean" | "object"; required: boolean }>;

export type McpToolDescriptor = {
  /** Vollqualifiziert: "<server>::<tool>". */
  id: string;
  server: string;
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  permissions: McpPermission[];
};

export type ConnectorKind = "web-search" | "execution" | "filesystem" | "custom-api";

export type ConnectorDescriptor = {
  id: string;
  name: string;
  kind: ConnectorKind;
  /** Basis-URL des Endpunkts (https für Remote-Connectoren). */
  baseUrl?: string;
  permissions: McpPermission[];
};

export type DiscoveryResult = {
  tools: McpToolDescriptor[];
  /** Werkzeuge mit identischem Kurznamen auf verschiedenen Servern. */
  conflicts: string[];
};

/** Server-Meldungen zusammenführen: Dedupe per voller ID, Konflikte markieren. */
export function mergeDiscoveredTools(serverToolLists: readonly McpToolDescriptor[][]): DiscoveryResult {
  const byId = new Map<string, McpToolDescriptor>();
  const nameOwners = new Map<string, Set<string>>();
  for (const list of serverToolLists) {
    for (const tool of list) {
      const id = tool.id || `${tool.server}::${tool.name}`;
      byId.set(id, { ...tool, id });
      const owners = nameOwners.get(tool.name) ?? new Set<string>();
      owners.add(tool.server);
      nameOwners.set(tool.name, owners);
    }
  }
  const conflicts = [...nameOwners.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([name, owners]) => `${name} (${[...owners].sort().join(", ")})`);
  return { tools: [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), conflicts };
}

/** Deskriptor-Validierung: HTTPS fuer Remote-Server, keine privaten Adressen. */
export function validateServerEndpoint(input: { server: string; url?: string }): { ok: true } | { ok: false; reason: string } {
  const url = (input.url ?? "").trim();
  if (input.url !== undefined) {
    if (!/^https:\/\//i.test(url)) return { ok: false, reason: `Endpoint muss HTTPS sein: ${url}` };
    if (/^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url)) {
      return { ok: false, reason: `Private/lokale Adresse ist als MCP-Server nicht erlaubt: ${url}` };
    }
  }
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/i.test(input.server)) {
    return { ok: false, reason: `Server-Name ungültig: ${input.server}` };
  }
  return { ok: true };
}

export type ToolMatchRequest = {
  task: string;
  requiredPermissions?: readonly McpPermission[];
  /** Berechtigungen, die der Anschluss nie vergeben darf (z. B. shell). */
  excludedPermissions?: readonly McpPermission[];
};

/** Faehigkeits-Matching: Tools, deren Berechtigungen die Anforderung abdecken. */
export function matchToolsForTask(tools: readonly McpToolDescriptor[], request: ToolMatchRequest): McpToolDescriptor[] {
  const required = request.requiredPermissions ?? [];
  const excluded = request.excludedPermissions ?? [];
  const keywords = request.task.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
  const scored = tools
    .filter((tool) => required.every((permission) => tool.permissions.includes(permission)))
    .filter((tool) => !tool.permissions.some((permission) => excluded.includes(permission)))
    .map((tool) => {
      const haystack = `${tool.name} ${tool.description}`.toLowerCase();
      const relevance = keywords.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
      return { tool, relevance };
    });
  return scored
    .sort((a, b) => b.relevance - a.relevance || (a.tool.id < b.tool.id ? -1 : 1))
    .map((entry) => entry.tool);
}

export type PermissionCheck = { allowed: true } | { allowed: false; reason: string };

/** Berechtigungs-Gate: Tool-Ausfuehrung nur mit passenden Grants. */
export function assertToolAllowed(tool: McpToolDescriptor, grantedPermissions: readonly McpPermission[]): PermissionCheck {
  const missing = tool.permissions.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length > 0) {
    return { allowed: false, reason: `Berechtigung fehlt: ${missing.join(", ")}` };
  }
  return { allowed: true };
}

export type ConnectorRegistry = {
  connectors: ConnectorDescriptor[];
};

export function emptyRegistry(): ConnectorRegistry {
  return { connectors: [] };
}

export type RegistryChange =
  | { ok: true; registry: ConnectorRegistry }
  | { ok: false; reason: string };

/** Connector registrieren (unveränderlich, Duplicate-IDs verboten). */
export function registerConnector(registry: ConnectorRegistry, descriptor: ConnectorDescriptor): RegistryChange {
  if (registry.connectors.some((connector) => connector.id === descriptor.id)) {
    return { ok: false, reason: `Connector-ID bereits registriert: ${descriptor.id}` };
  }
  const endpointCheck = descriptor.baseUrl !== undefined ? validateServerEndpoint({ server: descriptor.id, url: descriptor.baseUrl }) : { ok: true as const };
  if (!endpointCheck.ok) return endpointCheck;
  return { ok: true, registry: { connectors: [...registry.connectors, descriptor] } };
}

export function removeConnector(registry: ConnectorRegistry, connectorId: string): RegistryChange {
  if (!registry.connectors.some((connector) => connector.id === connectorId)) {
    return { ok: false, reason: `Connector nicht gefunden: ${connectorId}` };
  }
  return { ok: true, registry: { connectors: registry.connectors.filter((connector) => connector.id !== connectorId) } };
}

/** Connectoren nach Art oder Permissions filtern. */
export function findConnectors(
  registry: ConnectorRegistry,
  filter: { kind?: ConnectorKind; permission?: McpPermission } = {},
): ConnectorDescriptor[] {
  return registry.connectors.filter(
    (connector) =>
      (filter.kind === undefined || connector.kind === filter.kind) &&
      (filter.permission === undefined || connector.permissions.includes(filter.permission)),
  );
}
