import { createHubspotClient, describeHubspotEnv } from "./integrations/hubspot";

type HubSpotTicket = {
  id?: string;
  properties?: Record<string, string | null>;
};

type HubSpotThread = {
  id?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  inboxId?: string;
  assignedTo?: string;
};

function rows<T>(payload: unknown, keys: string[]): T[] {
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as T[];
  return [];
}

/**
 * Read-only HubSpot CX snapshot. Never returns message bodies or customer PII.
 * Ticket and Conversations API permissions are checked independently.
 */
export async function getCxHubspotSnapshot(env: Record<string, string | undefined> = process.env) {
  const config = describeHubspotEnv(env);
  if (!config.configured) {
    return {
      configured: false,
      baseUrl: config.baseUrl,
      ticketRead: "not_configured" as const,
      conversationRead: "not_configured" as const,
      tickets: { total: 0, openInSample: 0, sampleSize: 0, recent: [] as Array<Record<string, string | null>> },
      conversations: { totalReturned: 0, active: 0, recent: [] as Array<Record<string, string | null>> },
      problems: [config.problem ?? "HubSpot ist nicht konfiguriert."],
      writesPerformed: false as const,
    };
  }

  const client = createHubspotClient(env);
  if (!client) throw new Error("HubSpot-Konfiguration konnte nicht initialisiert werden.");

  const [ticketResult, conversationResult] = await Promise.allSettled([
    client.request<{ total?: number; results?: HubSpotTicket[] }>(
      "/crm/v3/objects/tickets/search",
      {
        method: "POST",
        body: {
          limit: 50,
          properties: ["subject", "hs_pipeline_stage", "hs_ticket_priority", "hs_ticket_category", "createdate", "hs_lastmodifieddate"],
          filterGroups: [],
          sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
        },
      },
    ),
    client.request<unknown>("/conversations/v3/conversations/threads?limit=50&sort=-last_message_timestamp"),
  ]);

  const problems: string[] = [];
  const ticketRows = ticketResult.status === "fulfilled"
    ? (Array.isArray(ticketResult.value.results) ? ticketResult.value.results : [])
    : [];
  const threadRows = conversationResult.status === "fulfilled"
    ? rows<HubSpotThread>(conversationResult.value, ["results", "threads"])
    : [];

  if (ticketResult.status === "rejected") {
    const error = ticketResult.reason;
    problems.push(`Ticket-Lesezugriff fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
  }
  if (conversationResult.status === "rejected") {
    const error = conversationResult.reason;
    problems.push(`Inbox-Lesezugriff fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
  }

  const recentTickets = ticketRows.slice(0, 10).map((ticket) => ({
    id: String(ticket.id ?? ""),
    subject: ticket.properties?.subject ?? null,
    stage: ticket.properties?.hs_pipeline_stage ?? null,
    priority: ticket.properties?.hs_ticket_priority ?? null,
    category: ticket.properties?.hs_ticket_category ?? null,
    createdAt: ticket.properties?.createdate ?? null,
  }));

  const recentConversations = threadRows.slice(0, 10).map((thread) => ({
    id: String(thread.id ?? ""),
    status: thread.status ?? null,
    inboxId: thread.inboxId ?? null,
    createdAt: thread.createdAt ?? null,
    updatedAt: thread.updatedAt ?? null,
  }));

  return {
    configured: true,
    baseUrl: config.baseUrl,
    ticketRead: ticketResult.status === "fulfilled" ? "connected" as const : "failed" as const,
    conversationRead: conversationResult.status === "fulfilled" ? "connected" as const : "failed" as const,
    tickets: {
      total: Number(ticketResult.status === "fulfilled" ? ticketResult.value.total ?? ticketRows.length : 0),
      sampleSize: ticketRows.length,
      recent: recentTickets,
    },
    conversations: {
      totalReturned: threadRows.length,
      active: threadRows.filter((thread) => String(thread.status ?? "").toLowerCase() !== "closed").length,
      recent: recentConversations,
    },
    problems,
    writesPerformed: false as const,
  };
}
