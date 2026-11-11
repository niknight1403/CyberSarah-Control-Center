/**
 * Sprint 7 — Team-Orchestrierung: Aufgabenzerlegung, Delegation, Limits.
 *
 * Reine Logik ohne IO, Netzwerk oder Uhr. Der Kern ist eine einzige Frage:
 * darf ein Agent eine Teilaufgabe an einen anderen Agenten abgeben, ohne dass
 * dabei Rechte, Budget oder Zeit aus dem Ruder laufen?
 *
 * Grundsaetze:
 *  - Ein Kind darf nie mehr duerfen als sein Eltern-Agent (keine Eskalation).
 *  - Jede Aufgabe hat genau einen Verantwortlichen oder ist ehrlich "offen".
 *  - Budget und Schritte werden VOR dem Lauf verteilt und geprueft.
 */
import {
  classifyRisk,
  tokenize,
  type CapabilityTag,
  type GovernanceMode,
  type RiskLevel,
} from "./mcp-governance-logic";
import { maxRisk, riskRank, type AgentSecurityProfile } from "./mcp-agent-factory-logic";

export type AgentGrant = { serverKey: string; toolName: string; riskLevel: RiskLevel };

export type AgentProfile = {
  agentKey: string;
  name: string;
  role: string;
  grants: AgentGrant[];
  security: AgentSecurityProfile;
};

export type TeamTask = {
  id: string;
  title: string;
  goal: string;
  /** agentKey oder null, wenn kein passender Agent existiert. */
  assignee: string | null;
  dependsOn: string[];
  /** Stichwoerter, an denen die Eignung gemessen wurde. */
  matches: string[];
  estimatedSteps: number;
  estimatedCostCents: number;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
};

export type TeamPlan = {
  objective: string;
  tasks: TeamTask[];
  order: string[];
  totalSteps: number;
  totalCostCents: number;
  budgetCents: number;
  warnings: string[];
  unassigned: string[];
};

export type Phase =
  | "scope"
  | "research"
  | "produce"
  | "verify"
  | "publish"
  | "report";

const PHASE_LABELS: Record<Phase, string> = {
  scope: "Aufgabe schaerfen",
  research: "Recherchieren",
  produce: "Erstellen",
  verify: "Pruefen",
  publish: "Veroeffentlichen",
  report: "Berichten",
};

const PHASE_KEYWORDS: { phase: Phase; words: readonly string[] }[] = [
  { phase: "scope", words: ["ziel", "umfang", "scope", "anforderung", "briefing", "abgrenz"] },
  { phase: "research", words: ["recherche", "research", "analys", "markt", "wettbewerb", "recherchier", "untersuch"] },
  { phase: "produce", words: ["erstelle", "erzeugen", "schreib", "bauen", "entwickel", "produzier", "generier", "entwerf"] },
  { phase: "verify", words: ["pruef", "prüf", "test", "validier", "qualitaet", "qualität", "kontrolle", "review"] },
  { phase: "publish", words: ["veroeffentlich", "veröffentlich", "publish", "deploy", "versend", "send", "poste", "upload"] },
  { phase: "report", words: ["bericht", "report", "zusammenfass", "summary", "dokumentier", "protokoll"] },
];

/** Basis-Schritte je Phase; bewusst klein gehalten und nachvollziehbar. */
const PHASE_STEPS: Record<Phase, number> = {
  scope: 2,
  research: 6,
  produce: 8,
  verify: 4,
  publish: 3,
  report: 2,
};

const PHASE_COST: Record<Phase, number> = {
  scope: 10,
  research: 60,
  produce: 90,
  verify: 40,
  publish: 30,
  report: 15,
};

const PHASE_CAPABILITIES: Record<Phase, CapabilityTag[]> = {
  scope: [],
  research: ["search", "web"],
  produce: ["filesystem", "media", "database"],
  verify: ["analytics", "filesystem"],
  publish: ["communication", "devops"],
  report: ["communication", "analytics"],
};

export function phaseLabel(phase: Phase): string {
  return PHASE_LABELS[phase];
}

