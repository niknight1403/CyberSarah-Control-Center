/**
 * Sprint 250 — Brücke Ideen-Inbox → Fokus-Modul (rein, testbar).
 *
 * Single-Writer-Prinzip: Jedes Modul schreibt nur seinen eigenen Speicher.
 * Diese Brücke entscheidet deshalb nur, OB und WOHIN eine Idee als
 * Fokus-Punkt pflanzbar wäre — angelegt wird der Punkt ausschließlich im
 * Fokus-Modul mit dessen Bestätigungs-Flow. Fehlende Kapazität oder ein
 * invalider Titel werden ehrlich benannt, nie still umgangen.
 */

import {
  FOCUS_LIMITS,
  hasDayCapacity,
  isoDayFromTimestamp,
  validateFocusItem,
  type FocusItem,
} from "@/lib/focus-review-logic";
import type { IdeaItem } from "@/lib/idea-inbox-logic";

export type PlantVerdict =
  | { plantable: true; day: string; draftTitle: string; detail: string }
  | { plantable: false; reason: string };

/**
 * Prüft, ob eine Idee an einem Tag als Fokus-Punkt pflanzbar wäre.
 * Ohne expliziten Tag gilt heute — nie morgen, nie geraten.
 */
export function checkPlantVerdict(
  idea: IdeaItem,
  focusItems: FocusItem[],
  day: string | null,
  now = Date.now,
): PlantVerdict {
  const targetDay = day ?? isoDayFromTimestamp(now());
  const draftTitle = idea.title.length > FOCUS_LIMITS.title.max ? `${idea.title.slice(0, FOCUS_LIMITS.title.max - 1)}…` : idea.title;
  const validation = validateFocusItem({ day: targetDay, title: draftTitle, note: idea.note });
  if (!validation.valid) {
    return { plantable: false, reason: `Als Fokus-Punkt ungeeignet: ${validation.reason}` };
  }
  if (!hasDayCapacity(focusItems, targetDay)) {
    return {
      plantable: false,
      reason: `Tag ${targetDay} ist voll: max. ${FOCUS_LIMITS.maxPerDay} Fokus-Punkte pro Tag — erst dort etwas abschließen oder verschieben.`,
    };
  }
  return {
    plantable: true,
    day: targetDay,
    draftTitle,
    detail: `Als Fokus-Punkt für ${targetDay} pflanzbar — Anlegen im Fokus-Tab mit "Plane Fokus: ${draftTitle}" und Bestätigung.`,
  };
}

/**
 * Prüft alle Pflanz-Vorschläge eines Triage-Plans und markiert ehrlich,
 * welche davon heute wirklich pflanzbar wären.
 */
export function annotateTriagePlantability(
  plan: { suggestions: { ideaId: string; kind: "plant" | "keep" | "drop" | "watch" }[] },
  ideas: IdeaItem[],
  focusItems: FocusItem[],
  now = Date.now,
): Map<string, PlantVerdict> {
  const verdicts = new Map<string, PlantVerdict>();
  for (const suggestion of plan.suggestions) {
    if (suggestion.kind !== "plant") continue;
    const idea = ideas.find((entry) => entry.id === suggestion.ideaId);
    if (idea) verdicts.set(suggestion.ideaId, checkPlantVerdict(idea, focusItems, null, now));
  }
  return verdicts;
}
