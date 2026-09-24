/**
 * Sprint 320 — Kuendigungs-Flow: reine, deterministische Logik fuer die
 * Abo-Kuendigung in der App mit Bestaetigung + Konsequenzen.
 *
 * Datenfluss:
 *   Der Zustandsautomat kennt: aktiv -> kuendigung-vorgemerkt (zum
 *   Periodenende) -> gekuendet; sowie Ruecknahme vor Periodenende.
 *   Die Konsequenz-Liste ist aus den Tier-Entitlements berechnet.
 *
 * Ehrlichkeits-Grenze: Konsequenzen werden beim MERKEN genannt, nicht
 *   versteckt (Features fallen erst am Periodenende weg). Die
 *   Ruecknahme-Frist ist ehrlich: danach geht es nicht mehr.
 */

import {
  TIER_ENTITLEMENTS,
  TIER_LABELS,
  type SubscriptionTier,
} from "./subscription-tiers-logic";

export type CancellationState = "aktiv" | "kuendigung-vorgemerkt" | "gekuendet";

export type CancellationRecord = {
  state: CancellationState;
  tier: SubscriptionTier;
  periodEndsAt: number;
  requestedAt: number | null;
  reason: string | null;
};

export function activeRecord(tier: SubscriptionTier, periodEndsAt: number): CancellationRecord {
  return { state: "aktiv", tier, periodEndsAt, requestedAt: null, reason: null };
}

/** Kuendigung vormerken: erst am Periodenende wirkt sie. */
export function scheduleCancellation(
  record: CancellationRecord,
  now: number,
  reason: string,
): CancellationRecord {
  if (record.state !== "aktiv" || now >= record.periodEndsAt) return record;
  return {
    ...record,
    state: "kuendigung-vorgemerkt",
    requestedAt: now,
    reason: reason.trim() || "Keine Angabe",
  };
}

/** Ruecknahme nur vor Periodenende und nur aus der Vormerkung. */
export function revertCancellation(record: CancellationRecord, now: number): CancellationRecord {
  if (record.state !== "kuendigung-vorgemerkt" || now >= record.periodEndsAt) return record;
  return { ...record, state: "aktiv", requestedAt: null, reason: null };
}

/** Periodenende erreicht: Vormerkung wird zur Kuendigung. */
export function finalizeIfPeriodEnded(record: CancellationRecord, now: number): CancellationRecord {
  if (record.state === "kuendigung-vorgemerkt" && now >= record.periodEndsAt) {
    return { ...record, state: "gekuendet" };
  }
  return record;
}

/** Konsequenz-Liste: was faellt WANN weg. */
export function buildConsequenceList(record: CancellationRecord, dateIso: string): string[] {
  if (record.state === "aktiv") return [];
  const lines = [
    `Abo laeuft bis zum Periodenende (${dateIso}) weiter — bezahlte Zeit bleibt.`,
    `Ab ${dateIso}: Tier "${TIER_LABELS[record.tier]}"-Features weg, Rueckkehr auf Free-Stufe.`,
  ];
  for (const entitlement of TIER_ENTITLEMENTS[record.tier]) {
    lines.push(`Verlust: ${entitlement}`);
  }
  return lines;
}

/** Bestaetigungsfrage fuer den Dialog: klare, ruhige Sprache. */
export function confirmationQuestion(record: CancellationRecord, dateIso: string): string {
  return `Abo wirklich zum ${dateIso} kuendigen? Du behaeltst alle Features bis dahin.`;
}

/** UI-Statuszeile je Zustand. */
export function formatStateLine(record: CancellationRecord, dateIso: string): string {
  if (record.state === "aktiv") {
    return `Aktiv — Tier "${TIER_LABELS[record.tier]}", naechste Abrechnung ${dateIso}.`;
  }
  if (record.state === "kuendigung-vorgemerkt") {
    return `Kuendigung vorgemerkt zum ${dateIso} — Ruecknahme jederzeit vorher moeglich.`;
  }
  return `Gekuendet zum ${dateIso}.`;
}