/** Erkennt die Phasen einer Aufgabe in fester Reihenfolge (deterministisch). */
export function detectPhases(objective: string): Phase[] {
  const words = new Set(tokenize(objective));
  const stemHit = (needles: readonly string[]) =>
    needles.some((needle) => [...words].some((word) => word.startsWith(needle.slice(0, 5)) || word.includes(needle)));

  const phases: Phase[] = ["scope"];
  for (const entry of PHASE_KEYWORDS) {
    if (entry.phase === "scope") continue;
    if (stemHit(entry.words)) phases.push(entry.phase);
  }
  if (!phases.includes("research")) phases.push("research");
  if (!phases.includes("verify")) phases.push("verify");
  if (!phases.includes("report")) phases.push("report");
  return phases;
}

function agentTokens(agent: AgentProfile): Set<string> {
  const toolText = agent.grants.map((grant) => `${grant.serverKey} ${grant.toolName}`).join(" ");
  return new Set(tokenize(`${agent.name} ${agent.role} ${toolText}`));
}

/** Eignung eines Agenten fuer eine Aufgabe (0 = nicht geeignet). */
export function scoreAgentForTask(taskText: string, agent: AgentProfile): { score: number; matches: string[] } {
  const taskTokens = [...new Set(tokenize(taskText))];
  const tokens = agentTokens(agent);
  const matches: string[] = [];
  let score = 0;
  for (const token of taskTokens) {
    if (tokens.has(token)) {
      score += 2;
      matches.push(token);
      continue;
    }
    if (token.length >= 4 && [...tokens].some((candidate) => candidate.startsWith(token.slice(0, 4)))) {
      score += 1;
      matches.push(`~${token}`);
    }
  }
  return { score, matches };
}

export type DecompositionIssue = { code: string; message: string };

/**
 * Zerlegt ein Ziel in Aufgaben und ordnet sie Agenten zu.
 *
 * Regeln: ohne passenden Agenten bleibt die Aufgabe unbesetzt (keine
 * Notzuweisung), jede Phase haengt an der vorherigen, und die Aufgabe ist
 * nur dann delegierbar, wenn ein Agent mindestens ein passendes Werkzeug hat.
 */
export function decomposeObjective(input: {
  objective: string;
  agents: AgentProfile[];
  budgetCents: number;
  maxTasks?: number;
}): { ok: true; plan: TeamPlan } | { ok: false; issues: DecompositionIssue[] } {
  const objective = input.objective.trim();
  const issues: DecompositionIssue[] = [];
  if (objective.length < 12) issues.push({ code: "objective_too_short", message: "Ziel ist zu kurz (mindestens 12 Zeichen)." });
  if (input.agents.length === 0) issues.push({ code: "no_agents", message: "Kein aktiver Agent vorhanden — Team nicht bildbar." });
  if (input.budgetCents <= 0) issues.push({ code: "no_budget", message: "Budget muss groesser als 0 Cent sein." });
  if (issues.length > 0) return { ok: false, issues };

  const phases = detectPhases(objective).slice(0, Math.max(1, Math.min(input.maxTasks ?? 8, 12)));
  const warnings: string[] = [];
  const tasks: TeamTask[] = [];
  const unassigned: string[] = [];

  phases.forEach((phase, index) => {
    const phaseText = `${objective} ${PHASE_LABELS[phase]} ${PHASE_CAPABILITIES[phase].join(" ")}`;
    const ranked = input.agents
      .map((agent) => ({ agent, ...scoreAgentForTask(phaseText, agent) }))
      .sort((a, b) => b.score - a.score || a.agent.agentKey.localeCompare(b.agent.agentKey));

    const best = ranked[0];
    const assignee = best && best.score > 0 ? best.agent.agentKey : null;
    if (assignee === null) unassigned.push(phase);

    const risk: RiskLevel = best && best.score > 0
      ? best.agent.grants.reduce<RiskLevel>((level, grant) => maxRisk(level, grant.riskLevel), "low")
      : "low";

    tasks.push({
      id: phase,
      title: `${index + 1}. ${PHASE_LABELS[phase]}`,
      goal: `${PHASE_LABELS[phase]}: ${objective}`.slice(0, 400),
      assignee,
      dependsOn: index === 0 ? [] : [phases[index - 1]],
      matches: best?.matches.slice(0, 6) ?? [],
      estimatedSteps: PHASE_STEPS[phase],
      estimatedCostCents: PHASE_COST[phase],
      riskLevel: risk,
      requiresApproval: riskRank(risk) >= riskRank("high"),
    });
  });

  const totalCostCents = tasks.reduce((sum, task) => sum + task.estimatedCostCents, 0);
  const totalSteps = tasks.reduce((sum, task) => sum + task.estimatedSteps, 0);

  if (unassigned.length > 0) {
    warnings.push(
      `Ohne Agenten: ${unassigned.map((phase) => phaseLabel(phase as Phase)).join(", ")}. Diese Aufgaben bleiben offen, statt einem ungeeigneten Agenten zugewiesen zu werden.`,
    );
  }
  if (totalCostCents > input.budgetCents) {
    warnings.push(
      `Schaetzung ${totalCostCents} Cent ueber Budget ${input.budgetCents} Cent: Lauf wuerde nach ${Math.floor(
        (input.budgetCents / totalCostCents) * 100,
      )} % abgebrochen.`,
    );
  }

  const ordered = topologicalOrder(tasks);
  if (!ordered.ok) return { ok: false, issues: [{ code: "cycle", message: ordered.reason }] };

  return {
    ok: true,
    plan: {
      objective,
      tasks,
      order: ordered.order,
      totalSteps,
      totalCostCents,
      budgetCents: input.budgetCents,
      warnings,
      unassigned,
    },
  };
}

