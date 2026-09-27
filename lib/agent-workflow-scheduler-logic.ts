/**
 * Faehigkeitsparitaet 2/6 — Workflow-Scheduler: reine, deterministische
 * Logik fuer geplante und getriggerte Agent-Automatisierungen
 * (Base44-Pendant: scheduled/entity/connector-Trigger + Aktivieren/Pausieren).
 *
 * Datenfluss:
 *   Workflow-Definitionen (Trigger: cron/Intervall/Einmal/Entity-Event)
 *   ergeben aus der aktuellen Zeit die naechste fällige Ausfuehrung;
 *   Pausieren stoppt sichtbar, Archivieren entfernt.
 *
 * Ehrlichkeits-Grenze: Ein pausierter Workflow laeuft NIE heimlich; die
 *   naechste Laufzeit wird nur fuer aktive Workflows berechnet — eine
 *   unbekannte Trigger-Form ist ein Konfigurationsfehler, kein "laeuft
 *   halt nie". Alles gratis: getaktet vom bestehenden Server-Timer.
 */

export type WorkflowTrigger =
  | { kind: "cron"; expression: string; hourUTC: number; minute: number }
  | { kind: "interval"; everyMinutes: number }
  | { kind: "once"; atMs: number }
  | { kind: "entity"; entity: string; on: "created" | "updated" | "deleted" };

export type AgentWorkflow = {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  active: boolean;
  lastRunMs: number | null;
};

/** Naechste fällige Laufzeit fuer AKTIVE Workflows (pausierte: null). */
export function nextRunAt(workflow: AgentWorkflow, nowMs: number): number | null {
  if (!workflow.active) return null;
  const t = workflow.trigger;
  switch (t.kind) {
    case "cron": {
      if (t.hourUTC < 0 || t.hourUTC > 23 || t.minute < 0 || t.minute > 59) return null;
      const today = new Date(nowMs);
      const candidate = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), t.hourUTC, t.minute);
      if (candidate > nowMs) return candidate;
      // Slot heute schon vorbei: Ein VERPASSTER Lauf (noch nie oder vor dem
      // Slot gelaufen) bleibt faellig statt still auf morgen zu rutschen.
      if (workflow.lastRunMs === null || workflow.lastRunMs < candidate) return candidate;
      return candidate + 24 * 3600_000; // heute schon gelaufen: naechster Tag
    }
    case "interval": {
      if (t.everyMinutes <= 0) return null;
      const step = t.everyMinutes * 60_000;
      const last = workflow.lastRunMs ?? nowMs;
      const next = Math.ceil(Math.max(last, nowMs) / step) * step;
      return next <= nowMs ? nowMs + step : next;
    }
    case "once": {
      return t.atMs > nowMs ? t.atMs : null; // abgelaufen = nie wieder
    }
    case "entity": {
      return null; // Event-getriggert: keine Zeitplanung, laeuft bei Event
    }
  }
}

/** Welche Workflows sind JETZT faellig (nur aktive, ehrlich gezaehlt)? */
export function dueWorkflows(workflows: AgentWorkflow[], nowMs: number): AgentWorkflow[] {
  return workflows.filter((w) => {
    const at = nextRunAt(w, nowMs);
    return at !== null && at <= nowMs;
  });
}

/** Aktivieren/Pausieren: sichtbarer Zustand, kein heimliches Laufen. */
export function setWorkflowActive(workflow: AgentWorkflow, active: boolean): AgentWorkflow {
  return { ...workflow, active };
}

/** Trigger-Konfiguration pruefen — ungueltige Trigger werden benannt. */
export function validateTrigger(trigger: WorkflowTrigger): string[] {
  const issues: string[] = [];
  switch (trigger.kind) {
    case "cron":
      if (!/^\S+\s+\S+$|^\S+$/.test(trigger.expression)) issues.push("Cron-Ausdruck ungueltig.");
      if (trigger.hourUTC < 0 || trigger.hourUTC > 23) issues.push("hourUTC ausserhalb 0-23.");
      break;
    case "interval":
      if (trigger.everyMinutes <= 0) issues.push("everyMinutes muss > 0 sein.");
      break;
    case "once":
      if (!Number.isFinite(trigger.atMs)) issues.push("atMs muss endliche Zeit sein.");
      break;
    case "entity":
      if (!trigger.entity.trim()) issues.push("Entity-Name fehlt.");
      break;
  }
  return issues;
}

/** Scheduler-Uebersicht fuer den Nutzer: Zustand + naechste Laufzeit. */
export function describeSchedule(workflows: AgentWorkflow[], nowMs: number): string {
  if (workflows.length === 0) return "Keine Workflows definiert.";
  return workflows
    .map((w) => {
      const at = nextRunAt(w, nowMs);
      const state = w.active ? "aktiv" : "PAUSIERT (laeuft nicht)";
      const next = at === null ? "keine Zeitplanung" : `naechster Lauf in ${Math.max(0, Math.round((at - nowMs) / 60_000))} min`;
      return `- ${w.name} [${w.trigger.kind}] ${state}, ${next}.`;
    })
    .join("\n");
}
