/**
 * Sprint 71 — Superagent-Kontext (Chat-Verknuepfung) — reine Logik.
 *
 * Der Chat ("Superagent") erhaelt fuer komplexe Entwicklungsauftraege einen
 * Live-Briefing-Kontext: App-Status, letzte Laufzeitfehler, Workspace- und
 * Preview-Zustand sowie die aktuelle Modell-Route. Damit koennen System-Audits
 * und Entwicklungsauftraege unmittelbar im Chat-Fenster mit echten Daten
 * beantwortet werden — der Chat ist mit Workspace, Agent, Vorschau und den
 * Entwicklungs-Skills verknuepft.
 */

export type SuperagentRuntimeSnapshot = {
  state: string;
  uptimeSeconds: number;
  activeUrl?: string | null;
  latencyMs?: number | null;
};

export type SuperagentWorkspaceSnapshot = {
  connected: boolean;
  repositoryUrl?: string | null;
  branch?: string | null;
  lastSyncAt?: string | null;
};

export type SuperagentBriefInput = {
  role: string | null | undefined;
  runtime: SuperagentRuntimeSnapshot | null;
  workspace: SuperagentWorkspaceSnapshot | null;
  recentErrors?: string[];
  routeProvider?: string | null;
  availableSkills?: readonly string[];
  now?: Date;
};

/** Max. Zeilen Fehler-Log im Briefing (Kontextfenster schonen). */
export const BRIEF_MAX_ERRORS = 5;

export function buildSuperagentBrief(input: SuperagentBriefInput): string {
  const now = (input.now ?? new Date()).toISOString();
  const lines: string[] = [];
  lines.push(`[Superagent-Briefing ${now}]`);
  lines.push(
    "Du arbeitest als autonomer Entwicklungs-Superagent im CyberSarah Control Center. Nutze die folgenden Live-Systemdaten als verbindlichen Kontext:",
  );

  const runtime = input.runtime;
  lines.push(
    `- App-Status: ${runtime?.state ?? "unbekannt"}${runtime?.uptimeSeconds != null ? ` (Uptime ${Math.round(runtime.uptimeSeconds / 60)} min)` : ""}${runtime?.latencyMs != null ? `, Latenz ${runtime.latencyMs} ms` : ""}${runtime?.activeUrl ? `, erreichbar unter ${runtime.activeUrl}` : ""}`,
  );

  const workspace = input.workspace;
  lines.push(
    workspace?.connected
      ? `- Workspace: verbunden${workspace.repositoryUrl ? ` mit ${workspace.repositoryUrl}${workspace.branch ? ` (Branch ${workspace.branch})` : ""}` : ""}`
      : "- Workspace: nicht verbunden — weise den Nutzer bei Bedarf auf die Workspace-Einrichtung hin.",
  );

  const errors = (input.recentErrors ?? []).filter(Boolean).slice(0, BRIEF_MAX_ERRORS);
  lines.push(
    errors.length > 0
      ? `- Letzte Laufzeitfehler (behandle sie im Auftrag, falls relevant):\n${errors.map((error) => `  · ${error.slice(0, 300)}`).join("\n")}`
      : "- Laufzeitfehler: keine in den letzten Log-Zeilen.",
  );

  if (input.availableSkills && input.availableSkills.length > 0) {
    lines.push(`- Aktive Entwicklungs-Skills: ${input.availableSkills.join(", ")}`);
  }
  if (input.routeProvider) {
    lines.push(`- Modell-Route: Dieser Auftrag läuft über "${input.routeProvider}" (autonomer Router mit Fallback).`);
  }
  lines.push("- Beantworte präzise, plane große Änderungen in Schritten und schlage konkrete Dateien/Tests vor.");
  return lines.join("\n");
}

/** Welche Prompts den Superagent-Briefing-Kontext aktivieren (Audit/Dev-Auftraege). */
export function shouldAttachSuperagentBrief(
  userMessage: string,
  role: string | null | undefined,
): boolean {
  if (role !== "admin") return false;
  return /\b(audit|system|status|fehler|logs?|sprint|architektur|migration|refactor|deploy|workspace|preview)\b/i.test(
    userMessage ?? "",
  );
}
