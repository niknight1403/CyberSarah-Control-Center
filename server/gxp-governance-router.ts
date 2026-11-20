import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { evaluateGxpGate } from "../lib/gxp-governance";

export const gxpGovernanceRouter = router({
  evaluateGate: adminProcedure.input(z.object({
    framework: z.enum(["GMP", "GDP", "GLP", "GCP", "GxP_GENERIC"]),
    activity: z.enum(["document_change", "quality_event", "deviation", "capa", "training", "release", "support_escalation"]),
    actorId: z.string().min(1).max(128),
    sopReference: z.string().max(128).optional(),
    changeControlReference: z.string().max(128).optional(),
    evidenceReferences: z.array(z.string().max(128)).max(50).optional(),
    approverIds: z.array(z.string().max(128)).max(10).optional(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  })).mutation(({ input }) => evaluateGxpGate(input)),
});
