/**
 * Sprint 295 — Onboarding v2: geführter erster Lauf mit ehrlichen
 * Erwartungen. Erweitert das bestehende Onboarding (Sprint 117) um
 * eine klarere 3-Schritt-Struktur und ehrliche Grenzen.
 *
 * Datenfluss:
 *   AsyncStorage "cybersarah.onboarding.v2" — Abschluss-Flag.
 *   Das alte v1-Flag bleibt unangetastet (Bestandsschutz).
 *
 * Ehrlichkeits-Grenze: Das Onboarding verspricht nur, was die App
 * zum Start-Zeitpunkt tatsaechlich kann. KI-gestuetzte Features
 * ("optimalere Vorschläge") werden als Beta gekennzeichnet.
 */

export const ONBOARDING_V2_STORAGE_KEY = "cybersarah.onboarding.v2"; // gitleaks:allow

/** Die 3 gefuehrten Schritte (feste Reihenfolge). */
export type OnboardingV2StepId = "expectations" | "setup" | "ready";

export type OnboardingV2Step = {
  id: OnboardingV2StepId;
  title: string;
  text: string;
  honestLimit: string;
  icon: "hand.raised.fill" | "gearshape.fill" | "checkmark.circle.fill";
};

export const ONBOARDING_V2_STEPS: readonly OnboardingV2Step[] = [
  {
    id: "expectations",
    title: "Was CyberSarah kann",
    text: "CyberSarah hilft dir beim Entwickeln, Testen und Optimieren von Apps. Verbinde ein Repo, chatte mit dem Agenten, verfolge CI und erstelle Releases.",
    honestLimit: "Die KI-gestützten Features sind Beta—Vorschläge können unvollständig sein. Du behältst die Kontrolle über jeden Commit.",
    icon: "hand.raised.fill",
  },
  {
    id: "setup",
    title: "Deine ersten Einstellungen",
    text: "Wähle Sprache und Design. Du kannst beides jederzeit in den Einstellungen ändern. Verbinde optional jetzt ein Repository—oder später.",
    honestLimit: "Ohne verbundenes Repo sind Workspace-spezifische Tools (Commit-Vorschau, CI-Check) erst nach der Einbindung nutzbar.",
    icon: "gearshape.fill",
  },
  {
    id: "ready",
    title: "Bereit zum Start",
    text: "Du kennst die Grenzen, deine Basis ist eingerichtet. Der Chat-Tab ist dein Ausgangspunkt—frage alles, oder wähle einen Starter-Prompt.",
    honestLimit: "Manche erweiterten Features (Medien-Studio, Stripe-Abrechnung) benötigen zusätzliche Konfiguration in den Einstellungen.",
    icon: "checkmark.circle.fill",
  },
];

/** Index-Clamp: nie ausserhalb der Schrittliste. */
export function clampV2StepIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.round(index), 0), total - 1);
}

export type OnboardingV2StepState = {
  step: OnboardingV2Step;
  stepNumber: number;
  totalSteps: number;
  progress: number;
  isFirst: boolean;
  isLast: boolean;
  nextLabel: string;
  honorLimitVisible: boolean;
};

/** Zustand eines Onboarding-v2-Schritts. */
export function getOnboardingV2StepState(
  index: number,
  steps: readonly OnboardingV2Step[] = ONBOARDING_V2_STEPS
): OnboardingV2StepState {
  const total = steps.length;
  const safeIndex = clampV2StepIndex(index, total);
  const step = steps[safeIndex];
  return {
    step,
    stepNumber: safeIndex + 1,
    totalSteps: total,
    progress: total <= 1 ? 1 : safeIndex / (total - 1),
    isFirst: safeIndex === 0,
    isLast: safeIndex === total - 1,
    nextLabel: safeIndex === total - 1 ? "Los geht's" : "Weiter",
    honorLimitVisible: true,
  };
}

/** Normalisiert den Storage-Wert fuer das v2-Abschluss-Flag. */
export function normalizeOnboardingV2Completion(value: unknown): boolean {
  return value === "true" || value === true;
}

/** Entscheidet, ob ein Wechsel zum naechsten Schritt erlaubt ist. */
export function canAdvanceV2Step(currentIndex: number, totalSteps: number): boolean {
  return clampV2StepIndex(currentIndex, totalSteps) < totalSteps - 1;
}

/** Entscheidet, ob der Abschluss-Button aktiv ist (nur im letzten Schritt). */
export function canCompleteV2(currentIndex: number, totalSteps: number): boolean {
  return clampV2StepIndex(currentIndex, totalSteps) === totalSteps - 1;
}

/** Migrations-Helfer: Wenn v1 abgeschlossen ist, gilt v2 ebenfalls als erledigt (kein erneut-Erzwingen). */
export function shouldSkipV2IfV1Complete(v1Completed: boolean): boolean {
  return v1Completed;
}
