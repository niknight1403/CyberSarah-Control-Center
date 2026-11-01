/**
 * Einstiegspunkt des HubSpot-Moduls.
 *
 * Entscheidet anhand der Umgebung, ob live gegen die HubSpot-API gearbeitet
 * wird oder die Sandbox einspringt. Damit laufen Tests und lokale Entwicklung
 * ohne Zugangsdaten, waehrend der Produktivpfad denselben Vertrag nutzt.
 */
import { assertValidToken, HubspotClient, type HubspotClientOptions } from "./client";
import { SandboxHubspotService } from "./sandbox";
import { HubspotService, type HubspotServiceLike } from "./service";
import { HubspotConfigError } from "./types";

export * from "./types";
export { HubspotClient, assertValidToken } from "./client";
export { HubspotService } from "./service";
export type { HubspotServiceLike } from "./service";
export { SandboxHubspotService } from "./sandbox";

const TOKEN_VARIABLES = [
  "HUBSPOT_SERVICE_KEY",
  "HUBSPOT_PRIVATE_APP_TOKEN",
  "HUBSPOT_ACCESS_TOKEN",
  "HUBSPOT_API_KEY",
] as const;

/** Loest das Token aus der Umgebung auf; beide historischen Namen werden akzeptiert. */
export function resolveHubspotToken(env: Record<string, string | undefined> = process.env): string {
  for (const name of TOKEN_VARIABLES) {
    const value = String(env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/**
 * Ordnet das Token formal ein. HubSpot akzeptiert fuer serverseitige Aufrufe
 * Service Keys und Private-App-Tokens (beide mit Praefix "pat-") sowie
 * OAuth-Tokens. Ein Legacy-API-Key (UUID-Form) wurde 2022 abgeschaltet.
 */
export type HubspotTokenKind = "private_app" | "legacy_api_key" | "unknown";

export function classifyHubspotToken(token: string): HubspotTokenKind {
  const value = String(token ?? "").trim();
  if (!value) return "unknown";
  if (value.startsWith("pat-")) return "private_app";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return "legacy_api_key";
  return "unknown";
}

export interface HubspotEnvStatus {
  configured: boolean;
  validFormat: boolean;
  variable: string | null;
  kind: HubspotTokenKind;
  problem: string | null;
}

/** Prueft Vorhandensein und Format, ohne einen Netzwerkaufruf zu machen. */
export function describeHubspotEnv(
  env: Record<string, string | undefined> = process.env,
): HubspotEnvStatus {
  const token = resolveHubspotToken(env);
  const variable = TOKEN_VARIABLES.find((name) => String(env[name] ?? "").trim()) ?? null;
  if (!token) {
    return {
      configured: false,
      validFormat: false,
      variable: null,
      kind: "unknown",
      problem: "Kein HubSpot-Schluessel gesetzt (erwartet HUBSPOT_SERVICE_KEY; aeltere Namen HUBSPOT_PRIVATE_APP_TOKEN, HUBSPOT_ACCESS_TOKEN, HUBSPOT_API_KEY werden weiter akzeptiert).",
    };
  }
  const kind = classifyHubspotToken(token);
  if (kind === "legacy_api_key") {
    return {
      configured: false,
      validFormat: false,
      variable,
      kind,
      problem:
        "Legacy-API-Key erkannt (UUID-Form). Diese Schluessel wurden 2022 abgeschaltet und liefern HTTP 401. Bitte eine Private App anlegen und deren pat-Token hinterlegen.",
    };
  }
  try {
    assertValidToken(token);
    return { configured: true, validFormat: true, variable, kind, problem: null };
  } catch (error) {
    const message = error instanceof HubspotConfigError ? error.message : String(error);
    return { configured: false, validFormat: false, variable, kind, problem: message };
  }
}

export interface HubspotModule {
  mode: "live" | "sandbox";
  service: HubspotServiceLike;
  reason: string;
}

/**
 * Baut den Service. Ohne gueltiges Token wird bewusst die Sandbox geliefert,
 * damit weder Tests noch lokale Laeufe an fehlenden Zugangsdaten scheitern.
 */
export function createHubspotModule(
  env: Record<string, string | undefined> = process.env,
  options: Partial<Omit<HubspotClientOptions, "token">> = {},
): HubspotModule {
  const status = describeHubspotEnv(env);
  if (!status.configured) {
    return {
      mode: "sandbox",
      service: new SandboxHubspotService(),
      reason: status.problem ?? "Kein HubSpot-Token konfiguriert.",
    };
  }
  const client = new HubspotClient({ ...options, token: resolveHubspotToken(env) });
  return { mode: "live", service: new HubspotService(client), reason: "Token vorhanden." };
}
