/**
 * Sprint 156 — Dashboard-View-Model (rein, testbar).
 *
 * Mapped echte Backend-Daten auf das Anzeige-Modell. Zentrale Ehrlichkeits-
 * Regeln aus dem Implementierungsauftrag:
 *  - Keine erfundenen Live-Daten (kein Fake-Uptime-Wert, kein Fake-247).
 *  - Administrator-Badge nur bei serverseitig bestaetigter Admin-Rolle.
 *  - Kein „LIVE · AKTIV", wenn kein aktiver Backend-Agent existiert.
 *  - Prozentveraenderung nur bei realen Vergleichsdaten, sonst null.
 *  - Keine Provider-Keys im ViewModel (nur Namen/Status).
 */

export type SuperAgentStatus =
  | "active"
  | "ready"
  | "paused"
  | "unconfigured"
  | "offline"
  | "error";

export const superAgentStatusCopy: Record<SuperAgentStatus, string> = {
  active: "LIVE · AKTIV",
  ready: "BEREIT",
  paused: "PAUSIERT",
  unconfigured: "NICHT KONFIGURIERT",
  offline: "OFFLINE",
  error: "FEHLER",
};

export type SystemStatus = "healthy" | "checking" | "degraded" | "offline" | "unknown";

export const systemStatusCopy: Record<SystemStatus, string> = {
  healthy: "Alle Systeme aktiv",
  checking: "Prüfung läuft",
  degraded: "Eingeschränkt",
  offline: "Nicht bereit",
  unknown: "Status nicht verfügbar",
};

export type ChatStatus = "ready" | "checking" | "unavailable" | "unknown";

export const chatStatusCopy: Record<ChatStatus, string> = {
  ready: "Bereit für deine Fragen",
  checking: "Provider wird geprüft",
  unavailable: "Kein Provider verfügbar",
  unknown: "Status unbekannt",
};

export type WorkspaceStatus = "ready" | "checking" | "unavailable" | "unknown";

export const workspaceStatusCopy: Record<WorkspaceStatus, string> = {
  ready: "Service erreichbar",
  checking: "Prüfung läuft",
  unavailable: "Nicht verbunden",
  unknown: "Status unbekannt",
};

export type DashboardViewModel = {
  user: {
    name: string;
    avatarUrl?: string;
    role: "admin" | "user" | "unknown";
    online: boolean;
    sessionState: "online" | "anmeldung-erforderlich" | "sitzung-abgelaufen";
  };
  kpis: {
    agents: number | null;
    providers: number | null;
    uptime: number | null;
  };
  system: {
    status: SystemStatus;
    detail?: string;
  };
  chat: {
    status: ChatStatus;
    provider?: string;
    model?: string;
  };
  workspace: {
    status: WorkspaceStatus;
    count: number | null;
  };
  activity: {
    count: number | null;
    changePercent: number | null;
    points: number[];
  };
  superAgent: {
    status: SuperAgentStatus;
    name: string;
    detail: string;
  };
};

/** Begruessungsname: echter Nutzername, sonst Fallback „Sarah". */
export function greetName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Sarah";
}

/**
 * Rollen-Badge NUR aus serverseitig bestaetigter Rolle. Ohne bestaetigte
 * Rolle wird niemals „Administrator" angezeigt.
 */
export function roleBadge(role: string | null | undefined): "Administrator" | "Benutzer" | null {
  const normalized = (role ?? "").trim().toLowerCase();
  if (normalized === "admin") return "Administrator";
  if (normalized === "user") return "Benutzer";
  return null;
}

export function sessionState(
  authenticated: boolean,
  sessionExpired: boolean,
): "online" | "anmeldung-erforderlich" | "sitzung-abgelaufen" {
  if (sessionExpired) return "sitzung-abgelaufen";
  return authenticated ? "online" : "anmeldung-erforderlich";
}

export const sessionStateCopy: Record<DashboardViewModel["user"]["sessionState"], string> = {
  online: "Online",
  "anmeldung-erforderlich": "Anmeldung erforderlich",
  "sitzung-abgelaufen": "Sitzung abgelaufen",
};

/**
 * Uptime aus echter Server-Laufzeit (Millisekunden). Unbekannt bleibt null —
 * es wird KEIN kuenstlicher Wert wie „99,9%" angezeigt.
 */
