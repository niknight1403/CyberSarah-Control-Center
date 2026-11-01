/**
 * Prueft die MRR-Verdrahtung gegen das echte Portal.
 *
 * Liest zuerst den Ist-Zustand, legt dann drei Deals an (zwei gewonnen, einer
 * offen), rechnet die Kennzahlen erneut, prueft Stichproben und loescht alle
 * Testdeals wieder. Aufruf: npm run hubspot:mrr-check
 */
import { createHubspotClient, createHubspotModule } from "../server/integrations/hubspot/index";
import { loadHubspotMrrSnapshot } from "../server/hubspot-mrr";

const stamp = `cybersarah-mrr-test-${Date.now()}`;

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}

function show(label: string, snapshot: { mrr: number; mrrDeals: number; openPipelineValue: number; openDeals: number; byOwner: Array<{ ownerName: string; mrr: number }>; currency: string }): void {
  console.log(
    `${label}: MRR ${money(snapshot.mrr, snapshot.currency)} aus ${snapshot.mrrDeals} Deals | ` +
      `offen ${money(snapshot.openPipelineValue, snapshot.currency)} (${snapshot.openDeals}) | ` +
      `Owner ${snapshot.byOwner.map((o) => `${o.ownerName}=${money(o.mrr, snapshot.currency)}`).join(", ") || "keine"}`,
  );
}

async function main(): Promise<void> {
  const client = createHubspotClient(process.env);
  const hub = createHubspotModule(process.env);
  if (!client || hub.mode !== "live") {
    console.error("Kein Live-Zugang konfiguriert.");
    process.exit(1);
  }

  const before = await loadHubspotMrrSnapshot(process.env);
  if (!before.ok) {
    console.error("Abfrage fehlgeschlagen:", before.reason);
    process.exit(1);
  }
  show("Ist-Zustand", before.snapshot);
  for (const warning of before.warnings) console.log("Hinweis:", warning);

  const pipelines = await client.request<any>("/crm/v3/pipelines/deals");
  const pipeline = pipelines.results?.[0];
  const wonStage = pipeline?.stages?.find((s: any) => String(s.metadata?.probability) === "1" || s.metadata?.isClosed === "true");
  const openStage = pipeline?.stages?.[0];
  const owners = await client.request<any>("/crm/v3/owners?limit=1").catch(() => ({ results: [] }));
  const ownerId = owners.results?.[0]?.id as string | undefined;
  if (!wonStage || !openStage) {
    console.error("Keine passenden Stages gefunden.");
    process.exit(1);
  }

  const created: string[] = [];
  try {
    for (const [name, amount] of [[`${stamp}-a`, 500], [`${stamp}-b`, 1500]] as const) {
      const deal = await hub.service.createDeal({
        dealname: name,
        amount,
        dealstage: wonStage.id,
        pipeline: pipeline.id,
        closedate: new Date().toISOString(),
        hubspotOwnerId: ownerId,
      });
      created.push(deal.id);
    }
    const openDeal = await hub.service.createDeal({
      dealname: `${stamp}-offen`,
      amount: 4000,
      dealstage: openStage.id,
      pipeline: pipeline.id,
      hubspotOwnerId: ownerId,
    });
    created.push(openDeal.id);

    const after = await loadHubspotMrrSnapshot(process.env);
    if (!after.ok) throw new Error(after.reason);
    show("Mit Testdeals", after.snapshot);

    const expected = before.snapshot.mrr + 2000;
    const mrrOk = Math.abs(after.snapshot.mrr - expected) < 0.01;
    const openOk = Math.abs(after.snapshot.openPipelineValue - (before.snapshot.openPipelineValue + 4000)) < 0.01;
    const ownerOk = after.snapshot.byOwner.some((o) => o.ownerName.includes("Oeben") || o.ownerName.includes("Heinz"));
    const trendOk = after.snapshot.trend.some((bucket) => bucket.wonValue > 0);
    console.log("Pruefungen: MRR", mrrOk ? "ok" : "FEHLER", "| offene Pipeline", openOk ? "ok" : "FEHLER",
      "| Owner", ownerOk ? "ok" : "FEHLER", "| Verlauf", trendOk ? "ok" : "FEHLER");
  } finally {
    for (const id of created) {
      await client.request(`/crm/v3/objects/deals/${id}`, { method: "DELETE" }).catch((error: unknown) => {
        console.error(`Deal ${id} nicht geloescht:`, error instanceof Error ? error.message : error);
      });
    }
    const final = await loadHubspotMrrSnapshot(process.env);
    if (final.ok) show("Nach Aufraeumen", final.snapshot);
  }
}

main().catch((error: unknown) => {
  console.error("Fehler:", error instanceof Error ? error.message : error);
  process.exit(1);
});
