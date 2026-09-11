import { describe, expect, it } from "vitest";

import {
  assertToolAllowed,
  emptyRegistry,
  findConnectors,
  matchToolsForTask,
  mergeDiscoveredTools,
  registerConnector,
  removeConnector,
  validateServerEndpoint,
  type ConnectorDescriptor,
  type McpToolDescriptor,
} from "../lib/mcp-registry-logic";

const searchTool: McpToolDescriptor = {
  id: "web::search",
  server: "web",
  name: "search",
  description: "Websuche durchführen",
  inputSchema: { query: { type: "string", required: true } },
  permissions: ["network", "read"],
};

const fileTool: McpToolDescriptor = {
  id: "fs::read-file",
  server: "fs",
  name: "read-file",
  description: "Datei lesen",
  inputSchema: { path: { type: "string", required: true } },
  permissions: ["filesystem", "read"],
};

const shellTool: McpToolDescriptor = {
  id: "ops::run-shell",
  server: "ops",
  name: "run-shell",
  description: "Shell-Befehl ausführen",
  inputSchema: { command: { type: "string", required: true } },
  permissions: ["shell", "write"],
};

describe("mcp registry logic", () => {
  it("merges discovered tools across servers and reports name conflicts", () => {
    const duplicate: McpToolDescriptor = { ...searchTool, id: "web2::search", server: "web2" };
    const result = mergeDiscoveredTools([[searchTool], [fileTool, duplicate]]);
    expect(result.tools.map((tool) => tool.id)).toEqual(["fs::read-file", "web2::search", "web::search"]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain("search");

    const unique = mergeDiscoveredTools([[searchTool], [fileTool]]);
    expect(unique.conflicts).toHaveLength(0);
  });

  it("fills missing tool ids deterministically", () => {
    const result = mergeDiscoveredTools([[{ ...searchTool, id: "" }]]);
    expect(result.tools[0].id).toBe("web::search");
  });

  it("validates server endpoints (https only, no private addresses)", () => {
    expect(validateServerEndpoint({ server: "workspace", url: "https://mcp.example.com/sse" }).ok).toBe(true);
    expect(validateServerEndpoint({ server: "workspace" }).ok).toBe(true);
    expect(validateServerEndpoint({ server: "workspace", url: "http://mcp.example.com" }).ok).toBe(false);
    expect(validateServerEndpoint({ server: "workspace", url: "https://127.0.0.1:8080" }).ok).toBe(false);
    expect(validateServerEndpoint({ server: "workspace", url: "https://192.168.1.5/sse" }).ok).toBe(false);
    expect(validateServerEndpoint({ server: "bad name" }).ok).toBe(false);
  });

  it("matches tools by required permissions, relevance and exclusions", () => {
    const tools = [searchTool, fileTool, shellTool];
    const forSearch = matchToolsForTask(tools, { task: "Suche im Web", requiredPermissions: ["network"] });
    expect(forSearch[0].id).toBe("web::search");

    const noShell = matchToolsForTask(tools, { task: "führe alles aus", excludedPermissions: ["shell"] });
    expect(noShell.map((tool) => tool.id)).not.toContain("ops::run-shell");
    expect(noShell.map((tool) => tool.id)).toContain("fs::read-file");

    const fsJob = matchToolsForTask(tools, { task: "Datei lesen", requiredPermissions: ["filesystem"] });
    expect(fsJob.map((tool) => tool.id)).toEqual(["fs::read-file"]);
  });

  it("gates tool execution behind granted permissions", () => {
    expect(assertToolAllowed(fileTool, ["filesystem", "read"]).allowed).toBe(true);
    const denied = assertToolAllowed(shellTool, ["read"]);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.reason).toContain("shell");
  });

  it("manages the connector registry immutably with validation", () => {
    const webSearch: ConnectorDescriptor = {
      id: "search-main",
      name: "Websuche",
      kind: "web-search",
      baseUrl: "https://search.example.com",
      permissions: ["network", "read"],
    };
    let registry = emptyRegistry();
    const added = registerConnector(registry, webSearch);
    expect(added.ok).toBe(true);
    registry = added.ok ? added.registry : registry;

    const duplicate = registerConnector(registry, webSearch);
    expect(duplicate.ok).toBe(false);

    const insecure = registerConnector(registry, {
      id: "bad",
      name: "Bad",
      kind: "custom-api",
      baseUrl: "http://insecure.example.com",
      permissions: [],
    });
    expect(insecure.ok).toBe(false);

    expect(registry.connectors).toHaveLength(1);
    expect(findConnectors(registry, { kind: "web-search" })).toHaveLength(1);
    expect(findConnectors(registry, { permission: "network" })).toHaveLength(1);
    expect(findConnectors(registry, { kind: "execution" })).toHaveLength(0);

    const removed = removeConnector(registry, "search-main");
    expect(removed.ok).toBe(true);
    const emptied = removed.ok ? removed.registry : registry;
    expect(emptied.connectors).toHaveLength(0);
    const empty = removeConnector(emptied, "search-main");
    expect(empty.ok).toBe(false);
  });
});
