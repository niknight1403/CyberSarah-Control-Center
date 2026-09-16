import type { SelfHealingIncident } from "./self-healing-logic";

/**
 * Sprint 142 — Autonomer Administrator-Agent (Logik-Kern).
 *
 * Nach dem Administrator-Login betreibt das Control Center einen autonomen
 * System-Agenten: Er scannt das Self-Healing-Incident-Ledger im Zyklus,
 * leitet pro Zyklus deterministisch hoechstens eine Korrekturmassnahme ab
 * (Analyse -> Fix-Vorschlag -> Redeploy-Remedy -> Auto-Acknowledge) und
 * liefert einen Live-Systemstatus (green/healing/red). Ziel: Der Admin
 * braucht nach dem Login keinerlei manuelle Einstellungen mehr — der Agent
 * bringt das System selbststaendig auf gruen.
 *
 * Diese Funktion ist rein und ohne Nebenwirkungen: Alle tRPC-Aufrufe und
 * Persistenz fuehrt der Aufrufer (Hook) aus.
 */

export const ADMIN_AGENT_STATE_STORAGE_KEY = "cybersarah.admin-agent.state.v1";
/** Scan-Intervall im aktiven Vordergrund-Betrieb. */
export const ADMIN_AGENT_SCAN_INTERVAL_MS = 60_000;
/** Mindestabstand zwischen zwei automatischen Redeploy-Remedies. */
export const ADMIN_AGENT_REMEDY_COOLDOWN_MS = 10 * 60_000;
/** Nicht-kritische Incidents werden nach dieser Ruhezeit auto-acknowledged. */
export const ADMIN_AGENT_STALE_ACK_MS = 30 * 60_000;
/** Maximal gespeicherte Aktionen im Live-Log des Agenten. */
export const ADMIN_AGENT_MAX_LOG_ENTRIES = 20;

export type AdminAgentActionKind = "analyze" | "apply-remedy" | "acknowledge" | "wait";

export type AdminAgentAction =
  | { kind: "analyze"; incidentId: string; reason: string }
  | { kind: "apply-remedy"; incidentId: string; reason: string }
  | { kind: "acknowledge"; incidentId: string; reason: string }
  | { kind: "wait"; reason: string };

export type AdminAgentSystemStatus = "green" | "healing" | "red";

export type AdminAgentSnapshot = {
  isAdmin: boolean;
  incidents: SelfHealingIncident[];
  /** Serverseitiger Schalter SELF_HEALING_AUTO_REDEPLOY. */
  autoRedeployEnabled: boolean;
  /** Epoch-ms des letzten angewendeten Remedies (null = noch nie). */
  lastRemedyAt: number | null;
  nowMs: number;
};

export type AdminAgentPlan = {
  status: AdminAgentSystemStatus;
  actions: AdminAgentAction[];
  openCount: number;
  criticalCount: number;
};

const OPEN_STATUSES: ReadonlySet<string> = new Set(["detected", "analyzing", "fix_proposed", "escalated"]);

/** Incident gilt als offen (noch nicht geheilt/quittiert). */
export function isOpenIncident(incident: SelfHealingIncident): boolean {
  return OPEN_STATUSES.has(incident.status);
}

function ageMs(incident: SelfHealingIncident, nowMs: number): number {
  const lastSeen = Date.parse(incident.lastSeenAt);
  return Number.isFinite(lastSeen) ? Math.max(0, nowMs - lastSeen) : 0;
}

/**
 * Leitet den naechsten Agenten-Zyklus ab.
 *
 * Policy (deterministisch, eine Korrekturmassnahme pro Zyklus):
 *   1. Kritisch + ohne Analyse -> Orchestrator-Analyse anstossen.
 *   2. Kritisch + Fix vorgeschlagen + Auto-Redeploy aktiv + Cooldown okay
 *      -> Redeploy-Remedy anwenden.
 *   3. Nicht-kritisch + seit >30 min ruhig -> Auto-Acknowledge (selbst
 *      ausgeheilt, Ledger aufraeumen).
 *   4. Eskalierte Incidents werden bewusst NICHT automatisch behandelt —
 *      hier entscheidet der Mensch.
 */
