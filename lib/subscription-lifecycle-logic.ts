/**
 * Sprint 26 — Abonnements mit Kuendigung, Retention und Wiederaufnahme
 * konsistent lesen.
 *
 * Vorher gab es zwei widerspruechliche Sichten: das Gating
 * (`resolvePlanForUser`) verlangte hart `status === "active"`, waehrend die
 * Abrechnungsuebersicht den Tarif allein aus der Preis-ID ableitete. Ein
 * Abo, das zum Periodenende kuendigt, verlor damit Zugriff oder zeigte
 * gleichzeitig einen Tarif, den es nicht mehr nutzen durfte.
 *
 * Diese Funktion ist die einzige Wahrheit: sie liest den gespeicherten
 * Zustand, entscheidet ueber Zugriff und sagt offen, was unbekannt ist.
 * Es wird nichts geschaetzt: fehlt das Periodenende, wird der Zugriff nicht
 * erfunden, sondern als Warnung ausgewiesen.
 */

export type LifecycleState =
  | "aktiv"
  | "probe"
  | "kuendigt_zum_periodenende"
  | "pausiert"
  | "zahlung_offen"
  | "abgelaufen"
  | "unvollstaendig"
  | "unbekannt";

export interface SubscriptionSnapshot {
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: Date | string | number | null;
  pausedBehavior?: string | null;
  trialEnd?: Date | string | number | null;
}

