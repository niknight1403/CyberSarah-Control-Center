/**
 * Persistent server-side Stripe administrator integration.
 * Connect once via Render environment variables; verify read permissions
 * without charging, updating products or exposing API credentials.
 */
import Stripe from "stripe";
import { stripeAdminSettings } from "../lib/stripe-admin-status-logic";
import { importStripeProductDrafts } from "./commerce-studio-autopilot";

export type StripeAdminState = {
  status: "not_configured" | "mode_mismatch" | "connected" | "read_forbidden" | "unreachable";
  mode: "live" | "test" | null;
  keyConfigured: boolean;
  webhookConfigured: boolean;
  catalogReadReady: boolean;
  autoSyncEnabled: boolean;
  connectionPersisted: true;
  verifiedAt: string | null;
  message: string;
  lastSyncAt: string | null;
  lastSyncResult: "success" | "error" | null;
  lastSyncSummary: string | null;
};
let cache: { key: string; savedAt: number; state: StripeAdminState } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let syncBusy = false;
let lastSyncAt: string | null = null;
let lastSyncResult: "success" | "error" | null = null;
let lastSyncSummary: string | null = null;

function autoSyncEnabled() {
  return (process.env.STRIPE_CATALOG_AUTO_SYNC ?? "off").toLowerCase() === "on";
}
function decorate(state: StripeAdminState): StripeAdminState {
  return { ...state, autoSyncEnabled: autoSyncEnabled(), lastSyncAt, lastSyncResult, lastSyncSummary };
}
export async function getStripeAdministratorStatus(force = false): Promise<StripeAdminState> {
  const configuration = stripeAdminSettings(process.env);
  const basic = {
    mode: configuration.mode,
    keyConfigured: configuration.keyPresent,
    webhookConfigured: configuration.webhookReady,
    catalogReadReady: false,
    autoSyncEnabled: autoSyncEnabled(),
    connectionPersisted: true as const,
    verifiedAt: null,
    lastSyncAt, lastSyncResult, lastSyncSummary,
  };
  if (configuration.phase !== "configured") {
    return { ...basic, status: configuration.phase === "missing_key" ? "not_configured" : "mode_mismatch", message: configuration.message };
  }
  const key = process.env.STRIPE_SECRET_KEY!.trim();
  // Secret stays in process memory only; cache never leaves this module.
  if (!force && cache?.key === key && Date.now() - cache.savedAt < 5 * 60_000) {
    return decorate(cache.state);
  }
  try {
    const client = new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 });
    // Restricted Stripe keys need read_products and read_prices only.
    await Promise.all([client.products.list({ limit: 1 }), client.prices.list({ limit: 1 })]);
    const state: StripeAdminState = {
      ...basic, status: "connected", catalogReadReady: true,
      verifiedAt: new Date().toISOString(),
      message: configuration.webhookReady
        ? "Stripe verbunden. Katalogzugriff verifiziert; Webhook-Secret vorhanden, Webhook-Zustellung separat pruefen."
        : "Stripe verbunden. Katalogzugriff verifiziert. Webhook-Secret fehlt; Abrechnungs-Webhook nicht bereit.",
    };
    cache = { key, savedAt: Date.now(), state };
    return decorate(state);
  } catch (error) {
    const code = error instanceof Stripe.errors.StripePermissionError ? "read_forbidden" :
      error instanceof Stripe.errors.StripeAuthenticationError ? "read_forbidden" : "unreachable";
    const state: StripeAdminState = {
      ...basic, status: code, verifiedAt: new Date().toISOString(),
      message: code === "read_forbidden"
        ? "Stripe-Schluessel nicht akzeptiert oder Lesezugriff auf Produkte/Preise fehlt."
        : "Stripe ist aktuell nicht erreichbar. Schluessel bleibt gespeichert; keine erneute Eingabe erforderlich.",
    };
    cache = { key, savedAt: Date.now(), state };
    return decorate(state);
  }
}
export async function syncStripeCatalogOnce() {
  if (syncBusy) return { ran: false, reason: "sync-in-progress" };
  syncBusy = true;
  try {
    const status = await getStripeAdministratorStatus();
    if (!status.catalogReadReady) {
      lastSyncResult = "error";
      lastSyncSummary = "Kein verifizierter Stripe-Katalogzugriff.";
      return { ran: false, reason: "stripe-unavailable" };
    }
    const result = await importStripeProductDrafts();
    lastSyncAt = new Date().toISOString();
    lastSyncResult = result.status === "draft-only" ? "success" : "error";
    lastSyncSummary = result.status === "draft-only"
      ? "Katalog abgeglichen: " + result.imported + " Entwuerfe neu, " + result.skipped + " bereits vorhanden/uebersprungen."
      : "Import nicht konfiguriert.";
    return { ran: result.status === "draft-only", reason: lastSyncSummary };
  } catch {
    lastSyncAt = new Date().toISOString();
    lastSyncResult = "error";
    lastSyncSummary = "Katalogabgleich fehlgeschlagen; bestehende Verbindung bleibt erhalten.";
    return { ran: false, reason: "sync-failed" };
  } finally {
    syncBusy = false;
  }
}
/** Schedule only safe Stripe reads and local draft inserts every 6 h. */
export function startStripeAdministratorSync(): void {
  if (!autoSyncEnabled() || timer) return;
  // The startup runs after initial HTTP health setup; no price changes, billing writes or publishing.
  void syncStripeCatalogOnce();
  timer = setInterval(() => void syncStripeCatalogOnce(), 6 * 60 * 60_000);
  timer.unref?.();
}
