/**
 * Sprint 56 — Zentrale Betriebsuebersicht: aggregierte Statusbewertung.
 * Sprint 110 — Erweitert um PaaS-Betriebspfade (Render-Deploy, Neon-Postgres,
 * Uptime-Waechter), Warnstufen je Komponente (ok/Warnung/kritisch) mit
 * Zeitstempel und letztem Fehlerbild sowie Stufenwechsel-Erkennung fuer
 * Admin-Benachrichtigungen.
 *
 * Konsolidiert die Pruefzustaende der Betriebspfade (API-Health/-Ready,
 * Datenbank, Workspace-Service, Metriken) in ein Gesamtbild mit
 * priorisierten, handlungsfaehigen deutschen Empfehlungen. Reine Logik —
 * die Router-Anbindung (server/ops-router.ts) uebergibt nur Pruefdaten.
 */

export type CheckState = "unknown" | "ok" | "degraded" | "down";

export type CheckKind =
  | "apiHealth"
  | "apiReady"
  | "database"
  | "neonPostgres"
  | "workspace"
  | "renderDeploy"
  | "uptimeWatcher"
  | "metrics"
  | "chat"
  | "backup";

export interface OpsCheckInput {
  kind: CheckKind;
  state: CheckState;
  /** Kurzbeschreibung fuer Anzeige (tokenfrei, z. B. "/api/ready"). */
  label?: string;
  /** Millisekunden seit Messung — veraltete Messungen werden markiert. */
  ageMs?: number;
  /** Millisekunden bis Messwerte als veraltet gelten (Default 120000). */
  staleAfterMs?: number;
  detail?: string;
  /** Sprint 110: Messzeitpunkt als Epoch-Millisekunden (Serveruhr). */
  checkedAt?: number | null;
  /** Sprint 110: letztes bekanntes Fehlerbild (ueber Messungen hinweg). */
  lastFailure?: string | null;
}

export type OpsOverallState = "unknown" | "ok" | "degraded" | "down";

/** Sprint 110: Warnstufe je Komponente fuer die zentrale Betriebsansicht. */
export type OpsLevel = "ok" | "warnung" | "kritisch" | "unbekannt";

export function levelForState(state: CheckState): OpsLevel {
  switch (state) {
    case "ok":
      return "ok";
    case "degraded":
      return "warnung";
    case "down":
      return "kritisch";
    default:
      return "unbekannt";
  }
}

export interface OpsCheckView extends OpsCheckInput {
  label: string;
  stale: boolean;
  message: string;
  /** Sprint 110: abgeleitete Warnstufe (ok/Warnung/kritisch/unbekannt). */
  level: OpsLevel;
  /** Sprint 110: Messzeitpunkt oder null, wenn nicht gemessen. */
  checkedAt: number | null;
  /** Sprint 110: letztes bekanntes Fehlerbild oder null. */
  lastFailure: string | null;
}

export interface OpsOverview {
  overall: OpsOverallState;
  checks: OpsCheckView[];
  focus: string | null;
  recommendations: string[];
}

const DEFAULT_LABELS: Record<CheckKind, string> = {
  apiHealth: "/api/health",
  apiReady: "/api/ready",
  database: "Datenbank",
  neonPostgres: "Neon-Postgres",
  workspace: "Workspace-Service",
  renderDeploy: "Render-Deploy",
  uptimeWatcher: "Uptime-Wächter",
  metrics: "Metriken",
  chat: "KI-Chat",
  backup: "Backup-Wächter",
};

const DEFAULT_STALE_MS = 120_000;

