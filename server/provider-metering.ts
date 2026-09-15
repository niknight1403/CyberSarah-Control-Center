/**
 * Sprint 115 — Provider-Metering (Server-Adapter): rollierendes Aufruf-
 * Ledger im Prozessspeicher, Quota-Warnung einmalig je Schwelle via
 * Ops-Benachrichtigung (Discord, ehrlich nicht-konfiguriert ohne Webhook).
 *
 * Der Ledger ist bewusst prozess-lokal (Betriebsstatistik seit Serverstart,
 * analog Retrieval-Metriken aus Sprint 113): ein Restart leert Verbrauchs-
 * zahlen — der Pool-Zustand (Cooldowns, erschöpfte Keys) bleibt davon
 * unberührt, weil er in llm.ts weiterlebt.
 *
 * Keine Secrets: Ereignisse und Overview tragen nur Quellen-IDs und
 * maskierte Labels ("…ab12") — Standardnutzer erreichen die Overview
 * ueberhaupt nicht (adminProcedure im metering-router).
 */
import {
  classifyProviderCall,
  evaluateQuotaWarnings,
  METERING_LEDGER_CAP,
  METERING_WINDOW_MS,
  type PoolKeyState,
  type ProviderMeteringEvent,
  type ProviderMeteringOverview,
  QUOTA_WARN_THRESHOLD,
  buildProviderMeteringOverview,
  quotaWarningKey,
} from "../lib/provider-metering-logic";

const ledger: ProviderMeteringEvent[] = [];
const firedThresholds = new Set<string>();

/** Einzelnes Aufruf-Ereignis ins rollierende Ledger nehmen (Deckel beachten). */
export function recordProviderCall(input: {
  source: string;
  httpStatus: number | null;
  networkError: boolean;
  latencyMs: number;
  nowMs?: number;
}): void {
  const kind = classifyProviderCall(input.httpStatus, input.networkError);
  ledger.push({
    source: input.source,
    kind,
    at: input.nowMs ?? Date.now(),
    latencyMs: Math.max(0, input.latencyMs),
  });
  if (ledger.length > METERING_LEDGER_CAP) {
    ledger.splice(0, ledger.length - METERING_LEDGER_CAP);
  }
}

/** Failover protokollieren (Rotation von einer Quelle zur naechsten). */
export function recordProviderFailover(input: { source: string; failoverTo?: string; nowMs?: number }): void {
  ledger.push({
    source: input.source,
    kind: "failover",
    at: input.nowMs ?? Date.now(),
    latencyMs: 0,
    failoverTo: input.failoverTo,
  });
  if (ledger.length > METERING_LEDGER_CAP) {
    ledger.splice(0, ledger.length - METERING_LEDGER_CAP);
  }
}

/**
 * Prueft die Quota-Warnschwelle gegen die Pool-Zustaende und benachrichtigt
 * bei neuem Ueberschreiten GENAU EINMAL je Schwelle und Key. Der Versand
 * laeuft ueber den Sprint-110-Alarmweg; ohne DISCORD_WEBHOOK_URL bleibt die
 * Warnung ehrlich "nur im Dashboard sichtbar" — gefeuert wird sie trotzdem
 * (firedThresholds), damit kein Zweitalarm entsteht.
 */
export async function evaluateAndNotifyQuotaWarnings(
  pool: PoolKeyState[],
  notify: (message: string) => Promise<unknown> = async () => undefined,
): Promise<{ fired: string[]; notified: boolean }> {
  const { warnings, fired } = evaluateQuotaWarnings(pool, firedThresholds, QUOTA_WARN_THRESHOLD);
  for (const id of fired) {
    firedThresholds.add(id);
  }
  let notified = false;
  if (warnings.length > 0) {
    notified = true;
    for (const warning of warnings) {
      await notify(warning.message).catch(() => {
        // Versand gescheitert: Warnung bleibt als gefeuert markiert (Dashboard
        // zeigt sie), der Ops-Waechter deckt den Zustand dauerhaft ab.
        notified = false;
      });
    }
  }
  return { fired, notified };
}

/** Admin-Overview: Pool-Zustaende + Ledger-Aggregate kombiniert (rein). */
export function getProviderMeteringOverview(pool: PoolKeyState[]): ProviderMeteringOverview {
  return buildProviderMeteringOverview(pool, ledger, firedThresholds, Date.now(), METERING_WINDOW_MS);
}

/** Test-Hook: Ledger und gefeuerte Schwellen zuruecksetzen. */
export function resetProviderMeteringForTests(): void {
  ledger.length = 0;
  firedThresholds.clear();
}

/** Fuer Tests: gefeuerte Warn-IDs einsehen (quotaWarningKey-Format). */
export function getFiredThresholdsForTests(): string[] {
  return [...firedThresholds];
}

export { quotaWarningKey };