export function planAdminAgentCycle(snapshot: AdminAgentSnapshot): AdminAgentPlan {
  const open = snapshot.incidents.filter(isOpenIncident);
  const criticalOpen = open.filter((i) => i.severity === "critical");
  const plan: AdminAgentPlan = {
    status: criticalOpen.length > 0 ? "red" : open.length > 0 ? "healing" : "green",
    actions: [],
    openCount: open.length,
    criticalCount: criticalOpen.length,
  };

  if (!snapshot.isAdmin) {
    plan.status = "green";
    plan.actions = [{ kind: "wait", reason: "Kein Admin-Login — Agent im Leerlauf" }];
    return plan;
  }

  const remedyCooldownOk =
    snapshot.lastRemedyAt == null || snapshot.nowMs - snapshot.lastRemedyAt >= ADMIN_AGENT_REMEDY_COOLDOWN_MS;

  // (1) Kritisch, noch ohne Analyse -> analysieren (aeltestes zuerst).
  const unanalyzed = criticalOpen
    .filter((i) => !i.analysisTaskId)
    .sort((a, b) => Date.parse(a.firstSeenAt) - Date.parse(b.firstSeenAt));
  if (unanalyzed.length > 0) {
    plan.actions = [{ kind: "analyze", incidentId: unanalyzed[0].id, reason: `Kritisch ohne Analyse: ${unanalyzed[0].finding}` }];
    plan.status = "healing";
    return plan;
  }

  // (2) Kritisch, Fix vorgeschlagen -> Remedy (sofern Server-Enforcing aktiv).
  if (snapshot.autoRedeployEnabled && remedyCooldownOk) {
    const remediable = criticalOpen
      .filter((i) => i.status === "fix_proposed")
      .sort((a, b) => Date.parse(a.firstSeenAt) - Date.parse(b.firstSeenAt));
    if (remediable.length > 0) {
      plan.actions = [
        { kind: "apply-remedy", incidentId: remediable[0].id, reason: `Fix vorgeschlagen, Remedy aktiv: ${remediable[0].finding}` },
      ];
      plan.status = "healing";
      return plan;
    }
  }

  // (3) Alte, nicht-kritische Incidents auto-acknowledgen.
  const stale = open
    .filter((i) => i.severity !== "critical" && i.status !== "escalated" && ageMs(i, snapshot.nowMs) >= ADMIN_AGENT_STALE_ACK_MS)
    .sort((a, b) => Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt));
  if (stale.length > 0) {
    plan.actions = [{ kind: "acknowledge", incidentId: stale[0].id, reason: `Ruhig seit >30 min, auto-quittiert: ${stale[0].finding}` }];
    return plan;
  }

  // (4) Nichts zu tun — ggf. bewusst auf Eskalation warten.
  plan.actions = [
    criticalOpen.some((i) => i.status === "escalated")
      ? { kind: "wait", reason: "Eskaliertes Incident — menschliche Entscheidung ausstehend" }
      : { kind: "wait", reason: "System stabil, keine offenen Korrekturen" },
  ];
  return plan;
}

/** Ring-Puffer fuer das Live-Log des Agenten (neueste zuerst). */
export function appendAgentLog(
  log: AdminAgentLogEntry[],
  entry: AdminAgentLogEntry,
  max = ADMIN_AGENT_MAX_LOG_ENTRIES,
): AdminAgentLogEntry[] {
  return [entry, ...log].slice(0, max);
}

export type AdminAgentLogEntry = {
  at: number;
  kind: AdminAgentActionKind;
  incidentId?: string;
  reason: string;
};
