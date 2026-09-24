/**
 * Sprint 242 — Ideen-Inbox: Kern-Domäne (rein, testbar).
 *
 * Eine Idee ist ein Rohgedanke, noch keine Verpflichtung. Ehrlichkeits-
 * Regeln des Moduls:
 *   - Der Inbox-Speicher ist begrenzt (max. 30 offene Ideen) — ein endloser
 *     Stapel ist eine Ablage, kein Inbox.
 *   - Eine Idee ohne Titel existiert nicht; Herkunft wird ehrlich geführt.
 *   - Nichts verlässt die Inbox von selbst: keine automatische Löschung,
 *     keine stille Umwandlung in Fokus-Punkte.
 */

export const IDEA_LIMITS = {
  /** Offene Ideen im Inbox-Zustand — bewusst hart begrenzt. */
  maxInboxOpen: 30,
  title: { min: 3, max: 140 },
  note: { min: 0, max: 400 },
} as const;

export const IDEA_DISCLAIMER =
  "Die Ideen-Inbox sammelt Rohgedanken, keine Verpflichtungen: Triage und Pflanzen passieren ausschließlich nach deiner Bestätigung, nichts wird automatisch gelöscht oder umgewandelt.";

export type IdeaStatus = "inbox" | "kept" | "planted" | "dropped";

export type IdeaItem = {
  id: string;
  title: string;
  /** Optionale Notiz — der Rohgedanke darf unordentlich sein. */
  note: string;
  status: IdeaStatus;
  /** Woher die Idee stammt (z. B. "chat", "spontan", "rückblick"). */
  source: string;
  capturedAt: number;
  updatedAt: number;
};

export type IdeaValidation = { valid: true } | { valid: false; reason: string };

export function ideaStatusLabel(status: IdeaStatus): string {
  switch (status) {
    case "inbox": return "im Eingang";
    case "kept": return "behalten";
    case "planted": return "gepflanzt";
    case "dropped": return "fallen gelassen";
  }
}

export function validateIdeaItem(input: Partial<IdeaItem>): IdeaValidation {
  const title = (input.title ?? "").trim();
  if (title.length < IDEA_LIMITS.title.min || title.length > IDEA_LIMITS.title.max) {
    return { valid: false, reason: `Der Titel braucht ${IDEA_LIMITS.title.min}–${IDEA_LIMITS.title.max} Zeichen — eine Idee ohne Namen ist Stimmung, keine Idee.` };
  }
  const note = input.note ?? "";
  if (note.length > IDEA_LIMITS.note.max) {
    return { valid: false, reason: `Die Notiz ist zu lang (max. ${IDEA_LIMITS.note.max} Zeichen).` };
  }
  if (typeof input.source !== "string" || input.source.trim().length === 0) {
    return { valid: false, reason: "Die Herkunft fehlt — eine Idee ohne Quelle ist später nicht mehr ehrlich einzuordnen." };
  }
  if (input.status !== undefined && !["inbox", "kept", "planted", "dropped"].includes(input.status)) {
    return { valid: false, reason: "Unbekannter Ideen-Status." };
  }
  return { valid: true };
}

/** Zählt nur offene Inbox-Ideen — behaltene und gepflanzte blockieren keinen Platz. */
export function countInboxOpen(items: IdeaItem[]): number {
  return items.filter((item) => item.status === "inbox").length;
}

export function hasInboxCapacity(items: IdeaItem[]): boolean {
  return countInboxOpen(items) < IDEA_LIMITS.maxInboxOpen;
}

let ideaIdCounter = 0;

/** Erstellt eine normalisierte Idee; wirft bei invalider Eingabe. */
export function createIdeaItem(input: Partial<IdeaItem>, now = Date.now): IdeaItem {
  const validation = validateIdeaItem(input);
  if (!validation.valid) throw new Error(validation.reason);
  const timestamp = now();
  ideaIdCounter += 1;
  return {
    id: `idea-${timestamp.toString(36)}-${ideaIdCounter}`,
    title: input.title!.trim(),
    note: (input.note ?? "").trim(),
    status: input.status ?? "inbox",
    source: input.source!.trim(),
    capturedAt: timestamp,
    updatedAt: timestamp,
  };
}

/* ==================== Ideen-Reifung (Sprint 243) ==================== */

export type IdeaAge = "fresh" | "aging" | "withering";

