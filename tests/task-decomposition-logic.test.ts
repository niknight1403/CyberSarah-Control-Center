import { describe, it, expect } from "vitest";
import {
  decomposeGoal,
  getNextExecutableTasks,
  updateSubTaskStatus,
  assessGoalProgress,
  isGoalVague,
} from "../lib/task-decomposition-logic";

describe("Sprint 368 — Aufgaben-Zerlegung", () => {
  it("erkennt vage Hauptziele und fordert Klärung an", () => {
    expect(isGoalVague("mach was")).toBe(true);

    const plan = decomposeGoal("mach was");
    expect(plan.isVagueGoal).toBe(true);
    expect(plan.clarificationNeeded).toContain("zu unkonkret");
  });

  it("zerlegt ein klares Ziel automatisch in prüfbare Standard-Teilschritte", () => {
    const goal = "Prompt-Versionierung in lib/prompt-versioning-ab-logic.ts implementieren";
    const plan = decomposeGoal(goal);

    expect(plan.isVagueGoal).toBe(false);
    expect(plan.subTasks.length).toBe(3);
    expect(plan.executionOrder[0]).toBe("step-1");
    expect(plan.executionOrder[2]).toBe("step-3");
  });

  it("akzeptiert explizite Teilschritte mit eigenen Akzeptanzkriterien", () => {
    const explicitSteps = [
      { title: "Schnittstelle definieren", description: "Typen in logic.ts", criteria: ["Types exported"] },
      { title: "Test schreiben", description: "Unit test in test.ts", dependencies: ["step-1"], criteria: ["vitest green"] },
    ];

    const plan = decomposeGoal("API Refactoring", explicitSteps);
    expect(plan.subTasks.length).toBe(2);
    expect(plan.subTasks[0].acceptanceCriteria[0]).toBe("Types exported");
  });

  it("ermittelt ausführbare Schritte sequenziell und aktualisiert den Fortschritt", () => {
    const plan = decomposeGoal("Feature-Rollout");

    // Schritt 1 ist der einzige ohne unerfüllte Abhängigkeiten
    const nextExecutable1 = getNextExecutableTasks(plan);
    expect(nextExecutable1.length).toBe(1);
    expect(nextExecutable1[0].id).toBe("step-1");

    // Schritt 1 abschließen
    const updatedPlan1 = updateSubTaskStatus(plan, "step-1", "succeeded", "Spezifikation erstellt.");

    // Schritt 2 ist nun bereit
    const nextExecutable2 = getNextExecutableTasks(updatedPlan1);
    expect(nextExecutable2.length).toBe(1);
    expect(nextExecutable2[0].id).toBe("step-2");

    // Fortschritt prüfen
    const progress = assessGoalProgress(updatedPlan1);
    expect(progress.completedCount).toBe(1);
    expect(progress.progressRatio).toBe(33.3);
    expect(progress.isFinished).toBe(false);
  });

  it("blockiert Folgeschritte bei Fehlern in einem vorausgesetzten Teilschritt", () => {
    const plan = decomposeGoal("Feature-Rollout");

    // Schritt 1 schlägt fehl
    const failedPlan = updateSubTaskStatus(plan, "step-1", "failed", "Syntaxfehler in Spezifikation.");

    expect(failedPlan.subTasks.find((t) => t.id === "step-2")?.status).toBe("blocked");
    expect(failedPlan.subTasks.find((t) => t.id === "step-3")?.status).toBe("blocked");

    const progress = assessGoalProgress(failedPlan);
    expect(progress.isFailed).toBe(true);
  });
});
