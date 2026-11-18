import { createHash, randomUUID } from "node:crypto";
import { desc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { modelRouterSettings } from "../drizzle/schema";
import { getDb } from "./db";
import { adminProcedure, router } from "./_core/trpc";

const POLICY_VERSION = "gxp-guardrails-v1";
const AUDIT_PREFIX = "gxp:audit:";
const CONTROLLED_ACTIONS = [
  "batch_release", "deviation_disposition", "capa_approval",
  "controlled_document_publish", "regulated_record_delete",
  "quality_event_close", "electronic_signature",
] as const;

type ControlledAction = typeof CONTROLLED_ACTIONS[number];

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Append-only at the application boundary: every event receives a unique key,
 * and no update/delete endpoint is exposed. This is not a validated or
 * independently immutable regulatory audit trail.
 */
async function appendAuditEvent(event: {
  action: string;
  decision: "allow" | "block";
  actor: string;
  reason: string;
  policyVersion: string;
  approvalReference?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("GxP-Audit-Speicher nicht verfügbar; Aktion wird gesperrt.");
  const record = {
    id: randomUUID(),
    ...event,
    occurredAt: new Date().toISOString(),
  };
  const recordHash = digest(record);
  await db.insert(modelRouterSettings).values({
    key: `${AUDIT_PREFIX}${record.id.replace(/-/g, "")}`,
    value: { ...record, recordHash } as never,
  });
  return { id: record.id, recordHash, occurredAt: record.occurredAt };
}

export const gxpComplianceRouter = router({
  readiness: adminProcedure.query(() => ({
    profile: "general_quality_governance",
    regulatedProfilesEnabled: false,
    policyVersion: POLICY_VERSION,
    electronicSignaturesEnabled: false,
    validatedAuditTrail: false,
    productionGxpClaim: false,
    controlledActions: CONTROLLED_ACTIONS,
    status: "foundation_only" as const,
  })),

  evaluateAction: adminProcedure.input(z.object({
    action: z.enum(CONTROLLED_ACTIONS),
    reason: z.string().trim().min(8).max(1000),
    approvalReference: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/).optional(),
  })).mutation(async ({ ctx, input }) => {
    const actor = String(ctx.user.openId);
    // No approval workflow exists yet. Therefore all regulated/controlled
    // actions fail closed even if a caller supplies an arbitrary reference.
    const decision = "block" as const;
    const audit = await appendAuditEvent({
      action: input.action,
      decision,
      actor,
      reason: input.reason,
      policyVersion: POLICY_VERSION,
      approvalReference: input.approvalReference,
    });
    return {
      decision,
      executable: false as const,
      reason: "Keine implementierte, verifizierte Freigabeinstanz. Kontrollierte Aktion bleibt gesperrt.",
      policyVersion: POLICY_VERSION,
      audit,
    };
  }),

  auditRecent: adminProcedure.input(z.object({
    limit: z.number().int().min(1).max(100).default(50),
  }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("GxP-Audit-Speicher nicht verfügbar.");
    const rows = await db.select({ value: modelRouterSettings.value })
      .from(modelRouterSettings)
      .where(like(modelRouterSettings.key, `${AUDIT_PREFIX}%`))
      .orderBy(desc(modelRouterSettings.updatedAt))
      .limit(input?.limit ?? 50);
    return rows.map((row) => row.value);
  }),
});
