/**
 * Sprint 187 — Wix-API-Logik (rein, testbar): Header-Aufbau, Fehler-
 * klassifikation und Normalisierung fuer die Wix-REST-API
 * (https://www.wixapis.com). Kein Netz, keine Env — ausschliesslich
 * deterministische Transformationen, damit alle Fehlerzustaeende aus den
 * Live-Debugging-Sessions (2026-09-19) reproduzierbar getestet sind.
 *
 * Wichtigste Live-Erkenntnisse (gegen den echten Endpunkt verifiziert):
 *   - Ohne `Accept: application/json` liefert Wix eine HTML-403-Seite.
 *   - Account-Level (z.B. Site-Liste) NUR Authorization-Header.
 *   - Site-Level (Properties/Orders) NUR `wix-site-id` — der offiziellen
 *     Doku folgend KEIN zusaetzlicher wix-account-id-Header.
 *   - `META_SITE_NOT_FOUND` = Site-ID gehoert nicht zum Account des Keys
 *     (401/404 je Endpunkt) — der haeufigste Irrtum: Key im falschen
 *     Wix-Konto erstellt.
 *   - `READ_ORDER_FORBIDDEN` = fehlender Scope ODER fehlende Site-ID.
 */

export type WixSiteId = string;

export interface WixSiteSummary {
  id: string;
  name: string | null;
  displayName: string | null;
  domain: string | null;
  published: boolean | null;
  createdDate: string | null;
  updatedDate: string | null;
}

export interface WixOrderSummary {
  id: string;
  number: number | null;
  createdDate: string | null;
  status: string | null;
  buyerEmail: string | null;
  currency: string | null;
  totalAmount: number | null;
}

export interface WixSitePropertiesSummary {
  businessName: string | null;
  siteName: string | null;
  description: string | null;
  language: string | null;
  currency: string | null;
  timeZone: string | null;
  email: string | null;
  phone: string | null;
}

export type WixFailureKind =
  | "not_configured"
  | "invalid_token"
  | "site_id_missing"
  | "meta_site_not_found"
  | "scope_missing"
  | "html_blocked"
  | "endpoint_not_found"
  | "server_error"
  | "rate_limited"
  | "network";

export interface WixFailure {
  kind: WixFailureKind;
  /** Sichere, deutschsprachige Ursache (kein Token, kein Roh-Body). */
  message: string;
  /** Konkreter naechster Schritt fuer den Administrator. */
  hint: string | null;
  /** Wix-errorCode (z.B. READ_ORDER_FORBIDDEN) fuer die Diagnose-Ansicht. */
  errorCode: string | null;
  httpStatus: number | null;
}

/** UUID-Format wie Wix es fuer Site-/Account-IDs verwendet. */
export function isWixUuidFormat(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value.trim(),
  );
}

/** Maskiert den API-Key — Klartext erscheint NIE in Antworten/Logs. */
export function maskWixToken(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return "***";
  return `${t.slice(0, 6)}…${t.slice(-6)}`;
}

/**
 * Baut die Request-Header. Account-Level: nur Authorization (+ Accept).
 * Site-Level: zusaetzlich `wix-site-id` (bewusst OHNE wix-account-id —
 * die Wix-Doku warnt vor beidem).
 */
export function buildWixRequestHeaders(options: {
  token: string;
  siteId?: string | null;
  json?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: options.token.trim(),
    Accept: "application/json",
  };
  if (options.json !== false) headers["Content-Type"] = "application/json";
  if (options.siteId) headers["wix-site-id"] = options.siteId.trim();
  return headers;
}

/** Bekannte Wix-errorCodes → fehlender Scope mit konkretem Aktivierungs-Hinweis. */
const WIX_SCOPE_HINTS: Record<string, string> = {
  READ_ORDER_FORBIDDEN:
    "Dem API-Key fehlt der Scope: API-Keys-Manager → eCommerce → Orders → Read. Danach Site-ID prüfen.",
  SITE_LIST_READ_FORBIDDEN:
    "Dem API-Key fehlt der Scope: API-Keys-Manager → Site List → Read.",
  DOMAINS_PERMISSION_DENIED:
    "Dem API-Key fehlt der Scope: API-Keys-Manager → Domains → Read Connected Domains.",
};

/**
 * Klassifiziert jeden Wix-Fehler aus (httpStatus, contentType, bodyText).
 * Reihenfolge ist bewusst: Wix-spezifische Fehlerkodes VOR generischen
 * HTTP-Klassen, weil Wix z.B. META_SITE_NOT_FOUND als 401 UND 404 schickt.
 */
