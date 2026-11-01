/**
 * Sprint 368 — Aufgaben-Zerlegung: große Ziele in prüfbare Teilschritte
 *
 * Zerlegt komplexe Hauptziele in strukturierte, prüfbare Teilschritte mit
 * expliziten Abhängigkeiten und Akzeptanzkriterien.
 * Ermöglicht Fortschrittsverfolgung, Abhängigkeitsauflösung und Nachplanung.
 */

export type SubTaskStatus = "pending" | "in_progress" | "succeeded" | "failed" | "blocked";

export type SubTask = {
  id: string;
  title: string;
  description: string;
  dependencies: string[]; // IDs vorausgesetzter Teilschritte
  acceptanceCriteria: string[]; // Prüfbare Akzeptanzkriterien
  status: SubTaskStatus;
  resultNote?: string;
};

export type DecompositionPlan = {
  goalId: string;
  mainGoal: string;
  subTasks: SubTask[];
  totalSteps: number;
  isVagueGoal: boolean;
  clarificationNeeded?: string;
  executionOrder: string[]; // Abfolge der SubTask-IDs
};

/**
 * Heuristische Erkennung vager/unzureichender Zielbeschreibungen.
 */
export function isGoalVague(mainGoal: string): boolean {
  if (!mainGoal || mainGoal.trim().length < 8) return true;
  const vagueTerms = ["mach was", "etwas bauen", "irgendwie", "fix it", "do something"];
  const lower = mainGoal.toLowerCase();
  return vagueTerms.some((term) => lower.includes(term));
}

/**
 * Zerlegt ein Hauptziel in prüfbare Teilschritte.
 */
