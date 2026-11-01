/** Read-only administrator Stripe health; credentials never leave the server. */
import Stripe from "stripe";
import { stripeAdminSettings } from "../lib/stripe-admin-status-logic";
export type AdminStripeHealth = {
  status: "not_configured" | "mode_mismatch" | "connected" | "read_forbidden" | "unreachable";
  mode: "live" | "test" | null;
  keyConfigured: boolean;
  webhookSecretConfigured: boolean;
  catalogReadable: boolean;
  connectionStorage: "server-environment";
  checkedAt: string | null;
  message: string;
};
let cache: { key: string; at: number; value: AdminStripeHealth } | null = null;
export async function getAdministratorStripeHealth(): Promise<AdminStripeHealth> {
  const config = stripeAdminSettings(process.env);
  const info = {
    mode: config.mode, keyConfigured: config.keyPresent,
    webhookSecretConfigured: config.webhookReady, catalogReadable: false,
    connectionStorage: "server-environment" as const, checkedAt: null,
  };
  if (config.phase !== "configured") {
    return { ...info, status: config.phase === "missing_key" ? "not_configured" : "mode_mismatch", message: config.message };
  }
  const key = process.env.STRIPE_SECRET_KEY!.trim();
  if (cache?.key === key && Date.now() - cache.at < 120_000) return cache.value;
  let value: AdminStripeHealth;
  try {
    const stripe = new Stripe(key, { timeout: 8_000, maxNetworkRetries: 1 });
    await Promise.all([stripe.products.list({ limit: 1 }), stripe.prices.list({ limit: 1 })]);
    value = { ...info, status: "connected", catalogReadable: true, checkedAt: new Date().toISOString(),
      message: "Stripe-Katalogzugriff bestaetigt. Webhook-Zustellung und Checkout separat testen." };
  } catch (error) {
    const denied = error instanceof Stripe.errors.StripePermissionError ||
      error instanceof Stripe.errors.StripeAuthenticationError;
    value = { ...info, status: denied ? "read_forbidden" : "unreachable",
      checkedAt: new Date().toISOString(),
      message: denied ? "Stripe-Zugriff abgelehnt. Berechtigung oder hinterlegten Key pruefen."
        : "Stripe ist derzeit nicht erreichbar; gespeicherte Konfiguration bleibt erhalten." };
  }
  cache = { key, at: Date.now(), value };
  return value;
}
