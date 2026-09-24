/**
 * Sprint 314 — Quota-Enforcement-Modus-Schalter: reine, deterministische
 * Logik fuer den Admin-Umschalter monitor <-> enforce mit Audit-Log.
 *
 * Datenfluss:
 *   Admin setzt den Modus; jede Aenderung landet im Audit-Log (wer,
 *   wann, von/auf, Grund). Die Enforcement-Entscheidung (blockiert
 *   ein Request?) ist eine reine Funktion des Modus.
 *
 * Ehrlichkeits-Grenze: Im Modus "monitor" blockiert die Quote NIE —
 *   Ueberschreitungen werden nur gezaehlt und gemeldet. Das Audit-Log
 *   ist append-only; nichts wird stillschweigend umgeschrieben.
 */

export type QuotaMode = "monitor" | "enforce";

export type QuotaModeAuditEntry = {
  id: string;
  actorId: string;
  fromMode: QuotaMode;
  toMode: QuotaMode;
  reason: string;
  changedAt: number;
};

export type QuotaModeState = {
  mode: QuotaMode;
  auditLog: QuotaModeAuditEntry[];
};

/** Neuer Zustand: default monitor (nie ueberraschend blocken). */
export function initialQuotaModeState(now: number): QuotaModeState {
  return {
    mode: "monitor",
    auditLog: [
      {
        id: "init",
        actorId: "system",
        fromMode: "monitor",
        toMode: "monitor",
        reason: "Initialzustand",
        changedAt: now,
      },
    ],
  };
}

export function canSwitchQuotaMode(
  state: QuotaModeState,
  nextMode: QuotaMode,
): { allowed: true } | { allowed: false; reason: string } {
  if (state.mode === nextMode) {
    return { allowed: false, reason: `Modus ist bereits "${nextMode}".` };
  }
  return { allowed: true };
}

/** Modus-Wechsel inkl. Audit-Eintrag (nur Admin-Actor, Grund Pflicht). */
export function switchQuotaMode(
  state: QuotaModeState,
  nextMode: QuotaMode,
  actorId: string,
  reason: string,
  now: number,
  entryId: string,
): QuotaModeState {
  const check = canSwitchQuotaMode(state, nextMode);
  if (!check.allowed || reason.trim().length === 0) return state;
  const entry: QuotaModeAuditEntry = {
    id: entryId,
    actorId,
    fromMode: state.mode,
    toMode: nextMode,
    reason: reason.trim(),
    changedAt: now,
  };
  return { mode: nextMode, auditLog: [...state.auditLog, entry] };
}

/** Kernfrage: blockiert die Quote diesen Request? */
export function shouldBlockOnQuota(state: QuotaModeState, isOverQuota: boolean): boolean {
  return state.mode === "enforce" && isOverQuota;
}

/** Monitor-Meldung: nie blockieren, aber Ueberschreitung ehrlich zaehlen. */
export function describeQuotaOutcome(
  state: QuotaModeState,
  isOverQuota: boolean,
): { blocked: boolean; message: string } {
  if (!isOverQuota) {
    return { blocked: false, message: "Im Rahmen der Quote." };
  }
  if (state.mode === "monitor") {
    return {
      blocked: false,
      message: "Quote ueberschritten (Modus monitor) — Request zugelassen, Vorfall gezaehlt.",
    };
  }
  return { blocked: true, message: "Quote ueberschritten (Modus enforce) — Request blockiert." };
}

/** Letzte Aenderungen fuer die Admin-Ansicht, neueste zuerst. */
export function recentAuditEntries(state: QuotaModeState, limit: number): QuotaModeAuditEntry[] {
  return [...state.auditLog].sort((a, b) => b.changedAt - a.changedAt).slice(0, Math.max(0, limit));
}

/** Lesbare Audit-Zeile: "Admin A: monitor -> enforce — Grund (Zeit)". */
export function formatAuditEntry(entry: QuotaModeAuditEntry, dateIso: string): string {
  return `${entry.actorId}: ${entry.fromMode} -> ${entry.toMode} — ${entry.reason} (${dateIso})`;
}