export function topologicalOrder(tasks: TeamTask[]): { ok: true; order: string[] } | { ok: false; reason: string } {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (byId.size !== tasks.length) return { ok: false, reason: "Doppelte Aufgaben-IDs." };

  const state = new Map<string, "new" | "visiting" | "done">();
  const order: string[] = [];

  const visit = (id: string, path: string[]): string | null => {
    const status = state.get(id) ?? "new";
    if (status === "done") return null;
    if (status === "visiting") return [...path, id].join(" -> ");
    const task = byId.get(id);
    if (!task) return null;
    state.set(id, "visiting");
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency)) return `Unbekannte Abhaengigkeit "${dependency}" bei "${id}".`;
      const cycle = visit(dependency, [...path, id]);
      if (cycle) return cycle;
    }
    state.set(id, "done");
    order.push(id);
    return null;
  };

  for (const task of tasks) {
    const cycle = visit(task.id, []);
    if (cycle) return { ok: false, reason: `Zyklische Abhaengigkeit: ${cycle}.` };
  }
  return { ok: true, order };
}

export type DelegationResult = { allowed: true; reason: string } | { allowed: false; reason: string };

/**
 * Darf `parent` diese Aufgabe an `child` abgeben?
 *
 * Harte Regeln: kein Rechtezuwachs (jedes Kind-Werkzeug muss der Eltern-Agent
 * ebenfalls besitzen), Risiko nicht hoeher als beim Eltern-Agenten, Kind nicht
 * im eigenen Auftrag, und das Restbudget muss reichen.
 */
