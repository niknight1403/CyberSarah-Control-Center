/**
 * CyberSarah Control Center — Live-Fix-Logik (Sprint 164)
 *
 * Ergaenzt das Self-Healing (Sprint 125: erkennen + analysieren) um die
 * DIREKTE Live-Behebung: definierte, garantiert sichere In-Prozess-Aktionen
 * werden sofort beim Incident ausgefuehrt — ohne Redeploy, ohne Operator,
 * ohne Kosten:
 *
 *   - restart_backup_watcher : DB-Verbindungsstroerung -> Backup-Waechter
 *     sauber zuruecksetzen (nimmt die naechste Sicherung wieder an).
 *   - purge_log_buffer        : Speicherdruck -> Runtime-Log-Ringpuffer
 *     freigeben.
 *   - quarantine_provider     : 429/Quota eines LLM-Providers -> Provider
 *     fuer 60s in die Quarantaene (In-Process-Registry). Waehrenddessen
 *     laeuft der Chat ohnehin ueber die naechsten kostenlosen Endpoints
 *     der Managed-Kaskade bzw. das lokale Ollama.
 *
 * Alles andere bleibt beim bewaehrten Analyse-Pfad (Orchestrator) bzw.
 * hinter dem bewussten Redeploy-Flag — Live-Fix ist bewusst auf
 * risikofreie Aktionen beschraenkt, damit der Betrieb reibungslos und
 * ohne Nebenwirkungen bleibt.
 */

import type { AnomalySignatureId, SelfHealingIncident } from "./self-healing-logic";

export type LiveFixActionId =
  | "restart_backup_watcher"
  | "purge_log_buffer"
  | "quarantine_provider"
  | "invalidate_runtime_caches" // Sprint 166: Latenz/Stale -> In-Process-Caches verwerfen (reine Neuberechnung)
  | "restart_subsystem" // Sprint 166: 3+ Wiederholungen -> Watchdog-Neustart EINES nicht-kritischen Subsystems
  | "none";

export interface LiveFixPlan {
  action: LiveFixActionId;
  /** Betroffener Provider (nur bei quarantine_provider). */
  provider?: string;
  reason: string;
}

/** Standard-Quarantaene eines limitierten Providers (60s). */
export const PROVIDER_QUARANTINE_MS = 60_000;

/** Watchdog-Fenster: N Wiederholungen desselben Signatur-Incidents loesen den Subsystem-Neustart aus. */
export const WATCHDOG_WINDOW_MS = 10 * 60_000;
export const WATCHDOG_RESTART_THRESHOLD = 3;

const LIMIT_PATTERN = /\b(429|rate.?limit|too many requests|quota|insufficient_quota|resource_exhausted)\b/i;
const PROVIDER_PATTERN = /\b(groq|openrouter|gemini|cerebras|sambanova|github|forge|openai|ollama|lmstudio|together|huggingface|cloudflare)\b/i;

/**
 * Plant die sofortige Live-Fix-Aktion fuer einen Incident.
 * Reine Funktion — die Ausfuehrung passiert im Server-Adapter.
 */
