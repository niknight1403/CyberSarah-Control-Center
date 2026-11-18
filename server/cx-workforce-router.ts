import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { triageCxRequest } from "../lib/cx-workforce-logic";
import { describeHubspotEnv } from "./integrations/hubspot";
import { getCxHubspotSnapshot } from "./cx-workforce-hubspot";
import { listCxCases, saveCxCase } from "./cx-workforce-store";

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
  previewTriage: adminProcedure.input(z.object({
    subject: z.string().max(300).optional(),
    message: z.string().min(3).max(12000),
    productInterest: z.string().max(100).optional(),
    purchaseIntent: z.string().max(100).optional(),
  })).mutation(({ input }) => triageCxRequest(input)),
  recordTriage: adminProcedure.input(z.object({
    subject: z.string().max(300).optional(),
    message: z.string().min(3).max(12000),
    productInterest: z.string().max(100).optional(),
    purchaseIntent: z.string().max(100).optional(),
    externalReference: z.string().max(128).optional(),
  })).mutation(async ({ input }) => {
    const { externalReference, ...triageInput } = input;
    const triage = triageCxRequest(triageInput);
    const saved = await saveCxCase({ source: "admin_preview", externalReference, triage });
    return { saved: true as const, case: saved, customerMessageStored: false as const };
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
      triage: triageCxRequest(request),
    })),
    source: "admin_supplied_preview_only" as const,
    noHubspotRecordsWritten: true as const,
  })),
});
