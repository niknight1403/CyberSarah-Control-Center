/**
 * Konto-Agent: verwaltet die Konten, die fuer den Umsatz-Loop gebraucht werden
 * (HubSpot, Stripe, Firecrawl, Apollo, Resend).
 *
 * Wichtig: Der Agent legt KEINE externen Konten selbst an - eine Registrierung
 * bei einem fremden Anbieter braucht eine bestaetigte E-Mail-Adresse und eine
 * Zustimmung des Inhabers. Er fuehrt stattdessen den Konto-Katalog, prueft die
 * hinterlegten Zugaenge, maskiert Geheimnisse und liefert die exakten Schritte
 * sowie die benoetigten Berechtigungen fuer die Einrichtung.
 */

export type AccountProviderKey = "hubspot" | "stripe" | "firecrawl" | "apollo" | "resend";

export type AccountField = {
  env: string;
  label: string;
  secret: boolean;
  required: boolean;
  hint: string;
};

export type AccountProvider = {
  key: AccountProviderKey;
  label: string;
  signupUrl: string;
  credentialsUrl: string;
  scopes: readonly string[];
  fields: readonly AccountField[];
  monthlyFreeTier: string | null;
};

export const ACCOUNT_PROVIDERS: readonly AccountProvider[] = [
  {
    key: "hubspot",
    label: "HubSpot CRM",
    signupUrl: "https://app.hubspot.com/signup",
    credentialsUrl: "https://app.hubspot.com/private-apps",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.read", "crm.objects.deals.write"],
    fields: [
      { env: "HUBSPOT_PRIVATE_APP_TOKEN", label: "Private-App-Token", secret: true, required: true, hint: "Beginnt mit pat-…" },
    ],
    monthlyFreeTier: "Free CRM, 1 Mio. API-Aufrufe/Tag",
  },
  {
    key: "stripe",
    label: "Stripe Billing",
    signupUrl: "https://dashboard.stripe.com/register",
    credentialsUrl: "https://dashboard.stripe.com/apikeys",
    scopes: ["billing:write", "customers:read"],
    fields: [
      { env: "STRIPE_SECRET_KEY", label: "Secret Key", secret: true, required: true, hint: "sk_test_… fuer Testbetrieb" },
      { env: "STRIPE_METER_EVENT_NAME", label: "Meter-Event-Name", secret: false, required: true, hint: "z. B. api_call" },
      { env: "STRIPE_WEBHOOK_SECRET", label: "Webhook-Secret", secret: true, required: false, hint: "whsec_…" },
    ],
    monthlyFreeTier: null,
  },
  {
    key: "firecrawl",
    label: "Firecrawl",
    signupUrl: "https://firecrawl.dev",
    credentialsUrl: "https://firecrawl.dev/app/api-keys",
    scopes: ["scrape"],
    fields: [
      { env: "FIRECRAWL_API_KEY", label: "API Key", secret: true, required: true, hint: "fc-…" },
    ],
    monthlyFreeTier: "Kostenloses Kontingent pro Monat",
  },
  {
    key: "apollo",
    label: "Apollo.io",
    signupUrl: "https://app.apollo.io/#/signup",
    credentialsUrl: "https://developer.apollo.io/keys",
    scopes: ["contacts:read", "organizations:read"],
    fields: [
      { env: "APOLLO_API_KEY", label: "API Key", secret: true, required: true, hint: "Aus dem Developer-Portal" },
    ],
    monthlyFreeTier: "Begrenzte Gratis-Credits",
  },
  {
    key: "resend",
    label: "Resend (E-Mail-Versand)",
    signupUrl: "https://resend.com/signup",
    credentialsUrl: "https://resend.com/api-keys",
    scopes: ["emails:send"],
    fields: [
      { env: "RESEND_API_KEY", label: "API Key", secret: true, required: true, hint: "re_…" },
      { env: "OUTREACH_FROM_ADDRESS", label: "Absenderadresse", secret: false, required: true, hint: "muss verifizierte Domain sein" },
    ],
    monthlyFreeTier: "3.000 E-Mails/Monat",
  },
];

export type AccountEntry = {
  id: string;
  provider: AccountProviderKey;
  label: string;
  status: "draft" | "configured" | "invalid";
  createdAt: string;
  updatedAt: string;
  missingFields: string[];
};

export type AccountDraftInput = {
  provider: string;
  label?: string;
  now?: Date;
};