export function planLiveFix(signature: AnomalySignatureId, message: string, occurrences: number = 1): LiveFixPlan {
  const text = message ?? "";

  if (LIMIT_PATTERN.test(text)) {
    const provider = text.match(PROVIDER_PATTERN)?.[1]?.toLowerCase() ?? "managed-kaskade";
    return {
      action: "quarantine_provider",
      provider,
      reason: `Limit-Fehler (429/Quota) bei '${provider}' erkannt — Provider fuer ${PROVIDER_QUARANTINE_MS / 1000}s in Quarantaene, Chat rotiert auf den naechsten kostenlosen Endpoint.`,
    };
  }
  if (signature === "db_connection") {
    return {
      action: "restart_backup_watcher",
      reason: "DB-Verbindungsstoerung — Backup-Waechter wird zurueckgesetzt und nimmt die naechste Sicherung wieder an.",
    };
  }
  if (signature === "out_of_memory") {
    return {
      action: "purge_log_buffer",
      reason: "Speicherdruck — Runtime-Log-Ringpuffer wird sofort freigegeben.",
    };
  }
  if (signature === "api_timeout" || signature === "http_5xx") {
    if (occurrences >= WATCHDOG_RESTART_THRESHOLD) {
      return {
        action: "restart_subsystem",
        reason: `${occurrences} Wiederhol-Incidents (${signature}) in ${WATCHDOG_WINDOW_MS / 60_000} Min — Watchdog startet das betroffene, nicht-kritische Subsystem einzeln neu (kein Redeploy, kein Prozess-Neustart).`,
      };
    }
    return {
      action: "invalidate_runtime_caches",
      reason: "Latenz-/Fehler-Signatur — In-Process-Runtime-Caches werden invalidiert (reine Neuberechnung, keine Datenverluste).",
    };
  }
  return { action: "none", reason: "Keine sichere In-Prozess-Live-Fix-Aktion definiert — Analyse-Pfad uebernimmt." };
}

// ---------------------------------------------------------------------------
// Provider-Quarantaene (In-Process-Registry, 60s)
// ---------------------------------------------------------------------------

const quarantinedUntil = new Map<string, number>();

/** Setzt einen Provider in die 60s-Quarantaene (idempotent, verlaengert). */
export function quarantineProvider(provider: string, durationMs: number = PROVIDER_QUARANTINE_MS): void {
  if (!provider) return;
  quarantinedUntil.set(provider.toLowerCase(), Date.now() + Math.max(0, durationMs));
}

/** True, solange der Provider in Quarantaene ist (Live-Rotation filtert ihn). */
export function isProviderQuarantined(provider: string, now: number = Date.now()): boolean {
  const until = quarantinedUntil.get((provider ?? "").toLowerCase());
  if (until === undefined) return false;
  if (until <= now) {
    quarantinedUntil.delete(provider.toLowerCase());
    return false;
  }
  return true;
}

