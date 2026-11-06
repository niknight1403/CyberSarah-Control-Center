/**
 * Abmeldung von Outreach-Mails.
 *
 * Ein Abmelde-Link ist keine Formalie: Wer ihn klickt, will nicht mehr
 * angeschrieben werden. Das wird gespeichert (`opted_out`) und vor jedem Versand
 * geprueft — nicht erst im Mailtext behauptet.
 */
import { eq, or, sql } from "drizzle-orm";

import { b2bNetworkNodes } from "../drizzle/schema";
import { getDb } from "./db";

function leadNodeKey(email: string): string {
  const domain = email.split("@")[1] ?? "";
  return `ai-influenza-lead:${domain}`;
}

export async function optOutEmail(rawEmail: string): Promise<{ updated: number; email: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Ungueltige Adresse.");
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar.");
  const nodeKey = leadNodeKey(email);
  const result = await db
    .update(b2bNetworkNodes)
    .set({
      optedOut: true,
      updatedAt: new Date(),
      // Der Zeitstempel braucht eine feste Typangabe: ohne ::text kann
      // Postgres den Parameter in jsonb_build_object nicht aufloesen.
      metadata: sql`coalesce(${b2bNetworkNodes.metadata}, '{}'::jsonb) || jsonb_build_object('optOutAt', ${new Date().toISOString()}::text)`,
    })
    .where(
      or(
        eq(b2bNetworkNodes.nodeKey, nodeKey),
        sql`lower(${b2bNetworkNodes.metadata}->>'email') = ${email}`,
      ),
    )
    .returning({ id: b2bNetworkNodes.id });
  return { updated: result.length, email };
}

/** Adressen, die nicht mehr angeschrieben werden duerfen. */
export async function readOptOutEmails(): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ metadata: b2bNetworkNodes.metadata })
    .from(b2bNetworkNodes)
    .where(eq(b2bNetworkNodes.optedOut, true));
  const emails = new Set<string>();
  for (const row of rows) {
    const email = (row.metadata as Record<string, unknown> | null)?.email;
    if (typeof email === "string" && email.includes("@")) emails.add(email.toLowerCase());
  }
  return emails;
}
