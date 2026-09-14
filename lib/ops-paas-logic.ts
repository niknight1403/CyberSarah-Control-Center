/**
 * Sprint 110 — PaaS-Betriebspruefungen: reine Klassifizierungslogik fuer die
 * zentralen Betriebsansicht. Alle Funktionen sind deterministisch und ohne
 * Netzwerk testbar; die eigentlichen Messungen macht server/ops-router.ts.
 *
 * Konvention (analog Sprint 93 Sub-Agenten): Fehlende Konfiguration ist KEIN
 * Fehler — sie fuehrt zu einem ehrlichen "unknown" mit klarem Hinweis, statt
 * rot zu werden oder Einstellungen zu erzwingen.
 */
import type { CheckState } from "./ops-overview-logic";

export interface ProbeResult {
  state: CheckState;
  /** Tokenfreies Fehlerbild fuer Anzeige und Protokolle. */
  detail: string;
}

/** Neon-Postgres-Erreichbarkeit aus einem SELECT-1-Roundtrip. */
export function classifyNeonLatency(latencyMs: number | null): ProbeResult {
  if (latencyMs === null) {
    return { state: "down", detail: "SELECT-1-Probe fehlgeschlagen" };
  }
  if (latencyMs > 3_000) {
    return { state: "degraded", detail: `SELECT-1-Roundtrip ${latencyMs} ms — verlangsamt` };
  }
  return { state: "ok", detail: `SELECT-1-Roundtrip ${latencyMs} ms` };
}

/** Uptime-Waechter-Ergebnis der letzten 24 h aus GitHub-Issues. */
export function classifyUptimeWatcherState(input: {
  /** null = GitHub-API nicht erreichbar (z. B. Rate-Limit). */
  openAlert: boolean | null;
  /** Millisekunden seit Erholung eines kuerzlich geschlossenen Alarms. */
  recoveredWithinMs?: number | null;
}): ProbeResult {
  if (input.openAlert === null) {
    return { state: "unknown", detail: "GitHub-Issue-Status nicht ermittelbar (Rate-Limit)" };
  }
  if (input.openAlert) {
    return { state: "down", detail: "offener Uptime-Alarm (GitHub-Issue)" };
  }
  const recovered = input.recoveredWithinMs;
  if (recovered !== null && recovered !== undefined && recovered <= 86_400_000) {
    const minutes = Math.max(1, Math.round(recovered / 60_000));
    return { state: "degraded", detail: `Ausfall vor ${minutes} min behoben` };
  }
  return { state: "ok", detail: "kein offener Alarm (Wächter prüft alle 30 min)" };
}

/** Render-Deploy-Status; null = RENDER_API_KEY nicht konfiguriert. */
export function classifyRenderDeployState(status: string | null): ProbeResult {
  if (status === null) {
    return {
      state: "unknown",
      detail: "RENDER_API_KEY nicht konfiguriert — Deploy-Status nicht prüfbar",
    };
  }
  switch (status) {
    case "live":
      return { state: "ok", detail: "Service live" };
    case "build":
    case "update":
    case "created":
    case "queued":
    case "pre_deployed":
      return { state: "degraded", detail: `Deploy läuft (${status})` };
    case "update_failed":
    case "deactivated":
    case "suspended":
    case "canceled":
      return { state: "down", detail: `Deploy-Status ${status} — Render-Dashboard prüfen` };
    default:
      // Unbekannte zukuenftige Render-Status ehrlich als Einschraenkung melden.
      return { state: "degraded", detail: `unbekannter Deploy-Status ${status}` };
  }
}

/** Discord-Webhook-Payload (Inhalt ist tokenfrei). */
export function buildOpsDiscordPayload(message: string): { content: string } {
  return { content: message };
}
