/**
 * Verbindungs-Logik fuer die Umsatz-Konnektoren.
 *
 * Alle Funktionen sind rein (keine Netzwerkaufrufe, kein Zustand). Damit lassen
 * sie sich ohne echte Zugangsdaten testen, und ein versehentlicher Live-Aufruf
 * ist ausgeschlossen. Die Server-Schicht entscheidet, ob ein Plan ausgefuehrt
 * oder nur als Vorschau zurueckgegeben wird.
 */

export type ConnectorKey = "hubspot" | "firecrawl" | "outreach" | "stripe_metered" | "apollo";

export type ConnectorDefinition = {
  key: ConnectorKey;
  label: string;
  purpose: string;
  requiredEnv: readonly string[];
  docsUrl: string;
  writeCapable: boolean;
};

export const CONNECTOR_CATALOG: readonly ConnectorDefinition[] = [
  {
    key: "hubspot",
    label: "HubSpot CRM",
    purpose: "Kontakte und Deals lesen, qualifizierte Leads zurueckschreiben",
    requiredEnv: ["HUBSPOT_PRIVATE_APP_TOKEN"],
    docsUrl: "https://developers.hubspot.com/docs/api/private-apps",
    writeCapable: true,
  },
  {
    key: "firecrawl",
    label: "Firecrawl Scraping",
    purpose: "Firmen-Webseiten fuer Lead-Anreicherung auslesen",
    requiredEnv: ["FIRECRAWL_API_KEY"],
    docsUrl: "https://docs.firecrawl.dev",
    writeCapable: false,
  },
  {
    key: "outreach",
    label: "Outreach Dispatcher",
    purpose: "Freigegebene Nachrichten ueber E-Mail-Gateway versenden",
    requiredEnv: ["RESEND_API_KEY", "OUTREACH_FROM_ADDRESS"],
    docsUrl: "https://resend.com/docs",
    writeCapable: true,
  },
  {
    key: "stripe_metered",
    label: "Stripe Metered Billing",
    purpose: "Nutzung messen und als Rechnungsposten abrechnen",
    requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_METER_EVENT_NAME"],
    docsUrl: "https://docs.stripe.com/billing/subscriptions/usage-based",
    writeCapable: true,
  },
  {
    key: "apollo",
    label: "Apollo.io",
    purpose: "Firmen- und Kontaktdaten fuer die Lead-Anreicherung",
    requiredEnv: ["APOLLO_API_KEY"],
    docsUrl: "https://docs.apollo.io",
    writeCapable: false,
  },
];

export type ConnectorReadiness = {
  key: ConnectorKey;
  configured: boolean;
  missingEnv: string[];
};

/**
 * Ein Variablenname kann mehrere Schreibweisen haben. HubSpot hat historisch
 * HUBSPOT_ACCESS_TOKEN benutzt (Bestandscode), der Konto-Agent fuehrt
 * HUBSPOT_PRIVATE_APP_TOKEN. Beide meinen dasselbe Private-App-Token; ohne
 * diese Zuordnung meldet die Bereitschaft "nicht konfiguriert", obwohl ein
 * Token gesetzt ist.
 */
const ENV_ALIASES: Record<string, readonly string[]> = {
  HUBSPOT_PRIVATE_APP_TOKEN: ["HUBSPOT_ACCESS_TOKEN", "HUBSPOT_API_KEY"],
};

