/**
 * Sprint 297 — Chat-Leerer-Zustand: reine, deterministische Logik fuer
 * hilfreiche Starter-Prompts statt weisser Flaeche im leeren Chat.
 *
 * Datenfluss:
 *   Die Starter-Prompts sind eine statische Liste—kein Server-Roundtrip.
 *   Auswahl und Mehrfachverwendung sind rein berechnet.
 *
 * Ehrlichkeits-Grenze: Starter-Prompts koennen kontextbezogen
 *   unpassend sein (z. B. "Analysiere die CI" ohne verbundenes Repo).
 *   Die Aktion wird beim Klick ausgefuehrt, aber das Ergebnis kann
 *   leer sein, wenn der Kontext fehlt. Der Prompt bleibt aber sichtbar—
 *   niemals still verstecken.
 */

export type StarterPrompt = {
  id: string;
  title: string;
  subtitle: string;
  icon: "doc.text.fill" | "bolt.fill" | "wand.and.stars" | "chart.bar.fill";
  /** Wenn true, ist der Prompt nur sinnvoll mit verbundenem Repo. */
  requiresRepo: boolean;
};

/** Feste Liste der Starter-Prompts fuer den leeren Chat-Zustand. */
export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  {
    id: "explain-project",
    title: "Erkläre mein Projekt",
    subtitle: "Übersicht über die aktuelle App-Struktur",
    icon: "doc.text.fill",
    requiresRepo: false,
  },
  {
    id: "analyze-ci",
    title: "CI-Pipeline analysieren",
    subtitle: "Letzte Builds und Fehlermeldungen prüfen",
    icon: "bolt.fill",
    requiresRepo: true,
  },
  {
    id: "optimize-onboarding",
    title: "Onboarding verbessern",
    subtitle: "Vorschläge für den ersten Nutzerlauf",
    icon: "wand.and.stars",
    requiresRepo: false,
  },
  {
    id: "summarize-commits",
    title: "Letzte Commits zusammenfassen",
    subtitle: "Was hat sich in den letzten Tagen geändert?",
    icon: "chart.bar.fill",
    requiresRepo: true,
  },
];

/** Komplette Liste, ungefiltert. */
export function getAllStarterPrompts(): StarterPrompt[] {
  return [...STARTER_PROMPTS];
}

/**
 * Filtert Prompts nach Kontext: wenn kein Repo verbunden ist,
 * werden Repo-abhaengige Prompts als "deaktiviert" markiert—aber
 * NIEMALS versteckt. Der Nutzer sieht, was moeglich waere.
 */
export function getStarterPromptsForContext(hasRepo: boolean): {
  prompt: StarterPrompt;
  enabled: boolean;
}[] {
  return STARTER_PROMPTS.map((prompt) => ({
    prompt,
    enabled: !prompt.requiresRepo || hasRepo,
  }));
}

/** Prueft, ob ein Starter-Prompt im aktuellen Kontext ausfuehrbar ist. */
export function isStarterPromptAvailable(prompt: StarterPrompt, hasRepo: boolean): boolean {
  return !prompt.requiresRepo || hasRepo;
}

/** Zeigt eine Hinweis-Nachricht fuer deaktivierte Prompts an. */
export function getDisabledPromptHint(prompt: StarterPrompt): string {
  if (prompt.requiresRepo) {
    return "Verbinde zuerst ein Repository, um diesen Prompt zu nutzen.";
  }
  return "";
}

/** Normalisiert die Auswahl einer Prompt-ID. */
export function normalizeStarterPromptId(value: unknown): StarterPrompt | undefined {
  if (typeof value !== "string") return undefined;
  return STARTER_PROMPTS.find((p) => p.id === value);
}
