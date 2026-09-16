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
    title: "Dein Look",
    text: "Waehle ein Design und ob die App hell, dunkel oder dem System folgen soll. Jederzeit im Konto-Tab aenderbar.",
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

/* ==================== Theme-Auswahl ==================== */

/**
 * Kuratierte Design-Auswahl im Onboarding. Die Registry ist die einzige
 * Quelle, damit neue produktive Paletten nicht nur im Konto-Tab erscheinen.
 */
// Sprint 127 — "neon" (Cyber Neon) ist das Standard-Design und steht an erster Stelle.
export const ONBOARDING_THEME_CHOICES: readonly DesignTheme[] = DESIGN_THEMES;

export type OnboardingThemeChoice = {
  theme: DesignTheme;
  label: string;
  description: string;
  icon: "bolt.fill" | "chart.bar.fill" | "sparkles" | "wand.and.stars";
};

/**
 * Theme-Metadaten fuer die Auswahl-Karten; nur bekannte Designs aus der
 * Registry kommen durch (unbekannte Wahl → Fallback Standard-Design).
 */
export function getOnboardingThemeChoices(): OnboardingThemeChoice[] {
  return ONBOARDING_THEME_CHOICES.filter((theme) => DESIGN_THEMES.includes(theme)).map((theme) => ({
    theme,
    label: designThemeLabel(theme),
    description: designThemeDescription(theme),
    icon: designThemeIcon(theme),
  }));
}

/** Validiert eine Design-Wahl aus dem Onboarding (unbekannt → Standard). */
export function normalizeOnboardingDesignTheme(value: unknown, fallback: DesignTheme): DesignTheme {
  return typeof value === "string" && (DESIGN_THEMES as readonly string[]).includes(value) ? (value as DesignTheme) : fallback;
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
