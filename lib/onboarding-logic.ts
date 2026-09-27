/**
 * Sprint 117 — Onboarding: reine, deterministische Logik fuer den
 * Willkommensflow beim ersten Start (liquid-glass-inspiriert, siehe
 * Tech-Scan-Fund "liquid-glass-screens").
 *
 * Datenfluss:
 *   AsyncStorage "cybersarah.onboarding.v1" — Abschluss-Flag ("true"),
 *   einmal gesetzt startet die App direkt in den Tabs (Sprint-Flow bleibt
 *   Bestandsinstallationen erspart: ohne Flag gilt der Flow als offen).
 *
 * Das UI (app/onboarding.tsx) rendert nur; alle Regeln — Reihenfolge der
 * Slides, Fortschritt, Theme-Auswahl-Filter, Abschluss-Entscheidung —
 * liegen hier rein und sind getestet.
 */

import type { DesignTheme } from "@/lib/design-theme-logic";
import { DESIGN_THEMES, designThemeDescription, designThemeIcon, designThemeLabel } from "@/lib/design-theme-logic";

/* ==================== Storage ==================== */

/** Abschluss-Flag: einmal "true" wird der Willkommensflow nie wieder gezeigt. */
export const ONBOARDING_STORAGE_KEY = "cybersarah.onboarding.v1";

/** AsyncStorage speichert Strings — nur exakt "true" zaehlt als abgeschlossen. */
export function normalizeOnboardingCompletion(value: unknown): boolean {
  return value === "true" || value === true;
}

/* ==================== Slides ==================== */

export type OnboardingSlide = {
  id: "welcome" | "workspace" | "theme";
  title: string;
  text: string;
  icon: "sparkles" | "folder.fill" | "wand.and.stars";
};

/** Fester, deutscher Ablauf: Begruessung → Workspace → Theme-Auswahl. */
export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: "welcome",
    title: "Willkommen bei CyberSarah",
    text: "Dein persoenliches KI-Control-Center: Agenten, Workspace, Dashboard und Qualitaet — alles an einem Ort.",
    icon: "sparkles",
  },
  {
    id: "workspace",
    title: "Dein Workspace",
    text: "Repository anbinden, Commits und Pull Requests pruefen, Qualitaet im Blick behalten — die Tabs fuehren dich durch.",
    icon: "folder.fill",
  },
  {
    id: "theme",
    title: "Dein Erscheinungsbild",
    text: "Aurora Flow ist fest eingestellt. Lege nur fest, ob die App hell, dunkel oder dem System folgen soll — jederzeit im Konto-Tab aenderbar.",
    icon: "wand.and.stars",
  },
];

/** Index-Clamp: ungueltige Werte landen im gueltigen Bereich, nie abstuerzen. */
export function clampOnboardingStepIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.round(index), 0), total - 1);
}

export type OnboardingStepState = {
  slide: OnboardingSlide;
  /** Fortschritt 0..1 fuer Punkte/Balken. */
  progress: number;
  isFirst: boolean;
  isLast: boolean;
  /** Button-Label des Vorwaerts-Schritts. */
  nextLabel: "Weiter" | "Los geht's";
};

/** Zustand eines Onboarding-Schritts (rein, total wird gegen die Slides geprueft). */
export function getOnboardingStepState(index: number, slides: readonly OnboardingSlide[] = ONBOARDING_SLIDES): OnboardingStepState {
  const total = slides.length;
  const safeIndex = clampOnboardingStepIndex(index, total);
  const slide = slides[safeIndex];
  return {
    slide,
    progress: total <= 1 ? 1 : safeIndex / (total - 1),
    isFirst: safeIndex === 0,
    isLast: safeIndex === total - 1,
    nextLabel: safeIndex === total - 1 ? "Los geht's" : "Weiter",
  };
}

/* ==================== Erscheinungsbild ==================== */

/**
 * Sprint 355 — Design-Auswahl entfernt: Aurora Flow ist das einzige Design.
 * Der Onboarding-Schritt fragt nur noch die Hell/Dunkel-Präferenz ab.
 */
export function normalizeOnboardingDesignTheme(value: unknown, fallback: DesignTheme): DesignTheme {
  return "aurora";
}

/* ==================== Abschluss ==================== */

/**
 * Entscheidet (rein) den Abschluss: Design-Wahl und Hell/Dunkel-Praeferenz
 * sind Pflicht, der Flow gilt erst mit bestaetigtem letzten Schritt als
 * abgeschlossen und wird persistent.
 */
export function shouldCompleteOnboarding(isLastStep: boolean, designThemeChosen: boolean): boolean {
  return isLastStep && designThemeChosen;
}
