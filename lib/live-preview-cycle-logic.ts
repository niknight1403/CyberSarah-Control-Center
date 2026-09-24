/**
 * Sprint 284 — Live-Preview-Zyklus Chat↔Preview: Pure View-/Zustandslogik.
 *
 * Verwaltet den Zustand des Vorschau-Zyklus zwischen Chat-Interaktionen und
 * der Preview-Laufzeit ohne Zustandsverlust. Reines, deterministisches Modul.
 */

export type PreviewCycleState = "idle" | "building" | "updating" | "ready" | "error" | "offline";

export interface PreviewCycleHistoryEntry {
  timestamp: number;
  status: PreviewCycleState;
  message: string;
}

export interface LivePreviewSession {
  id: string;
  activeUrl: string | null;
  lastUpdatedMs: number;
  status: PreviewCycleState;
  buildOutput: string | null;
  chatSessionId: string | null;
  version: number;
  history: PreviewCycleHistoryEntry[];
}

export const PREVIEW_CYCLE_LABELS: Record<PreviewCycleState, string> = {
  idle: "Bereit für Vorschau",
  building: "Build läuft …",
  updating: "Vorschau wird aktualisiert …",
  ready: "Live-Vorschau aktiv",
  error: "Vorschau-Fehler",
  offline: "Vorschau offline",
};

export function formatPreviewCycleStatusLabel(status: PreviewCycleState): string {
  return PREVIEW_CYCLE_LABELS[status] ?? "Status unbekannt";
}

export function getPreviewCycleBadgeTone(status: PreviewCycleState): "ready" | "warning" | "neutral" {
  switch (status) {
    case "ready":
      return "ready";
    case "building":
    case "updating":
      return "neutral";
    case "error":
    case "offline":
      return "warning";
    default:
      return "neutral";
  }
}

export function createPreviewSession(params?: {
  chatSessionId?: string;
  initialUrl?: string;
  nowMs?: number;
}): LivePreviewSession {
  const now = params?.nowMs ?? Date.now();
  const id = `prev-${now.toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const initialStatus: PreviewCycleState = params?.initialUrl ? "ready" : "idle";

  return {
    id,
    activeUrl: params?.initialUrl ?? null,
    lastUpdatedMs: now,
    status: initialStatus,
    buildOutput: null,
    chatSessionId: params?.chatSessionId ?? null,
    version: 1,
    history: [
      {
        timestamp: now,
        status: initialStatus,
        message: params?.initialUrl ? `Vorschau-Sitzung mit URL ${params.initialUrl} gestartet.` : "Neue Vorschau-Sitzung initialisiert.",
      },
    ],
  };
}

export function transitionPreviewState(
  session: LivePreviewSession,
  newStatus: PreviewCycleState,
  details?: {
    url?: string;
    buildOutput?: string;
    logMessage?: string;
  },
  nowMs?: number
): LivePreviewSession {
  const now = nowMs ?? Date.now();
  const updatedUrl = details?.url !== undefined ? details.url : session.activeUrl;
  const updatedOutput = details?.buildOutput !== undefined ? details.buildOutput : session.buildOutput;
  const logMsg = details?.logMessage ?? `Zustandswechsel zu '${formatPreviewCycleStatusLabel(newStatus)}'.`;

  const newHistoryEntry: PreviewCycleHistoryEntry = {
    timestamp: now,
    status: newStatus,
    message: logMsg,
  };

  return {
    ...session,
    activeUrl: updatedUrl,
    buildOutput: updatedOutput,
    status: newStatus,
    lastUpdatedMs: now,
    version: session.version + 1,
    history: [newHistoryEntry, ...session.history].slice(0, 50),
  };
}

export function syncChatWithPreviewState(
  chatState: { sessionId: string; isAgentTyping: boolean },
  previewSession: LivePreviewSession
): {
  previewActive: boolean;
  statusBadge: string;
  statusTone: "ready" | "warning" | "neutral";
  summary: string;
} {
  const isCurrentChat = previewSession.chatSessionId === chatState.sessionId;
  const previewActive = Boolean(previewSession.activeUrl) && previewSession.status !== "offline";

  let statusBadge = formatPreviewCycleStatusLabel(previewSession.status);
  let statusTone = getPreviewCycleBadgeTone(previewSession.status);

  if (chatState.isAgentTyping && (previewSession.status === "ready" || previewSession.status === "idle")) {
    statusBadge = "Build wird vorbereitet …";
    statusTone = "neutral";
  }

  const summary = !isCurrentChat
    ? "Vorschau stammt aus einer früheren Chat-Sitzung."
    : previewSession.status === "ready"
      ? `Live-Vorschau aktiv unter ${previewSession.activeUrl}`
      : previewSession.status === "error"
        ? `Fehler in Vorschau: ${previewSession.buildOutput || "Keine Fehlerdetails"}`
        : `Vorschau-Status: ${statusBadge}`;

  return {
    previewActive,
    statusBadge,
    statusTone,
    summary,
  };
}

export function serializePreviewSession(session: LivePreviewSession): string {
  return JSON.stringify(session);
}

export function restorePreviewSession(serialized: string | null | undefined): LivePreviewSession | null {
  if (!serialized || !serialized.trim()) return null;
  try {
    const parsed = JSON.parse(serialized);
    if (parsed && typeof parsed === "object" && typeof parsed.id === "string" && typeof parsed.status === "string") {
      return parsed as LivePreviewSession;
    }
    return null;
  } catch {
    return null;
  }
}