export function canDelegate(input: {
  parent: AgentProfile;
  child: AgentProfile;
  task: Pick<TeamTask, "estimatedCostCents" | "riskLevel">;
  remainingBudgetCents: number;
  visited?: string[];
}): DelegationResult {
  if (input.parent.agentKey === input.child.agentKey) {
    return { allowed: false, reason: "Ein Agent kann nicht an sich selbst delegieren." };
  }
  const visited = input.visited ?? [];
  if (visited.includes(input.child.agentKey)) {
    return { allowed: false, reason: `Delegationsschleife: ${[...visited, input.child.agentKey].join(" -> ")}.` };
  }
  if (riskRank(input.child.security.maxRiskLevel) > riskRank(input.parent.security.maxRiskLevel)) {
    return { allowed: false, reason: "Kind-Agent hat eine hoehere Risikostufe als der Eltern-Agent." };
  }
  if (riskRank(input.task.riskLevel) > riskRank(input.parent.security.maxRiskLevel)) {
    return { allowed: false, reason: "Aufgabe uebersteigt die Risikostufe des Eltern-Agenten." };
  }
  const parentTools = new Set(input.parent.grants.map((grant) => `${grant.serverKey}/${grant.toolName}`));
  const escalated = input.child.grants
    .map((grant) => `${grant.serverKey}/${grant.toolName}`)
    .filter((key) => !parentTools.has(key));
  if (escalated.length > 0) {
    return {
      allowed: false,
      reason: `Rechtezuwachs nicht erlaubt: ${escalated.slice(0, 3).join(", ")}${escalated.length > 3 ? " ..." : ""}.`,
    };
  }
  if (input.task.estimatedCostCents > input.remainingBudgetCents) {
    return { allowed: false, reason: "Restbudget reicht fuer diese Aufgabe nicht." };
  }
  return { allowed: true, reason: `Delegation ok: ${input.child.agentKey} erbt keine zusaetzlichen Rechte.` };
}

/** Verteilt ein Gesamtbudget proportional zur Schaetzung, ohne Überschreitung. */
export function allocateBudget(input: {
  budgetCents: number;
  tasks: Pick<TeamTask, "id" | "estimatedCostCents">[];
}): { ok: true; allocations: Record<string, number>; reservedCents: number } | { ok: false; reason: string } {
  if (input.budgetCents <= 0) return { ok: false, reason: "Budget muss groesser als 0 Cent sein." };
  const total = input.tasks.reduce((sum, task) => sum + Math.max(0, task.estimatedCostCents), 0);
  if (total === 0) return { ok: false, reason: "Keine Aufgaben mit Kostenschaetzung." };

  const allocations: Record<string, number> = {};
  let reserved = 0;
  for (const task of input.tasks) {
    const share = Math.floor((Math.max(0, task.estimatedCostCents) / total) * input.budgetCents);
    allocations[task.id] = share;
    reserved += share;
  }
  // Rundungsrest dem ersten Task geben, damit die Summe exakt stimmt.
  const rest = input.budgetCents - reserved;
  if (rest > 0 && input.tasks.length > 0) {
    allocations[input.tasks[0].id] += rest;
    reserved += rest;
  }
  return { ok: true, allocations, reservedCents: reserved };
}

export type RunLimitsInput = {
  budgetCents: number;
  maxSteps: number;
  maxDurationMs: number;
  spentCents: number;
  stepsUsed: number;
  elapsedMs: number;
};

export type RunLimits = {
  ok: boolean;
  shouldAbort: boolean;
  reasons: string[];
  remainingCents: number;
  remainingSteps: number;
  remainingMs: number;
};

/**
 * Prueft Budget, Schritte und Dauer eines Laufs. Ein Limit, das erreicht ist,
 * fuehrt zum Abbruch — nicht zu "weiter mit Warnung".
 */
export function evaluateRunLimits(input: RunLimitsInput): RunLimits {
  const reasons: string[] = [];
  if (!Number.isFinite(input.spentCents) || input.spentCents > input.budgetCents) {
    reasons.push(`Budget erschoepft: ${Math.max(0, input.spentCents)} von ${input.budgetCents} Cent verbraucht.`);
  }
  if (!Number.isFinite(input.stepsUsed) || input.stepsUsed >= input.maxSteps) {
    reasons.push(`Schrittlimit erreicht: ${input.stepsUsed} von ${input.maxSteps}.`);
  }
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs >= input.maxDurationMs) {
    reasons.push(`Laufzeitlimit erreicht: ${Math.round(input.elapsedMs / 1000)} s von ${Math.round(input.maxDurationMs / 1000)} s.`);
  }
  return {
    ok: reasons.length === 0,
    shouldAbort: reasons.length > 0,
    reasons,
    remainingCents: Math.max(0, input.budgetCents - Math.max(0, input.spentCents)),
    remainingSteps: Math.max(0, input.maxSteps - Math.max(0, input.stepsUsed)),
    remainingMs: Math.max(0, input.maxDurationMs - Math.max(0, input.elapsedMs)),
  };
}

