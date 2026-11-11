/**
 * Sprint 7 — Tests der Team-Orchestrierung.
 *
 * Zusagen: Aufgaben werden nur an geeignete Agenten gegeben (sonst offen),
 * Delegation erzeugt keinen Rechtezuwachs, und Budget/Schritte/Zeit werden
 * vor und waehrend eines Laufs hart geprueft.
 */
import { describe, expect, it } from "vitest";

import {
  allocateBudget,
  canDelegate,
  decomposeObjective,
  detectPhases,
  evaluateRunLimits,
  phaseLabel,
  scoreAgentForTask,
  summarizeTeamPlan,
  toolRisk,
  topologicalOrder,
  validateDelegationChain,
  validateTeamPlan,
  type AgentProfile,
  type TeamPlan,
  type TeamTask,
} from "../lib/mcp-team-orchestration-logic";

function agent(overrides: Partial<AgentProfile> & { agentKey: string }): AgentProfile {
  return {
    name: "Research Scout",
    role: "research",
    grants: [
      { serverKey: "websearch", toolName: "search_web", riskLevel: "low" },
      { serverKey: "websearch", toolName: "fetch_page", riskLevel: "low" },
    ],
    security: {
      mode: "assisted",
      maxRiskLevel: "low",
      budgetCentsPerRun: 250,
      maxStepsPerRun: 20,
      approvalFor: ["critical"],
      allowedServers: ["websearch"],
    },
    ...overrides,
  };
}

const RESEARCH = agent({ agentKey: "research-scout", name: "Research Scout", role: "research" });
const CONTENT = agent({
  agentKey: "content-writer",
  name: "Content Writer",
  role: "content",
  grants: [
    { serverKey: "docs", toolName: "write_document", riskLevel: "medium" },
    { serverKey: "media", toolName: "render_image", riskLevel: "low" },
  ],
  security: {
    mode: "assisted",
    maxRiskLevel: "medium",
    budgetCentsPerRun: 400,
    maxStepsPerRun: 24,
    approvalFor: ["critical"],
    allowedServers: ["docs", "media"],
  },
});
const OPS = agent({
  agentKey: "ops-agent",
  name: "Ops Agent",
  role: "operations",
  grants: [{ serverKey: "slack", toolName: "send_message", riskLevel: "medium" }],
  security: {
    mode: "assisted",
    maxRiskLevel: "medium",
    budgetCentsPerRun: 200,
    maxStepsPerRun: 18,
    approvalFor: ["high", "critical"],
    allowedServers: ["slack"],
  },
});

const OBJECTIVE = "Recherchiere den Markt, erstelle einen Bericht und pruefe die Qualitaet der Zahlen.";

describe("Phasen", () => {
  it("beginnt mit Scope und endet mit Pruefung und Bericht", () => {
    const phases = detectPhases(OBJECTIVE);
    expect(phases[0]).toBe("scope");
    expect(phases).toContain("research");
    expect(phases).toContain("produce");
    expect(phases).toContain("verify");
    expect(phases[phases.length - 1]).toBe("report");
  });

  it("ergaenzt Recherche und Pruefung auch ohne Stichwort", () => {
    const phases = detectPhases("Baue eine neue Landingpage");
    expect(phases).toContain("research");
    expect(phases).toContain("verify");
  });

  it("liefert lesbare Phasennamen", () => {
    expect(phaseLabel("verify")).toBe("Pruefen");
  });
});

