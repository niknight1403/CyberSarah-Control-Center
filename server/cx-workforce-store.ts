import { createHash, randomUUID } from "node:crypto";
import { desc, eq, like } from "drizzle-orm";

import { modelRouterSettings } from "../drizzle/schema";
import { getDb } from "./db";
import type { CxTriageResult } from "../lib/cx-workforce-logic";

const KEY_PREFIX = "cx-workforce:case:";

export type CxCaseRecord = {
  id: string;
  source: "admin_preview" | "hubspot";
  externalReference: string | null;
  status: "needs_review" | "draft_ready";
  triage: CxTriageResult;
  createdAt: string;
};

/**
 * Persist only operational metadata and the generated triage result.
 * Original customer messages, subjects, email addresses and message bodies
 * are deliberately not stored in this queue.
 */
export async function saveCxCase(input: {
  source: CxCaseRecord["source"];
  externalReference?: string;
  triage: CxTriageResult;
}) {
  const db = await getDb();
  if (!db) throw new Error("CX-Fall konnte nicht gespeichert werden: Datenbank nicht verfügbar.");

  const externalReference = input.externalReference?.trim() || null;
  const id = externalReference
    ? createHash("sha256").update(`${input.source}:${externalReference}`).digest("hex").slice(0, 32)
    : randomUUID().replace(/-/g, "");
  const key = `${KEY_PREFIX}${id}`;
  const record: CxCaseRecord = {
    id,
    source: input.source,
    externalReference,
    status: input.triage.humanReviewRequired ? "needs_review" : "draft_ready",
    triage: input.triage,
    createdAt: new Date().toISOString(),
  };

  await db.insert(modelRouterSettings)
    .values({ key, value: record as never })
    .onConflictDoNothing({ target: modelRouterSettings.key });

  const [saved] = await db.select({ value: modelRouterSettings.value })
    .from(modelRouterSettings)
    .where(eq(modelRouterSettings.key, key))
    .limit(1);
  if (!saved) throw new Error("CX-Fall konnte nach dem Speichern nicht verifiziert werden.");
  return saved.value as CxCaseRecord;
}

export async function listCxCases(limit = 50): Promise<CxCaseRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("CX-Queue nicht verfügbar: Datenbank nicht verfügbar.");
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await db.select({ value: modelRouterSettings.value })
    .from(modelRouterSettings)
    .where(like(modelRouterSettings.key, `${KEY_PREFIX}%`))
    .orderBy(desc(modelRouterSettings.updatedAt))
    .limit(safeLimit);
  return rows.map((row) => row.value as CxCaseRecord);
}
