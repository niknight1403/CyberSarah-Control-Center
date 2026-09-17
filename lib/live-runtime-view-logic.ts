import type { LiveConnectionState, LiveRuntimeStatus } from "@/lib/live-runtime-client";
import { RUNTIME_STATE_LABELS, type RuntimeState } from "@/lib/live-status-logic";

/**
 * Sprint 111 — View-Logik fuer das Live-Runtime-Preview-Panel.
 *
 * Rein deterministische Ableitungen (Badges, Formatierungen, ehrliche
 * Zustaende) fuer den Preview-Tab. Die Anbindung (Hooks, SSE/Polling)
 * bleibt in lib/live-runtime-client.ts, diese Logik hier ist die
 * testbare Schicht dazwischen.
 */

export type BadgeTone = "ready" | "warning" | "neutral";

export interface Badge {
  label: string;
  tone: BadgeTone;
}

export interface PreviewViewModel {
  stateBadge: Badge;
  connectionBadge: Badge;
  headline: string;
  description: string;
  urlLabel: string;
  uptimeLabel: string;
  pingLabel: string;
  logCountLabel: string;
  isLive: boolean;
  showClearButton: boolean;
}

/** Zustands-Badge der Laufzeitumgebung aus dem Server-Status. */
export function getRuntimeStateBadge(state: RuntimeState | null | undefined): Badge {
  if (!state) return { label: "Status unbekannt", tone: "neutral" };
  const label = RUNTIME_STATE_LABELS[state] ?? "Status unbekannt";
  if (state === "running") return { label, tone: "ready" };
  if (state === "error" || state === "stopped") return { label, tone: "warning" };
  return { label, tone: "neutral" };
}

/** Verbindungs-Badge: Web-Stream (SSE), Nativ-Polling oder Offline. */
export function getConnectionBadge(connection: LiveConnectionState): Badge {
  switch (connection) {
    case "streaming":
      return { label: "Live-Stream (SSE)", tone: "ready" };
    case "polling":
      return { label: "Live-Polling", tone: "ready" };
    case "offline":
      return { label: "Offline", tone: "warning" };
    default:
      return { label: "Verbinde …", tone: "neutral" };
  }
}

/** Uptime als kompakte Menschenlesbarkeit (Minuten/Stunden). */
export function formatUptimeLabel(uptimeMs: number | null | undefined): string {
  if (typeof uptimeMs !== "number" || !Number.isFinite(uptimeMs) || uptimeMs < 0) return "–";
  const totalMinutes = Math.floor(uptimeMs / 60_000);
  if (totalMinutes < 1) return "< 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${String(minutes).padStart(2, "0")} min` : `${hours} h`;
}

/** Latenz-Anzeige in Millisekunden; ohne Messung ehrlich "–". */
export function formatPingLabel(pingMs: number | null | undefined): string {
  if (typeof pingMs !== "number" || !Number.isFinite(pingMs) || pingMs < 0) return "–";
  return `${Math.round(pingMs)} ms`;
}

export interface PreviewViewModelInput {
  status: LiveRuntimeStatus | null;
  connection: LiveConnectionState;
  previewUrl: string | null;
  isAdmin: boolean;
  logEntryCount: number;
}

/**
 * Konsolidiertes View-Modell des Preview-Tabs mit ehrlichen
 * Nicht-Verfügbar-Zustaenden statt erfundener Daten.
 */