export function classifyWixFailure(
  httpStatus: number,
  contentType: string,
  bodyText: string,
): WixFailure {
  const trimmed = bodyText.trim();

  // HTML-Antwort = klassischer 403-Bot-Schutz ohne Accept: application/json.
  if (trimmed.startsWith("<")) {
    return {
      kind: "html_blocked",
      message: "Wix hat eine HTML-Seite statt JSON geliefert (Bot-Schutz).",
      hint: "Header 'Accept: application/json' muss mitgesendet werden.",
      errorCode: null,
      httpStatus,
    };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = null;
  }

  const message =
    (typeof parsed?.message === "string" && parsed.message) ||
    (typeof parsed?.errorDescription === "string" && parsed.errorDescription) ||
    trimmed.slice(0, 200) ||
    "Unbekannter Wix-Fehler";

  const errorCodeFromDetails = (() => {
    const details = parsed?.details;
    if (details && typeof details === "object") {
      const app = (details as { applicationError?: { code?: unknown } }).applicationError;
      if (app && typeof app.code === "string") return app.code;
    }
    return null;
  })();
  const errorCode = errorCodeFromDetails ?? null;

  if (errorCode === "META_SITE_NOT_FOUND" || /meta-site .+ (?:was )?not found/i.test(message)) {
    return {
      kind: "meta_site_not_found",
      message: "Die Site-ID gehört zu keinem Site im Konto dieses API-Keys.",
      hint:
        "API-Key und Site müssen im selben Wix-Konto liegen. Konto-Wechsler oben rechts im Dashboard prüfen und den Key im kontoeigenden Account neu erstellen.",
      errorCode: "META_SITE_NOT_FOUND",
      httpStatus,
    };
  }

  if (errorCode && WIX_SCOPE_HINTS[errorCode]) {
    return {
      kind: "scope_missing",
      message: `Berechtigung verweigert (${errorCode}).`,
      hint: WIX_SCOPE_HINTS[errorCode],
      errorCode,
      httpStatus,
    };
  }
  if (/permission denied|PERMISSION_DENIED/i.test(message)) {
    return {
      kind: "scope_missing",
      message: "Berechtigung verweigert — dem API-Key fehlt der nötige Scope.",
      hint: "Im Wix API-Keys-Manager die passenden Read-Scopes aktivieren.",
      errorCode,
      httpStatus,
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      kind: "invalid_token",
      message: "Wix hat den API-Key abgelehnt.",
      hint: "API-Key im API-Keys-Manager neu erstellen/aktualisieren.",
      errorCode,
      httpStatus,
    };
  }

  if (/Controller mapped to .+ was not found/i.test(message)) {
    return {
      kind: "endpoint_not_found",
      message: "Der API-Pfad existiert nicht (falsche Version, z.B. v1 statt v4).",
      hint: "Pfad an die offizielle Wix-Doku anpassen (site-properties: v4).",
      errorCode,
      httpStatus,
    };
  }

  if (httpStatus === 404) {
    return {
      kind: "endpoint_not_found",
      message: "Endpunkt oder Ressource nicht gefunden.",
      hint: "Site-ID und API-Pfad prüfen.",
      errorCode,
      httpStatus,
    };
  }

  if (httpStatus === 429) {
    return {
      kind: "rate_limited",
      message: "Wix-Rate-Limit erreicht.",
      hint: "Kurz warten und erneut versuchen.",
      errorCode,
      httpStatus,
    };
  }

  if (httpStatus >= 500) {
    return {
      kind: "server_error",
      message: "Wix-Server-Fehler.",
      hint: "Später erneut versuchen.",
      errorCode,
      httpStatus,
    };
  }

  return {
    kind: "network",
    message,
    hint: "Netzwerk-/Antwortdetails prüfen.",
    errorCode,
    httpStatus,
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Normalisiert die Antwort von POST /site-list/v2/sites/query. */
export function normalizeWixSites(body: unknown): WixSiteSummary[] {
  if (!body || typeof body !== "object") return [];
  const sites = (body as { sites?: unknown }).sites;
  if (!Array.isArray(sites)) return [];
  return sites.map((raw) => {
    const site = (raw ?? {}) as Record<string, unknown>;
    return {
      id: asString(site.id) ?? "",
      name: asString(site.name),
      displayName: asString(site.displayName),
      domain: asString(site.domain),
      published: asBoolean(site.published),
      createdDate: asString(site.createdDate),
      updatedDate: asString(site.updatedDate),
    };
  });
}

/** Normalisiert die Antwort von POST /ecom/v1/orders/query. */
export function normalizeWixOrders(
  body: unknown,
): { orders: WixOrderSummary[]; hasNext: boolean } {
  if (!body || typeof body !== "object") return { orders: [], hasNext: false };
  const raw = (body as { orders?: unknown }).orders;
  if (!Array.isArray(raw)) return { orders: [], hasNext: false };
  const orders = raw.map((entry) => {
    const order = (entry ?? {}) as Record<string, unknown>;
    const buyerInfo = (order.buyerInfo ?? {}) as Record<string, unknown>;
    const price = (order.priceSummary ?? {}) as Record<string, unknown>;
    const total = (price.total ?? {}) as Record<string, unknown>;
    const amount = typeof total.amount === "number" ? total.amount : null;
    return {
      id: asString(order.id) ?? "",
      number: typeof order.number === "number" ? order.number : null,
      createdDate: asString(order.createdDate),
      status: asString(order.status),
      buyerEmail: asString(buyerInfo.email),
      currency: asString(total.currencyCode),
      totalAmount: amount,
    };
  });
  const metadata = (body as { metadata?: { hasNext?: unknown } }).metadata;
  return { orders, hasNext: metadata?.hasNext === true };
}

/**
 * Normalisiert die Antwort von GET /site-properties/v4/properties
 * (defensiv — Struktur je nach Site unterschiedlich belegt).
 */
export function normalizeWixSiteProperties(body: unknown): WixSitePropertiesSummary {
  const props = ((body as { properties?: unknown })?.properties ?? body ?? {}) as Record<
    string,
    unknown
  >;
  const profile = (props.profile ?? {}) as Record<string, unknown>;
  const businessContact = (props.businessContact ?? {}) as Record<string, unknown>;
  const currencies = (props.currencies ?? {}) as Record<string, unknown>;
  const email = Array.isArray(businessContact.emails)
    ? asString((businessContact.emails as unknown[])[0])
    : null;
  const phone = Array.isArray(businessContact.phones)
    ? asString((businessContact.phones as unknown[])[0])
    : null;
  return {
    businessName: asString(profile.businessName),
    siteName: asString(profile.siteName),
    description: asString(profile.description),
    language: asString(props.language),
    currency: asString(currencies.currency),
    timeZone: asString(currencies.timeZone),
    email,
    phone,
  };
}

export type WixStatusState = "not_configured" | "site_id_missing" | "site_id_invalid" | "ready";
export type WixTokenSource = "env" | "admin_store" | "none";

export interface WixStatusSnapshot {
  state: WixStatusState;
  tokenConfigured: boolean;
  tokenSource: WixTokenSource;
  tokenMasked: string | null;
  accountId: string | null;
  siteId: string | null;
  /** Klarer naechster Schritt (deutsch) — wird 1:1 in der Admin-Karte gezeigt. */
  nextStep: string;
}

/** Baut den ehrlichen Status-Snapshot (kein Fake-Zustand, kein Netzaufruf). */
export function buildWixStatusSnapshot(input: {
  token: string | null;
  accountId: string | null;
  siteId: string | null;
  tokenSource?: WixTokenSource;
}): WixStatusSnapshot {
  const tokenConfigured = Boolean(input.token && input.token.trim().length > 20);
  if (!tokenConfigured) {
    return {
      state: "not_configured",
      tokenConfigured: false,
      tokenSource: "none",
      tokenMasked: null,
      accountId: input.accountId,
      siteId: input.siteId,
      nextStep: "WIX_API_TOKEN in den Server-Secrets hinterlegen (Wix API-Keys-Manager).",
    };
  }
  if (!input.siteId || !input.siteId.trim()) {
    return {
      state: "site_id_missing",
      tokenConfigured: true,
      tokenSource: input.tokenSource ?? "env",
      tokenMasked: maskWixToken(input.token as string),
      accountId: input.accountId,
      siteId: null,
      nextStep:
        "Site-ID aus der Dashboard-URL kopieren (…/dashboard/{SITE-ID}/…) und hier eintragen.",
    };
  }
  if (!isWixUuidFormat(input.siteId)) {
    return {
      state: "site_id_invalid",
      tokenConfigured: true,
      tokenSource: input.tokenSource ?? "env",
      tokenMasked: maskWixToken(input.token as string),
      accountId: input.accountId,
      siteId: input.siteId,
      nextStep: "Site-ID ist kein UUID-Format — vollständige Dashboard-URL prüfen.",
    };
  }
  return {
    state: "ready",
    tokenConfigured: true,
    tokenSource: input.tokenSource ?? "env",
    tokenMasked: maskWixToken(input.token as string),
    accountId: input.accountId,
    siteId: input.siteId.trim(),
    nextStep: "Bereit — Site-Properties und Orders über die Karte abrufbar.",
  };
}
