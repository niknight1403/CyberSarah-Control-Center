import { createHash, randomUUID } from "node:crypto";
import { desc, eq, like } from "drizzle-orm";
import { z } from "zod";

import { modelRouterSettings } from "../drizzle/schema";
import { getDb } from "./db";
import type { CxTriageResult } from "../lib/cx-workforce-logic";

const KEY_PREFIX = "cx-workforce:case:";

const cxTriageRecordSchema = z.object({
  category: z.enum(["billing", "refund", "technical", "account", "product", "security", "complaint", "general"]),
  priority: z.enum(["critical", "high", "normal", "low"]),
  confidence: z.number().min(0).max(1),
  queue: z.enum(["security", "billing-specialist", "technical-support", "customer-success", "general-support"]),
  ticketStage: z.enum(["1", "3"]),
  humanReviewRequired: z.boolean(),
  escalationReasons: z.array(z.string().min(1).max(100)).max(30),
  responseDraft: z.string().min(1).max(4000),
  automationMode: z.literal("draft_only"),
  classifier: z.literal("deterministic_rules_v1"),
}).strict();

const cxCaseRecordSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/),
  source: z.enum(["admin_preview", "hubspot"]),
  externalReference: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).nullable(),
  status: z.enum(["needs_review", "draft_ready"]),
  triage: cxTriageRecordSchema,
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine((record, context) => {
  const expectedStatus = record.triage.humanReviewRequired ? "needs_review" : "draft_ready";
  if (record.status !== expectedStatus) {
    context.addIssue({ code: "custom", path: ["status"], message: "CX-Fallstatus stimmt nicht mit dem Review-Status überein." });
  }
});

/** Validate untrusted JSON read from the shared settings table before using it. */
export function parseCxCaseRecord(value: unknown, expectedId?: string): CxCaseRecord {
  const parsed = cxCaseRecordSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Ungültiger gespeicherter CX-Fall: Datenstruktur oder Triage-Metadaten sind fehlerhaft.");
  }
  if (expectedId && parsed.data.id !== expectedId) {
    throw new Error("Ungültiger gespeicherter CX-Fall: interne ID stimmt nicht mit dem Datenbankschlüssel überein.");
  }
  return parsed.data;
}

/** Accept only opaque provider IDs; reject email addresses and free-form PII. */
export function normalizeCxExternalReference(value?: string | null): string | null {
  const normalized = value?.trim() || null;
  if (normalized && !/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    throw new Error("Externe CX-Referenz muss eine opake ID sein; personenbezogene Daten sind nicht zulässig.");
  }
  return normalized;
}

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
  const externalReference = normalizeCxExternalReference(input.externalReference);
  const db = await getDb();
  if (!db) throw new Error("CX-Fall konnte nicht gespeichert werden: Datenbank nicht verfügbar.");
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
  return parseCxCaseRecord(saved.value, id);
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
  return rows.map((row) => parseCxCaseRecord(row.value));
}

/** Load one minimized CX case by its opaque internal ID for a quality assessment. */
export async function getCxCaseById(id: string): Promise<CxCaseRecord | null> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Ungültige CX-Fall-ID.");
  const db = await getDb();
  if (!db) throw new Error("CX-Fall konnte nicht geladen werden: Datenbank nicht verfügbar.");
  const [row] = await db.select({ value: modelRouterSettings.value })
    .from(modelRouterSettings)
    .where(eq(modelRouterSettings.key, `${KEY_PREFIX}${id}`))
    .limit(1);
  return row ? parseCxCaseRecord(row.value, id) : null;
}