export type IdeaAgeView = {
  age: IdeaAge;
  label: string;
  daysInInbox: number;
  /** Ehrliche Beschreibung, kein Mahntext, keine Lösch-Drohung. */
  observation: string;
};

/**
 * Beschreibt, wie lange eine Idee offen im Eingang liegt — als Beobachtung:
 * vergilbende Ideen sind keine Fehler, aber unsichtbar zu vergilben lügt
 * über den Zustand des Stapels.
 */
export function describeIdeaAge(idea: IdeaItem, now = Date.now): IdeaAgeView {
  const days = Math.max(0, Math.floor((now() - idea.capturedAt) / 86_400_000));
  if (days <= 2) {
    return { age: "fresh", label: "frisch", daysInInbox: days, observation: "Gerade erst angekommen — erst mal liegen lassen ist legitim." };
  }
  if (days <= 13) {
    return {
      age: "aging",
      label: "vergilbt",
      daysInInbox: days,
      observation: `${days} Tage im Eingang — noch nichts Verwerfliches, aber die Triage sollte sie bald gesehen haben.`,
    };
  }
  return {
    age: "withering",
    label: "verwelkend",
    daysInInbox: days,
    observation: `${days} Tage ohne Entscheidung — vermutlich war es ein Impuls, kein Vorhaben. Fallen lassen wäre ehrlicher als ewiges Aufbewahren.`,
  };
}

/** Alters-Statistik des ganzen Stapels — ehrlich, auch bei leerer Inbox. */
export function describeInboxAges(items: IdeaItem[], now = Date.now): { fresh: number; aging: number; withering: number; openTotal: number } {
  const open = items.filter((item) => item.status === "inbox");
  const views = open.map((idea) => describeIdeaAge(idea, now));
  return {
    fresh: views.filter((view) => view.age === "fresh").length,
    aging: views.filter((view) => view.age === "aging").length,
    withering: views.filter((view) => view.age === "withering").length,
    openTotal: open.length,
  };
}

/* ==================== Triage-Engine (Sprint 244) ==================== */

export type TriageSuggestionKind = "plant" | "keep" | "drop" | "watch";

export type TriageSuggestion = {
  ideaId: string;
  title: string;
  kind: TriageSuggestionKind;
  /** Warum diese Empfehlung — nachvollziehbar, nicht belehrend. */
  reason: string;
};

export type TriagePlan = {
  suggestions: TriageSuggestion[];
  summary: string;
  /** Bewusst nie automatisch: ein Plan ist ein Vorschlag, keine Ausführung. */
  requiresApproval: true;
};

/**
 * Baut einen deterministischen Triage-Vorschlag für offene Ideen.
 * Kriterien sind nachvollziehbar und konservativ:
 *   - verwelkende Ideen → Fallenlassen vorschlagen (nie ausführen)
 *   - vergilbte Ideen mit erkennbarem Vorhabens-Charakter (Zahl, Termin, Fokus-
 *     wort) → Pflanzen vorschlagen (Inbox → Fokus-Punkt, mit Freigabe)
 *   - frische Ideen → liegen lassen (watch) — gut gemeinte Eile erzeugt
 *     Pseudo-Verpflichtungen
 */
