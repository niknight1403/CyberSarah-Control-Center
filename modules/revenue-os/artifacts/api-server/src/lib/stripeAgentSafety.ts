/**
 * Safe by default: autonomous revenue agents may simulate in Stripe TEST mode
 * only after a dedicated operator opt-in. Never mutate LIVE catalogue.
 * Human-admin product creation through a separate reviewed workflow is unaffected.
 */
export function agentStripeWritePolicy(env: Record<string, string | undefined>) {
  const testMode = (env.STRIPE_MODE ?? "live").trim().toLowerCase() === "test";
  const approved = (env.STRIPE_AUTONOMOUS_WRITES_APPROVED ?? "off").trim().toLowerCase() === "on";
  return {
    allowed: testMode && approved,
    mode: testMode ? "test" as const : "not-test" as const,
    reason: !testMode
      ? "Autonome Stripe-Produkt-/Preisänderungen im Live-Modus sind gesperrt."
      : approved ? "Testmodus und ausdrückliche Freigabe vorhanden."
        : "Testmodus ohne ausdrückliche Agenten-Write-Freigabe: keine Produkte angelegt.",
  };
}
