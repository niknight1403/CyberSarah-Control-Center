/**
 * AI Influenza Team im Tages-Autopilot (Sprint 3).
 *
 * Haengt die Umsatzsparte an `/api/cron/control-center-autopilot`. Bewusst
 * konservativ: es werden nur Schritte ausgefuehrt, die der Guard ohne Freigabe
 * erlaubt. Externe Aktionen und "paid" bleiben liegen und werden als wartend
 * gemeldet — kein Autopilot umgeht eine Freigabe.
 */
import { planAiInfluenzaAutopilot, type AiInfluenzaAutopilotCandidate } from "../lib/ai-influenza-autopilot-logic";
import type { AiInfluenzaMode, AiInfluenzaWorkflowStep } from "../lib/ai-influenza-team-logic";
import { advanceAiInfluenzaOrder, listAiInfluenzaOrders } from "./ai-influenza-team-service";

export type AiInfluenzaAutopilotResult = {
  considered: number;
  advanced: number;
  waiting: number;
  failed: number;
  details: { orderId: string; from: string; to?: string; decision: string; reason?: string }[];
  error: string | null;
};

type Deps = {
  listOrders?: typeof listAiInfluenzaOrders;
  advanceOrder?: typeof advanceAiInfluenzaOrder;
  maxAdvances?: number;
};

export async function runAiInfluenzaAutopilotStep(deps: Deps = {}): Promise<AiInfluenzaAutopilotResult> {
  const listOrders = deps.listOrders ?? listAiInfluenzaOrders;
  const advanceOrder = deps.advanceOrder ?? advanceAiInfluenzaOrder;

  const rows = await listOrders(200);
  const candidates: AiInfluenzaAutopilotCandidate[] = rows
    .filter((row) => row.status !== "completed")
    .map((row) => {
      const order = row.order;
      return {
        jobId: row.id,
        orderId: order.orderId,
        step: order.step as AiInfluenzaWorkflowStep,
        mode: order.mode as AiInfluenzaMode,
        monthlyBudgetCents: order.monthlyBudgetCents,
        testOnly: Boolean(order.testOnly),
      };
    });

  const plan = planAiInfluenzaAutopilot({ orders: candidates, maxAdvances: deps.maxAdvances });
  let advanced = 0;
  let failed = 0;
  let error: string | null = null;
  const details: AiInfluenzaAutopilotResult["details"] = [];

  for (const item of plan.plans) {
    if (item.decision !== "advance") {
      details.push({
        orderId: item.orderId,
        from: item.from,
        to: "to" in item ? item.to : undefined,
        decision: item.decision,
        reason: "reason" in item ? item.reason : undefined,
      });
      continue;
    }
    try {
      await advanceOrder({ jobId: item.jobId, approved: false });
      advanced += 1;
      details.push({ orderId: item.orderId, from: item.from, to: item.to, decision: "advanced" });
    } catch (cause) {
      failed += 1;
      const message = cause instanceof Error ? cause.message : "Schritt konnte nicht ausgefuehrt werden.";
      error = error ?? message;
      details.push({ orderId: item.orderId, from: item.from, to: item.to, decision: "failed", reason: message });
    }
  }

  return {
    considered: candidates.length,
    advanced,
    waiting: plan.waiting,
    failed,
    details,
    error,
  };
}