export function resolveEnvValue(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  for (const candidate of [name, ...(ENV_ALIASES[name] ?? [])]) {
    const value = String(env[candidate] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/** Aufgeloestes HubSpot-Token (Private App), leer wenn nicht gesetzt. */
export function resolveHubspotToken(
  env: Record<string, string | undefined> = process.env,
): string {
  return resolveEnvValue("HUBSPOT_PRIVATE_APP_TOKEN", env);
}

export function evaluateConnectorReadiness(
  key: ConnectorKey,
  env: Record<string, string | undefined> = process.env,
): ConnectorReadiness {
  const definition = CONNECTOR_CATALOG.find((item) => item.key === key);
  if (!definition) return { key, configured: false, missingEnv: [] };
  const missingEnv = definition.requiredEnv.filter((name) => !resolveEnvValue(name, env));
  return { key, configured: missingEnv.length === 0, missingEnv };
}

export function summarizeConnectorReadiness(
  env: Record<string, string | undefined> = process.env,
): { ready: number; total: number; items: ConnectorReadiness[] } {
  const items = CONNECTOR_CATALOG.map((item) => evaluateConnectorReadiness(item.key, env));
  return { ready: items.filter((item) => item.configured).length, total: items.length, items };
}

/* ---------------------------------------------------------------- HubSpot */

export type HubspotSyncRequest = {
  contacts: number;
  deals: number;
  direction?: "pull" | "push" | "both";
};

export type HubspotSyncPlan = {
  allowed: boolean;
  reason: string | null;
  direction: "pull" | "push" | "both";
  batches: { object: "contacts" | "deals"; limit: number; cursor: number }[];
};

const HUBSPOT_BATCH_LIMIT = 100;

export function buildHubspotSyncPlan(
  request: HubspotSyncRequest,
  env: Record<string, string | undefined> = process.env,
): HubspotSyncPlan {
  const readiness = evaluateConnectorReadiness("hubspot", env);
  const direction = request.direction ?? "pull";
  if (!readiness.configured) {
    return { allowed: false, reason: "hubspot-not-configured", direction, batches: [] };
  }
  const contacts = Math.max(0, Math.min(Math.trunc(request.contacts), 10_000));
  const deals = Math.max(0, Math.min(Math.trunc(request.deals), 10_000));
  const batches: HubspotSyncPlan["batches"] = [];
  for (let cursor = 0; cursor < contacts; cursor += HUBSPOT_BATCH_LIMIT) {
    batches.push({ object: "contacts", limit: Math.min(HUBSPOT_BATCH_LIMIT, contacts - cursor), cursor });
  }
  for (let cursor = 0; cursor < deals; cursor += HUBSPOT_BATCH_LIMIT) {
    batches.push({ object: "deals", limit: Math.min(HUBSPOT_BATCH_LIMIT, deals - cursor), cursor });
  }
  return { allowed: true, reason: null, direction, batches };
}

/* --------------------------------------------------------------- Firecrawl */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /\.internal$/i,
  /\.local$/i,
];

export type ScrapeGuard = { allowed: boolean; reason: string | null; url: string | null };

/**
 * Nur oeffentliche HTTPS-Adressen zulassen. Das verhindert, dass der Scraper
 * interne Dienste (Metadata, Datenbank, Admin-Ports) erreicht.
 */
export function guardScrapeUrl(input: string): ScrapeGuard {
  let parsed: URL;
  try {
    parsed = new URL(String(input).trim());
  } catch {
    return { allowed: false, reason: "ungueltige-url", url: null };
  }
  if (parsed.protocol !== "https:") return { allowed: false, reason: "nur-https", url: null };
  if (parsed.username || parsed.password) return { allowed: false, reason: "keine-zugangsdaten-in-url", url: null };
  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return { allowed: false, reason: "interne-adresse", url: null };
  }
  if (!host.includes(".")) return { allowed: false, reason: "ungueltiger-host", url: null };
  return { allowed: true, reason: null, url: parsed.toString() };
}

export type LeadScrapePlan = {
  allowed: boolean;
  reason: string | null;
  url: string | null;
  fields: string[];
  requiresHumanReview: true;
};

export function buildLeadScrapePlan(
  url: string,
  env: Record<string, string | undefined> = process.env,
): LeadScrapePlan {
  const guard = guardScrapeUrl(url);
  const readiness = evaluateConnectorReadiness("firecrawl", env);
  const fields = ["companyName", "industry", "employeeRange", "country", "publicEmail"];
  if (!guard.allowed) return { allowed: false, reason: guard.reason, url: null, fields, requiresHumanReview: true };
  if (!readiness.configured) {
    return { allowed: false, reason: "firecrawl-not-configured", url: guard.url, fields, requiresHumanReview: true };
  }
  return { allowed: true, reason: null, url: guard.url, fields, requiresHumanReview: true };
}

/* ---------------------------------------------------------------- Outreach */

export type OutreachCandidate = {
  email: string;
  companyDomain: string;
  consentGiven: boolean;
  suppressed?: boolean;
};

export type OutreachPlan = {
  queued: OutreachCandidate[];
  rejected: { email: string; reason: string }[];
};

const DISPOSABLE_DOMAINS = new Set(["mailinator.com", "tempmail.com", "guerrillamail.com", "10minutemail.com"]);
const MAX_PER_RUN = 50;

export function buildOutreachDispatchPlan(
  candidates: OutreachCandidate[],
  env: Record<string, string | undefined> = process.env,
): OutreachPlan {
  const readiness = evaluateConnectorReadiness("outreach", env);
  const queued: OutreachCandidate[] = [];
  const rejected: { email: string; reason: string }[] = [];
  for (const candidate of candidates) {
    const email = String(candidate.email || "").trim().toLowerCase();
    const domain = email.split("@")[1] || "";
    if (!readiness.configured) { rejected.push({ email, reason: "outreach-not-configured" }); continue; }
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { rejected.push({ email, reason: "ungueltige-adresse" }); continue; }
    if (!candidate.consentGiven) { rejected.push({ email, reason: "keine-einwilligung" }); continue; }
    if (candidate.suppressed) { rejected.push({ email, reason: "gesperrt" }); continue; }
    if (DISPOSABLE_DOMAINS.has(domain)) { rejected.push({ email, reason: "wegwerf-domain" }); continue; }
    if (queued.length >= MAX_PER_RUN) { rejected.push({ email, reason: "ratenlimit" }); continue; }
    queued.push({ ...candidate, email });
  }
  return { queued, rejected };
}

/* ---------------------------------------------------------- Stripe Metering */

export type MeteredUsageInput = {
  customerId: string;
  meterEventName?: string;
  quantity: number;
  occurredAt?: Date;
  idempotencySeed?: string;
};

export type MeteredUsageEvent = {
  valid: boolean;
  reason: string | null;
  event: { customerId: string; eventName: string; value: number; identifier: string; timestamp: number } | null;
};

export function buildMeteredUsageEvent(
  input: MeteredUsageInput,
  env: Record<string, string | undefined> = process.env,
): MeteredUsageEvent {
  const readiness = evaluateConnectorReadiness("stripe_metered", env);
  const customerId = String(input.customerId || "").trim();
  const eventName = String(input.meterEventName || env.STRIPE_METER_EVENT_NAME || "").trim();
  const quantity = Number(input.quantity);
  if (!readiness.configured) return { valid: false, reason: "stripe-not-configured", event: null };
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) return { valid: false, reason: "ungueltige-kunden-id", event: null };
  if (!eventName) return { valid: false, reason: "meter-fehlt", event: null };
  if (!Number.isFinite(quantity) || quantity <= 0) return { valid: false, reason: "ungueltige-menge", event: null };
  const timestamp = (input.occurredAt ?? new Date()).getTime();
  const seed = input.idempotencySeed || `${customerId}:${eventName}:${timestamp}:${quantity}`;
  return {
    valid: true,
    reason: null,
    event: {
      customerId,
      eventName,
      value: Math.trunc(quantity),
      identifier: `vf_${Buffer.from(seed).toString("base64url").slice(0, 48)}`,
      timestamp: Math.floor(timestamp / 1000),
    },
  };
}
