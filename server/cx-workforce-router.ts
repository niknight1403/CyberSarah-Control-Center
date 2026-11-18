import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { triageCxRequest } from "../lib/cx-workforce-logic";
import { detectGxpQualitySignal } from "../lib/gxp-policy-logic";
import { describeHubspotEnv } from "./integrations/hubspot";
import { getCxHubspotSnapshot } from "./cx-workforce-hubspot";
import { listCxCases, listCxQualityEvents, saveCxCase } from "./cx-workforce-store";

function triageWithQualityGovernance(input: { subject?: string; message: string; productInterest?: string; purchaseIntent?: string }) {
  const triage = triageCxRequest(input);
  const qualityGovernance = detectGxpQualitySignal(input);
  if (qualityGovernance.potentialQualityEvent) {
    triage.humanReviewRequired = true;
    triage.escalationReasons = [...new Set([...triage.escalationReasons, "potential_gxp_quality_event"])];
  }
  return { triage, qualityGovernance };
}

export const cxWorkforceRouter = router({
  readiness: adminProcedure.query(() => {
    const hubspot = describeHubspotEnv();
    return {
      hubspotConfigured: hubspot.configured,
      hubspotBaseUrl: hubspot.baseUrl,
      ticketPipeline: "Support Pipeline",
      supportedStages: ["New", "Waiting on contact", "Waiting on us", "Closed"],
      liveTicketSync: false,
      inboundConversationSync: false,
      outboundRepliesEnabled: false,
      automationMode: "draft_only" as const,
      nextRequirements: [
        ...(hubspot.configured ? [] : ["HubSpot Private App Token konfigurieren"]),
        "Ticket- und Conversations-Scopes live prüfen",
        "Persistente Idempotenz- und Audit-Ledger integrieren",
        "Echten Inbox-Webhook oder Poller mit Signaturprüfung anbinden",
      ],
    };
  }),
  liveInboxSnapshot: adminProcedure.query(() => getCxHubspotSnapshot()),
  caseQueue: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()).query(({ input }) => listCxCases(input?.limit ?? 50)),
  qualityEventQueue: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()).query(({ input }) => listCxQualityEvents(input?.limit ?? 50)),
  previewTriage: adminProcedure.input(z.object({
    subject: z.string().max(300).optional(),
    message: z.string().min(3).max(12000),
    productInterest: z.string().max(100).optional(),
    purchaseIntent: z.string().max(100).optional(),
  })).mutation(({ input }) => triageWithQualityGovernance(input)),
  recordTriage: adminProcedure.input(z.object({
    subject: z.string().max(300).optional(),
    message: z.string().min(3).max(12000),
    productInterest: z.string().max(100).optional(),
    purchaseIntent: z.string().max(100).optional(),
    externalReference: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  })).mutation(async ({ input }) => {
    const { externalReference, ...triageInput } = input;
    const { triage, qualityGovernance } = triageWithQualityGovernance(triageInput);
    const saved = await saveCxCase({ source: "admin_preview", externalReference, triage, qualityGovernance });
    return { saved: true as const, case: saved, qualityGovernance: saved.qualityGovernance, customerMessageStored: false as const };
  }),
  batchPreview: adminProcedure.input(z.object({
    requests: z.array(z.object({
      subject: z.string().max(300).optional(),
      message: z.string().min(3).max(12000),
      productInterest: z.string().max(100).optional(),
      purchaseIntent: z.string().max(100).optional(),
    })).min(1).max(50),
  })).mutation(({ input }) => ({
    items: input.requests.map((request, index) => ({
      index,
      ...triageWithQualityGovernance(request),
    })),
    source: "admin_supplied_preview_only" as const,
    noHubspotRecordsWritten: true as const,
  })),
});