export function formatUptime(uptimeMs: number | null | undefined): string {
  if (typeof uptimeMs !== "number" || !Number.isFinite(uptimeMs) || uptimeMs < 0) return "—";
  const totalMinutes = Math.floor(uptimeMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/** Systemstatus aus echten Backend-Signalen (kein https-Nachahmen). */
export function mapSystemStatus(input: {
  reachable: boolean;
  checking: boolean;
  hasRecentErrors: boolean;
  workspaceReachable: boolean | null;
}): { status: SystemStatus; detail: string } {
  if (input.checking) return { status: "checking", detail: systemStatusCopy.checking };
  if (!input.reachable) return { status: "offline", detail: "Backend nicht erreichbar" };
  if (input.hasRecentErrors || input.workspaceReachable === false) {
    return { status: "degraded", detail: "Datenbank oder Workspace nicht bereit" };
  }
  return { status: "healthy", detail: systemStatusCopy.healthy };
}

/**
 * Chat-/Provider-Status. Ein Providername wird nur angezeigt, wenn er
 * serverseitig als aktiv gemeldet wurde — niemals geraten.
 */
export function mapChatStatus(input: {
  providersConfigured: number | null;
  activeProvider?: string | null;
  activeModel?: string | null;
}): { status: ChatStatus; provider?: string; model?: string } {
  if (input.providersConfigured === null) return { status: "unknown" };
  if ((input.providersConfigured ?? 0) === 0) return { status: "unavailable" };
  if (!input.activeProvider) return { status: "checking" };
  return {
    status: "ready",
    provider: input.activeProvider,
    model: input.activeModel ?? undefined,
  };
}

/**
 * Workspace-Status: count ist die echte Anzahl erreichbarer Workspaces —
 * null, wenn unbekannt (keine erfundenen Projektzahlen).
 */
export function mapWorkspaceStatus(input: {
  configured: boolean;
  reachable: boolean | null;
  count: number | null;
}): { status: WorkspaceStatus; count: number | null } {
  if (!input.configured) return { status: "unavailable", count: 0 };
  if (input.reachable === null) return { status: "unknown", count: null };
  if (!input.reachable) return { status: "unavailable", count: null };
  return { status: "ready", count: input.count };
}

/**
 * Superagent-Status — streng ehrlich:
 *  - Backend nicht erreichbar => offline (niemals „LIVE · AKTIV").
 *  - Keine Agenten => unconfigured.
 *  - Mind. ein Agent mit Status „aktiv" und frueher Aktivitaet => active.
 *  - Nur pausierte/archivierte Agenten => paused.
 *  - Fehler beim Laden => error.
 */
export function mapSuperAgentStatus(input: {
  reachable: boolean | null;
  loadError: boolean;
  agents: { status: string; lastActiveAt: string }[];
  now?: number;
}): { status: SuperAgentStatus; name: string; detail: string } {
  if (input.reachable === false) {
    return { status: "offline", name: "Superagent", detail: "Backend nicht erreichbar" };
  }
  if (input.loadError) {
    return { status: "error", name: "Superagent", detail: "Status konnte nicht geladen werden" };
  }
  if (input.agents.length === 0) {
    return { status: "unconfigured", name: "Superagent", detail: "Noch kein Superagent eingerichtet" };
  }
  const now = input.now ?? Date.now();
  const activeWindowMs = 24 * 60 * 60 * 1000;
  const hasActive = input.agents.some(
    (agent) => agent.status === "aktiv" && now - Date.parse(agent.lastActiveAt) < activeWindowMs,
  );
  if (hasActive) {
    return { status: "active", name: "Superagent", detail: "Autonomer KI-Assistent" };
  }
  const hasPaused = input.agents.some((agent) => agent.status === "pausiert" || agent.status === "aktiv");
  if (hasPaused) {
    return { status: "paused", name: "Superagent", detail: "Agenten vorhanden, keine aktuelle Aktivität" };
  }
  return { status: "ready", name: "Superagent", detail: "Bereit — Start per Nutzeraktion" };
}

/**
 * Aktivitaet der letzten 24 h: nur echte Zaehlwerte; changePercent ausschliess-
 * lich bei realen Vergleichsdaten (previousCount !== null), sonst null.
 * Sparkline-Punkte nur aus echten Messreihen — nie generiert.
 */
export function mapActivity(input: {
  countLast24h: number | null;
  previousCount: number | null;
  points?: number[] | null;
}): { count: number | null; changePercent: number | null; points: number[] } {
  const points = Array.isArray(input.points)
    ? input.points.filter((point) => Number.isFinite(point)).slice(-24)
    : [];
  let changePercent: number | null = null;
  if (typeof input.countLast24h === "number" && typeof input.previousCount === "number" && input.previousCount > 0) {
    changePercent = Math.round(((input.countLast24h - input.previousCount) / input.previousCount) * 1000) / 10;
  }
  return { count: input.countLast24h, changePercent, points };
}

/** Sparkline-Geometrie: normalisiert Punkte auf 0..1 (leer => leere Flaeche). */
export function sparklineGeometry(points: number[]): { x: number; y: number }[] {
  if (points.length < 2) return [];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min;
  return points.map((point, index) => ({
    x: index / (points.length - 1),
    y: span === 0 ? 0.5 : (point - min) / span,
  }));
}
