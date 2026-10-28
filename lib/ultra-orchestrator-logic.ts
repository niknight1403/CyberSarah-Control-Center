/**
 * Ultra-Orchestrator decision policy.
 *
 * Adopted from the useful part of the Agentforge2/AGI-Agenten control loop:
 * observe -> decide -> heal/retry -> verify. This module is deliberately pure;
 * it does not grant permissions or execute external side effects.
 */
export type UltraAutopilotAction = "HEAL" | "RETRY" | "VERIFY" | "OBSERVE";

export type UltraAutopilotDecision = {
  action: UltraAutopilotAction;
  reason: string;
  priority: "critical" | "high" | "normal" | "idle";
};

export type UltraAutopilotSignals = {
  blocked: readonly string[];
  deferred: readonly string[];
  realActions: readonly string[];
};

export function deriveUltraAutopilotDecision(
  signals: UltraAutopilotSignals,
): UltraAutopilotDecision {
  if (signals.blocked.length > 0) {
    return {
      action: "HEAL",
      priority: "critical",
      reason: `${signals.blocked.length} echte Blockade(n) muessen vor dem naechsten Zyklus behoben werden.`,
    };
  }
  if (signals.deferred.length > 0) {
    return {
      action: "RETRY",
      priority: "high",
      reason: `${signals.deferred.length} temporaer verschobene Aufgabe(n) sollen nach Cooldown erneut bewertet werden.`,
    };
  }
  if (signals.realActions.length > 0) {
    return {
      action: "VERIFY",
      priority: "normal",
      reason: `${signals.realActions.length} reale Aktion(en) wurden ausgefuehrt und muessen im Folgelauf gegen Live-Signale verifiziert werden.`,
    };
  }
  return {
    action: "OBSERVE",
    priority: "idle",
    reason: "Keine Blockade und keine neue Aktion; Live-Signale weiter beobachten.",
  };
}
