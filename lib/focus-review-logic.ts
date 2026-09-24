/**
 * Sprint 232 — Fokus & Rückblick: Kern-Domäne (rein, testbar).
 *
 * Ein Fokus-Punkt ist eine bewusst kleine Tagesverpflichtung. Ehrlichkeits-
 * Regeln des Moduls:
 *   - Max. 3 Fokus-Punkte pro Tag — Kapazität ist endlich, Listen nicht.
 *   - Ein Punkt ohne Tag ist kein Punkt: erst Tag, dann Verpflichtung.
 *   - Verschoben/ fallen gelassen bleibt sichtbar — Rückblick braucht
 *     die echte Geschichte, nicht die geschönte.
 */

export const FOCUS_LIMITS = {
  /** Bewusst hart: mehr als 3 Tagesverpflichtungen sind Planungsfiktion. */
  maxPerDay: 3,
  title: { min: 3, max: 120 },
  note: { min: 0, max: 400 },
  /** Erwartbarer Umfang gespeicherter Punkte — begrenzt im Store. */
} as const;

export const FOCUS_DISCLAIMER =
  "Fokus & Rückblick ist eine Planungs- und Reflexionshilfe: keine Produktivitäts-Bewertung, keine automatische Ausführung — jeder Punkt und jede Änderung braucht deine explizite Bestätigung.";

export type FocusStatus = "active" | "done" | "moved" | "dropped";

export type FocusItem = {
  id: string;
  /** Tag als ISO-Datum (YYYY-MM-DD, lokale Zeit des Nutzers). */
  day: string;
  title: string;
  status: FocusStatus;
  /** Optionale Notiz (z. B. warum verschoben). */
  note: string;
  createdAt: number;
  updatedAt: number;
};

export type FocusValidation = { valid: true } | { valid: false; reason: string };

/** ISO-Tag (YYYY-MM-DD) aus Epoch-Millisekunden — lokale Zeit, nicht UTC geraten. */
export function isoDayFromTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new Error("Ungültiger Zeitstempel für Tages-Schlüssel.");
  const date = new Date(timestamp);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Prüft, dass ein Tag wirklich das ISO-Format YYYY-MM-DD hat. */
