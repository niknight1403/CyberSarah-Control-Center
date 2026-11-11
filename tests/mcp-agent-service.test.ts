/**
 * Sprint 6 — Tests des Agent-Factory-Service.
 *
 * Zusagen: der Katalog enthaelt nur aktive Server, gespeichert wird nur ein
 * gueltiger Entwurf, doppelte Schluessel werden abgelehnt, und ein Agent ohne
 * Werkzeuge laesst sich nicht aktivieren.
 */
import { describe, expect, it } from "vitest";

import { createMcpAgentService } from "../server/mcp-agent-service";
import type { McpAgentStore, StoredAgent } from "../server/mcp-agent-store";

const TOOLS = [
  { name: "search_web", description: "Searches the public web and returns ranked results." },
  { name: "fetch_page", description: "Fetches a web page and returns its text." },
];

const SERVERS = [
  { serverKey: "websearch", enabled: true, tools: TOOLS },
  { serverKey: "paused", enabled: false, tools: TOOLS },
  { serverKey: "empty", enabled: true, tools: [] },
];

function createFakeStore(seed: StoredAgent[] = []) {
  const agents = new Map(seed.map((agent) => [agent.agentKey, agent]));
  let id = 1;
  const store: McpAgentStore = {
    async list() {
      return [...agents.values()];
    },
    async findByKey(agentKey) {
      return agents.get(agentKey) ?? null;
    },
    async insert(spec, actor) {
      const row: StoredAgent = {
        id: id++,
        agentKey: spec.key,
        name: spec.name,
        role: spec.role,
        purpose: spec.purpose,
        systemPrompt: spec.systemPrompt,
        security: spec.security,
        acceptanceTests: spec.acceptanceTests,
        qualityCriteria: spec.qualityCriteria,
        monitoring: spec.monitoring,
        warnings: spec.warnings,
        version: spec.version,
        status: "draft",
        createdBy: actor,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        grants: spec.grants.map((grant) => ({
          serverKey: grant.serverKey,
          toolName: grant.toolName,
          riskLevel: grant.riskLevel,
          purpose: grant.purpose,
        })),
      };
      agents.set(row.agentKey, row);
      return row;
    },
    async setStatus(agentKey, status) {
      const existing = agents.get(agentKey);
      if (!existing) return null;
      const updated = { ...existing, status };
      agents.set(agentKey, updated);
      return updated;
    },
    async remove(agentKey) {
      return agents.delete(agentKey);
    },
  };
  return { store, agents };
}

function build(seed: StoredAgent[] = []) {
  const fakes = createFakeStore(seed);
  const service = createMcpAgentService({
    store: fakes.store,
    servers: { list: async () => SERVERS as never },
  });
  return { service, ...fakes };
}

describe("Katalog", () => {
  it("enthaelt nur aktive Server mit Werkzeugen", async () => {
    const { service } = build();
    const catalog = await service.catalog();
    expect(catalog.every((profile) => profile.serverKey === "websearch")).toBe(true);
    expect(catalog).toHaveLength(2);
  });
});

describe("Planung", () => {
  it("liefert im dryRun einen Entwurf ohne zu speichern", async () => {
    const { service, agents } = build();
    const result = await service.dryRun({
      name: "Web Scout",
      brief: "Recherchiere taeglich Webseiten und fasse Inhalte zusammen.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.grants.length).toBeGreaterThan(0);
    expect(result.summary.tools).toBeGreaterThan(0);
    expect(agents.size).toBe(0);
  });

  it("lehnt eine zu kurze Aufgabe ab", async () => {
    const { service } = build();
    const result = await service.dryRun({ name: "X", brief: "kurz" });
    expect(result.ok).toBe(false);
  });

  it("speichert einen gueltigen Agenten als draft", async () => {
    const { service, agents } = build();
    const result = await service.create({
      name: "Web Scout",
      brief: "Recherchiere taeglich Webseiten und fasse Inhalte zusammen.",
      actor: "admin",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.status).toBe("draft");
    expect(result.agent.createdBy).toBe("admin");
    expect(result.agent.grants.length).toBeGreaterThan(0);
    expect(agents.size).toBe(1);
  });

  it("lehnt doppelte Agenten ab", async () => {
    const { service } = build();
    const input = { name: "Web Scout", brief: "Recherchiere taeglich Webseiten und fasse Inhalte zusammen." };
    expect((await service.create(input)).ok).toBe(true);
    const again = await service.create(input);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toContain("existiert bereits");
  });
});

describe("Statuswechsel", () => {
  it("aktiviert einen Agenten mit Werkzeugen", async () => {
    const { service } = build();
    const created = await service.create({
      name: "Web Scout",
      brief: "Recherchiere taeglich Webseiten und fasse Inhalte zusammen.",
    });
    expect(created.ok).toBe(true);
    const activated = await service.setStatus("web-scout", "active");
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.agent.status).toBe("active");
  });

  it("verweigert die Aktivierung ohne Werkzeuge", async () => {
    const { service } = build();
    const created = await service.create({
      name: "Leerer Agent",
      brief: "Verwalte Sonderfaelle ohne passende Werkzeuge im Katalog.",
    });
    expect(created.ok).toBe(true);
    const activated = await service.setStatus("leerer-agent", "active");
    expect(activated.ok).toBe(false);
    if (activated.ok) return;
    expect(activated.reason).toContain("ohne Werkzeuge");
  });

  it("meldet unbekannte Agenten", async () => {
    const { service } = build();
    const result = await service.setStatus("gibtsnicht", "paused");
    expect(result.ok).toBe(false);
  });
});

describe("Loeschen", () => {
  it("meldet ehrlich, ob ein Agent entfernt wurde", async () => {
    const { service } = build();
    await service.create({ name: "Web Scout", brief: "Recherchiere taeglich Webseiten und fasse Inhalte zusammen." });
    expect(await service.remove("web-scout")).toEqual({ ok: true, removed: true });
    expect(await service.remove("web-scout")).toEqual({ ok: true, removed: false });
  });
});
