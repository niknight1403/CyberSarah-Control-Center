/**
 * Echte Umsatz-Attribution: verfolgt nach, welcher Content (SEO-Artikel,
 * E-Mail-Sequenz, ...) tatsächlich zu einer bezahlten Stripe-Transaktion
 * geführt hat. Nutzt Stripes `client_reference_id`, der beim Klick auf einen
 * Payment-Link mitgegeben und in der Checkout-Session gespiegelt wird.
 *
 * Format der Referenz: "<typ>:<id>", z. B. "seo_content:42".
 */
import { db } from "@workspace/db";
import { pendingAttributionTable, seoContentTable, emailSequenzenTable, contentTable, produkteTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { logger } from "./logger";

export type AttributionTyp = "seo_content" | "email_sequenz" | "content" | "produkt";

export interface Attribution {
  typ: AttributionTyp;
  id: number;
  label: string;
}

/** Hängt eine client_reference_id an einen Stripe-Payment-Link an, ohne dessen Ziel-URL zu verändern. */
export function erzeugeTrackingLink(url: string, typ: AttributionTyp, id: number): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("client_reference_id", `${typ}:${id}`);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function parseAttributionRef(ref: string | null | undefined): { typ: AttributionTyp; id: number } | null {
  if (!ref) return null;
  const [typ, idStr] = ref.split(":");
  const id = Number(idStr);
  if (!typ || !Number.isFinite(id)) return null;
  return { typ: typ as AttributionTyp, id };
}

/** Lädt einen menschenlesbaren Titel für eine Attributionsquelle (zum Einfrieren in der Transaktion). */
export async function holeAttributionLabel(typ: AttributionTyp, id: number): Promise<string> {
  try {
    if (typ === "seo_content") {
      const [row] = await db.select({ titel: seoContentTable.titel }).from(seoContentTable).where(eq(seoContentTable.id, id));
      return row?.titel ?? `SEO-Artikel #${id}`;
    }
    if (typ === "email_sequenz") {
      const [row] = await db.select({ id: emailSequenzenTable.id, produktId: emailSequenzenTable.produktId }).from(emailSequenzenTable).where(eq(emailSequenzenTable.id, id));
      return row ? `E-Mail-Sequenz #${row.id}` : `E-Mail-Sequenz #${id}`;
    }
    if (typ === "content") {
      const [row] = await db.select({ titel: contentTable.titel }).from(contentTable).where(eq(contentTable.id, id));
      return row?.titel ?? `Content #${id}`;
    }
    if (typ === "produkt") {
      const [row] = await db.select({ name: produkteTable.name }).from(produkteTable).where(eq(produkteTable.id, id));
      return row?.name ?? `Produkt #${id}`;
    }
  } catch (err) {
    logger.warn({ err, typ, id }, "Attribution: Label konnte nicht geladen werden");
  }
  return `${typ} #${id}`;
}

/** Merkt sich eine Attribution unter einem Referenzschlüssel (z. B. PaymentIntent-ID), bis das Buchungs-Event eintrifft. */
export async function merkeAttributionFuerReferenz(referenceKey: string, typ: AttributionTyp, id: number): Promise<void> {
  const label = await holeAttributionLabel(typ, id);
  await db
    .insert(pendingAttributionTable)
    .values({ referenceKey, attributionTyp: typ, attributionId: id, attributionLabel: label })
    .onConflictDoUpdate({
      target: pendingAttributionTable.referenceKey,
      set: { attributionTyp: typ, attributionId: id, attributionLabel: label },
    });

  // Opportunistisches Aufräumen alter, nie eingelöster Zuordnungen (>48h)
  const grenze = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await db.delete(pendingAttributionTable).where(lt(pendingAttributionTable.createdAt, grenze));
}

/** Liest und entfernt eine vorgemerkte Attribution anhand ihres Referenzschlüssels. */
export async function holeUndEntferneAttribution(referenceKey: string): Promise<Attribution | null> {
  const [row] = await db.select().from(pendingAttributionTable).where(eq(pendingAttributionTable.referenceKey, referenceKey));
  if (!row) return null;
  await db.delete(pendingAttributionTable).where(eq(pendingAttributionTable.id, row.id));
  return { typ: row.attributionTyp as AttributionTyp, id: row.attributionId, label: row.attributionLabel ?? `${row.attributionTyp} #${row.attributionId}` };
}
