/**
 * Conversion-Events schreiben.
 *
 * Die Tabelle existierte bereits fuer den Digistore24-IPN, wurde aber fuer den
 * eigenen Funnel nicht genutzt — deshalb gab es keine Zahl fuer "gestartete
 * Checkouts". Hier wird sie gefuellt, idempotent ueber `orderKey`.
 *
 * Grundsatz: Tracking darf nie den Verkauf verhindern. Fehler werden
 * protokolliert, nicht geworfen.
 */
import { getDb } from "./db";
import { conversionEvents } from "../drizzle/schema";

export const CONVERSION_EVENT_TYPES = {
  checkoutStarted: "checkout_started",
  checkoutCompleted: "checkout_completed",
  introRequest: "intro_request",
  introCallHeld: "intro_call_held",
} as const;

export type ConversionEventType = (typeof CONVERSION_EVENT_TYPES)[keyof typeof CONVERSION_EVENT_TYPES];

export async function recordConversionEvent(input: {
  eventType: ConversionEventType;
  /** Idempotenz: eindeutig je Ereignis, z. B. "checkout_started:<ref>". */
  orderKey: string;
  productSlug?: string | null;
  amountCents?: number;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}): Promise<{ written: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { written: false, reason: "Datenbank nicht verfügbar." };
  try {
    const inserted = await db
      .insert(conversionEvents)
      .values({
        orderKey: input.orderKey.slice(0, 200),
        eventType: input.eventType,
        productSlug: input.productSlug ?? "ai-influenza-team",
        amountCents: Math.max(0, Math.round(input.amountCents ?? 0)),
        rawPayload: input.payload ?? {},
        occurredAt: input.occurredAt ?? new Date(),
      })
      .onConflictDoNothing({ target: conversionEvents.orderKey })
      .returning({ id: conversionEvents.id });
    return { written: inserted.length > 0, reason: inserted.length > 0 ? undefined : "bereits protokolliert" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[conversion] ${input.eventType} ${input.orderKey} nicht protokolliert: ${reason}`);
    return { written: false, reason };
  }
}
