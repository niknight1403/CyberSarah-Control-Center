import { describe, expect, it } from "vitest";

import {
  ADMIN_AGENT_MAX_LOG_ENTRIES,
  ADMIN_AGENT_REMEDY_COOLDOWN_MS,
  ADMIN_AGENT_STALE_ACK_MS,
  appendAgentLog,
  isOpenIncident,
  planAdminAgentCycle,
  type AdminAgentSnapshot,
} from "@/lib/admin-autonomous-agent-logic";
import type { SelfHealingIncident } from "@/lib/self-healing-logic";

/** Fabrik fuer deterministische Test-Incidents. */
function incident(overrides: Partial<SelfHealingIncident> & { id: string }): SelfHealingIncident {
  return {
    source: "manual_scan",
    signature: "http_5xx",
    severity: "medium",
    finding: "Test-Befund",
    evidence: [],
    status: "detected",
    occurrenceCount: 1,
    firstSeenAt: "2026-09-16T10:00:00.000Z",
    lastSeenAt: "2026-09-16T10:05:00.000Z",
    ...overrides,
  };
}

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const BASE: AdminAgentSnapshot = {
  isAdmin: true,
  incidents: [],
  autoRedeployEnabled: true,
  lastRemedyAt: null,
  nowMs: NOW,
};

describe("Sprint 142 — Autonomer Administrator-Agent (Entscheidungslogik)", () => {
  it("bleibt bei fehlendem Admin-Login im Leerlauf und meldet gruen", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      isAdmin: false,
      incidents: [incident({ id: "i1", severity: "critical" })],
    });
    expect(plan.status).toBe("green");
    expect(plan.actions[0].kind).toBe("wait");
  });

  it("liefert gruen, wenn keine Incidents offen sind", () => {
    const plan = planAdminAgentCycle(BASE);
    expect(plan.status).toBe("green");
    expect(plan.openCount).toBe(0);
    expect(plan.actions[0].kind).toBe("wait");
  });

  it("stoesst fuer kritische Incidents ohne Analyse sofort eine Analyse an (aelteste zuerst)", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      incidents: [
        incident({ id: "newer", severity: "critical", firstSeenAt: "2026-09-16T11:30:00.000Z" }),
        incident({ id: "older", severity: "critical", firstSeenAt: "2026-09-16T10:30:00.000Z" }),
      ],
    });
    expect(plan.status).toBe("healing");
    const action = plan.actions[0];
    expect(action.kind).toBe("analyze");
    if (action.kind === "analyze") expect(action.incidentId).toBe("older");
  });

  it("wendet ein vorgeschlagenes Fix-Remedy autonom an, wenn Auto-Redeploy aktiv ist", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      incidents: [
        incident({
          id: "fix",
          severity: "critical",
          status: "fix_proposed",
          analysisTaskId: "task-1",
        }),
      ],
    });
    const action = plan.actions[0];
    expect(action.kind).toBe("apply-remedy");
    expect(plan.status).toBe("healing");
  });

  it("respektiert den Remedy-Cooldown und wartet stattdessen", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      lastRemedyAt: NOW - ADMIN_AGENT_REMEDY_COOLDOWN_MS / 2,
      incidents: [incident({ id: "fix", severity: "critical", status: "fix_proposed", analysisTaskId: "t" })],
    });
    expect(plan.actions[0].kind).toBe("wait");
  });

  it("laesst Remedy bei deaktiviertem Auto-Redeploy bewusst aus", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      autoRedeployEnabled: false,
      incidents: [incident({ id: "fix", severity: "critical", status: "fix_proposed", analysisTaskId: "t" })],
    });
    expect(plan.actions[0].kind).toBe("wait");
  });

  it("acknowledged ruhige nicht-kritische Incidents automatisch (>30 min)", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      incidents: [
        incident({ id: "fresh", lastSeenAt: "2026-09-16T11:55:00.000Z" }),
        incident({ id: "stale", lastSeenAt: "2026-09-16T10:00:00.000Z" }),
      ],
    });
    const action = plan.actions[0];
    expect(action.kind).toBe("acknowledge");
    if (action.kind === "acknowledge") expect(action.incidentId).toBe("stale");
  });

  it("fuehrt eine Massnahme pro Zyklus aus — nie mehrere gleichzeitig", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      incidents: [
        incident({ id: "a", severity: "critical", lastSeenAt: "2026-09-16T10:00:00.000Z" }),
        incident({ id: "b", severity: "critical", lastSeenAt: "2026-09-16T10:10:00.000Z" }),
      ],
    });
    expect(plan.actions).toHaveLength(1);
  });

  it("meldet rot bei eskalierten kritischen Incidents und greift nicht automatisch ein", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      incidents: [
        incident({
          id: "esc",
          severity: "critical",
          status: "escalated",
          analysisTaskId: "t",
        }),
      ],
    });
    expect(plan.status).toBe("red");
    expect(plan.actions[0].kind).toBe("wait");
    expect(plan.criticalCount).toBe(1);
  });

  it("behandelt analysierende und geheilte Incidents korrekt (kein Doppel-Analyse)", () => {
    const plan = planAdminAgentCycle({
      ...BASE,
      incidents: [
        incident({ id: "wip", severity: "critical", status: "analyzing", analysisTaskId: "t" }),
        incident({ id: "done", severity: "critical", status: "remedied" }),
        incident({ id: "ack", severity: "critical", status: "acknowledged" }),
      ],
    });
    expect(
      isOpenIncident(
        incident({ id: "wip", severity: "critical", status: "analyzing", analysisTaskId: "t" }),
      ),
    ).toBe(true);
    expect(
      isOpenIncident(incident({ id: "done", severity: "critical", status: "remedied" })),
    ).toBe(false);
    expect(plan.openCount).toBe(1);
  });
});

describe("Sprint 142 — Live-Log Ring-Puffer", () => {
  it("haelt maximal ADMIN_AGENT_MAX_LOG_ENTRIES Einträge (neueste zuerst)", () => {
    let log: ReturnType<typeof appendAgentLog> = [];
    for (let i = 0; i < ADMIN_AGENT_MAX_LOG_ENTRIES + 5; i += 1) {
      log = appendAgentLog(log, { at: i, kind: "wait", reason: `run-${i}` });
    }
    expect(log).toHaveLength(ADMIN_AGENT_MAX_LOG_ENTRIES);
    expect(log[0].reason).toBe(`run-${ADMIN_AGENT_MAX_LOG_ENTRIES + 4}`);
  });
});

describe("Sprint 142 — Stale-Ack-Fenster", () => {
  it("nutzt ein 30-Minuten-Fenster fuer Auto-Acknowledge", () => {
    expect(ADMIN_AGENT_STALE_ACK_MS).toBe(30 * 60_000);
  });
});