describe("Zerlegung", () => {
  function decompose(overrides: Partial<Parameters<typeof decomposeObjective>[0]> = {}) {
    const result = decomposeObjective({
      objective: OBJECTIVE,
      agents: [RESEARCH, CONTENT, OPS],
      budgetCents: 1000,
      ...overrides,
    });
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(" "));
    return result.plan;
  }

  it("weist Phasen den passenden Agenten zu", () => {
    const plan = decompose();
    const research = plan.tasks.find((task) => task.id === "research");
    const produce = plan.tasks.find((task) => task.id === "produce");
    expect(research?.assignee).toBe("research-scout");
    expect(produce?.assignee).toBe("content-writer");
  });

  it("verkettet Aufgaben in Abhaengigkeitsreihenfolge", () => {
    const plan = decompose();
    expect(plan.tasks[0].dependsOn).toEqual([]);
    for (let index = 1; index < plan.tasks.length; index += 1) {
      expect(plan.tasks[index].dependsOn).toEqual([plan.tasks[index - 1].id]);
    }
    expect(plan.order[0]).toBe("scope");
  });

  it("laesst Aufgaben ohne passenden Agenten offen statt sie falsch zuzuweisen", () => {
    const plan = decompose({ agents: [RESEARCH] });
    expect(plan.unassigned.length).toBeGreaterThan(0);
    expect(plan.warnings.join(" ")).toContain("bleiben offen");
    for (const phase of plan.unassigned) {
      expect(plan.tasks.find((task) => task.id === phase)?.assignee).toBeNull();
    }
  });

  it("warnt, wenn die Schaetzung das Budget uebersteigt", () => {
    const plan = decompose({ budgetCents: 50 });
    expect(plan.warnings.join(" ")).toContain("ueber Budget");
  });

  it("warnt nicht, wenn das Budget reicht", () => {
    const plan = decompose({ budgetCents: 5000 });
    expect(plan.warnings.join(" ")).not.toContain("ueber Budget");
  });

  it("begrenzt die Aufgabenzahl", () => {
    const plan = decompose({ maxTasks: 3 });
    expect(plan.tasks).toHaveLength(3);
  });

  it("lehnt kurze Ziele, fehlende Agenten und fehlendes Budget ab", () => {
    expect(decomposeObjective({ objective: "kurz", agents: [RESEARCH], budgetCents: 100 }).ok).toBe(false);
    expect(decomposeObjective({ objective: OBJECTIVE, agents: [], budgetCents: 100 }).ok).toBe(false);
    expect(decomposeObjective({ objective: OBJECTIVE, agents: [RESEARCH], budgetCents: 0 }).ok).toBe(false);
  });

  it("markiert riskante Aufgaben als freigabepflichtig", () => {
    const riskyAgent = agent({ agentKey: "risky", name: "Risky Bot", role: "engineering" });
    const plan = decompose({ agents: [riskyAgent], budgetCents: 2000 });
    for (const task of plan.tasks) {
      if (["high", "critical"].includes(task.riskLevel)) expect(task.requiresApproval).toBe(true);
    }
  });
});

