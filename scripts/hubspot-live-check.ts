/**
 * Prueft die HubSpot-Anbindung gegen das echte Konto.
 *
 * Beantwortet drei Fragen: Welche Variable wird genutzt, erreicht das Modul
 * das richtige Rechenzentrum, und gehoert der Schluessel zum erwarteten Portal.
 * Aufruf: npm run hubspot:check
 */
import {
  createHubspotModule,
  describeHubspotEnv,
  resolveHubspotToken,
} from "../server/integrations/hubspot/index";

const TOKEN_VARIABLES = [
  "HUBSPOT_SERVICE_KEY",
  "HUBSPOT_PRIVATE_APP_TOKEN",
  "HUBSPOT_ACCESS_TOKEN",
  "HUBSPOT_API_KEY",
] as const;

function maskVariable(name: string, value: string): string {
  const prefix = value.startsWith("pat-") ? value.slice(0, 8) : "ohne-praefix";
  return `${name}: ${value.length} Zeichen, ${prefix}`;
}

async function main(): Promise<void> {
  const status = describeHubspotEnv(process.env);
  console.log("Aktive Variable:", status.variable, "| Format ok:", status.validFormat, "| Host:", status.baseUrl);

  // Schattenseite: gesetzte, aber nicht genutzte Variablen sichtbar machen.
  const active = resolveHubspotToken(process.env);
  for (const name of TOKEN_VARIABLES) {
    const value = String(process.env[name] ?? "").trim();
    if (!value) continue;
    if (value === active) console.log("  genutzt  ", maskVariable(name, value));
    else console.log("  ignoriert", maskVariable(name, value));
  }

  const portal = String(process.env.HUBSPOT_PORTAL_ID ?? "").trim();
  if (portal) {
    console.log(
      /^\d+$/.test(portal)
        ? `HUBSPOT_PORTAL_ID: ${portal}`
        : `HUBSPOT_PORTAL_ID: ungueltig (${portal.length} Zeichen, erwartet rein numerisch)`,
    );
  }

  const hub = createHubspotModule(process.env);
  console.log("Modus:", hub.mode, "|", hub.reason);
  if (hub.mode !== "live") {
    const detail = describeHubspotEnv(process.env).problem;
    if (detail) console.error("Grund:", detail);
    process.exit(1);
  }

  const account = await hub.service.getAccountDetails().catch(() => null);
  console.log(
    "Portal laut Schluessel:", account?.portalId ?? "(nicht ermittelbar)",
    "| Zeitzone:", account?.timeZone ?? "?", "| Waehrung:", account?.currency ?? "?",
  );
  if (portal && /^\d+$/.test(portal) && account?.portalId && String(account.portalId) !== portal) {
    console.error(`Portal passt nicht: Schluessel gehoert zu ${account.portalId}, erwartet ${portal}.`);
    process.exit(1);
  }

  const res = await hub.service.search({
    objectType: "contacts",
    filters: [],
    properties: ["email"],
    limit: 3,
  });
  const results = res.results ?? [];
  console.log("Kontakte gelesen:", res.total ?? results.length);
  for (const contact of results) {
    console.log(" -", contact.id, (contact.properties as Record<string, unknown>)?.email ?? "(ohne E-Mail)");
  }
}

main().catch((error: unknown) => {
  console.error("Fehler:", error instanceof Error ? error.message : error);
  process.exit(1);
});