export function isIsoDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T12:00:00`).getTime());
}

export function focusStatusLabel(status: FocusStatus): string {
  switch (status) {
    case "active": return "aktiv";
    case "done": return "erledigt";
    case "moved": return "verschoben";
    case "dropped": return "fallen gelassen";
  }
}

/** Validiert einen Fokus-Entwurf mit sprechender deutscher Ablehnung. */
export function validateFocusItem(input: Partial<FocusItem>): FocusValidation {
  const title = (input.title ?? "").trim();
  if (title.length < FOCUS_LIMITS.title.min || title.length > FOCUS_LIMITS.title.max) {
    return { valid: false, reason: `Der Titel braucht ${FOCUS_LIMITS.title.min}–${FOCUS_LIMITS.title.max} Zeichen — kein Fokus ohne Namen.` };
  }
  if (typeof input.day !== "string" || !isIsoDay(input.day)) {
    return { valid: false, reason: "Der Tag fehlt oder ist kein Datum (YYYY-MM-DD) — erst Tag, dann Verpflichtung." };
  }
  const note = input.note ?? "";
  if (note.length > FOCUS_LIMITS.note.max) {
    return { valid: false, reason: `Die Notiz ist zu lang (max. ${FOCUS_LIMITS.note.max} Zeichen).` };
  }
  if (input.status !== undefined && !["active", "done", "moved", "dropped"].includes(input.status)) {
    return { valid: false, reason: "Unbekannter Fokus-Status." };
  }
  return { valid: true };
}

/** Zählt nur echte Tages-Punkte: fallen gelassene blockieren keinen neuen Platz. */
export function countDayFocus(items: FocusItem[], day: string): number {
  return items.filter((item) => item.day === day && item.status !== "dropped").length;
}

/** Prüft, ob an einem Tag noch ein Fokus-Punkt Platz hat. */
export function hasDayCapacity(items: FocusItem[], day: string): boolean {
  return countDayFocus(items, day) < FOCUS_LIMITS.maxPerDay;
}

let focusIdCounter = 0;

/** Erstellt einen normalisierten Fokus-Punkt; wirft bei invalider Eingabe. */
export function createFocusItem(input: Partial<FocusItem>, now = Date.now): FocusItem {
  const validation = validateFocusItem(input);
  if (!validation.valid) throw new Error(validation.reason);
  const timestamp = now();
  focusIdCounter += 1;
  return {
    id: `focus-${timestamp.toString(36)}-${focusIdCounter}`,
    day: input.day!,
    title: input.title!.trim(),
    status: input.status ?? "active",
    note: (input.note ?? "").trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/* ==================== Tages-Bewertung (Sprint 233) ==================== */

export type FocusDayVerdict = {
  /** Was der Tag ehrlich ist — inkl. gültigem Leerzustand. */
  state: "empty" | "open" | "partially-done" | "done" | "overtime";
  headline: string;
  /** Beobachtungen in Klartext, ohne Bewertung der Person. */
  observations: string[];
  counts: { active: number; done: number; moved: number; dropped: number };
};

/**
 * Bewertet einen Fokus-Tag ehrlich:
 *   - Ein Tag ohne Punkte ist gültig und kein Versäumnis.
 *   - Erledigt-Quoten sind Beobachtungen, keine Noten.
 *   - „Übererfüllt" entsteht nur, wenn mehr Punkte erledigt wurden als das
 *     Limit pro Tag erlaubt (z. B. nach Rückverschiebungen) — sichtbar,
 *     nicht versteckt.
 */
export function evaluateFocusDay(items: FocusItem[], day: string, capacity = FOCUS_LIMITS.maxPerDay): FocusDayVerdict {
  const daysItems = items.filter((item) => item.day === day);
  const counts = {
    active: daysItems.filter((item) => item.status === "active").length,
    done: daysItems.filter((item) => item.status === "done").length,
    moved: daysItems.filter((item) => item.status === "moved").length,
    dropped: daysItems.filter((item) => item.status === "dropped").length,
  };
  const observations: string[] = [];
  const total = daysItems.length;

  if (total === 0) {
    return {
      state: "empty",
      headline: "Kein Fokus für diesen Tag geplant",
      observations: ["Der Tag ist bewusst leer — kein Punkt ist kein Versäumnis. Falls das öfter passiert, ist das ein Planungshinweis, kein Vorwurf."],
      counts,
    };
  }

  if (counts.done > capacity) {
    observations.push(`${counts.done} Punkte erledigt — mehr als das Tageslimit (${capacity}). Stark, aber kein Standard zum Verplanen.`);
  }
  if (counts.moved > 0) {
    observations.push(`${counts.moved} Punkt(e) verschoben — sichtbar bleiben, damit der Rückblick die echte Geschichte erzählt.`);
  }
  if (counts.dropped > 0) {
    observations.push(`${counts.dropped} Punkt(e) fallen gelassen — auch das zählt, sonst verplant sich der nächste Tag.`);
  }

  if (counts.active === 0 && counts.done > 0) {
    observations.push(counts.done >= capacity
      ? `Alle ${counts.done} geplanten Punkte erledigt.`
      : `${counts.done} von ${total} Punkten erledigt, Rest wurde verschoben oder fallen gelassen.`);
    return {
      state: counts.done > capacity ? "overtime" : "done",
      headline: counts.done > capacity ? "Übererfüllt" : "Tagesfokus abgeschlossen",
      observations,
      counts,
    };
  }

  if (counts.done > 0) {
    observations.push(`${counts.done} von ${total} Punkten erledigt — der Rest liegt noch offen.`);
    return { state: "partially-done", headline: "Teilweise erledigt", observations, counts };
  }

  observations.push(`${counts.active} Punkt(e) offen, noch nichts erledigt — der Tag hat noch Platz nach oben.`);
  return { state: "open", headline: "Tagesfokus noch offen", observations, counts };
}
