/**
 * Sprint 263 — Integrations-Registry (rein, testbar): ehrliche Readiness
 * fuer Zahlungen, Mail, Social und Medien — uebernommen aus dem
 * revenue-os-app-Muster (deklarative Definition + Ausfuehrungs-Grenze).
 *
 * Ehrlichkeits-Regeln:
 *   - "not_configured" ist ein Zustand, den wir benennen, nicht verstecken.
 *   - Jede Integration hat eine Ausfuehrungs-Grenze (executionBoundary):
 *     was ohne Freigabe NIE passiert, steht im Code, nicht in einem Doc.
 *   - Keine Integration behauptet Faehigkeiten, deren ENV fehlt.
 */

export type IntegrationKey = "stripe" | "resend" | "github" | "huggingface" | "digistore24" | "tiktok" | "meta";
export type IntegrationReadiness = "ready" | "partial" | "not_configured";

export type IntegrationDefinition = {
  key: IntegrationKey;
  label: string;
  requiredEnv: readonly string[];
  optionalEnv?: readonly string[];
  capabilities: readonly string[];
  executionBoundary: string;
};

export type IntegrationStatus = IntegrationDefinition & {
  readiness: IntegrationReadiness;
  missingEnv: string[];
  configuredEnv: string[];
};

export const INTEGRATION_REGISTRY: readonly IntegrationDefinition[] = [
  {
    key: "stripe",
    label: "Stripe Payments",
    requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    optionalEnv: ["STRIPE_PUBLISHABLE_KEY", "STRIPE_MODE"],
    capabilities: ["Checkout-Links", "Abonnements (Lite/Pro/Expert)", "Webhook-Verifikation"],
    executionBoundary: "Zahlungslinks und Abos entstehen nur serverseitig; Webhooks werden signaturgeprueft.",
  },
  {
    key: "resend",
    label: "Resend E-Mail",
    requiredEnv: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
    capabilities: ["Transaktionsmails", "Opt-in-Zustellung", "Idempotenz-Audit"],
    executionBoundary: "Zustellung ausschliesslich nach dokumentiertem Opt-in und Freigabe.",
  },
  {
    key: "github",
    label: "GitHub Dev-Agent",
    requiredEnv: ["ADMIN_GITHUB_TOKEN"],
    capabilities: ["Repo-Dateien lesen/schreiben", "Commits, PRs, Issues"],
    executionBoundary: "Push und PR nur mit Admin-Token des Workspace; keine fremden Repos.",
  },
  {
    key: "huggingface",
    label: "HuggingFace Bilder (FLUX.1-schnell)",
    requiredEnv: ["HF_TOKEN"],
    capabilities: ["Bild-Generierung im Free-Tier", "Ken-Burns-Fallback bei Provider-Fehler"],
    executionBoundary: "Erzeugung nur nach Nutzer-Freigabe; quota-gedeckelt; keine Prompts zu realen Personen.",
  },
  {
    key: "digistore24",
    label: "Digistore24",
    requiredEnv: ["DIGISTORE24_API_KEY", "DIGISTORE24_IPN_SECRET"],
    capabilities: ["Deutsche Zahlungsabwicklung", "IPN-Verifikation"],
    executionBoundary: "IPN nur mit signaturgueltigen Ereignissen; kein Auto-Versand digitaler Gueter ohne Pruefung.",
  },
  {
    key: "tiktok",
    label: "TikTok (lesend)",
    requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_ACCESS_TOKEN"],
    capabilities: ["Profilpruefung lesend", "Trend-/Content-Einblicke"],
    executionBoundary: "Posting und Upload bleiben deaktiviert; nur autorisierte lesende Endpunkte.",
  },
  {
    key: "meta",
    label: "Meta / Instagram (lesend)",
    requiredEnv: ["META_APP_ID", "META_APP_SECRET", "META_ACCESS_TOKEN", "META_VERIFY_TOKEN"],
    capabilities: ["Ads-Insights lesend", "Webhook-Empfang", "Content-Einblicke"],
    executionBoundary: "Keine Veroeffentlichung oder Budgetaenderung ohne Level-3-Freigabe.",
  },
];

export function getIntegrationStatus(
  key: IntegrationKey,
  env: Record<string, string | undefined> = process.env,
): IntegrationStatus | null {
  const definition = INTEGRATION_REGISTRY.find((entry) => entry.key === key);
  if (!definition) return null;
  const missingEnv = definition.requiredEnv.filter((name) => !(env[name]?.trim()));
  const configuredEnv = [...definition.requiredEnv, ...(definition.optionalEnv ?? [])].filter((name) => Boolean(env[name]?.trim()));
  const readiness: IntegrationReadiness = missingEnv.length === 0 ? "ready" : configuredEnv.length === 0 ? "not_configured" : "partial";
  return { ...definition, readiness, missingEnv, configuredEnv };
}

export function getAllIntegrationStatuses(env: Record<string, string | undefined> = process.env): IntegrationStatus[] {
  return INTEGRATION_REGISTRY.map((definition) => getIntegrationStatus(definition.key, env)!);
}

export function readinessLabel(readiness: IntegrationReadiness): string {
  switch (readiness) {
    case "ready": return "bereit";
    case "partial": return "teilweise konfiguriert";
    case "not_configured": return "nicht konfiguriert";
  }
}

export function summarizeReadiness(statuses: IntegrationStatus[]): string {
  const ready = statuses.filter((status) => status.readiness === "ready").map((status) => status.label);
  const missing = statuses.filter((status) => status.readiness !== "ready").map((status) => status.label);
  return [
    ready.length > 0 ? `Bereit: ${ready.join(", ")}.` : "Keine Integration vollstaendig konfiguriert.",
    missing.length > 0 ? `Fehlt/teilweise: ${missing.join(", ")}.` : null,
  ].filter(Boolean).join(" ");
}
