/**
 * Sprint 110 — Betriebsalarme: Stufenverlauf je Komponente, letztes Fehlerbild
 * und Admin-Benachrichtigung bei Stufenwechsel zu kritisch via Discord-Webhook
 * (analog Uptime-Waechter aus Sprint 92).
 *
 * Der Verlauf lebt bewusst im Prozessspeicher: Nach einem Server-Restart gibt
 * es keinen falschen Erstalarm (Erstlauf alarmiert nicht), und ein dauerhaft
 * kritischer Pfad wird vom externen Uptime-Waechter abgedeckt. Ohne
 * DISCORD_WEBHOOK_URL bleibt der Alarm ehrlich "nur im Dashboard sichtbar".
 */
import {
  buildOpsAlertMessage,
  collectCriticalTransitions,
  summarizeOpsOverview,
  type CheckState,
    type OpsOverview,
} from "../lib/ops-overview-logic";
import { buildOpsDiscordPayload } from "../lib/ops-paas-logic";

const lastStates = new Map<string, CheckState>();
const lastFailures = new Map<string, { detail: string; checkedAt: number }>();

/** Letztes bekanntes Fehlerbild einer Komponente (ueber Messungen hinweg). */
export function getLastFailure(kind: string): { detail: string; checkedAt: number } | null {
  return lastFailures.get(kind) ?? null;
}

export type OpsAlertOutcome = "kein-alarm" | "gesendet" | "nicht-konfiguriert" | "senden-fehlgeschlagen";

export async function sendOpsDiscordAlert(message: string): Promise<OpsAlertOutcome> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.info("[Ops-Alarm] DISCORD_WEBHOOK_URL nicht konfiguriert — Alarm nur im Dashboard sichtbar.");
    console.info(`[Ops-Alarm] ${message}`);
    return "nicht-konfiguriert";
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildOpsDiscordPayload(message)),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.warn(`[Ops-Alarm] Discord-Webhook antwortete mit HTTP ${response.status}.`);
      return "senden-fehlgeschlagen";
    }
    return "gesendet";
  } catch (error) {
    console.warn("[Ops-Alarm] Discord-Versand fehlgeschlagen:", error instanceof Error ? error.message : error);
    return "senden-fehlgeschlagen";
  }
}

/**
 * Wertet einen neuen Betriebsueberblick gegen den Stufenverlauf aus:
 * aktualisiert Verlauf und Fehlerbilder, alarmiert bei Stufenwechsel
 * zu kritisch. Reihenfolge: erst messen (Fehlerbilder pflegen), dann
 * alarmieren, damit die Meldung den aktuellen Stand beschreibt.
 */
export async function evaluateOpsTransitionsAndAlert(overview: OpsOverview): Promise<OpsAlertOutcome> {
  const now = Date.now();
  for (const check of overview.checks) {
    if (check.state === "degraded" || check.state === "down") {
      lastFailures.set(check.kind, {
        detail: check.detail ?? check.message,
        checkedAt: check.checkedAt ?? now,
      });
    }
  }

  const previous: Record<string, CheckState> = {};
  for (const [kind, state] of lastStates.entries()) {
    previous[kind] = state;
  }

  const critical = collectCriticalTransitions(previous, overview.checks);

  for (const check of overview.checks) {
    lastStates.set(check.kind, check.state);
  }

  if (critical.length === 0) {
    return "kein-alarm";
  }

  const message = buildOpsAlertMessage(overview, critical);
  console.warn(`[Ops-Alarm] Stufenwechsel zu kritisch: ${summarizeOpsOverview(overview)}`);
  return sendOpsDiscordAlert(message);
}

/** Nur fuer Tests/Protokolle: Verlauf gezielt zuruecksetzen. */
export function resetOpsTransitionState(): void {
  lastStates.clear();
  lastFailures.clear();
}
