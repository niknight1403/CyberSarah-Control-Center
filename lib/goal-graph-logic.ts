/**
 * Ziel-Zerlegung & Ausführungsgraphen (rein, testbar).
 *
 * Ein Agent-Ziel wird in einen gerichteten, azyklischen Ausführungsgraphen
 * (DAG) aus Schritten zerlegt. Schritte tragen Abhängigkeiten, einen Status
 * und eine deterministische Ausführungsreihenfolge (Topologische Sortierung).
 * Der Graph ist wiederanlaufbar: abgeschlossene Schritte überleben einen
 * Neustart, ausstehende werden aus der readiness-Berechnung abgeleitet.
 */

export type GoalStepKind = "plan" | "code" | "review" | "test" | "deploy";

export type GoalStepStatus = "pending" | "running" | "done" | "failed";

export type GoalStep = {
  id: string;
  title: string;
  kind: GoalStepKind;
  status: GoalStepStatus;
  /** IDs von Schritten, die zuerst abgeschlossen sein müssen. */
  dependsOn: string[];
};

export type GoalGraph = {
  goal: string;
  steps: GoalStep[];
};

const PIPELINE: ReadonlyArray<{ kind: GoalStepKind; title: string }> = [
  { kind: "plan", title: "Ziel analysieren und Plan festlegen" },
  { kind: "code", title: "Umsetzung implementieren" },
  { kind: "test", title: "Tests ergänzen und ausführen" },
  { kind: "review", title: "Ergebnis prüfen und freigeben" },
  { kind: "deploy", title: "Änderung übernehmen" },
];

/**
 * Standard-Zerlegung: Pipeline mit Kette plan → code → test → review → deploy.
 * Explizite Schritte (z. B. aus einer Agent-Planung) werden 1:1 übernommen,
 * sofern sie das GoalStep-Format erfüllen.
 */
export function decomposeGoal(goal: string, explicitSteps?: GoalStep[]): GoalGraph {
  const trimmedGoal = goal.trim();
  if (explicitSteps && explicitSteps.length > 0) {
    return { goal: trimmedGoal, steps: explicitSteps.map(normalizeStep) };
  }
  const steps: GoalStep[] = PIPELINE.map((entry, index) => ({
    id: `${entry.kind}-${index + 1}`,
    title: entry.title,
    kind: entry.kind,
    status: "pending",
    dependsOn: index === 0 ? [] : [`${PIPELINE[index - 1].kind}-${index}`],
  }));
  return { goal: trimmedGoal, steps };
}

function normalizeStep(step: GoalStep): GoalStep {
  const status: GoalStepStatus = ["pending", "running", "done", "failed"].includes(step.status)
    ? step.status
    : "pending";
  return {
    id: step.id,
    title: step.title.trim(),
    kind: step.kind,
    status,
    dependsOn: Array.isArray(step.dependsOn) ? [...step.dependsOn] : [],
  };
}

export type TopologicalResult =
  | { ok: true; order: string[] }
  | { ok: false; cycle: string[] };

/** Kahn-Algorithmus: deterministische Reihenfolge; Zyklen werden gemeldet. */
export function topologicalOrder(steps: readonly GoalStep[]): TopologicalResult {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const known = (id: string) => byId.has(id);
  const order: string[] = [];
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const step of steps) {
    inDegree.set(step.id, 0);
  }
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!known(dep)) continue;
      dependents.set(dep, [...(dependents.get(dep) ?? []), step.id]);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }
  const queue = steps.filter((step) => (inDegree.get(step.id) ?? 0) === 0).map((step) => step.id);
  const cycleDetected = new Set<string>(steps.map((step) => step.id));
  while (queue.length > 0) {
    const current = queue.shift() as string;
    order.push(current);
    cycleDetected.delete(current);
    for (const next of dependents.get(current) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) {
        queue.push(next);
        cycleDetected.delete(next);
      }
    }
  }
  if (cycleDetected.size > 0) {
    return { ok: false, cycle: [...cycleDetected] };
  }
  return { ok: true, order };
}

/** Schritte, die jetzt ausgeführt werden dürfen: pending UND alle Abhängigkeiten done. */
export function readySteps(steps: readonly GoalStep[]): GoalStep[] {
  const statusOf = new Map(steps.map((step) => [step.id, step.status]));
  return steps.filter(
    (step) =>
      step.status === "pending" &&
      step.dependsOn.every((dep) => statusOf.get(dep) === "done"),
  );
}

/** Erlaubte Statusübergänge der Schritt-Zustandsmaschine. */
const ALLOWED_TRANSITIONS: Record<GoalStepStatus, GoalStepStatus[]> = {
  pending: ["running", "failed"],
  running: ["done", "failed"],
  failed: ["pending", "running"],
  done: [],
};

export type TransitionResult = { ok: true; steps: GoalStep[] } | { ok: false; reason: string };

/** Statuswechsel mit Zustandsmaschinen-Validierung (unveränderlich, Kopie zurück). */
export function transitionStep(
  steps: readonly GoalStep[],
  stepId: string,
  nextStatus: GoalStepStatus,
): TransitionResult {
  const step = steps.find((entry) => entry.id === stepId);
  if (!step) return { ok: false, reason: `Unbekannter Schritt: ${stepId}` };
  if (step.status === nextStatus) return { ok: false, reason: `Schritt ${stepId} ist bereits ${nextStatus}` };
  if (!ALLOWED_TRANSITIONS[step.status].includes(nextStatus)) {
    return { ok: false, reason: `Übergang ${step.status} → ${nextStatus} für ${stepId} nicht erlaubt` };
  }
  if (nextStatus === "running" && !step.dependsOn.every((dep) => steps.find((entry) => entry.id === dep)?.status === "done")) {
    return { ok: false, reason: `Abhängigkeiten von ${stepId} sind noch nicht abgeschlossen` };
  }
  return {
    ok: true,
    steps: steps.map((entry) => (entry.id === stepId ? { ...entry, status: nextStatus } : entry)),
  };
}

export type GoalProgress = {
  total: number;
  done: number;
  failed: number;
  running: number;
  fraction: number;
  complete: boolean;
  blocked: boolean;
};

/** Fortschritt des Ziel-Graphen; blocked = keine ready-Schritte, aber noch nicht fertig. */
export function goalProgress(steps: readonly GoalStep[]): GoalProgress {
  const total = steps.length;
  const done = steps.filter((step) => step.status === "done").length;
  const failed = steps.filter((step) => step.status === "failed").length;
  const running = steps.filter((step) => step.status === "running").length;
  const ready = readySteps(steps).length;
  return {
    total,
    done,
    failed,
    running,
    fraction: total === 0 ? 1 : done / total,
    complete: total > 0 && done === total,
    blocked: total > 0 && done < total && ready === 0 && running === 0 && failed > 0,
  };
}

/** Kompakte Beschreibung für die Ops-/Chat-Anzeige. */
export function describeGoalGraph(graph: GoalGraph): string {
  const progress = goalProgress(graph.steps);
  const next = readySteps(graph.steps).map((step) => step.title).join(", ");
  const head = `Ziel „${graph.goal}“ — ${progress.done}/${progress.total} Schritten erledigt (${Math.round(progress.fraction * 100)} %).`;
  if (progress.complete) return `${head} Ziel erreicht.`;
  if (progress.blocked) return `${head} Blockiert: ${progress.failed} fehlgeschlagene Schritte ohne Wiederanlaufpunkt.`;
  return `${head} Als nächstes bereit: ${next || "—"}.`;
}