export function buildTriagePlan(items: IdeaItem[], now = Date.now): TriagePlan {
  const open = items
    .filter((item) => item.status === "inbox")
    .map((idea) => ({ idea, age: describeIdeaAge(idea, now) }));

  const suggestions: TriageSuggestion[] = [];
  for (const { idea, age } of open) {
    if (age.age === "withering") {
      suggestions.push({
        ideaId: idea.id,
        title: idea.title,
        kind: "drop",
        reason: `${age.daysInInbox} Tage im Eingang ohne Entscheidung — als Impuls war sie echt, als Vorhaben nie ernst gemeint.`,
      });
    } else if (age.age === "aging" && /\b(bis|deadline|woche|tag(e|en)?|termin|\d+)\b/i.test(`${idea.title} ${idea.note}`)) {
      suggestions.push({
        ideaId: idea.id,
        title: idea.title,
        kind: "plant",
        reason: `${age.daysInInbox} Tage im Eingang und erkennbar zeitlich gemeint — eher als Fokus-Punkt pflanzen als weiter lagern.`,
      });
    } else if (age.age === "aging") {
      suggestions.push({
        ideaId: idea.id,
        title: idea.title,
        kind: "keep",
        reason: `${age.daysInInbox} Tage im Eingang, aber ohne Zeitdruck — behalten und beim nächsten Rückblick erneut ansehen.`,
      });
    } else {
      suggestions.push({
        ideaId: idea.id,
        title: idea.title,
        kind: "watch",
        reason: "Frisch im Eingang — frühe Triage erzeugt Pseudo-Verpflichtungen; liegen lassen ist die ehrliche Empfehlung.",
      });
    }
  }

  const counts = {
    plant: suggestions.filter((s) => s.kind === "plant").length,
    keep: suggestions.filter((s) => s.kind === "keep").length,
    drop: suggestions.filter((s) => s.kind === "drop").length,
    watch: suggestions.filter((s) => s.kind === "watch").length,
  };
  const summary = open.length === 0
    ? "Keine offenen Ideen im Eingang — der leere Stapel ist echt, kein Fehler."
    : `${open.length} offene Idee(n): ${counts.plant}× pflanzen, ${counts.keep}× behalten, ${counts.drop}× fallen lassen, ${counts.watch}× liegen lassen — alles nur Vorschläge, nichts wird ohne dich entschieden.`;

  return { suggestions, summary, requiresApproval: true };
}

/* ==================== Prompt-Parsing (Sprint 245) ==================== */

export type IdeaPromptAction = "add" | "triage" | "status" | "list" | "keep" | "plant" | "drop";

export type IdeaPromptCommand = {
  actions: IdeaPromptAction[];
  /** Titel-Bezug einer gemeinten Idee — null, wenn keiner erkannt. */
  titleQuery: string | null;
  newIdea: { title: string; note: string | null; source: string } | null;
};

/** Parst deutsche Ideen-Aufträge. Verneinte Aufträge bleiben Anfragen. */
export function parseIdeaPrompt(prompt: string): IdeaPromptCommand {
  const trimmed = prompt.trim();
  if (!trimmed) return { actions: ["list"], titleQuery: null, newIdea: null };

  const negated = /(nicht|kein\w*)\s+(pflanz|löschen|lösche|fallen|streich|behalte|behalten|triag)/i.test(trimmed);
  if (negated) {
    return { actions: ["status"], titleQuery: extractIdeaTitleQuery(trimmed), newIdea: null };
  }

  const actions: IdeaPromptAction[] = [];
  if (/\b(idee|gedanke|hinzufü|füg\w*\s+hinzu|notier|notiere|sammel|sammle)/i.test(trimmed)) actions.push("add");
  if (/\b(triage|sortier|sortiere|aufräum|aufräumen|vorschlag|vorschläge)/i.test(trimmed)) actions.push("triage");
  if (/\b(status|stand|lage|wie viele)/i.test(trimmed)) actions.push("status");
  if (/\b(liste|übersicht|alle|zeig|stapel)/i.test(trimmed)) actions.push("list");
  if (/\b(behalte|behalten|keep)/i.test(trimmed)) actions.push("keep");
  if (/\b(pflanz|pflanze|in\s+fokus|fokus-punkt)/i.test(trimmed)) actions.push("plant");
  if (/\b(fallen\s*lassen|streich\w*|löschen|lösche|drop)/i.test(trimmed)) actions.push("drop");
  if (actions.length === 0) actions.push("status");

  const newIdea = actions.includes("add") ? extractNewIdea(trimmed) : null;
  return { actions, titleQuery: extractIdeaTitleQuery(trimmed), newIdea };
}

function extractIdeaTitleQuery(prompt: string): string | null {
  const quoted = prompt.match(/["'„]([^"'„]{3,})["'„]/);
  if (quoted?.[1]) return quoted[1].trim();
  return null;
}

function extractNewIdea(prompt: string): { title: string; note: string | null; source: string } | null {
  const colon = prompt.match(/(?:Idee|Gedanke)\s*:([^;\n]+)/i);
  const title = colon?.[1]?.trim();
  if (!title || title.length < IDEA_LIMITS.title.min) return null;
  const noteMatch = prompt.match(/Notiz\s*:([^;\n]+)/i);
  const sourceMatch = prompt.match(/Quelle\s*:([^;\n]+)/i);
  return { title, note: noteMatch?.[1]?.trim() ?? null, source: sourceMatch?.[1]?.trim() ?? "spontan" };
}
