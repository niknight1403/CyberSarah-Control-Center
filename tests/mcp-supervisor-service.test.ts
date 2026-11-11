/**
 * Sprint 5 — Tests des Supervisor-Service.
 *
 * Geprueft wird die Verdrahtung: Schwelle oeffnet den Kreis, ein Aufruf wird
 * danach mit echter Wartezeit abgelehnt, Erfolg schliesst ihn wieder, und ein
 * Speicherfehler blockiert keine Aufrufe.
 */
import { describe, expect, it } from "vitest";

import { createMcpSupervisorService } from "../server/mcp-supervisor-service";
import type { CircuitStore } from "../server/mcp-supervisor-store";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");

function createFakeStore(seed: Record<string, unknown>[] = []) {
  const rows = new Map<string, Record<string, unknown>>();
  for (const row of seed) rows.set(`${row.serverKey}::${row.toolName ?? ""}`, row);

  const store: CircuitStore = {
    async find(serverKey, toolName) {
      return (rows.get(`${serverKey}::${toolName ?? ""}`) as never) ?? null;
    },
    async list() {
      return [...rows.values()] as never;
    },
    async upsert(row) {
      rows.set(`${row.serverKey}::${row.toolName ?? ""}`, { ...row, id: 1 });
      return { ...row, id: 1 } as never;
    },
    async reset(serverKey, toolName) {
      rows.delete(`${serverKey}::${toolName ?? ""}`);
    },
  };
  return { store, rows };
}

describe("Supervisor", () => {
  it("laesst Aufrufe im Normalzustand durch", async () => {
    const { store } = createFakeStore();
    const supervisor = createMcpSupervisorService({ store, now: () => NOW });
    const gate = await supervisor.gate("srv", "read_pdf");
    expect(gate.allowed).toBe(true);
    expect(gate.state).toBe("closed");
  });

  it("oeffnet nach drei Fehlern und nennt eine Wartezeit", async () => {
    const { store } = createFakeStore();
    const supervisor = createMcpSupervisorService({ store, now: () => NOW });
    for (let i = 0; i < 3; i += 1) {
      await supervisor.record("srv", "read_pdf", { ok: false, message: "fetch failed" });
    }
    const gate = await supervisor.gate("srv", "read_pdf");
    expect(gate.allowed).toBe(false);
    expect(gate.state).toBe("open");
    expect(gate.retryAfterMs).toBeGreaterThan(0);
  });

  it("schliesst nach einem erfolgreichen Aufruf wieder", async () => {
    const { store } = createFakeStore();
    const supervisor = createMcpSupervisorService({ store, now: () => NOW });
    await supervisor.record("srv", "read_pdf", { ok: false, message: "timeout" });
    await supervisor.record("srv", "read_pdf", { ok: true });
    const status = await supervisor.status("srv");
    expect(status[0].state).toBe("closed");
    expect(status[0].failures).toBe(0);
  });

  it("blockiert gesunde Server nicht wegen Governance-Fehlern", async () => {
    const { store } = createFakeStore();
    const supervisor = createMcpSupervisorService({ store, now: () => NOW });
    for (let i = 0; i < 5; i += 1) {
      await supervisor.record("srv", "charge_card", { ok: false, message: "Governance: Freigabe erforderlich" });
    }
    const gate = await supervisor.gate("srv", "charge_card");
    expect(gate.allowed).toBe(true);
  });

  it("erlaubt nach Abklingzeit einen Probeaufruf", async () => {
    const { store } = createFakeStore();
    let clock = NOW;
    const supervisor = createMcpSupervisorService({
      store,
      now: () => clock,
      policy: { failureThreshold: 1, cooldownMs: 1_000, halfOpenSuccesses: 1 },
    });
    await supervisor.record("srv", null, { ok: false, message: "ECONNREFUSED" });
    expect((await supervisor.gate("srv", null)).allowed).toBe(false);

    clock = NOW + 2_000;
    const probe = await supervisor.gate("srv", null);
    expect(probe.allowed).toBe(true);
    expect(probe.state).toBe("half_open");
  });

  it("zeigt den Zustand je Werkzeug und setzt ihn zurueck", async () => {
    const { store } = createFakeStore();
    const supervisor = createMcpSupervisorService({ store, now: () => NOW });
    await supervisor.record("srv", "read_pdf", { ok: false, message: "timeout" });
    const listed = await supervisor.status("srv");
    expect(listed).toHaveLength(1);
    expect(listed[0].toolName).toBe("read_pdf");
    expect(listed[0].detail).toContain("Kreis");

    await supervisor.reset("srv", "read_pdf");
    expect(await supervisor.status("srv")).toEqual([]);
  });

  it("blockiert keine Aufrufe, wenn der Zustand nicht lesbar ist", async () => {
    const broken: CircuitStore = {
      find: async () => {
        throw new Error("Datenbank nicht verfuegbar");
      },
      list: async () => [],
      upsert: async () => {
        throw new Error("Datenbank nicht verfuegbar");
      },
      reset: async () => undefined,
    };
    const supervisor = createMcpSupervisorService({ store: broken, now: () => NOW });
    const gate = await supervisor.gate("srv");
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toContain("nicht lesbar");
  });
});
