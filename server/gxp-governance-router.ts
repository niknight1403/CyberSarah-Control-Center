import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { evaluateGxpGate } from "../lib/gxp-governance";
import { appendGxpAuditEvent, verifyGxpAuditChain } from "./gxp-audit-store";

export const gxpGovernanceRouter = router({
  evaluateGate: adminProcedure.input(z.object({
    framework: z.enum(["GMP", "GDP", "GLP", "GCP", "GxP_GENERIC"]),
    activity: z.enum(["document_change", "quality_event", "deviation", "capa", "training", "release", "support_escalation"]),
    sopReference: z.string().max(128).optional(),
    changeControlReference: z.string().max(128).optional(),
    evidenceReferences: z.array(z.string().max(128)).max(50).optional(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  })).mutation(async ({ input, ctx }) => {
    const result = evaluateGxpGate({ ...input, actorId: String(ctx.user.id) });
    // Store only minimized assessment metadata; never copy SOP/evidence references or customer content.
    const audit = await appendGxpAuditEvent({
      actorUserId: ctx.user.id,
      framework: result.framework,
      activity: result.activity,
      assessmentStatus: result.status,
      missingControls: result.missingControls,
      eventPayload: {
        requiredControls: result.requiredControls,
        allowedToExecute: false,
        automationMode: "assessment_only",
        humanApprovalRequired: true,
      },
    });
    return { ...result, auditEventId: audit.id, auditEventHash: audit.eventHash };
  }),
  auditIntegrity: adminProcedure.query(() => verifyGxpAuditChain()),
});
