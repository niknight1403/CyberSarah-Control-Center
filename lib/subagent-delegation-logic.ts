/**
 * Faehigkeitsparitaet 3/6 — Sub-Agent-Delegation: reine, deterministische
 * Logik fuer die Zerlegung einer Mission in fokussierte Teil-Aufgaben
 * (Base44-Pendant: sub_agent mit Mission, Tasks, Capabilities, Deadlines).
 *
 * Datenfluss:
 *   Eine Mission (Ziel + Teil-Aufgaben mit Abhaengigkeiten) wird geplant:
 *   Tasks ohne offene Abhaengigkeiten sind bereit, exklusive Ressourcen
 *   (conflict keys) blockieren Parallelitaet, Scopes begrenzen Rechte.
 *
 * Ehrlichkeits-Grenze: Ein Task ohne benoetigte Faehigkeit bleibt
 *   "blockiert", bis sie gewaehrt ist — er wird nicht "einfach mal"
 *   ausgefuehrt. First-Success-Missionen enden beim ersten Erfolg,
 *   All-Missionen erst, wenn wirklich ALLE fertig sind.
 */

export type TaskStatus = "bereit" | "wartet" | "blockiert" | "erledigt" | "fehlgeschlagen";

export type DelegationTask = {
  id: string;
  topic: string;
  instruction: string;
  dependsOn: string[];
  /** Exklusive Ressourcen, die nicht parallel von zwei Tasks genutzt werden. */
  conflictKeys: string[];
  /** Noetige Faehigkeiten (z. B. "web-suche", "entity-write"). */
  requiredCapabilities: string[];
};

export type Mission = {
  name: string;
  objective: string;
  tasks: DelegationTask[];
  policy: "all" | "first_success";
};

/** Status eines Tasks im Graphen (Abhaengigkeiten + Capability-Deckung). */
export function taskStatus(
  mission: Mission,
  task: DelegationTask,
  done: Set<string>,
  grantedCapabilities: Set<string>,
): TaskStatus {
  if (done.has(task.id)) return "erledigt";
  const missingDeps = task.dependsOn.filter((d) => !done.has(d));
  if (missingDeps.length > 0) return "wartet";
  const missingCaps = task.requiredCapabilities.filter((c) => !grantedCapabilities.has(c));
  if (missingCaps.length > 0) return "blockiert";
  return "bereit";
}

/** Bereite Tasks, aber nur die ohne Konflikt mit bereits laufenden. */
export function pickRunnableTasks(
  mission: Mission,
  done: Set<string>,
  running: Set<string>,
  grantedCapabilities: Set<string>,
): DelegationTask[] {
  const runningConflicts = new Set(
    [...running].flatMap((id) => mission.tasks.find((t) => t.id === id)?.conflictKeys ?? []),
  );
  return mission.tasks.filter((task) => {
    if (running.has(task.id)) return false;
    if (taskStatus(mission, task, done, grantedCapabilities) !== "bereit") return false;
    return !task.conflictKeys.some((key) => runningConflicts.has(key));
  });
}

/** Ist die Mission nach den Regeln ihrer Policy abgeschlossen? */
export function missionComplete(
  mission: Mission,
  done: Set<string>,
  failed: Set<string>,
): boolean {
  const anyTaskFailed = mission.tasks.some((t) => failed.has(t.id));
  const anyTaskDone = mission.tasks.some((t) => done.has(t.id));
  if (mission.policy === "first_success") {
    return anyTaskDone || anyTaskFailed; // Rennen endet beim ersten Ergebnis
  }
  return [...mission.tasks].every((t) => done.has(t.id) || failed.has(t.id));
}

/** Mission in nutzerlesbarer Form — inklusive blockierter Tasks beim Namen. */
export function describeMission(
  mission: Mission,
  done: Set<string>,
  grantedCapabilities: Set<string>,
): string {
  const lines = [`Mission "${mission.name}" (${mission.policy}): ${mission.objective}`];
  for (const task of mission.tasks) {
    const status = done.has(task.id) ? "erledigt" : taskStatus(mission, task, done, grantedCapabilities);
    lines.push(`- [${status}] ${task.topic}: ${task.instruction}`);
  }
  return lines.join("\n");
}

/** Zyklus-Pruefung: Abhaengigkeitsgraphen muessen azyklisch sein. */
export function hasDependencyCycle(mission: Mission): boolean {
  const state = new Map<string, number>(); // 0=offen, 1=in Arbeit, 2=fertig
  const visit = (id: string): boolean => {
    const mark = state.get(id) ?? 0;
    if (mark === 1) return true;
    if (mark === 2) return false;
    state.set(id, 1);
    const task = mission.tasks.find((t) => t.id === id);
    const cyclic = (task?.dependsOn ?? []).some(visit);
    state.set(id, 2);
    return cyclic;
  };
  return mission.tasks.some((t) => visit(t.id));
}
