/**
 * Beweist den Schreibzugriff mit echten Datensaetzen und raeumt sie wieder ab.
 *
 * Legt einen Kontakt und einen Deal an, liest beide zurueck, verschiebt die
 * Deal-Stage und loescht anschliessend genau diese beiden Datensaetze.
 * Aufruf: npm run hubspot:write-check
 */
import { createHubspotClient, createHubspotModule } from "../server/integrations/hubspot/index";

const stamp = `cybersarah-validierung-${Date.now()}`;

async function main(): Promise<void> {
  const client = createHubspotClient(process.env);
  const hub = createHubspotModule(process.env);
  if (!client || hub.mode !== "live") {
    console.error("Kein Live-Zugang konfiguriert.");
    process.exit(1);
  }

  const pipelines = await client.request<any>("/crm/v3/pipelines/deals");
  const pipeline = pipelines.results?.[0];
  if (!pipeline?.stages?.length) {
    console.error("Keine Deal-Pipeline gefunden, Deal-Test uebersprungen.");
  }
  const firstStage = pipeline?.stages?.[0]?.id as string;
  const secondStage = pipeline?.stages?.[1]?.id as string;

  let contactId = "";
  let dealId = "";
  const cleanup: string[] = [];

  try {
    const contact = await hub.service.createContact({
      email: `${stamp}@example.com`,
      firstname: "CyberSarah",
      lastname: "Validierungstest",
    } as any);
    contactId = contact.id;
    console.log("Kontakt angelegt:", contactId);

    const again = await hub.service.findContactByEmail(`${stamp}@example.com`);
    console.log("Kontakt wiedergefunden:", again?.id === contactId ? "ja" : "NEIN");

    if (pipeline) {
      const deal = await hub.service.createDeal({
        dealname: `${stamp}-deal`,
        dealstage: firstStage,
        pipeline: pipeline.id,
        amount: 1,
      } as any);
      dealId = deal.id;
      console.log("Deal angelegt:", dealId, "| Stage:", firstStage);

      if (secondStage) {
        const moved = await hub.service.updateDealStage(dealId, { dealstage: secondStage });
        const stageNow = (moved.properties as Record<string, unknown>)?.dealstage;
        console.log("Deal-Stage verschoben:", stageNow === secondStage ? "ja" : `NEIN (${String(stageNow)})`);
      }
    }
  } finally {
    for (const [type, id] of [["deals", dealId], ["contacts", contactId]] as const) {
      if (!id) continue;
      try {
        await client.request(`/crm/v3/objects/${type}/${id}`, { method: "DELETE" });
        cleanup.push(`${type}/${id} geloescht`);
      } catch (error) {
        cleanup.push(`${type}/${id} NICHT geloescht: ${error instanceof Error ? error.message : error}`);
      }
    }
    for (const line of cleanup) console.log("Aufraeumen:", line);
    if (contactId) {
      const gone = await client
        .request(`/crm/v3/objects/contacts/${contactId}`)
        .then(() => "noch vorhanden")
        .catch(() => "nicht mehr vorhanden");
      console.log("Kontrolllesen Testkontakt:", gone);
    }
  }
}

main().catch((error: unknown) => {
  console.error("Fehler:", error instanceof Error ? error.message : error);
  process.exit(1);
});
