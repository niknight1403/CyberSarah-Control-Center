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

/* ==================== Wochenrückblick (Sprint 234) ==================== */

export type WeeklyReview = {
  /** Montag der Woche als ISO-Tag. */
  weekStart: string;
  headline: string;
  summary: string;
  observations: string[];
  counts: { total: number; done: number; moved: number; dropped: number; active: number; daysWithFocus: number };
};

/** ISO-Montag der Woche eines Zeitstempels (lokale Zeit). */
export function isoWeekStart(timestamp: number): string {
  const date = new Date(timestamp);
  const weekday = (date.getDay() + 6) % 7; // Montag = 0
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday);
  return isoDayFromTimestamp(monday.getTime());
}

function addDaysIso(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDayFromTimestamp(date.getTime());
}

/**
 * Baut den Wochenrückblick aus den echten Punkten — bewusst ohne
 * Produktivitäts-Score: eine Zahl wäre eine Note für eine Person,
 * dieses Modul zählt nur Beobachtungen.
 */
export function buildWeeklyReview(items: FocusItem[], weekStart: string): WeeklyReview {
  if (!isIsoDay(weekStart)) throw new Error("Wochenstart muss ein ISO-Tag (YYYY-MM-DD) sein.");
  const days = Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index));
  const weekItems = items.filter((item) => days.includes(item.day));
  const counts = {
    total: weekItems.length,
    done: weekItems.filter((item) => item.status === "done").length,
    moved: weekItems.filter((item) => item.status === "moved").length,
    dropped: weekItems.filter((item) => item.status === "dropped").length,
    active: weekItems.filter((item) => item.status === "active").length,
    daysWithFocus: days.filter((day) => weekItems.some((item) => item.day === day)).length,
  };

  const observations: string[] = [];
  observations.push(`${counts.daysWithFocus} von 7 Tagen mit Fokus-Punkten.`);
  if (counts.total === 0) {
    return {
      weekStart,
      headline: "Leere Woche",
      summary: "In dieser Woche sind keine Fokus-Punkte erfasst — ein echter Leerzustand, kein Fehler.",
      observations: [...observations, "Ohne Punkte ist kein Rückblick möglich. Nächste Woche mit 1–3 Punkten starten — klein zählt."],
      counts,
    };
  }

  observations.push(`${counts.done} erledigt, ${counts.moved} verschoben, ${counts.dropped} fallen gelassen, ${counts.active} offen.`);
  if (counts.done > 0 && counts.total > 0) {
    observations.push(`Erledigt-Anteil: ${Math.round((counts.done / counts.total) * 100)} % — eine Beobachtung, keine Note.`);
  } else if (counts.done === 0) {
    observations.push("Kein Punkt wurde erledigt — zuerst klären, ob die Ziele oder die Rahmenbedingungen das Problem waren.");
  }

  const movedTitles = weekItems.filter((item) => item.status === "moved");
  if (movedTitles.length >= 2) {
    observations.push(`${movedTitles.length} Verschiebungen — wiederkehrende Muster zeigen Überverpflichtung, nicht Willensschwäche.`);
  }
  if (counts.daysWithFocus === 1) {
    observations.push("Fokus nur an einem Tag — vermutlich war die Woche reaktiv. Das ist eine Beobachtung zum Kalender, nicht zu dir.");
  }

  return {
    weekStart,
    headline: `Woche ab ${weekStart}`,
    summary: `${counts.total} Fokus-Punkt(e) in der Woche.`,
    observations,
    counts,
  };
}

/* ==================== Reflexions-Fragen (Sprint 235) ==================== */

export type ReflectionPrompt = {
  id: string;
  question: string;
  /** Warum gerade diese Frage gestellt wird — damit sie nicht belehrend wirkt. */
  rationale: string;
};

/**
 * Wählt deterministisch 2 Reflexionsfragen passend zum Muster der Woche.
 * Der Katalog ist bewusst klein und ehrlich: keine Motivations-Fassaden,
 * keine Fragen, die die Antwort schon vorgeben.
 */