export interface LifecycleReading {
  state: LifecycleState;
  /** Zugriff auf bezahlte Funktionen zum Zeitpunkt `now`. */
  entitled: boolean;
  /** Ende des bezahlten Zeitraums (ISO) oder null, wenn nicht belegbar. */
  accessUntil: string | null;
  /** Kuendigung laesst sich noch zuruecknehmen. */
  canResume: boolean;
  /** Kunde befindet sich in einem Zeitraum, in dem Retention sinnvoll ist. */
  retentionEligible: boolean;
  /** Restlaufzeit in Tagen (nur wenn belegbar). */
  daysLeft: number | null;
  warnings: string[];
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Kulanz nach Periodenende bei offener Zahlung (Stripe `past_due`). */
export const PAST_DUE_GRACE_DAYS = 3;
/** Ab dieser Restlaufzeit gilt ein kuendigendes Abo als Retention-Fall. */
export const RETENTION_WINDOW_DAYS = 14;

function toMs(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function readSubscriptionLifecycle(
  snapshot: SubscriptionSnapshot,
  now: number = Date.now(),
  options: { graceDays?: number } = {},
): LifecycleReading {
  const graceDays = Number.isFinite(options.graceDays) ? Number(options.graceDays) : PAST_DUE_GRACE_DAYS;
  const status = (snapshot.status ?? "").trim().toLowerCase();
  const periodEndMs = toMs(snapshot.currentPeriodEnd);
  const trialEndMs = toMs(snapshot.trialEnd);
  const paused = Boolean(snapshot.pausedBehavior && snapshot.pausedBehavior.trim());
  const warnings: string[] = [];
  const accessUntil = periodEndMs === null ? null : new Date(periodEndMs).toISOString();
  const daysLeft = periodEndMs === null ? null : Math.max(0, Math.ceil((periodEndMs - now) / DAY_MS));
  const base = { accessUntil, daysLeft, warnings } as const;

  if (!status) {
    return {
      ...base,
      state: "unbekannt",
      entitled: false,
      canResume: false,
      retentionEligible: false,
      warnings: ["Kein Abo-Status gespeichert; Zugriff wird nicht angenommen."],
      reason: "Kein Abo hinterlegt.",
    };
  }

  if (periodEndMs === null && status !== "canceled") {
    warnings.push("Periodenende unbekannt — Restlaufzeit nicht belegbar.");
  }
  if (periodEndMs !== null && periodEndMs < now && (status === "active" || status === "trialing")) {
    warnings.push("Periodenende liegt in der Vergangenheit, Status aber noch aktiv — Webhook pruefen.");
  }

  if (status === "active") {
    if (paused) {
      const entitled = periodEndMs !== null && periodEndMs > now;
      return {
        ...base,
        state: "pausiert",
        entitled,
        canResume: false,
        retentionEligible: false,
        warnings: [...warnings, "Zahlungsabruf ist pausiert (pause_collection)."],
        reason: entitled
          ? "Abo pausiert; bezahlter Zeitraum laeuft noch."
          : "Abo pausiert; der bezahlte Zeitraum ist beendet.",
      };
    }
    if (snapshot.cancelAtPeriodEnd === true) {
      const entitled = periodEndMs === null ? false : periodEndMs > now;
      if (periodEndMs === null) warnings.push("Kuendigung ohne Periodenende — Zugriff bis Ende nicht belegbar.");
      return {
        ...base,
        state: "kuendigt_zum_periodenende",
        entitled,
        canResume: entitled,
        retentionEligible: entitled && daysLeft !== null && daysLeft <= RETENTION_WINDOW_DAYS,
        reason: entitled
          ? `Gekuendigt, Zugriff bis ${accessUntil}.`
          : "Gekuendigt, bezahlter Zeitraum beendet.",
      };
    }
    return {
      ...base,
      state: "aktiv",
      entitled: true,
      canResume: false,
      retentionEligible: false,
      reason: "Abo aktiv.",
    };
  }

  if (status === "trialing") {
    const entitled = trialEndMs === null ? false : trialEndMs > now;
    if (trialEndMs === null) warnings.push("Testphase ohne Enddatum — Zugriff nicht belegbar.");
    return {
      ...base,
      state: "probe",
      entitled,
      canResume: false,
      retentionEligible: false,
      warnings,
      reason: entitled ? "Testphase laeuft." : "Testphase beendet.",
    };
  }

  if (status === "past_due") {
    const graceEnd = (periodEndMs ?? now) + graceDays * DAY_MS;
    const entitled = graceEnd > now;
    return {
      ...base,
      state: "zahlung_offen",
      entitled,
      canResume: false,
      retentionEligible: entitled,
      warnings: [...warnings, `Zahlung offen; Kulanz bis ${new Date(graceEnd).toISOString()} (${graceDays} Tage).`],
      reason: entitled ? "Zahlung offen, Zugriff in der Kulanzfrist." : "Zahlung offen, Kulanzfrist abgelaufen.",
    };
  }

  if (status === "unpaid") {
    return {
      ...base,
      state: "zahlung_offen",
      entitled: false,
      canResume: false,
      retentionEligible: false,
      warnings: [...warnings, "Zahlung nicht eingegangen; kein Kulanzzugriff."],
      reason: "Zahlung nicht eingegangen.",
    };
  }

  if (status === "canceled") {
    const entitled = periodEndMs !== null && periodEndMs > now;
    return {
      ...base,
      state: "abgelaufen",
      entitled,
      canResume: false,
      retentionEligible: false,
      reason: entitled ? `Gekuendigt, bezahlter Zeitraum laeuft bis ${accessUntil}.` : "Abo beendet.",
    };
  }

  if (status === "incomplete" || status === "incomplete_expired") {
    return {
      ...base,
      state: "unvollstaendig",
      entitled: false,
      canResume: false,
      retentionEligible: false,
      warnings: [...warnings, "Zahlung nie abgeschlossen — Abo kommt nicht zustande."],
      reason: "Abschluss der Zahlung fehlt.",
    };
  }

  if (status === "paused") {
    return {
      ...base,
      state: "pausiert",
      entitled: false,
      canResume: false,
      retentionEligible: false,
      reason: "Abo pausiert.",
    };
  }

  return {
    ...base,
    state: "unbekannt",
    entitled: false,
    canResume: false,
    retentionEligible: false,
    warnings: [...warnings, `Unbekannter Abo-Status "${status}".`],
    reason: "Status nicht einordenbar.",
  };
}
