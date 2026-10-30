/**
 * Save a Stripe product campaign plan to the existing shared admin approval queue.
 * Unique per product/persona/platform per month. DB advisory lock prevents
 * parallel producer calls from bypassing the content queue quota.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { draftQueue } from "../drizzle/schema";
import { readStripeAdminCatalog } from "./stripe-catalog-readonly";
import { buildProductContentBrief } from "../lib/stripe-product-content-logic";
import { DRAFT_MAX_PENDING_BY_KIND } from "../lib/draft-engine-logic";
export async function queueStripeProductCampaign(input: {
  productId: string; personaId: string; platform: string;
}) {
  const catalog = await readStripeAdminCatalog();
  const brief = buildProductContentBrief(catalog,input.productId,input.personaId,input.platform);
  if (!brief.ok) return { queued:false, reason:brief.reason };
  const db = await getDb();
  if (!db) throw new Error("Keine Datenbank für Produktkampagnen verfügbar.");
  const month = new Date().toISOString().slice(0,7);
  const dedupeKey = ["stripe-campaign","v1",brief.stripeProductId,
    brief.stripePriceId,input.personaId,input.platform,month].join(":");
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(6300431)`);
    const [existing] = await tx.select({ id: draftQueue.id })
      .from(draftQueue).where(eq(draftQueue.dedupeKey,dedupeKey)).limit(1);
    if (existing) return { queued:false, reason:"Kampagnenentwurf in diesem Monat bereits vorhanden." };
    const [{total}] = await tx.select({ total:sql<number>`count(*)` })
      .from(draftQueue).where(and(eq(draftQueue.status,"pending"),eq(draftQueue.kind,"content")));
    if (Number(total) >= DRAFT_MAX_PENDING_BY_KIND.content) {
      return { queued:false, reason:"Content-Freigabequeue voll; zuerst Entwürfe prüfen." };
    }
    const added = await tx.insert(draftQueue).values({
      kind:"content",title:brief.title,payload:brief.payload,status:"pending",
      createdBy:"stripe-product-bridge",dedupeKey,
    }).onConflictDoNothing({target:draftQueue.dedupeKey}).returning({id:draftQueue.id});
    return added.length ? { queued:true, reason:"Produktkampagne als prüfbarer Freigabeentwurf gespeichert.",draftId:added[0].id }
      : { queued:false, reason:"Kampagnenentwurf bereits vorhanden." };
  });
}