/** Handlungsfaehige Empfehlung je Pruefungszustand (tokenfrei). */
function messageFor(kind: CheckKind, state: CheckState): string {
  switch (kind) {
    case "apiHealth":
      return state === "ok"
        ? "API antwortet."
        : state === "degraded"
          ? "API antwortet verlangsamt — Deploy-Logs pruefen."
          : state === "down"
            ? "API nicht erreichbar — Dienst-Status im Render-Dashboard pruefen."
            : "Keine API-Gesundheitsdaten.";
    case "apiReady":
      return state === "ok"
        ? "Bereitschaft bestätigt."
        : "Bereitschaft nicht bestätigt — /api/ready aufrufen und Datenbankverbindung pruefen.";
    case "database":
      return state === "ok"
        ? "Datenbank verbunden."
        : state === "down"
          ? "Datenbank nicht verbunden — DATABASE_URL und Neon-Verfuegbarkeit pruefen."
          : "Datenbankstatus unklar — Verbindung testen.";
    case "neonPostgres":
      return state === "ok"
        ? "Neon-Postgres antwortet prompt."
        : state === "degraded"
          ? "Neon-Postgres antwortet verlangsamt — Neon-Konsole und Connection-Pool pruefen."
          : state === "down"
            ? "Neon-Postgres nicht erreichbar — DATABASE_URL und Neon-Konsole pruefen."
            : "Keine Neon-Postgres-Messwerte.";
    case "workspace":
      return state === "ok"
        ? "Workspace-Service verbunden."
        : state === "down"
          ? "Workspace-Service nicht erreichbar — SERVICE_ACCESS_TOKEN-ENV und Dienst-Status pruefen."
          : state === "degraded"
            ? "Workspace-Service eingeschraenkt erreichbar — Health-Endpoint und SERVICE_ACCESS_TOKEN pruefen."
            : "Workspace-Status unklar — Health-Endpoint des Dienstes aufrufen.";
    case "renderDeploy":
      return state === "ok"
        ? "Render-Deploy aktiv (Service live)."
        : state === "degraded"
          ? "Render-Deploy laeuft oder pausiert — Deploy-Status beobachten."
          : state === "down"
            ? "Render-Deploy fehlgeschlagen oder Dienst inaktiv — Render-Dashboard pruefen."
            : "Keine Deploy-Daten — RENDER_API_KEY fuer Live-Status konfigurieren.";
    case "uptimeWatcher":
      return state === "ok"
        ? "Uptime-Wächter: kein offener Alarm."
        : state === "degraded"
          ? "Uptime-Wächter meldet kuerzlichen Ausfall — Issue-Verlauf pruefen."
          : state === "down"
            ? "Offener Uptime-Alarm — Produktiv-URL extern pruefen."
            : "Uptime-Wächter-Ergebnisse nicht ermittelbar.";
    case "metrics":
      return state === "ok"
        ? "Metriken abrufbar."
        : "Metriken nicht abrufbar — METRICS_TOKEN pruefen.";
    case "chat":
      return state === "ok"
        ? "KI-Chat einsatzbereit."
        : state === "down"
          ? "Kein KI-Provider verfuegbar — Provider-Keys oder Managed-Fallback pruefen."
          : "KI-Chat eingeschraenkt — Verbindungstest im Chat ausfuehren.";    case "backup":
      return state === "ok"
        ? "Backup im Tagesrhythmus (unter 22 h)."
        : state === "degraded"
          ? "Letztes Backup läuft ab (22-26 h) — neues Backup erstellen."
          : state === "down"
            ? "Backup überfällig (über 26 h) — sofort Backup erstellen und Datenbank prüfen."
            : "Noch kein Backup seit Serverstart aufgezeichnet.";

  }
}

/** Berechnet den Gesamtzustand prioritaetsbasiert: down > degraded > unknown > ok. */
export function evaluateOverall(states: CheckState[]): OpsOverallState {
  const relevant = states.filter((state) => state !== "unknown");
  if (relevant.length === 0) return "unknown";
  if (relevant.includes("down")) return "down";
  if (relevant.includes("degraded")) return "degraded";
  return "ok";
}

/** Kerncheck, der den Fokus-Tonality-Satz bestimmt (Reihenfolge = Prioritaet). */
const FOCUS_ORDER: CheckKind[] = [
  "apiHealth",
  "database",
  "neonPostgres",
  "apiReady",
  "workspace",
  "renderDeploy",
  "uptimeWatcher",
  "chat",
  "metrics",
];