export type AccountResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function maskSecret(value: string): string {
  const text = String(value ?? "");
  if (!text) return "";
  if (text.length <= 6) return "•".repeat(text.length);
  return `${text.slice(0, 3)}${"•".repeat(Math.min(12, text.length - 6))}${text.slice(-3)}`;
}

export function findProvider(key: string): AccountProvider | null {
  return ACCOUNT_PROVIDERS.find((provider) => provider.key === key) ?? null;
}

export function buildAccountId(provider: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `acct_${String(provider).slice(0, 12)}_${stamp}`;
}

/** Legt einen Konto-Eintrag an (nur Metadaten, kein externer Aufruf). */
export function createAccountEntry(
  input: AccountDraftInput,
  env: Record<string, string | undefined> = process.env,
): AccountResult<AccountEntry> {
  const provider = findProvider(String(input.provider || ""));
  if (!provider) return { ok: false, reason: "unbekannter-anbieter" };
  const now = input.now ?? new Date();
  const missingFields = provider.fields
    .filter((field) => field.required && !String(env[field.env] ?? "").trim())
    .map((field) => field.env);
  return {
    ok: true,
    value: {
      id: buildAccountId(provider.key, now),
      provider: provider.key,
      label: String(input.label || provider.label).slice(0, 80),
      status: missingFields.length === 0 ? "configured" : "draft",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      missingFields,
    },
  };
}

export type AccountConfiguration = {
  ready: boolean;
  missing: string[];
  invalid: string[];
  masked: { env: string; value: string }[];
  scopes: readonly string[];
};

/** Prueft hinterlegte Zugangsdaten ohne sie im Klartext zurueckzugeben. */
export function reviewAccountConfiguration(
  providerKey: string,
  env: Record<string, string | undefined> = process.env,
): AccountResult<AccountConfiguration> {
  const provider = findProvider(String(providerKey || ""));
  if (!provider) return { ok: false, reason: "unbekannter-anbieter" };
  const missing: string[] = [];
  const invalid: string[] = [];
  const masked: { env: string; value: string }[] = [];
  for (const field of provider.fields) {
    const raw = String(env[field.env] ?? "").trim();
    if (!raw) {
      if (field.required) missing.push(field.env);
      continue;
    }
    if (field.secret && raw.length < 12) invalid.push(field.env);
    masked.push({ env: field.env, value: field.secret ? maskSecret(raw) : raw });
  }
  return { ok: true, value: { ready: missing.length === 0 && invalid.length === 0, missing, invalid, masked, scopes: provider.scopes } };
}

export type SetupGuide = {
  provider: AccountProviderKey;
  label: string;
  steps: string[];
  envTemplate: string;
  scopes: readonly string[];
};

/** Liefert die Einrichtungsschritte, die ein Mensch einmalig ausfuehren muss. */
export function buildSetupGuide(providerKey: string): AccountResult<SetupGuide> {
  const provider = findProvider(String(providerKey || ""));
  if (!provider) return { ok: false, reason: "unbekannter-anbieter" };
  return {
    ok: true,
    value: {
      provider: provider.key,
      label: provider.label,
      steps: [
        `Konto anlegen: ${provider.signupUrl}`,
        "E-Mail-Adresse bestaetigen und Zwei-Faktor-Anmeldung aktivieren",
        `Zugangsdaten erzeugen: ${provider.credentialsUrl}`,
        `Berechtigungen setzen: ${provider.scopes.join(", ")}`,
        "Werte im Control Center unter Einstellungen > Integrationen eintragen (verschluesselt gespeichert)",
        "Verbindung testen: Button 'Verbindung pruefen' im Konto-Agenten",
        provider.key === "resend" ? "Absender-Domain im Anbieter verifizieren (SPF und DKIM)" : "Kontingent und Abrechnung im Anbieter pruefen",
      ],
      envTemplate: provider.fields.map((field) => `${field.env}=<${field.label}>`).join("\n"),
      scopes: provider.scopes,
    },
  };
}

export function nextAccountStep(entry: AccountEntry): string {
  if (entry.status === "configured") return "Bereit: Verbindung pruefen und Synchronisation starten";
  if (entry.missingFields.length > 0) return `Fehlende Angaben ergaenzen: ${entry.missingFields.join(", ")}`;
  return "Angaben pruefen und Verbindung erneut testen";
}
