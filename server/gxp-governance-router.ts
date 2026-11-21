import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { evaluateGxpGate } from "../lib/gxp-governance";
import { appendGxpAuditEvent, verifyGxpAuditChain } from "./gxp-audit-store";
import { CxCaseRecordValidationError, getCxCaseById } from "./cx-workforce-store";
import { buildGxpCxCaseAuditPayload } from "../lib/gxp-cx-link";

async function recordRejectedAssessment(actorUserId: number, framework: string, activity: string) {
  // Never persist rejected input values: they may contain free-form or personal data.
  return appendGxpAuditEvent({
    actorUserId,
    framework,
    activity,
    assessmentStatus: "input_rejected",
    missingControls: ["input_validation_failed"],
    eventPayload: {
      allowedToExecute: false,
      automationMode: "assessment_only",
      humanApprovalRequired: true,
      rejectionReason: "opaque_reference_validation_failed",
    },
  });
}

export const gxpGovernanceRouter = router({
  evaluateGate: adminProcedure.input(z.object({
    framework: z.enum(["GMP", "GDP", "GLP", "GCP", "GxP_GENERIC"]),
    activity: z.enum(["document_change", "quality_event", "deviation", "capa", "training", "release", "support_escalation"]),
    sopReference: z.string().max(128).optional(),
    changeControlReference: z.string().max(128).optional(),
    evidenceReferences: z.array(z.string().max(128)).max(50).optional(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  })).mutation(async ({ input, ctx }) => {
    let result;
    try {
      result = evaluateGxpGate({ ...input, actorId: String(ctx.user.id) });
    } catch (error) {
      await recordRejectedAssessment(ctx.user.id, input.framework, input.activity);
      throw error;
    }
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

  assessCxCase: adminProcedure.input(z.object({
    caseId: z.string().regex(/^[a-f0-9]{32}$/),
    framework: z.enum(["GMP", "GDP", "GLP", "GCP", "GxP_GENERIC"]),
    activity: z.enum(["quality_event", "deviation", "capa"]),
    sopReference: z.string().max(128).optional(),
    evidenceReferences: z.array(z.string().max(128)).max(50).optional(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  })).mutation(async ({ input, ctx }) => {
    let cxCase;
    try {
      cxCase = await getCxCaseById(input.caseId);
    } catch (error) {
      if (error instanceof CxCaseRecordValidationError) {
        await recordRejectedAssessment(ctx.user.id, input.framework, input.activity);
      }
      // Database and infrastructure failures are not input-validation events.
      throw error;
    }
    if (!cxCase) throw new Error("CX-Fall nicht gefunden.");
    let result;
    try {
      result = evaluateGxpGate({
        framework: input.framework,
        activity: input.activity,
        sopReference: input.sopReference,
        evidenceReferences: input.evidenceReferences,
        riskLevel: input.riskLevel,
        actorId: String(ctx.user.id),
      });
    } catch (error) {
      await recordRejectedAssessment(ctx.user.id, input.framework, input.activity);
      throw error;
    }
    const cxAuditPayload = buildGxpCxCaseAuditPayload({
      caseId: cxCase.id,
      category: cxCase.triage?.category,
      priority: cxCase.triage?.priority,
      requiredControls: result.requiredControls,
    });
    const audit = await appendGxpAuditEvent({
      actorUserId: ctx.user.id,
      framework: result.framework,
      activity: result.activity,
      assessmentStatus: result.status,
      missingControls: result.missingControls,
      eventPayload: cxAuditPayload,
    });
    return { ...result, relatedRecordType: "cx_case" as const, relatedRecordId: cxCase.id, auditEventId: audit.id, auditEventHash: audit.eventHash };
  }),
  auditIntegrity: adminProcedure.query(() => verifyGxpAuditChain()),
});
