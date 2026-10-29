/**
 * CyberSarah Commerce Studio: Produkt -> LLM -> Reel + Landing + Produktkarte.
 * Alles wird als PENDING in die bestehende menschliche Freigabe-Queue gelegt.
 * Kein externer Publish, kein Stripe-Write, keine Werbeausgaben.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { auditCommerceDraft } from "../lib/commerce-content-quality-logic";
import Stripe from "stripe";
import { mapStripeProductToDraft, readStripeCatalogue } from "../lib/commerce-catalog-logic";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { draftQueue, revenueOffers, revenueAttributionEvents, revenueCostEvents } from "../drizzle/schema";
import { DRAFT_MAX_PENDING_BY_KIND } from "../lib/draft-engine-logic";
import {
  buildContentAssets, commerceKey, evaluateOffers, simulatePricePlan,
  type CommerceBundle, type CommerceOffer,
} from "../lib/commerce-studio-autopilot-logic";

const bundleSchema = z.object({
  productCard: z.string().trim().min(30).max(3000),
  reelScript: z.string().trim().min(60).max(4000),
  landingCopy: z.string().trim().min(100).max(6000),
  hookVariants: z.tuple([z.string().trim().min(8).max(300), z.string().trim().min(8).max(300), z.string().trim().min(8).max(300)]),
  cta: z.string().trim().min(4).max(240),
  disclosure: z.string().trim().min(8).max(500),
});
function parseBundle(input: string): CommerceBundle {
  const first = input.indexOf("{"), last = input.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Kein JSON vom KI-Provider.");
  return bundleSchema.parse(JSON.parse(input.slice(first, last + 1)));
}
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
async function database(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht erreichbar: keine Entwuerfe erzeugt.");
  return db;
}
async function findOffer(offerId: number): Promise<CommerceOffer> {
  const db = await database();
  const rows = await db.select().from(revenueOffers).where(eq(revenueOffers.id, offerId)).limit(1);
  const offer = rows[0];
  if (!offer) throw new Error("Produktangebot nicht gefunden.");
  return { id: offer.id, name: offer.name, kind: offer.kind,
    status: offer.status, priceCents: offer.priceCents,
    marginPct: offer.marginPct, targetUrl: offer.targetUrl };
}
async function generateBundle(offer: CommerceOffer, audience: string): Promise<CommerceBundle> {
  const instructions = [
    "Du bist CyberSarah Commerce Studio. Verfasse ein komplettes DEUTSCHES Kampagnenpaket.",
    "Produkt: " + offer.name,
    "Art: " + offer.kind,
    "Zielgruppe: " + audience,
    "Katalogpreis (nur wenn belegt): " + (offer.priceCents === null ? "unbekannt" : (offer.priceCents / 100).toFixed(2) + " EUR"),
    "Zieladresse (nur wenn vorhanden): " + (offer.targetUrl ?? "noch nicht verbunden"),
    "Valides JSON-Objekt mit productCard, reelScript, landingCopy, hookVariants (genau 3 unterschiedliche Strings), cta, disclosure.",
    "Reel: 15-30 Sekunden, starker klarer Hook, Szenen mit Sprechertext und visuellen Hinweisen.",
    "Landing: Headline, Kundennutzen, Features, FAQ, CTA und transparente Hinweise.",
    "Produktkarte: kurze Fakten, Zielgruppe, Nutzen und Handlungsaufforderung.",
    "Keine erfundenen Reviews, Testimonials, Heilaussagen, Umsatzwerte oder Eigenschaften.",
    "Fehlende Fakten als ZU PRUEFEN markieren, einschliesslich Produktspezifikation und Rechte.",
    "Werbe-, Affiliate- und KI-Disclosure korrekt kennzeichnen, falls relevant.",
    "Niemals als bereits veroeffentlicht ausgeben. Human Approval ist erforderlich.",
  ].join("\n");
  const response = await invokeLLM({
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: "Erstelle die sechs JSON-Felder als direkt bearbeitbare Entwuerfe." },
    ],
    maxTokens: 2200, responseFormat: { type: "json_object" },
  });
  const output = response.choices[0]?.message?.content;
  if (typeof output !== "string") throw new Error("KI-Provider lieferte keine lesbare Antwort.");
  return parseBundle(output);
}
export async function commerceStudioOverview(days = 30) {
  const db = await database();
  const since = new Date(Date.now() - Math.min(90, Math.max(1, days)) * 86_400_000);
  const [rows, events, costs, pending] = await Promise.all([
    db.select().from(revenueOffers).orderBy(desc(revenueOffers.updatedAt)).limit(100),
    db.select().from(revenueAttributionEvents).where(gte(revenueAttributionEvents.occurredAt, since)).limit(15000),
    db.select().from(revenueCostEvents).where(gte(revenueCostEvents.occurredAt, since)).limit(15000),
    db.select({ kind: draftQueue.kind, createdBy: draftQueue.createdBy })
      .from(draftQueue).where(eq(draftQueue.status, "pending")).limit(100),
  ]);
  const offers = rows.map(row => ({
    id: row.id, name: row.name, kind: row.kind, status: row.status,
    priceCents: row.priceCents, marginPct: row.marginPct, targetUrl: row.targetUrl,
  }));
  const performance = evaluateOffers(offers, events.map(event => ({
    contentId: event.contentId, eventType: event.eventType, valueCents: event.valueCents,
  })), costs.map(cost => ({ amountCents: cost.amountCents, metadata: cost.metadata })));
  return {
    status: "observe-diagnose-draft-approve",
    mode: "approval-gated",
    offers: performance,
    pricePlans: offers.map(offer => ({
      offerId: offer.id,
      plan: simulatePricePlan(offer, { measuredPurchases: performance.find(row => row.id === offer.id)?.purchases ?? 0 }),
    })),
    pendingContentDrafts: pending.filter(row => row.kind === "content").length,
    pendingRevenueDrafts: pending.filter(row => row.kind === "revenue-loop").length,
    pendingStudioDrafts: pending.filter(row => row.createdBy === "commerce-studio-autopilot").length,
    evidenceNotice: "Nur via offer:ID:* zugeordnete Events. Unbekannte Kosten bleiben unbekannt. Simulation ist keine Umsatzprognose.",
    externalActionsExecuted: 0,
    generatedAt: new Date().toISOString(),
  };
}
export async function createCommerceBundleDraft(offerId: number, audience = "deutschsprachige Zielgruppe") {
  const offer = await findOffer(offerId);
  if (offer.status !== "active" && offer.status !== "draft") {
    return { generated: false, reason: "Angebot pausiert." };
  }
  const key = commerceKey(offerId, new Date().toISOString().slice(0, 10), "content");
  const db = await database();
  const existing = await db.select({ id: draftQueue.id }).from(draftQueue)
    .where(eq(draftQueue.dedupeKey, key)).limit(1);
  if (existing.length) return { generated: false, reason: "Paket heute bereits vorhanden." };
  const bundle = await generateBundle(offer, audience);
  const audit = auditCommerceDraft(bundle, { priceCents: offer.priceCents, productUrl: offer.targetUrl });
  if (!audit.passed) return { generated: false, reason: "Qualitaetspruefung: " + audit.blockers.join(" ") };
  const payload = { ...buildContentAssets(offer, bundle), qualityWarnings: audit.warnings };
  const inserted = await db.transaction(async tx => {
    await tx.execute(sql.raw("SELECT pg_advisory_xact_lock(hashtext('cybersarah-commerce-studio-content'))"));
    const open = await tx.select({ id: draftQueue.id }).from(draftQueue)
      .where(and(eq(draftQueue.kind, "content"), eq(draftQueue.status, "pending")));
    if (open.length >= DRAFT_MAX_PENDING_BY_KIND.content) return false;
    const rows = await tx.insert(draftQueue).values({
      kind: "content", title: payload.topic, payload,
      status: "pending", createdBy: "commerce-studio-autopilot", dedupeKey: key,
    }).onConflictDoNothing({ target: draftQueue.dedupeKey }).returning({ id: draftQueue.id });
    return rows.length > 0;
  });
  return { generated: inserted,
    reason: inserted ? "Produktkarte, Reel, Landingpage warten auf Freigabe." : "Queue voll oder Duplikat.",
    draftKey: key };
}
export async function createPriceExperimentDraft(offerId: number) {
  const offer = await findOffer(offerId);
  const db = await database();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const events = await db.select({
    eventType: revenueAttributionEvents.eventType, contentId: revenueAttributionEvents.contentId,
  }).from(revenueAttributionEvents).where(gte(revenueAttributionEvents.occurredAt, since)).limit(15000);
  const purchases = events.filter(event => event.eventType === "purchase" &&
    (event.contentId === "offer:" + offerId || event.contentId.startsWith("offer:" + offerId + ":"))).length;
  const plan = simulatePricePlan(offer, { measuredPurchases: purchases });
  if (plan.mode !== "experiment-proposal" || plan.baselinePriceCents === null) {
    return { generated: false, reason: plan.reason, plan };
  }
  const key = commerceKey(offerId, new Date().toISOString().slice(0, 10), "price");
  const variants = plan.scenarios.map(s => (s.priceCents / 100).toFixed(2) + " EUR");
  const payload = {
    hub: "saas" as const,
    name: ("PREISTEST · " + offer.name).slice(0, 120),
    hypothesis: "Randomisierter Preistest koennte den Deckungsbeitrag pro Besucher erhoehen; die Preiselastizitaet ist noch unbekannt.",
    stages: ["A/B-Test mit expliziter Freigabe planen", "Conversion, Kosten und Refunds messen", "Gewinn und Unsicherheit auswerten"],
    experiment: ("Nur nach Freigabe: " + variants.join(" / ")).slice(0, 300),
    metric: "Netto-Deckungsbeitrag pro qualifiziertem Besucher",
    unit: "EUR/Besucher", targetValue: 1, currentValue: 0,
    autopilotKey: key,
    baseline: (plan.baselinePriceCents / 100).toFixed(2) + " EUR",
    target: "Hoherer gemessener Gewinn statt simulierter Umsatz",
    scenarios: plan.scenarios, offerId, requiresHumanApproval: true, noAutomaticPriceChanges: true,
  };
  const inserted = await db.transaction(async tx => {
    await tx.execute(sql.raw("SELECT pg_advisory_xact_lock(hashtext('cybersarah-commerce-studio-pricing'))"));
    const open = await tx.select({ id: draftQueue.id }).from(draftQueue)
      .where(and(eq(draftQueue.kind, "revenue-loop"), eq(draftQueue.status, "pending")));
    if (open.length >= DRAFT_MAX_PENDING_BY_KIND["revenue-loop"]) return false;
    const rows = await tx.insert(draftQueue).values({
      kind: "revenue-loop", title: payload.name, payload,
      status: "pending", createdBy: "commerce-studio-autopilot", dedupeKey: key,
    }).onConflictDoNothing({ target: draftQueue.dedupeKey }).returning({ id: draftQueue.id });
    return rows.length > 0;
  });
  return { generated: inserted,
    reason: inserted ? "Preistest in der Freigabe; kein Preis geaendert." : "Queue voll oder Vorschlag bereits vorhanden.",
    plan };
}
export async function runCommerceStudioCycle(maxOffers = 2) {
  const overview = await commerceStudioOverview();
  const selected = overview.offers.filter(offer => offer.status === "active")
    .slice(0, Math.min(3, Math.max(1, maxOffers)));
  const created: Array<{ offerId: number; generated: boolean; reason: string }> = [];
  for (const offer of selected) {
    try {
      const result = await createCommerceBundleDraft(offer.id);
      created.push({ offerId: offer.id, generated: result.generated, reason: result.reason });
    } catch (error) {
      created.push({ offerId: offer.id, generated: false,
        reason: error instanceof Error ? error.message : "Unbekannter KI-/DB-Fehler." });
    }
  }
  return { created, generated: created.filter(row => row.generated).length,
    externalActionsExecuted: 0, priceChangesApplied: 0 };
}


/**
 * Default 6-hourly, idempotent planning loop; no publishing or automatic pricing.
 * Environment COMMERCE_STUDIO_AUTOPILOT=off disables it on deployment.
 */
