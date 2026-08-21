export type PersistedProposalPreview = {
  affectedFiles: string[];
  changes: Array<{ path: string; explanation: string }>;
};

export type DevelopmentChatHistoryMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  state?: "ready" | "applying" | "applied" | "error" | "restored";
  proposalPreview?: PersistedProposalPreview;
};

export const DEVELOPMENT_CHAT_HISTORY_KEY = "custom-ai-studio.development-chat.v1";
export const DEVELOPMENT_CHAT_HISTORY_LIMIT = 24;

function isRole(value: unknown): value is DevelopmentChatHistoryMessage["role"] {
  return value === "user" || value === "agent";
}

function cleanPreview(value: unknown): PersistedProposalPreview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { affectedFiles?: unknown; changes?: unknown };
  const affectedFiles = Array.isArray(candidate.affectedFiles)
    ? candidate.affectedFiles.filter((path): path is string => typeof path === "string").slice(0, 4)
    : [];
  const changes = Array.isArray(candidate.changes)
    ? candidate.changes
      .filter((change): change is { path: string; explanation: string } => Boolean(change) && typeof change === "object" && typeof (change as { path?: unknown }).path === "string" && typeof (change as { explanation?: unknown }).explanation === "string")
      .slice(0, 4)
      .map((change) => ({ path: change.path.slice(0, 500), explanation: change.explanation.slice(0, 600) }))
    : [];
  return affectedFiles.length || changes.length ? { affectedFiles, changes } : undefined;
}

type UnknownHistoryMessage = { id: unknown; role: unknown; content: unknown; state?: unknown; proposalPreview?: unknown };

function isHistoryMessage(value: unknown): value is UnknownHistoryMessage & { id: string; role: DevelopmentChatHistoryMessage["role"]; content: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as UnknownHistoryMessage;
  return typeof candidate.id === "string" && isRole(candidate.role) && typeof candidate.content === "string";
}

export function serializeDevelopmentChatHistory(messages: DevelopmentChatHistoryMessage[]): string {
  const bounded = messages.slice(-DEVELOPMENT_CHAT_HISTORY_LIMIT).map((message) => ({
    id: message.id.slice(0, 100),
    role: message.role,
    content: message.content.slice(0, 4_000),
    state: message.state === "applying" ? "ready" : message.state,
    proposalPreview: cleanPreview(message.proposalPreview),
  }));
  return JSON.stringify({ version: 1, messages: bounded });
}

export function parseDevelopmentChatHistory(raw: string | null): DevelopmentChatHistoryMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; messages?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) return [];
    return parsed.messages
      .filter(isHistoryMessage)
      .slice(-DEVELOPMENT_CHAT_HISTORY_LIMIT)
      .map((message) => ({
        id: message.id.slice(0, 100),
        role: message.role,
        content: message.content.slice(0, 4_000),
        state: message.proposalPreview ? "restored" : message.state === "applied" ? "applied" : undefined,
        proposalPreview: cleanPreview(message.proposalPreview),
      }));
  } catch {
    return [];
  }
}
