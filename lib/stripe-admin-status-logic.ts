/** Stripe-Admin-Konfigurationsprüfung; never output key material. */
export type StripeAdminMode = "live" | "test";
export type StripeAdminPhase =
  | "missing_key" | "invalid_mode" | "key_mode_mismatch" | "configured";
export type StripeAdminSettings = {
  phase: StripeAdminPhase;
  mode: StripeAdminMode | null;
  keyPresent: boolean;
  webhookReady: boolean;
  message: string;
};
export function stripeAdminSettings(env: Record<string, string | undefined>): StripeAdminSettings {
  const mode = (env.STRIPE_MODE ?? "live").trim().toLowerCase();
  const resultMode: StripeAdminMode | null = mode === "live" ? "live" : mode === "test" ? "test" : null;
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhook = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const webhookReady = webhook.startsWith("whsec_") && webhook.length > 12;
  const general = { mode: resultMode, keyPresent: Boolean(key), webhookReady };
  if (!resultMode) return { ...general, phase: "invalid_mode", message: "STRIPE_MODE muss test oder live sein." };
  if (!key) return { ...general, phase: "missing_key", message: "Kein serverseitiger Stripe-Schluessel hinterlegt." };
  const valid = resultMode === "live"
    ? key.startsWith("sk_live_") || key.startsWith("rk_live_")
    : key.startsWith("sk_test_") || key.startsWith("rk_test_");
  if (!valid) return { ...general, phase: "key_mode_mismatch", message: "Stripe-Schluessel und Betriebsmodus passen nicht zusammen." };
  return { ...general, phase: "configured", message: webhookReady
    ? "Stripe-Serverkonfiguration vorhanden; Live-Verbindung muss separat verifiziert werden."
    : "Stripe-Schluessel vorhanden. Das Webhook-Signatur-Secret muss noch geprueft werden." };
}