/** Diagnose-Snapshot fuer die Admin-Ansicht. */
export function getProviderQuarantineSnapshot(now: number = Date.now()): { provider: string; secondsLeft: number }[] {
  const snapshot: { provider: string; secondsLeft: number }[] = [];
  for (const [provider, until] of [...quarantinedUntil.entries()]) {
    if (until > now) snapshot.push({ provider, secondsLeft: Math.ceil((until - now) / 1000) });
    else quarantinedUntil.delete(provider);
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Watchdog-Wiederholungszaehler (Sprint 166, In-Process, 10-Min-Fenster)
// ---------------------------------------------------------------------------

const signatureOccurrences = new Map<AnomalySignatureId, number[]>();

/**
 * Notiert einen Incident des Signatur-Typs und liefert die aktuelle
 * Wiederholungsanzahl im WATCHDOG_WINDOW_MS-Fenster (fuer den Watchdog).
 */
export function noteIncidentOccurrence(signature: AnomalySignatureId, now: number = Date.now()): number {
  const windowStart = now - WATCHDOG_WINDOW_MS;
  const stamps = (signatureOccurrences.get(signature) ?? []).filter((t) => t >= windowStart);
  stamps.push(now);
  signatureOccurrences.set(signature, stamps);
  return stamps.length;
}

/** Test-/Diagnose-Hook: leert die Wiederholungszaehler. */
export function resetIncidentOccurrences(): void {
  signatureOccurrences.clear();
}

// ---------------------------------------------------------------------------
// Ausfuehrung (Server-Adapter, gegen echte Subsysteme)
// ---------------------------------------------------------------------------

export interface LiveFixOutcome {
  action: LiveFixActionId;
  applied: boolean;
  detail: string;
}

/**
 * Fuehrt die geplante Live-Fix-Aktion SOFORT aus. Aktionen sind bewusst
 * risikofrei (kein Datenverlust, kein Redeploy, keine Kosten) — deshalb
 * laufen sie automatisch, sobald der Detekktor einen Incident meldet.
 */
export async function applyLiveFix(
  plan: LiveFixPlan,
  actions: {
    restartBackupWatcher?: () => void;
    purgeLogBuffer?: () => number;
    invalidateRuntimeCaches?: () => number | Promise<number>;
    restartSubsystem?: (reason: string) => boolean | Promise<boolean>;
  },
): Promise<LiveFixOutcome> {
  switch (plan.action) {
    case "restart_backup_watcher":
      try {
        if (!actions.restartBackupWatcher) {
          return { action: plan.action, applied: false, detail: `${plan.reason} Kein Waechter-Reset angebunden.` };
        }
        actions.restartBackupWatcher();
        return { action: plan.action, applied: true, detail: plan.reason };
      } catch (error) {
        return { action: plan.action, applied: false, detail: `Backup-Waechter-Reset fehlgeschlagen: ${String(error)}` };
      }
    case "purge_log_buffer":
      try {
        if (!actions.purgeLogBuffer) {
          return { action: plan.action, applied: false, detail: `${plan.reason} Kein Log-Puffer angebunden.` };
        }
        const purged = actions.purgeLogBuffer();
        return { action: plan.action, applied: true, detail: `${plan.reason} (${purged} Eintraege freigegeben.)` };
      } catch (error) {
        return { action: plan.action, applied: false, detail: `Log-Purge fehlgeschlagen: ${String(error)}` };
      }
    case "quarantine_provider":
      if (plan.provider) quarantineProvider(plan.provider);
      return { action: plan.action, applied: true, detail: plan.reason };
    case "invalidate_runtime_caches":
      try {
        if (!actions.invalidateRuntimeCaches) {
          return { action: plan.action, applied: false, detail: `${plan.reason} Kein Cache-Ziel angebunden — Watchdog-Flag dokumentiert.` };
        }
        const invalidated = await actions.invalidateRuntimeCaches();
        return { action: plan.action, applied: true, detail: `${plan.reason} (${invalidated} Caches invalidiert.)` };
      } catch (error) {
        return { action: plan.action, applied: false, detail: `Cache-Invalidierung fehlgeschlagen: ${String(error)}` };
      }
    case "restart_subsystem":
      try {
        if (!actions.restartSubsystem) {
          return { action: plan.action, applied: false, detail: `${plan.reason} Kein restartfaehiges nicht-kritisches Subsystem registriert — Watchdog-Flag bleibt dokumentiert, Analyse-Pfad uebernimmt.` };
        }
        const restarted = await actions.restartSubsystem(plan.reason);
        return {
          action: plan.action,
          applied: restarted,
          detail: restarted
            ? plan.reason
            : `${plan.reason} Kein restartfaehiges nicht-kritisches Subsystem registriert — Watchdog-Flag bleibt dokumentiert, Analyse-Pfad uebernimmt.`,
        };
      } catch (error) {
        return { action: plan.action, applied: false, detail: `Subsystem-Neustart fehlgeschlagen: ${String(error)}` };
      }
    default:
      return { action: "none", applied: false, detail: plan.reason };
  }
}

/** Serialisiert das Ergebnis in den Incident ( Feld liveFix). */
export function describeLiveFix(outcome: LiveFixOutcome): string {
  return outcome.applied
    ? `LIVE-FIX (${outcome.action}) sofort angewendet: ${outcome.detail}`
    : `Keine Live-Fix-Aktion: ${outcome.detail}`;
}

export type IncidentWithLiveFix = SelfHealingIncident & { liveFix?: string };

/** Test-Hook: Quarantaene-Registry komplett leeren (deterministische Suite). */
export function resetProviderQuarantineForTests(): void {
  quarantinedUntil.clear();
}
