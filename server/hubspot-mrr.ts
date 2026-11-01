/**
 * Laedt echte HubSpot-Daten und rechnet daraus die MRR-Kennzahlen.
 *
 * Nur Lesezugriffe: Deals, Pipelines, Owner, Kontostammdaten. Fehlt der
 * Owner-Scope, laufen die Kennzahlen ohne Zuweisung weiter statt zu scheitern.
 */
import { createHubspotClient, describeHubspotEnv } from "./integrations/hubspot/index";
import { HubspotApiError } from "./integrations/hubspot/types";
import {
  buildHubspotMrrSnapshot,
  type HubspotMrrDeal,
  type HubspotMrrOwner,
  type HubspotMrrPipeline,
  type HubspotMrrSnapshot,
} from "../lib/hubspot-mrr-logic";

const DEAL_PROPERTIES = [
  "dealname",
  "amount",
  "dealstage",
  "closedate",
  "pipeline",
  "hubspot_owner_id",
  "billing_frequency",
  "hs_object_id",
];

const MAX_DEALS = 2000;
const PAGE_SIZE = 100;

export type HubspotMrrResult =
  | { ok: true; snapshot: HubspotMrrSnapshot; warnings: string[] }
  | { ok: false; reason: string; code: "not_configured" | "api_error" };

function isApiError(error: unknown): error is HubspotApiError {
  return error instanceof HubspotApiError;
}

/**
 * Liest ueber den Listen-Endpunkt, nicht ueber die Suche: der Suchindex hinkt
 * nach dem Anlegen mehrere Sekunden hinterher, ein Dashboard soll aber sofort
 * stimmen.
 */
async function loadDeals(client: NonNullable<ReturnType<typeof createHubspotClient>>): Promise<HubspotMrrDeal[]> {
  const deals: HubspotMrrDeal[] = [];
  let after: string | undefined;
  while (deals.length < MAX_DEALS) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), properties: DEAL_PROPERTIES.join(",") });
    if (after) query.set("after", after);
    const page = await client.request<{
      results?: HubspotMrrDeal[];
      paging?: { next?: { after?: string } };
    }>(`/crm/v3/objects/deals?${query.toString()}`);
    const results = page.results ?? [];
    deals.push(...results);
    after = page.paging?.next?.after;
    if (!after || results.length === 0) break;
  }
  return deals.slice(0, MAX_DEALS);
}

async function loadOwners(client: NonNullable<ReturnType<typeof createHubspotClient>>): Promise<HubspotMrrOwner[]> {
  const owners: HubspotMrrOwner[] = [];
  let after: string | undefined;
  while (owners.length < 500) {
    const page = await client.request<{ results?: HubspotMrrOwner[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/owners?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    owners.push(...(page.results ?? []));
    after = page.paging?.next?.after;
    if (!after) break;
  }
  return owners;
}

export async function loadHubspotMrrSnapshot(
  env: Record<string, string | undefined> = process.env,
  options: { months?: number; windowDays?: number; now?: Date } = {},
): Promise<HubspotMrrResult> {
  const status = describeHubspotEnv(env);
  if (!status.configured) {
    return { ok: false, reason: status.problem ?? "HubSpot ist nicht konfiguriert.", code: "not_configured" };
  }
  const client = createHubspotClient(env);
  if (!client) {
    return { ok: false, reason: "HubSpot-Client konnte nicht erstellt werden.", code: "not_configured" };
  }

  const warnings: string[] = [];

  try {
    const [account, pipelinesResponse, deals] = await Promise.all([
      client.getAccountDetails().catch(() => ({})),
      client.request<{ results?: HubspotMrrPipeline[] }>("/crm/v3/pipelines/deals"),
      loadDeals(client),
    ]);

    let owners: HubspotMrrOwner[] = [];
    try {
      owners = await loadOwners(client);
    } catch (error) {
      const detail = isApiError(error) ? `HTTP ${error.status}` : "unbekannt";
      warnings.push(`Owner-Daten nicht lesbar (${detail}), Zuweisungen bleiben leer.`);
    }

    const currency =
      (account as { currency?: string }).currency ??
      (typeof env.HUBSPOT_CURRENCY === "string" ? env.HUBSPOT_CURRENCY : "") ??
      "EUR";

    const snapshot = buildHubspotMrrSnapshot({
      deals,
      pipelines: pipelinesResponse.results ?? [],
      owners,
      currency: currency || "EUR",
      months: options.months,
      windowDays: options.windowDays,
      now: options.now,
    });

    return { ok: true, snapshot, warnings };
  } catch (error) {
    if (isApiError(error) && error.status === 403) {
      return { ok: false, reason: error.message, code: "api_error" };
    }
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "HubSpot-Abfrage fehlgeschlagen.",
      code: "api_error",
    };
  }
}