export function selectReflectionPrompts(review: WeeklyReview): ReflectionPrompt[] {
  const prompts: ReflectionPrompt[] = [];
  const { counts } = review;

  if (counts.total === 0) {
    prompts.push({
      id: "start-small",
      question: "Was ist nächste Woche der eine Punkt, der die Woche besser macht?",
      rationale: "Ohne diese Woche gibt es nichts zu bewerten — eine kleine Verpflichtung ist besser als eine große Planung.",
    });
    prompts.push({
      id: "calendar-reality",
      question: "Wann hatte diese Woche real 90 ungestörte Minuten?",
      rationale: "Fokus braucht Kalenderplätze. Die leere Woche zeigt meist ein Kalender-Problem, kein Disziplin-Problem.",
    });
    return prompts;
  }

  if (counts.moved >= 2) {
    prompts.push({
      id: "overcommitment",
      question: "Welcher verschobene Punkt war von Anfang an zu groß für einen Tag?",
      rationale: `${counts.moved} Verschiebungen zeigen Überverpflichtung — die Punktgröße prüfen, nicht die Willenskraft.`,
    });
  }
  if (counts.done === 0 && counts.total > 0) {
    prompts.push({
      id: "zero-done",
      question: "Was hat die Punkte konkret blockiert — Ziel, Zeit oder Energie?",
      rationale: "Nichts Erledigtes ist ein Signal, aber erst die Ursache macht es nützlich.",
    });
  }
  if (counts.done > 0 && counts.done >= counts.total * 0.7) {
    prompts.push({
      id: "sustain",
      question: "Was hat diesmal funktioniert, das du nächste Woche wiederholen willst?",
      rationale: "Gute Wochen sind keine Zufälle — die Bedingung benennen, sonst wiederholt sie sich nicht.",
    });
  }
  if (counts.active > 0) {
    prompts.push({
      id: "open-rest",
      question: "Welcher offene Punkt verdient es, in die nächste Woche zu wandern — und welcher nicht?",
      rationale: `${counts.active} offene Punkte vererben sich nicht von selbst — jeder braucht eine Entscheidung.`,
    });
  }
  if (counts.daysWithFocus === 1 && counts.total > 0) {
    prompts.push({
      id: "spread",
      question: "Warum hat der Fokus nur an einem einzigen Tag stattgefunden?",
      rationale: `Fokus an ${counts.daysWithFocus} von 7 Tagen — ein Muster im Kalender, kein Charakterzug.`,
    });
  }
  if (counts.dropped >= 2) {
    prompts.push({
      id: "dropped-honesty",
      question: "War der fallen gelassene Punkt jemals wichtig — oder nur laut?",
      rationale: "Fallen gelassen ist erlaubt. Die Prüfung verhindert, dass laute Punkte wöchentlich wiederkommen.",
    });
  }

  const defaults: ReflectionPrompt[] = [
    {
      id: "default-honest",
      question: "Was nimmst du aus dieser Woche für die nächste mit?",
      rationale: "Eine ruhige Woche — ohne Auffälligkeit ist die einfachste Frage die richtige.",
    },
    {
      id: "default-capacity",
      question: "Wie viele Fokus-Punkte sind nächste Woche realistisch — ehrlich geschätzt?",
      rationale: "Drei Punkte sind das Tageslimit, aber die Woche darf weniger wollen.",
    },
  ];
  for (const fallback of defaults) {
    if (prompts.length >= 2) break;
    prompts.push(fallback);
  }
  if (prompts.length === 0) {
    prompts.push({
      id: "default-honest",
      question: "Was nimmst du aus dieser Woche für die nächste mit?",
      rationale: "Eine ruhige Woche — ohne Auffälligkeit ist die einfachste Frage die richtige.",
    });
    prompts.push({
      id: "default-capacity",
      question: "Wie viele Fokus-Punkte sind nächste Woche realistisch — ehrlich geschätzt?",
      rationale: "Drei Punkte sind das Tageslimit, aber die Woche darf weniger wollen.",
    });
  }
  return prompts.slice(0, 2);
}

/* ==================== Prompt-Parsing (Sprint 236) ==================== */

export type FocusPromptAction = "add" | "complete" | "move" | "drop" | "review" | "day" | "list";

export type FocusPromptCommand = {
  actions: FocusPromptAction[];
  /** Titel des gemeinten Punktes — null, wenn keiner erkannt wurde. */
  titleQuery: string | null;
  /** ISO-Tag aus Klartext (heute/morgen/Wochentag/ISO) — null, wenn keiner erkannt. */
  day: string | null;
  newFocus: { title: string; day: string | null; note: string | null } | null;
};

const WEEKDAY_NAMES: Record<string, number> = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0,
};