const COMMERCE_TICK_MS = 6 * 60 * 60_000;
let commerceTimer: ReturnType<typeof setInterval> | null = null;
let commerceBusy = false;
export async function commerceStudioTickOnce(): Promise<void> {
  if (commerceBusy) return;
  commerceBusy = true;
  try {
    const result = await runCommerceStudioCycle(2);
    console.log("[Commerce Studio] content drafts: " + result.generated +
      "; external actions: 0; price changes: 0.");
  } catch (error) {
    console.error("[Commerce Studio] autopilot: " +
      (error instanceof Error ? error.message : "unknown error"));
  } finally {
    commerceBusy = false;
  }
}
export function startCommerceStudioAutopilot(): void {
  if (commerceTimer) return;
  if (String(process.env.COMMERCE_STUDIO_AUTOPILOT ?? "on").toLowerCase() === "off") {
    console.log("[Commerce Studio] disabled by COMMERCE_STUDIO_AUTOPILOT=off.");
    return;
  }
  console.log("[Commerce Studio] 6-hour draft-only cycle enabled.");
  void commerceStudioTickOnce();
  commerceTimer = setInterval(() => void commerceStudioTickOnce(), COMMERCE_TICK_MS);
}

/**
 * Explicit admin-triggered, read-only Stripe pagination, draft-only local writes.
 * Existing offers and prices are not mutated. Advisory lock protects races.
 */