export function buildPreviewViewModel(input: PreviewViewModelInput): PreviewViewModel {
  const { status, connection, previewUrl, isAdmin, logEntryCount } = input;
  const stateBadge = getRuntimeStateBadge(status?.state ?? null);
  const connectionBadge = getConnectionBadge(connection);
  const isLive = connection === "streaming" || connection === "polling";

  const headline = status
    ? `${stateBadge.label} — ${status.activeUrl || "keine aktive URL"}`
    : "Runtime-Status wird geladen …";
  const description = status
    ? isLive
      ? "Live-Protokoll der Server-Laufzeit. Ereignisse erscheinen ohne manuelle Aktualisierung."
      : "Keine Live-Verbindung zur Laufzeit verfügbar. Der Status wird regelmäßig neu geprüft."
    : "Der Runtime-Status konnte noch nicht geladen werden. Sobald der Server erreichbar ist, erscheinen hier Status und Protokoll.";

  return {
    stateBadge,
    connectionBadge,
    headline,
    description,
    urlLabel: previewUrl ?? "Keine Preview-URL",
    uptimeLabel: formatUptimeLabel(status?.serverUptimeMs ?? null),
    pingLabel: formatPingLabel(status?.pingMs ?? null),
    logCountLabel: logEntryCount > 0 ? `${logEntryCount} Ereignis(se)` : "Keine Ereignisse",
    isLive,
    showClearButton: isAdmin && logEntryCount > 0,
  };
}

/** Ziel-URL der Vorschau: Workspace-Preview vor API-Basis (Web-Export). */
export function resolvePreviewTargetUrl(workspaceUrl: string | undefined | null, apiBaseUrl: string): string {
  const trimmed = (workspaceUrl ?? "").trim().replace(/\/+$/, "");
  return trimmed ? `${trimmed}/preview` : apiBaseUrl;
}

/**
 * Sprint 148 — View-Modell fuer die Live-Status-Karte im Admin-Screen.
 *
 * Konsolidiert den Runtime-Status (Backend-Zustand, Uptime, Latenz) und
 * die gefilterten Server-Logs (Fehler/Warnungen) zu einem ehrlichen,
 * deterministischen View-Modell. Wie immer: keine erfundenen Daten —
 * fehlende Messungen werden klar als "unbekannt" ausgewiesen.
 */

export interface AdminLiveStatusLogLine {
  level: string;
  source: string;
  message: string;
  atMs: number;
}

export interface AdminLiveStatusViewModel {
  stateBadge: Badge;
  isHealthy: boolean;
  statusLoaded: boolean;
  uptimeLabel: string;
  pingLabel: string;
  logCountLabel: string;
  errorCountLabel: string;
  /** Kurz-Zusammenfassung der letzten Fehler/Warnungen (max. 3, neueste zuerst). */
  recentIssueLines: AdminLiveStatusLogLine[];
  showClearButton: boolean;
  headline: string;
}

export interface AdminLiveStatusInput {
  status: (Pick<LiveRuntimeStatus, "state" | "serverUptimeMs" | "pingMs"> & { logCount?: number }) | null;
  /** Neu geschaetzte Fehler/Warn-Eintraege (beliebige Reihenfolge). */
  issueEntries?: AdminLiveStatusLogLine[];
  isAdmin: boolean;
}

export function buildAdminLiveStatusViewModel(input: AdminLiveStatusInput): AdminLiveStatusViewModel {
  const { status, isAdmin } = input;
  const stateBadge = getRuntimeStateBadge(status?.state ?? null);
  const isHealthy = status != null && status.state === "running";
  const statusLoaded = status != null;

  const issues = (input.issueEntries ?? [])
    .filter((entry) => entry.level === "error" || entry.level === "warn")
    .slice(-3)
    .reverse();

  const errorCount = issues.filter((entry) => entry.level === "error").length;
  const logCount = typeof status?.logCount === "number" ? status.logCount : 0;

  return {
    stateBadge,
    isHealthy,
    statusLoaded,
    uptimeLabel: formatUptimeLabel(status?.serverUptimeMs ?? null),
    pingLabel: formatPingLabel(status?.pingMs ?? null),
    logCountLabel: statusLoaded ? `${logCount} im Ringpuffer` : "unbekannt",
    errorCountLabel:
      errorCount > 0
        ? `${errorCount} Fehler (${issues.length} Ereignis(se))`
        : issues.length > 0
          ? `${issues.length} Warnung(en)`
          : "keine Fehler/Warnungen",
    recentIssueLines: issues,
    showClearButton: isAdmin && logCount > 0,
    headline: statusLoaded
      ? `Backend: ${stateBadge.label}`
      : "Backend-Status wird geladen …",
  };
}
