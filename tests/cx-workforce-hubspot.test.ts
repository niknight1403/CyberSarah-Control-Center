import { afterEach, describe, expect, it, vi } from "vitest";
import { getCxHubspotSnapshot } from "@/server/cx-workforce-hubspot";
import { describeHubspotEnv, resolveHubspotToken } from "@/server/integrations/hubspot";

afterEach(() => vi.unstubAllGlobals());

describe("CX HubSpot read-only snapshot", () => {
  it("reports an unconfigured connection without network access", async () => {
    const result = await getCxHubspotSnapshot({});
    expect(result.configured).toBe(false);
    expect(result.ticketRead).toBe("not_configured");
    expect(result.conversationRead).toBe("not_configured");
    expect(result.writesPerformed).toBe(false);
  });

  it("reads ticket and conversation metadata without exposing message bodies or subjects", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/crm/v3/objects/tickets/search")) {
        return new Response(JSON.stringify({
          total: 1,
          results: [{ id: "42", properties: {
            subject: "Example private subject",
            hs_pipeline_stage: "1",
            hs_ticket_priority: "HIGH",
            hs_ticket_category: "TECHNICAL",
            createdate: "2026-11-18T10:00:00.000Z",
          }}],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        results: [{ id: "thread-1", status: "OPEN", inboxId: "inbox-1", messageText: "Example private body" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = { HUBSPOT_PRIVATE_APP_TOKEN: "pat-eu1-" + "123456789012345678901234" };
    expect(resolveHubspotToken(env)).toBe(env.HUBSPOT_PRIVATE_APP_TOKEN);
    expect(describeHubspotEnv(env)).toMatchObject({
      configured: true,
      validFormat: true,
      variable: "HUBSPOT_PRIVATE_APP_TOKEN",
      kind: "private_app",
      baseUrl: "https://api-eu1.hubapi.com",
      problem: null,
    });
    const result = await getCxHubspotSnapshot(env);
    expect(result.ticketRead).toBe("connected");
    expect(result.conversationRead).toBe("connected");
    expect(result.tickets.total).toBe(1);
    expect(result.tickets.sampleSize).toBe(1);
    expect(result.conversations.active).toBe(1);
    expect(JSON.stringify(result)).not.toContain("Example private body");
    expect(JSON.stringify(result)).not.toContain("Example private subject");
    expect(result.writesPerformed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports partial failure when one HubSpot API scope is missing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/tickets/search")) {
        return new Response(JSON.stringify({ total: 0, results: [] }), { status: 200 });
      }
      return new Response("missing conversations scope", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = { HUBSPOT_PRIVATE_APP_TOKEN: "pat-eu1-" + "123456789012345678901234" };
    expect(resolveHubspotToken(env)).toBe(env.HUBSPOT_PRIVATE_APP_TOKEN);
    expect(describeHubspotEnv(env)).toMatchObject({
      configured: true,
      validFormat: true,
      variable: "HUBSPOT_PRIVATE_APP_TOKEN",
      kind: "private_app",
      baseUrl: "https://api-eu1.hubapi.com",
      problem: null,
    });
    const result = await getCxHubspotSnapshot(env);
    expect(result.ticketRead).toBe("connected");
    expect(result.conversationRead).toBe("failed");
    expect(result.problems).toHaveLength(1);
    expect(result.writesPerformed).toBe(false);
  });
});
