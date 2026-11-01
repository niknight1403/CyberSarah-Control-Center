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

const TOKEN_VARIABLES = ["HUBSPOT_PRIVATE_APP_TOKEN", "HUBSPOT_ACCESS_TOKEN"] as const;

/** Loest das Token aus der Umgebung auf; beide historischen Namen werden akzeptiert. */
export function resolveHubspotToken(env: Record<string, string | undefined> = process.env): string {
  for (const name of TOKEN_VARIABLES) {
    const value = String(env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export interface HubspotEnvStatus {
  configured: boolean;
  validFormat: boolean;
  variable: string | null;
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
      problem: "HUBSPOT_ACCESS_TOKEN ist nicht gesetzt.",
    };
  }
  try {
    assertValidToken(token);
    return { configured: true, validFormat: true, variable, problem: null };
  } catch (error) {
    const message = error instanceof HubspotConfigError ? error.message : String(error);
    return { configured: false, validFormat: false, variable, problem: message };
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