export async function importStripeProductDrafts() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { imported: 0, skipped: 0, status: "not-configured",
      details: ["STRIPE_SECRET_KEY fehlt."], remainingPages: false };
  }
  const stripe = new Stripe(key);
  const catalogue = await readStripeCatalogue(async cursor => stripe.products.list({
    active: true, limit: 100, expand: ["data.default_price"],
    ...(cursor ? { starting_after: cursor } : {}),
  }), 20);
  const db = await database();
  const now = new Date().toISOString();
  return db.transaction(async tx => {
    await tx.execute(sql.raw("SELECT pg_advisory_xact_lock(hashtext('cybersarah-commerce-stripe-import'))"));
    const existing = await tx.select({ metadata: revenueOffers.metadata }).from(revenueOffers);
    const known = new Set(existing.map(row => String(row.metadata.stripeProductId ?? "")).filter(Boolean));
    let imported = 0, skipped = 0;
    const details: string[] = [];
    for (const product of catalogue.products) {
      if (known.has(product.id)) { skipped++; continue; }
      const mapped = mapStripeProductToDraft(product, now);
      if (!mapped.ok) {
        skipped++;
        if (details.length < 12) details.push("Uebersprungen " + mapped.productId + ": " + mapped.reason);
        continue;
      }
      await tx.insert(revenueOffers).values(mapped.offer);
      known.add(product.id);
      imported++;
      if (details.length < 12) details.push(mapped.offer.name);
    }
    return {
      imported, skipped, status: "draft-only", details,
      remainingPages: !catalogue.complete, pagesRead: catalogue.pages,
      countRead: catalogue.products.length,
    };
  });
}