export function decomposeGoal(
  mainGoal: string,
  explicitSteps?: Array<{
    title: string;
    description: string;
    dependencies?: string[];
    criteria?: string[];
  }>
): DecompositionPlan {
  const goalId = `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  if (isGoalVague(mainGoal)) {
    return {
      goalId,
      mainGoal,
      subTasks: [],
      totalSteps: 0,
      isVagueGoal: true,
      clarificationNeeded: `Das Hauptziel '${mainGoal}' ist zu unkonkret. Bitte präzisiere das gewünschte Ergebnis oder die Zielkomponenten.`,
      executionOrder: [],
    };
  }

  let rawSteps: Array<{
    title: string;
    description: string;
    dependencies: string[];
    criteria: string[];
  }> = [];

  if (explicitSteps && explicitSteps.length > 0) {
    rawSteps = explicitSteps.map((step) => ({
      title: step.title,
      description: step.description,
      dependencies: step.dependencies || [],
      criteria: step.criteria || [
        `Schritt '${step.title}' muss ohne Fehler abgeschlossen werden.`,
      ],
    }));
  } else {
    // Automatische Standard-Zerlegung für dreistufige Entwicklungsaufgaben
    rawSteps = [
      {
        title: "1. Analyse & Spezifikation",
        description: `Anforderungen und Ist-Zustand für '${mainGoal}' analysieren.`,
        dependencies: [],
        criteria: ["Anforderungen dokumentiert", "Schnittstellen definiert"],
      },
      {
        title: "2. Implementierung",
        description: `Kernlogik für '${mainGoal}' im Quellcode umsetzen.`,
        dependencies: ["step-1"],
        criteria: ["Code geschrieben", "Keine Syntax- oder Typerrfehler"],
      },
      {
        title: "3. Verifikation & Tests",
        description: `Unit- und Integrationstests für '${mainGoal}' ausführen.`,
        dependencies: ["step-2"],
        criteria: ["Automatisierte Tests komplett grün", "npx vitest bestanden"],
      },
    ];
  }

  const subTasks: SubTask[] = rawSteps.map((step, idx) => {
    const id = `step-${idx + 1}`;
    const dependencies = step.dependencies.map((dep) => {
      if (!isNaN(Number(dep))) return `step-${dep}`;
      return dep;
    });

    return {
      id,
      title: step.title,
      description: step.description,
      dependencies,
      acceptanceCriteria: step.criteria,
      status: "pending",
    };
  });

  const executionOrder = computeExecutionOrder(subTasks);

  return {
    goalId,
    mainGoal,
    subTasks,
    totalSteps: subTasks.length,
    isVagueGoal: false,
    executionOrder,
  };
}

/**
 * Berechnet eine gültige Ausführungsreihenfolge (Topologischer Sort).
 */
export function computeExecutionOrder(subTasks: SubTask[]): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    const task = subTasks.find((t) => t.id === taskId);
    if (!task) return;

    for (const depId of task.dependencies) {
      visit(depId);
    }

    visited.add(taskId);
    order.push(taskId);
  }

  for (const task of subTasks) {
    visit(task.id);
  }

  return order;
}

/**
 * Ermittelt Teilschritte, die aktuell bereit für die Ausführung sind (alle Abhängigkeiten erfüllt).
 */
export function getNextExecutableTasks(plan: DecompositionPlan): SubTask[] {
  if (plan.isVagueGoal || plan.subTasks.length === 0) return [];

  const succeededIds = new Set(
    plan.subTasks.filter((t) => t.status === "succeeded").map((t) => t.id)
  );

  return plan.subTasks.filter((task) => {
    if (task.status !== "pending") return false;
    const allDepsMet = task.dependencies.every((depId) => succeededIds.has(depId));
    return allDepsMet;
  });
}

/**
 * Aktualisiert den Status eines Teilschritts und blockiert Folge-Schritte bei Fehlern.
 */
export function updateSubTaskStatus(
  plan: DecompositionPlan,
  subTaskId: string,
  status: SubTaskStatus,
  resultNote?: string
): DecompositionPlan {
  const updatedSubTasks = plan.subTasks.map((task) => {
    if (task.id === subTaskId) {
      return { ...task, status, resultNote };
    }
    return { ...task };
  });

  // Falls ein Schritt fehlschlägt oder blockiert wird, propagiere Blocking transitiv
  let changed = true;
  while (changed) {
    changed = false;
    const blockedOrFailedIds = new Set(
      updatedSubTasks
        .filter((t) => t.status === "failed" || t.status === "blocked")
        .map((t) => t.id)
    );

    for (const task of updatedSubTasks) {
      if (task.status === "pending" || task.status === "in_progress") {
        const hasBlockedDep = task.dependencies.some((depId) => blockedOrFailedIds.has(depId));
        if (hasBlockedDep) {
          task.status = "blocked";
          task.resultNote = "Blockiert wegen Fehler oder Blockade in vorausgesetztem Teilschritt.";
          changed = true;
        }
      }
    }
  }

  return {
    ...plan,
    subTasks: updatedSubTasks,
  };
}

/**
 * Bewertet den Gesamtforschritt des Plans.
 */
export function assessGoalProgress(plan: DecompositionPlan): {
  completedCount: number;
  totalCount: number;
  progressRatio: number; // 0..100 (%)
  isFinished: boolean;
  isFailed: boolean;
} {
  const totalCount = plan.subTasks.length;
  if (totalCount === 0) {
    return { completedCount: 0, totalCount: 0, progressRatio: 0, isFinished: false, isFailed: plan.isVagueGoal };
  }

  const completedCount = plan.subTasks.filter((t) => t.status === "succeeded").length;
  const failedCount = plan.subTasks.filter((t) => t.status === "failed").length;
  const blockedCount = plan.subTasks.filter((t) => t.status === "blocked").length;
  const isFinished = completedCount === totalCount;
  const isFailed =
    failedCount > 0 ||
    (completedCount + blockedCount === totalCount && completedCount < totalCount);

  return {
    completedCount,
    totalCount,
    progressRatio: Math.round((completedCount / totalCount) * 1000) / 10,
    isFinished,
    isFailed,
  };
}
