/**
 * Prueft, was ein Service Key im echten Portal tatsaechlich darf.
 *
 * Lesezugriffe werden direkt getestet. Schreibrechte werden ueber ein PATCH auf
 * eine bewusst nicht existierende ID geprueft: 404 bedeutet "Scope vorhanden",
 * 403 "Scope fehlt". Dabei wird kein Datensatz angelegt oder veraendert.
 */
import type { HubspotClient } from "./client";
import { HubspotApiError } from "./types";

export interface CapabilityCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** IDs, die in keinem Portal existieren, aber die Form einer echten ID haben. */
const PROBE_ID = "999999999999999999";

const READ_TARGETS: Array<{ name: string; path: string }> = [
  { name: "Kontakte lesen", path: "/crm/v3/objects/contacts?limit=1" },
  { name: "Firmen lesen", path: "/crm/v3/objects/companies?limit=1" },
  { name: "Deals lesen", path: "/crm/v3/objects/deals?limit=1" },
  { name: "Deal-Pipelines lesen", path: "/crm/v3/pipelines/deals" },
  { name: "Owner lesen", path: "/crm/v3/owners?limit=1" },
  { name: "Kontostammdaten lesen", path: "/account-info/v3/details" },
];

const WRITE_TARGETS = ["contacts", "companies", "deals"] as const;

async function checkRead(client: HubspotClient, name: string, path: string): Promise<CapabilityCheck> {
  try {
    await client.request(path);
    return { name, ok: true, detail: "erlaubt" };
  } catch (error) {
    if (error instanceof HubspotApiError) {
      return { name, ok: false, detail: `HTTP ${error.status}` };
    }
    return { name, ok: false, detail: "Netzwerkfehler" };
  }
}

async function checkWrite(client: HubspotClient, objectType: string): Promise<CapabilityCheck> {
  const name = `${objectType} schreiben`;
  try {
    await client.request(`/crm/v3/objects/${objectType}/${PROBE_ID}`, {
      method: "PATCH",
      body: { properties: {} },
    });
    // Ein 2xx auf eine erfundene ID waere ueberraschend, gilt aber als erlaubt.
    return { name, ok: true, detail: "erlaubt (Testobjekt existierte)" };
  } catch (error) {
    if (error instanceof HubspotApiError) {
      if (error.status === 403) return { name, ok: false, detail: "Scope fehlt (403)" };
      // 400/404 heissen: die Autorisierung hat stattgefunden, nur der Probesatz
      // war unbrauchbar (400) oder die ID existiert nicht (404).
      if (error.status === 400 || error.status === 404 || error.status === 409) {
        return { name, ok: true, detail: "erlaubt" };
      }
      return { name, ok: false, detail: `HTTP ${error.status}` };
    }
    return { name, ok: false, detail: "Netzwerkfehler" };
  }
}

export async function probeHubspotCapabilities(client: HubspotClient): Promise<CapabilityCheck[]> {
  const checks: CapabilityCheck[] = [];
  for (const target of READ_TARGETS) {
    checks.push(await checkRead(client, target.name, target.path));
  }
  for (const objectType of WRITE_TARGETS) {
    checks.push(await checkWrite(client, objectType));
  }
  return checks;
}

/** Fasst die Pruefung fuer Logs und Berichte zusammen. */
export function summarizeCapabilities(checks: CapabilityCheck[]): {
  granted: string[];
  missing: string[];
  writable: boolean;
} {
  const granted = checks.filter((c) => c.ok).map((c) => c.name);
  const missing = checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`);
  const writes = checks.filter((c) => c.name.endsWith("schreiben"));
  return { granted, missing, writable: writes.length > 0 && writes.every((c) => c.ok) };
}