/** Prueft einen fertigen Plan gegen Agenten und Regeln (vor Speicherung). */
export function validateTeamPlan(plan: TeamPlan, agents: AgentProfile[]): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [...plan.warnings];
  const agentKeys = new Set(agents.map((agent) => agent.agentKey));

  if (plan.tasks.length === 0) errors.push("Plan ohne Aufgaben.");
  for (const task of plan.tasks) {
    if (task.assignee && !agentKeys.has(task.assignee)) errors.push(`Aufgabe "${task.id}" verweist auf unbekannten Agenten "${task.assignee}".`);
    if (task.assignee === null && !plan.unassigned.includes(task.id as Phase)) {
      warnings.push(`Aufgabe "${task.id}" ist ohne Agenten und nicht als offen markiert.`);
    }
    if (task.estimatedCostCents < 0 || task.estimatedSteps < 0) errors.push(`Aufgabe "${task.id}" hat negative Schaetzung.`);
    if (riskRank(task.riskLevel) >= riskRank("high") && !task.requiresApproval) {
      errors.push(`Aufgabe "${task.id}" ist riskant, aber nicht freigabepflichtig.`);
    }
  }

  const ordered = topologicalOrder(plan.tasks);
  if (!ordered.ok) errors.push(ordered.reason);
  if (ordered.ok && ordered.order.join(",") !== plan.order.join(",")) {
    errors.push("Gespeicherte Reihenfolge weicht von der Abhaengigkeitsreihenfolge ab.");
  }
  const cost = plan.tasks.reduce((sum, task) => sum + task.estimatedCostCents, 0);
  if (cost !== plan.totalCostCents) errors.push("Kostensumme passt nicht zu den Aufgaben.");
  if (plan.totalCostCents > plan.budgetCents * 2) {
    warnings.push("Schaetzung liegt ueber dem Doppelten des Budgets — Ziel kleiner schneiden oder Budget erhoehen.");
  }
  return { ok: errors.length === 0, errors, warnings: [...new Set(warnings)] };
}

/** Kurzfassung fuer UI/Logs. */
export function summarizeTeamPlan(plan: TeamPlan): {
  tasks: number;
  assigned: number;
  open: number;
  steps: number;
  costCents: number;
  budgetCents: number;
  summary: string;
} {
  const assigned = plan.tasks.filter((task) => task.assignee !== null).length;
  return {
    tasks: plan.tasks.length,
    assigned,
    open: plan.tasks.length - assigned,
    steps: plan.totalSteps,
    costCents: plan.totalCostCents,
    budgetCents: plan.budgetCents,
    summary: `${plan.tasks.length} Aufgaben, ${assigned} zugewiesen, ${
      plan.tasks.length - assigned
    } offen, ${plan.totalSteps} Schritte, ${plan.totalCostCents} von ${plan.budgetCents} Cent geschaetzt.`,
  };
}

/** Delegationskette pruefen (Eltern -> Kinder), inkl. Rechtevererbung. */
export function validateDelegationChain(input: {
  root: AgentProfile;
  chain: AgentProfile[];
  remainingBudgetCents: number;
  task: Pick<TeamTask, "estimatedCostCents" | "riskLevel">;
}): DelegationResult {
  if (input.chain.length === 0) return { allowed: true, reason: "Keine Delegation noetig." };
  let parent = input.root;
  const visited = [parent.agentKey];
  for (const child of input.chain) {
    const step = canDelegate({
      parent,
      child,
      task: input.task,
      remainingBudgetCents: input.remainingBudgetCents,
      visited,
    });
    if (!step.allowed) return step;
    visited.push(child.agentKey);
    parent = child;
  }
  return { allowed: true, reason: `Delegationskette ok: ${visited.join(" -> ")}.` };
}

/** Risikostufe eines Werkzeugs, ohne einen zweiten Klassifizierer zu bauen. */
export function toolRisk(serverKey: string, toolName: string, description = ""): RiskLevel {
  return classifyRisk({ name: `${serverKey} ${toolName}`, description }).level;
}

export type TeamMode = GovernanceMode;