describe("Abhaengigkeiten", () => {
  const base: TeamTask = {
    id: "a",
    title: "A",
    goal: "A",
    assignee: null,
    dependsOn: [],
    matches: [],
    estimatedSteps: 1,
    estimatedCostCents: 1,
    riskLevel: "low",
    requiresApproval: false,
  };

  it("sortiert eine Kette korrekt", () => {
    const result = topologicalOrder([{ ...base, id: "b", dependsOn: ["a"] }, { ...base, id: "a" }]);
    expect(result).toEqual({ ok: true, order: ["a", "b"] });
  });

  it("erkennt unbekannte Abhaengigkeiten", () => {
    const result = topologicalOrder([{ ...base, id: "b", dependsOn: ["fehlt"] }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Unbekannte Abhaengigkeit");
  });

  it("erkennt Zyklen", () => {
    const result = topologicalOrder([
      { ...base, id: "a", dependsOn: ["b"] },
      { ...base, id: "b", dependsOn: ["a"] },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Zyklische");
  });

  it("erkennt doppelte IDs", () => {
    const result = topologicalOrder([{ ...base, id: "a" }, { ...base, id: "a" }]);
    expect(result.ok).toBe(false);
  });
});

describe("Delegation", () => {
  const task = { estimatedCostCents: 50, riskLevel: "low" as const };

  it("erlaubt Delegation ohne Rechtezuwachs", () => {
    const child = agent({ agentKey: "child", grants: [RESEARCH.grants[0]] });
    const result = canDelegate({ parent: RESEARCH, child, task, remainingBudgetCents: 200 });
    expect(result.allowed).toBe(true);
  });

  it("verbietet Selbstdelegation", () => {
    const result = canDelegate({ parent: RESEARCH, child: RESEARCH, task, remainingBudgetCents: 200 });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toContain("sich selbst");
  });

  it("verbietet Rechtezuwachs", () => {
    const child = agent({
      agentKey: "child",
      grants: [RESEARCH.grants[0], { serverKey: "docs", toolName: "write_document", riskLevel: "medium" }],
    });
    const result = canDelegate({ parent: RESEARCH, child, task, remainingBudgetCents: 1000 });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toContain("Rechtezuwachs");
  });

  it("verbietet Kinder mit hoeherer Risikostufe", () => {
    const child = agent({
      agentKey: "child",
      security: { ...RESEARCH.security, maxRiskLevel: "high" },
      grants: [RESEARCH.grants[0]],
    });
    const result = canDelegate({ parent: RESEARCH, child, task, remainingBudgetCents: 200 });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toContain("hoehere Risikostufe");
  });

  it("verbietet Aufgaben ueber der Risikostufe des Eltern-Agenten", () => {
    const result = canDelegate({ parent: RESEARCH, child: RESEARCH, task: { ...task, riskLevel: "critical" }, remainingBudgetCents: 200 });
    expect(result.allowed).toBe(false);
  });

  it("verbietet Delegation bei zu kleinem Restbudget", () => {
    const child = agent({ agentKey: "child", grants: [RESEARCH.grants[0]] });
    const result = canDelegate({ parent: RESEARCH, child, task, remainingBudgetCents: 10 });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toContain("Restbudget");
  });

  it("erkennt Delegationsschleifen", () => {
    const child = agent({ agentKey: "child", grants: [RESEARCH.grants[0]] });
    const result = canDelegate({ parent: RESEARCH, child, task, remainingBudgetCents: 200, visited: ["child"] });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toContain("Delegationsschleife");
  });

  it("prueft eine ganze Kette gegen Vererbung", () => {
    const child = agent({ agentKey: "child", grants: [RESEARCH.grants[0]] });
    const ok = validateDelegationChain({ root: RESEARCH, chain: [child], remainingBudgetCents: 200, task });
    expect(ok.allowed).toBe(true);
    const bad = validateDelegationChain({ root: RESEARCH, chain: [child, CONTENT], remainingBudgetCents: 400, task });
    expect(bad.allowed).toBe(false);
  });
});

describe("Budget und Laufzeitlimits", () => {
  it("verteilt das Budget proportional und exakt", () => {
    const result = allocateBudget({
      budgetCents: 100,
      tasks: [
        { id: "a", estimatedCostCents: 60 },
        { id: "b", estimatedCostCents: 40 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations.a + result.allocations.b).toBe(100);
    expect(result.reservedCents).toBe(100);
    expect(result.allocations.a).toBeGreaterThan(result.allocations.b);
  });

  it("lehnt Budget ohne Aufgaben ab", () => {
    expect(allocateBudget({ budgetCents: 100, tasks: [] }).ok).toBe(false);
    expect(allocateBudget({ budgetCents: 0, tasks: [{ id: "a", estimatedCostCents: 5 }] }).ok).toBe(false);
  });

  it("erlaubt einen Lauf innerhalb der Limits", () => {
    const limits = evaluateRunLimits({ budgetCents: 100, maxSteps: 10, maxDurationMs: 60_000, spentCents: 40, stepsUsed: 3, elapsedMs: 5_000 });
    expect(limits.ok).toBe(true);
    expect(limits.shouldAbort).toBe(false);
    expect(limits.remainingCents).toBe(60);
    expect(limits.remainingSteps).toBe(7);
  });

  it("bricht bei Budgetueberschreitung ab", () => {
    const limits = evaluateRunLimits({ budgetCents: 100, maxSteps: 10, maxDurationMs: 60_000, spentCents: 120, stepsUsed: 1, elapsedMs: 1000 });
    expect(limits.shouldAbort).toBe(true);
    expect(limits.reasons.join(" ")).toContain("Budget erschoepft");
  });

  it("bricht bei Schrittlimit und Laufzeit ab", () => {
    const limits = evaluateRunLimits({ budgetCents: 100, maxSteps: 5, maxDurationMs: 10_000, spentCents: 10, stepsUsed: 5, elapsedMs: 10_000 });
    expect(limits.reasons).toHaveLength(2);
    expect(limits.reasons.join(" ")).toContain("Schrittlimit");
    expect(limits.reasons.join(" ")).toContain("Laufzeitlimit");
  });
});

describe("Planpruefung", () => {
  function plan(): TeamPlan {
    const result = decomposeObjective({ objective: OBJECTIVE, agents: [RESEARCH, CONTENT, OPS], budgetCents: 1000 });
    if (!result.ok) throw new Error("Plan fehlgeschlagen");
    return result.plan;
  }

  it("akzeptiert einen sauberen Plan", () => {
    const result = validateTeamPlan(plan(), [RESEARCH, CONTENT, OPS]);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("erkennt unbekannte Agenten", () => {
    const broken = plan();
    broken.tasks[0].assignee = "gibtsnicht";
    const result = validateTeamPlan(broken, [RESEARCH, CONTENT, OPS]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("unbekannten Agenten");
  });

  it("erkennt falsche Kostensumme", () => {
    const broken = plan();
    broken.totalCostCents += 1;
    expect(validateTeamPlan(broken, [RESEARCH, CONTENT, OPS]).errors.join(" ")).toContain("Kostensumme");
  });

  it("erkennt eine abweichende Reihenfolge", () => {
    const broken = plan();
    broken.order = [...broken.order].reverse();
    expect(validateTeamPlan(broken, [RESEARCH, CONTENT, OPS]).errors.join(" ")).toContain("Reihenfolge");
  });

  it("verlangt Freigabe fuer riskante Aufgaben", () => {
    const broken = plan();
    broken.tasks[0].riskLevel = "critical";
    broken.tasks[0].requiresApproval = false;
    expect(validateTeamPlan(broken, [RESEARCH, CONTENT, OPS]).errors.join(" ")).toContain("freigabepflichtig");
  });
});

describe("Eignung und Zusammenfassung", () => {
  it("bewertet Agenten anhand von Rolle und Werkzeugen", () => {
    const good = scoreAgentForTask("recherche web search", RESEARCH);
    const bad = scoreAgentForTask("voellig fremde begriffe xyzzy", RESEARCH);
    expect(good.score).toBeGreaterThan(0);
    expect(bad.score).toBe(0);
  });

  it("fasst den Plan ehrlich zusammen", () => {
    const result = decomposeObjective({ objective: OBJECTIVE, agents: [RESEARCH], budgetCents: 500 });
    if (!result.ok) throw new Error("Plan fehlgeschlagen");
    const summary = summarizeTeamPlan(result.plan);
    expect(summary.tasks).toBe(result.plan.tasks.length);
    expect(summary.assigned + summary.open).toBe(summary.tasks);
    expect(summary.summary).toContain("Aufgaben");
  });

  it("klassifiziert Werkzeugrisiken ueber die bestehende Logik", () => {
    expect(toolRisk("stripe", "charge_invoice")).toBe("critical");
    expect(toolRisk("websearch", "search_web")).toBe("low");
  });
});
