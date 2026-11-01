/**
 * Sprint 349 — Android: Predictive Back + Rückabwicklungs-Animationen.
 *
 * Reine, deterministische Logik für Android 13/14+ Predictive Back Gesten
 * und Rückabwicklungs-Visualisierungen.
 *
 * Datenfluss:
 *   Bei Touch-Geste am Bildschirmrand ('left' oder 'right') startet die Session.
 *   Während der Nutzer wischt, wird der Fortschritt (0.0 bis 1.0) aktualisiert.
 *   Die UI berechnet damit die Karten-Skalierung, Abrundung und Deckkraft.
 *   Beim Loslassen wird die Geste über oder unter dem Schwellenwert (default 35%)
 *   entweder abgeschlossen (commit) oder abgebrochen (cancel).
 *
 * Ehrlichkeits-Grenze:
 *   Native Hardware-Predictive-Back-Vorschauen setzen Android API Level >= 33
 *   (Android 13+) voraus. Auf älteren Versionen oder im Web wird die Logik
 *   als Fallback ohne System-Vorschau-Layer ausgeführt.
 */

export type GestureStatus = "idle" | "started" | "progress" | "completed" | "cancelled";

export type PredictiveBackGestureState = {
  status: GestureStatus;
  swipeX: number;
  progress: number; // 0.0 bis 1.0
  edge: "left" | "right";
  sourceRoute: string;
  targetRoute: string | null;
  canGoBack: boolean;
  isModal: boolean;
};

export type PredictiveTransformResult = {
  scale: number; // e.g. 1.0 -> 0.90
  borderRadius: number; // e.g. 0 -> 16px
  opacity: number; // e.g. 1.0 -> 0.7
  translateX: number; // horizontal displacement in px
  translateY: number; // vertical displacement for modals
  backdropOpacity: number; // backdrop dimmer 0.5 -> 0.0
};

export const DEFAULT_BACK_THRESHOLD = 0.35; // 35% swipe distance to confirm back action

/**
 * Prüft, ob Predictive Back natively unterstützt wird (Android API 33+).
 */
export function isPredictiveBackSupported(platform: string, apiLevel: number): boolean {
  if (platform.toLowerCase() !== "android") return false;
  return apiLevel >= 33;
}

/**
 * Startet eine neue Predictive-Back-Gesten-Session.
 */
export function startPredictiveBackGesture(params: {
  sourceRoute: string;
  targetRoute?: string | null;
  canGoBack: boolean;
  isModal?: boolean;
  edge?: "left" | "right";
}): PredictiveBackGestureState {
  return {
    status: "started",
    swipeX: 0,
    progress: 0,
    edge: params.edge ?? "left",
    sourceRoute: params.sourceRoute,
    targetRoute: params.targetRoute ?? null,
    canGoBack: params.canGoBack,
    isModal: params.isModal ?? false,
  };
}

/**
 * Aktualisiert den Fortschritt der Wischgeste basierend auf der Wischdistanz und Bildschirmbreite.
 */
export function updatePredictiveBackProgress(
  state: PredictiveBackGestureState,
  swipeDistanceX: number,
  screenWidth: number,
): PredictiveBackGestureState {
  if (state.status !== "started" && state.status !== "progress") {
    return state;
  }

  const effectiveWidth = Math.max(screenWidth, 1);
  const rawProgress = Math.max(0, swipeDistanceX) / effectiveWidth;
  const clampedProgress = Math.min(1.0, Math.max(0.0, rawProgress));

  return {
    ...state,
    status: "progress",
    swipeX: Math.max(0, swipeDistanceX),
    progress: clampedProgress,
  };
}

/**
 * Berechnet die visuellen Transformationsparameter für die Rückabwicklungs-Animation.
 */
export function calculatePredictiveTransform(
  progress: number,
  isModal: boolean = false,
): PredictiveTransformResult {
  const p = Math.min(1.0, Math.max(0.0, progress));

  if (isModal) {
    // Modal-Blatt schiebt sich nach unten ab
    return {
      scale: 1.0 - p * 0.05, // 1.0 -> 0.95
      borderRadius: Math.round(p * 20), // 0 -> 20px
      opacity: 1.0 - p * 0.3, // 1.0 -> 0.7
      translateX: 0,
      translateY: Math.round(p * 250), // Modal verschiebt sich nach unten
      backdropOpacity: 0.5 * (1.0 - p),
    };
  }

  // Standard Screen Back Transition (Verkleinerung & Karteneffekt)
  return {
    scale: 1.0 - p * 0.1, // 1.0 -> 0.90
    borderRadius: Math.round(p * 16), // 0 -> 16px
    opacity: 1.0 - p * 0.25, // 1.0 -> 0.75
    translateX: Math.round(p * 40), // Leichte Verschiebung
    translateY: 0,
    backdropOpacity: 0.4 * (1.0 - p),
  };
}

/**
 * Entscheidet, ob Haptik ausgelöst werden soll, wenn die Schwelle überschritten wird.
 */
export function shouldTriggerHapticFeedback(
  previousProgress: number,
  currentProgress: number,
  threshold: number = DEFAULT_BACK_THRESHOLD,
): boolean {
  const crossedAbove = previousProgress < threshold && currentProgress >= threshold;
  const crossedBelow = previousProgress >= threshold && currentProgress < threshold;
  return crossedAbove || crossedBelow;
}

/**
 * Schließt die Geste ab und führt bei ausreichendem Fortschritt die Zurück-Aktion aus.
 */
export function commitPredictiveBackGesture(
  state: PredictiveBackGestureState,
  threshold: number = DEFAULT_BACK_THRESHOLD,
): {
  state: PredictiveBackGestureState;
  action: "navigate_back" | "dismiss_modal" | "exit_app" | "cancelled_insufficient_progress";
  targetRoute: string | null;
} {
  if (state.progress < threshold) {
    return {
      state: { ...state, status: "cancelled" },
      action: "cancelled_insufficient_progress",
      targetRoute: null,
    };
  }

  const completedState: PredictiveBackGestureState = {
    ...state,
    status: "completed",
  };

  if (state.isModal) {
    return {
      state: completedState,
      action: "dismiss_modal",
      targetRoute: state.targetRoute,
    };
  }

  if (!state.canGoBack) {
    return {
      state: completedState,
      action: "exit_app",
      targetRoute: null,
    };
  }

  return {
    state: completedState,
    action: "navigate_back",
    targetRoute: state.targetRoute,
  };
}

/**
 * Bricht die Predictive-Back-Geste manuell ab.
 */
export function cancelPredictiveBackGesture(
  state: PredictiveBackGestureState,
): PredictiveBackGestureState {
  return {
    ...state,
    status: "cancelled",
    progress: 0,
    swipeX: 0,
  };
}
