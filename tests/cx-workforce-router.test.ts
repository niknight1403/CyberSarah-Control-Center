import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  describeHubspotEnv: vi.fn(),
  getCxHubspotSnapshot: vi.fn(),
  listCxCases: vi.fn(),
  saveCxCase: vi.fn(),
}));

vi.mock("../server/integrations/hubspot", () => ({
  describeHubspotEnv: mocks.describeHubspotEnv,
}));
vi.mock("../server/cx-workforce-hubspot", () => ({
  getCxHubspotSnapshot: mocks.getCxHubspotSnapshot,
}));
vi.mock("../server/cx-workforce-store", () => ({
  listCxCases: mocks.listCxCases,
  saveCxCase: mocks.saveCxCase,
}));

import { cxWorkforceRouter } from "../server/cx-workforce-router";

const adminContext = {
  req: {} as never,
  res: {} as never,
  user: { id: 7, role: "admin" } as never,
};
const userContext = {
  req: {} as never,
  res: {} as never,
  user: { id: 8, role: "user" } as never,
};
const anonymousContext = { req: {} as never, res: {} as never, user: null };

describe("CX workforce router access and operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.describeHubspotEnv.mockReturnValue({
      configured: false,
      baseUrl: "https://api.hubapi.com",
      problem: "HubSpot nicht konfiguriert",
    });
    mocks.getCxHubspotSnapshot.mockResolvedValue({ configured: false, writesPerformed: false });
    mocks.listCxCases.mockResolvedValue([]);
    mocks.saveCxCase.mockImplementation(async (input) => ({
      id: "a".repeat(32),
      source: input.source,
      externalReference: input.externalReference ?? null,
      status: input.triage.humanReviewRequired ? "needs_review" : "draft_ready",
      triage: input.triage,
      createdAt: "2026-11-21T00:00:00.000Z",
    }));
  });

  it("restricts every procedure to administrators", async () => {
    const userCaller = cxWorkforceRouter.createCaller(userContext as never);
    const anonymousCaller = cxWorkforceRouter.createCaller(anonymousContext as never);

    await expect(userCaller.readiness()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(anonymousCaller.readiness()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(userCaller.previewTriage({ message: "Hallo, eine Frage." }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.describeHubspotEnv).not.toHaveBeenCalled();
  });

  it("reports conservative readiness requirements when HubSpot is unconfigured", async () => {
    const caller = cxWorkforceRouter.createCaller(adminContext);
    const result = await caller.readiness();

    expect(result.hubspotConfigured).toBe(false);
    expect(result.liveTicketSync).toBe(false);
    expect(result.inboundConversationSync).toBe(false);
    expect(result.outboundRepliesEnabled).toBe(false);
    expect(result.automationMode).toBe("draft_only");
    expect(result.nextRequirements).toContain("HubSpot Private App Token konfigurieren");
  });

  it("omits the token requirement when HubSpot is configured but retains operational gates", async () => {
    mocks.describeHubspotEnv.mockReturnValue({
      configured: true,
      baseUrl: "https://api-eu1.hubapi.com",
    });
    const result = await cxWorkforceRouter.createCaller(adminContext).readiness();

    expect(result.hubspotConfigured).toBe(true);
    expect(result.nextRequirements).not.toContain("HubSpot Private App Token konfigurieren");
    expect(result.nextRequirements).toContain("Echten Inbox-Webhook oder Poller mit Signaturprüfung anbinden");
  });

  it("returns the read-only HubSpot snapshot", async () => {
    const snapshot = { configured: true, ticketRead: "connected", writesPerformed: false };
    mocks.getCxHubspotSnapshot.mockResolvedValue(snapshot);
    await expect(cxWorkforceRouter.createCaller(adminContext).liveInboxSnapshot()).resolves.toEqual(snapshot);
    expect(mocks.getCxHubspotSnapshot).toHaveBeenCalledOnce();
  });

  it("validates and forwards the bounded case queue limit", async () => {
    const caller = cxWorkforceRouter.createCaller(adminContext);
    await caller.caseQueue({ limit: 12 });
    expect(mocks.listCxCases).toHaveBeenCalledWith(12);
    await caller.caseQueue();
    expect(mocks.listCxCases).toHaveBeenLastCalledWith(50);
    await expect(caller.caseQueue({ limit: 0 })).rejects.toThrow();
    await expect(caller.caseQueue({ limit: 101 })).rejects.toThrow();
  });

  it("previews triage without persisting a case", async () => {
    const result = await cxWorkforceRouter.createCaller(adminContext).previewTriage({
      message: "Ich möchte eine Rückerstattung.",
    });

    expect(result.category).toBe("refund");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.automationMode).toBe("draft_only");
    expect(mocks.saveCxCase).not.toHaveBeenCalled();
  });

  it("records a minimized admin preview with an opaque external reference", async () => {
    const result = await cxWorkforceRouter.createCaller(adminContext).recordTriage({
      subject: "Rückfrage",
      message: "Ich möchte eine Rückerstattung.",
      externalReference: "ticket_123",
    });

    expect(result.saved).toBe(true);
    expect(result.customerMessageStored).toBe(false);
    expect(result.case.externalReference).toBe("ticket_123");
    expect(mocks.saveCxCase).toHaveBeenCalledWith(expect.objectContaining({
      source: "admin_preview",
      externalReference: "ticket_123",
      triage: expect.objectContaining({ category: "refund", humanReviewRequired: true }),
    }));
    expect(JSON.stringify(mocks.saveCxCase.mock.calls)).not.toContain("Rückfrage");
  });

  it("rejects non-opaque external references before attempting persistence", async () => {
    await expect(cxWorkforceRouter.createCaller(adminContext).recordTriage({
      message: "Bitte helfen Sie mir.",
      externalReference: "customer@example.com",
    })).rejects.toThrow();
    expect(mocks.saveCxCase).not.toHaveBeenCalled();
  });

  it("previews batches in order and never writes HubSpot or queue records", async () => {
    const result = await cxWorkforceRouter.createCaller(adminContext).batchPreview({
      requests: [
        { message: "Mein Konto wurde gehackt." },
        { message: "Die App stürzt ab." },
      ],
    });

    expect(result.items.map((item) => item.index)).toEqual([0, 1]);
    expect(result.items.map((item) => item.triage.category)).toEqual(["security", "technical"]);
    expect(result.source).toBe("admin_supplied_preview_only");
    expect(result.noHubspotRecordsWritten).toBe(true);
    expect(mocks.saveCxCase).not.toHaveBeenCalled();
    await expect(cxWorkforceRouter.createCaller(adminContext).batchPreview({ requests: [] }))
      .rejects.toThrow();
    await expect(cxWorkforceRouter.createCaller(adminContext).batchPreview({
      requests: Array.from({ length: 51 }, () => ({ message: "Kurze Frage." })),
    })).rejects.toThrow();
  });
});
