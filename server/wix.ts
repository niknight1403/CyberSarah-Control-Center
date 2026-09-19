/**
 * Sprint 187 — Wix-API-Servermodul (read-only): Site-Liste (account-level),
 * Site-Properties und eCommerce-Orders (site-level) gegen die offizielle
 * Wix-REST-API https://www.wixapis.com.
 *
 * Schutzkonventionen (analog Revenue-OS, Sprint 114):
 *   - Geheimnistrennung: eigene Umgebungsvariable WIX_API_TOKEN.
 *   - Strikt read-only: nur GET/Query-Endpunkte, keine Schreib-APIs.
 *   - Ehrliche Zustaende: not-configured ohne Secret, klassifizierte
 *     Fehler mit konkretem Hinweis statt haarstraeubender Fehlermeldungen.
 *   - Site-ID: persistiert im KV (setModelRouterSetting, key "wix.siteId"),
 *     vom Admin zur Laufzeit setzbar — kein Redeploy noetig. Fallback:
 *     Umgebungsvariable WIX_SITE_ID.
 *   - Account-ID: WIX_ACCOUNT_ID, Fallback auf die vom Owner bestaetigte
 *     Konto-ID (mehrfach verifiziert, s. Sprint-187-Doku).
 */

import { getModelRouterSetting, setModelRouterSetting } from "./db";
import {
  buildWixRequestHeaders,
  buildWixStatusSnapshot,
  classifyWixFailure,
  isWixUuidFormat,
  normalizeWixOrders,
  normalizeWixSiteProperties,
  normalizeWixSites,
  type WixFailure,
  type WixOrderSummary,
  type WixSitePropertiesSummary,
  type WixSiteSummary,
  type WixStatusSnapshot,
} from "../lib/wix-logic";

const WIX_API_BASE = "https://www.wixapis.com";
const WIX_TIMEOUT_MS = 15_000;
const WIX_SITE_ID_KV_KEY = "wix.siteId";

/** Vom Owner bestaetigte Wix-Konto-ID (Sprint 187, mehrfach uebermittelt). */
export const DEFAULT_WIX_ACCOUNT_ID = "ae403255-f2e1-48b9-91ab-36840f6609fa";

/** Eigener Fehlertyp mit klassifizierter Ursache + Admin-Hinweis. */
export class WixApiError extends Error {
  readonly failure: WixFailure;
  constructor(failure: WixFailure) {
    super(`WIX_${failure.kind.toUpperCase()}: ${failure.message}`);
    this.name = "WixApiError";
    this.failure = failure;
  }
}

export function resolveWixToken(): string | null {
  const token = process.env.WIX_API_TOKEN?.trim();
  return token && token.length > 20 ? token : null;
}

export function resolveWixAccountId(): string | null {
  return process.env.WIX_ACCOUNT_ID?.trim() || DEFAULT_WIX_ACCOUNT_ID;
}

/** Aktuell gesetzte Site-ID: KV vor Env (Admin kann zur Laufzeit setzen). */
export async function resolveWixSiteId(): Promise<string | null> {
  try {
    const fromKv = await getModelRouterSetting<string>(WIX_SITE_ID_KV_KEY);
    const value = (fromKv ?? process.env.WIX_SITE_ID ?? "").trim();
    return value.length > 0 ? value : null;
  } catch {
    const fallback = (process.env.WIX_SITE_ID ?? "").trim();
    return fallback.length > 0 ? fallback : null;
  }
}

/** Site-ID zur Laufzeit setzen (Admin) — Validierung UUID, Speicher KV. */
export async function setWixSiteId(siteId: string): Promise<{ siteId: string }> {
  const trimmed = siteId.trim();
  if (!isWixUuidFormat(trimmed)) {
    throw new Error(
      "INVALID_SITE_ID: Die Site-ID muss eine UUID sein, wie in der Dashboard-URL (…/dashboard/{SITE-ID}/…).",
    );
  }
  await setModelRouterSetting(WIX_SITE_ID_KV_KEY, trimmed);
  return { siteId: trimmed };
}

export async function getWixStatus(): Promise<WixStatusSnapshot> {
  return buildWixStatusSnapshot({
    token: resolveWixToken(),
    accountId: resolveWixAccountId(),
    siteId: await resolveWixSiteId(),
  });
}

/** Zentraler Fetch mit Timeout und ehrlicher Fehlerklassifikation. */
async function wixRequest(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; siteId?: string | null },
): Promise<Record<string, unknown>> {
  const token = resolveWixToken();
  if (!token) {
    throw new WixApiError({
      kind: "not_configured",
      message: "Kein Wix-API-Key hinterlegt (WIX_API_TOKEN fehlt).",
      hint: "API-Key im Wix API-Keys-Manager erstellen und als WIX_API_TOKEN hinterlegen.",
      errorCode: null,
      httpStatus: null,
    });
  }
  if (options.siteId !== undefined && !options.siteId) {
    throw new WixApiError({
      kind: "site_id_missing",
      message: "Für Site-Aufrufe fehlt die Site-ID.",
      hint: "Site-ID aus der Dashboard-URL (…/dashboard/{SITE-ID}/…) in der Karte eintragen.",
      errorCode: null,
      httpStatus: null,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WIX_TIMEOUT_MS);
  try {
    const response = await fetch(`${WIX_API_BASE}${path}`, {
      method: options.method,
      headers: buildWixRequestHeaders({ token, siteId: options.siteId }),
      body: options.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
      signal: controller.signal,
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new WixApiError(
        classifyWixFailure(response.status, response.headers.get("content-type") ?? "", bodyText),
      );
    }
    try {
      return JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      throw new WixApiError(
        classifyWixFailure(response.status, response.headers.get("content-type") ?? "", bodyText),
      );
    }
  } catch (error) {
    if (error instanceof WixApiError) throw error;
    throw new WixApiError({
      kind: "network",
      message: error instanceof Error ? error.message : "Netzwerkfehler Richtung Wix.",
      hint: "Erreichbarkeit von www.wixapis.com prüfen (Timeout 15 s).",
      errorCode: null,
      httpStatus: null,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Account-level: alle Sites des API-Key-Kontos (Scope: Site List Read). */
export async function fetchWixSites(): Promise<WixSiteSummary[]> {
  const body = await wixRequest("/site-list/v2/sites/query", {
    method: "POST",
    body: { query: { paging: { limit: 50 } } },
  });
  return normalizeWixSites(body);
}

/** Site-level: Site-Properties (v4 — v1/v2 existieren nicht mehr). */
export async function fetchWixSiteProperties(siteId?: string | null): Promise<WixSitePropertiesSummary> {
  const resolved = siteId ?? (await resolveWixSiteId());
  const body = await wixRequest("/site-properties/v4/properties", {
    method: "GET",
    siteId: resolved,
  });
  return normalizeWixSiteProperties(body);
}

/** Site-level: eCommerce-Orders (Scope: eCommerce Orders Read). */
export async function fetchWixOrders(input?: {
  siteId?: string | null;
  limit?: number;
}): Promise<{ orders: WixOrderSummary[]; hasNext: boolean }> {
  const resolved = input?.siteId ?? (await resolveWixSiteId());
  const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
  const body = await wixRequest("/ecom/v1/orders/query", {
    method: "POST",
    siteId: resolved,
    body: { query: { paging: { limit } } },
  });
  return normalizeWixOrders(body);
}