function isoWeekday(offsetDays: number, now = Date.now): string {
  const date = new Date(now());
  date.setDate(date.getDate() + offsetDays);
  return isoDayFromTimestamp(date.getTime());
}

/**
 * Parst deutsche Fokus-Aufträge. Verneinte Aufträge ("nicht erledigen",
 * "keine Änderung") werden als reine Statusanfragen behandelt — das Modul
 * ändert nie ohne Freigabe.
 */
export function parseFocusPrompt(prompt: string, now = Date.now): FocusPromptCommand {
  const trimmed = prompt.trim();
  if (!trimmed) return { actions: ["list"], titleQuery: null, day: null, newFocus: null };
  const day = parseFocusDay(trimmed, now);

  const negated = /(nicht|kein\w*)\s+(erledig|verschieb|löschen|lösche|fallen|start|hinzufü|ändern)/i.test(trimmed);
  if (negated) {
    return { actions: ["day"], titleQuery: extractTitleQuery(trimmed), day, newFocus: null };
  }

  const actions: FocusPromptAction[] = [];
  if (/\b(fokus|hinzufü|füg\w*\s+hinzu|plan\w*|neuer punkt|anleg)/i.test(trimmed)) actions.push("add");
  if (/\b(erledig\w*|abgeschlossen|fertig|complete)/i.test(trimmed)) actions.push("complete");
  if (/\b(verschieb\w*|move)/i.test(trimmed)) actions.push("move");
  if (/\b(fallen\s*gelassen|fallen\s*lassen|streich\w*|drop|löschen|lösche)/i.test(trimmed)) actions.push("drop");
  if (/\b(wochenrückblick|rückblick|reflexion)/i.test(trimmed)) actions.push("review");
  if (/\b(status|stand|heute|tag|wie läuft)/i.test(trimmed)) actions.push("day");
  if (/\b(liste|übersicht|alle|zeig)/i.test(trimmed)) actions.push("list");
  if (actions.length === 0) actions.push("day");

  // Ohne erkennbaren Tag landet ein neuer Punkt bewusst auf heute — kein
  // unbekannter Tag, keine stillschweigende Verplanung auf morgen.
  const effectiveDay = day ?? (actions.includes("add") ? isoDayFromTimestamp(now()) : null);
  const newFocus = actions.includes("add") ? extractNewFocus(trimmed, effectiveDay) : null;
  return { actions, titleQuery: extractTitleQuery(trimmed), day, newFocus };
}

function parseFocusDay(prompt: string, now = Date.now): string | null {
  if (/\bheute\b/i.test(prompt)) return isoDayFromTimestamp(now());
  if (/\bmorgen\b/i.test(prompt)) return isoWeekday(1, now);
  if (/\bgestern\b/i.test(prompt)) return isoWeekday(-1, now);
  for (const [name, weekday] of Object.entries(WEEKDAY_NAMES)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(prompt)) {
      const date = new Date(now());
      const current = (date.getDay() + 6) % 7; // Montag = 0
      let delta = weekday === 0 ? 6 : weekday - 1 - current;
      if (/\bnächste\w*\b/i.test(prompt) && delta < 7) delta += 7;
      else if (delta < 0) delta += 7; // kommender Wochentag
      date.setDate(date.getDate() + delta);
      return isoDayFromTimestamp(date.getTime());
    }
  }
  const iso = prompt.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso?.[1] && isIsoDay(iso[1])) return iso[1];
  return null;
}

function extractTitleQuery(prompt: string): string | null {
  const quoted = prompt.match(/["'„]([^"'„]{3,})["'„]/);
  if (quoted?.[1]) return quoted[1].trim();
  const colon = prompt.match(/\b(?:für|von)\s+(?:den\s+Punkt\s+)?([\w\- /!?:.,&+]+)/i);
  return colon?.[1]?.trim() || null;
}

function extractNewFocus(prompt: string, day: string | null): { title: string; day: string | null; note: string | null } | null {
  const colon = prompt.match(/(?:Punkt|Fokus)\s*:([^;\n]+)/i);
  const title = colon?.[1]?.trim();
  if (!title || title.length < FOCUS_LIMITS.title.min) return null;
  const noteMatch = prompt.match(/Notiz\s*:([^;\n]+)/i);
  return { title, day, note: noteMatch?.[1]?.trim() ?? null };
}