function focusLine(overview: OpsOverallState, checks: OpsCheckView[]): string | null {
  if (overview === "ok") {
    return "Alle Betriebspfade gruen.";
  }
  for (const kind of FOCUS_ORDER) {
    const check = checks.find((c) => c.kind === kind);
    if (check && (check.state === "down" || check.state === "degraded")) {
      return overview === "down"
        ? `Kritisch: ${check.label} — ${check.message}`
        : `Eingeschraenkt: ${check.label} — ${check.message}`;
    }
  }
  return overview === "unknown"
    ? "Keine Messwerte vorhanden — Pruefungen ausfuehren."
    : null;
}

/** Aggregiert Pruefungen zu einer tokenfreien Betriebsuebersicht. */
export function buildOpsOverview(inputs: OpsCheckInput[]): OpsOverview {
  const checks: OpsCheckView[] = inputs.map((input) => {
    const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_MS;
    const stale = Boolean(
      input.ageMs !== undefined && input.ageMs > staleAfterMs && input.state === "ok",
    );
    const state: CheckState = stale ? "degraded" : input.state;
    return {
      ...input,
      state,
      label: input.label ?? DEFAULT_LABELS[input.kind],
      stale,
      message: messageFor(input.kind, state),
      level: levelForState(state),
      checkedAt: input.checkedAt ?? null,
      lastFailure: input.lastFailure ?? null,
    };
  });

  const overall = evaluateOverall(checks.map((check) => check.state));
  const recommendations = checks
    .filter((check) => check.state !== "ok")
    .map((check) => check.message);

  return {
    overall,
    checks,
    focus: focusLine(overall, checks),
    recommendations,
  };
}

/**
 * Sprint 110: Stufenwechsel zu kritisch — Komponenten, die aus einem
 * Nicht-Kritisch-Zustand nach "down" gewechselt sind. Der erste Lauf ohne
 * Vorbildzustand alarmiert bewusst NICHT (kein Boot-Rauschen); ein dauerhaft
 * kritischer Pfad wird vom externen Uptime-Waechter abgedeckt.
 */
export function collectCriticalTransitions(
  previousStates: Record<string, CheckState>,
  checks: OpsCheckView[],
): OpsCheckView[] {
  return checks.filter((check) => {
    const previous = previousStates[check.kind];
    return check.state === "down" && previous !== undefined && previous !== "down";
  });
}

/** Sprint 110: Tokenfreie Alarmmeldung fuer den Discord-Webhook. */
export function buildOpsAlertMessage(overview: OpsOverview, critical: OpsCheckView[]): string {
  const lines = critical.map((check) => `• ${check.label}: ${check.message}`);
  return [
    "🚨 Betriebswacht CyberSarah Control Center: Stufenwechsel zu KRITISCH",
    ...lines,
    `Gesamt: ${summarizeOpsOverview(overview)}`,
  ].join("\n");
}

/** Kompakte einzeilige Zusammenfassung fuer Protokolle. */
export function summarizeOpsOverview(overview: OpsOverview): string {
  const counts = {
    ok: overview.checks.filter((c) => c.state === "ok").length,
    degraded: overview.checks.filter((c) => c.state === "degraded").length,
    down: overview.checks.filter((c) => c.state === "down").length,
    unknown: overview.checks.filter((c) => c.state === "unknown").length,
  };
  return `Betriebsstatus ${overallLabel(overview.overall)} — ok:${counts.ok} warnung:${counts.degraded} kritisch:${counts.down} unbekannt:${counts.unknown}`;
}

function overallLabel(state: OpsOverallState): string {
  switch (state) {
    case "ok":
      return "GRUEN";
    case "degraded":
      return "EINGESCHRAENKT";
    case "down":
      return "KRITISCH";
    default:
      return "UNBEKANNT";
  }
}
