/**
 * AI Influenza Team — Autopilot-Planung (Sprint 3).
 *
 * Der Tages-Autopilot darf nur Schritte ausfuehren, die der bestehende
 * Guard ohnehin erlaubt: `canAdvanceAiInfluenzaStep` mit `approved:false`
 * laesst interne Schritte in Assisted/Autopilot durch und blockiert alles
 * Externe oder Sensible. Diese Datei entscheidet nur, WELCHE Auftraege in
 * einem Lauf betrachtet werden und wie viele Schritte maximal passieren.
 */
import {
  canAdvanceAiInfluenzaStep,
  nextAiInfluenzaStep,
  type AiInfluenzaMode,
  type AiInfluenzaWorkflowStep,
} from "./ai-influenza-team-logic";

export type AiInfluenzaAutopilotCandidate = {
  jobId: number;
  orderId: string;
  step: AiInfluenzaWorkflowStep;
  mode: AiInfluenzaMode;
  monthlyBudgetCents: number;
  testOnly: boolean;
};

export type AiInfluenzaAutopilotPlan =
  | { decision: "advance"; jobId: number; orderId: string; from: AiInfluenzaWorkflowStep; to: AiInfluenzaWorkflowStep }
  | { decision: "wait"; jobId: number; orderId: string; from: AiInfluenzaWorkflowStep; to: AiInfluenzaWorkflowStep; reason: string }
  | { decision: "final"; jobId: number; orderId: string; from: AiInfluenzaWorkflowStep; reason: string };

export type AiInfluenzaAutopilotPlanResult = {
  plans: AiInfluenzaAutopilotPlan[];
  advanced: number;
  waiting: number;
  final: number;
};

/**
 * Plant einen Autopilot-Lauf. Deterministisch: Eingabereihenfolge bleibt,
 * hoechstens `maxAdvances` Auftraege werden weitergeschaltet.
 */
export function planAiInfluenzaAutopilot(args: {
  orders: readonly AiInfluenzaAutopilotCandidate[];
  maxAdvances?: number;
}): AiInfluenzaAutopilotPlanResult {
  const maxAdvances = Math.max(0, Math.floor(args.maxAdvances ?? 10));
  const plans: AiInfluenzaAutopilotPlan[] = [];
  let advanced = 0;
  let waiting = 0;
  let final = 0;

  for (const order of args.orders) {
    const next = nextAiInfluenzaStep(order.step);
    if (!next) {
      final += 1;
      plans.push({
        decision: "final", jobId: order.jobId, orderId: order.orderId, from: order.step,
        reason: "Auftrag steht im letzten Workflow-Schritt.",
      });
      continue;
    }
    if (advanced >= maxAdvances) {
      waiting += 1;
      plans.push({
        decision: "wait", jobId: order.jobId, orderId: order.orderId, from: order.step, to: next,
        reason: "Lauf-Limit erreicht, Schritt folgt im naechsten Zyklus.",
      });
      continue;
    }
    const verdict = canAdvanceAiInfluenzaStep({
      mode: order.mode,
      from: order.step,
      to: next,
      approved: false,
      budgetCents: order.monthlyBudgetCents,
      estimatedCostCents: 0,
    });
    if (!verdict.allowed) {
      waiting += 1;
      plans.push({
        decision: "wait", jobId: order.jobId, orderId: order.orderId, from: order.step, to: next,
        reason: verdict.reason,
      });
      continue;
    }
    advanced += 1;
    plans.push({ decision: "advance", jobId: order.jobId, orderId: order.orderId, from: order.step, to: next });
  }

  return { plans, advanced, waiting, final };
}
