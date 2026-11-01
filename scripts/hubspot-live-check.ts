import { describeHubspotEnv, createHubspotModule } from "./server/integrations/hubspot/index";

async function main() {
  const status = describeHubspotEnv(process.env);
  console.log("Variable:", status.variable, "| Format ok:", status.validFormat, "| Host:", status.baseUrl);
  const hub = createHubspotModule(process.env);
  console.log("Modus:", hub.mode, "|", hub.reason);
  const res = await hub.service.search({
    objectType: "contacts",
    filters: [],
    properties: ["email", "firstname"],
    limit: 3,
  });
  console.log("Kontakte gelesen:", res.total ?? res.results?.length);
  for (const c of res.results ?? []) console.log(" -", c.id, (c.properties as any)?.email ?? "(ohne E-Mail)");
}
main().catch((e) => { console.error("Fehler:", e?.message ?? e); process.exit(1); });
