/**
 * Sprint 350 — Tastatur-Handling: Chat-Eingabe, Formulare, kein Overlay-Verstecken.
 *
 * Reine, deterministische Logik zur Berechnung von Keyboard-Offsets,
 * Fokus-Nachführung für Eingabefelder und Vermeidung von Overlay-Überlappung.
 *
 * Datenfluss:
 *   Die UI sendet Events bei Tastatur-Einblendung/Ausblendung und Fokuswechsel.
 *   Diese Logik berechnet die minimal erforderliche Scroll-Verschiebung (offsetY),
 *   damit das fokussierte Formularelement oder die Chat-Toolbar nicht von der
 *   Tastatur verdeckt wird.
 *
 * Ehrlichkeits-Grenze:
 *   Auf Mobile Web basiert die Tastatur-Höhenerkennung auf der `visualViewport`-API
 *   oder Fenstergrößenänderungen. Bei ungenauen Inset-Daten der Plattform wird ein
 *   Standard-Sicherheitsabstand (extraPadding) hinzugerechnet.
 */

export type InputBounds = {
  y: number; // Y-Position im Dokument/Scroll-Container
  height: number;
};

export type KeyboardState = {
  isVisible: boolean;
  keyboardHeight: number;
  animationDurationMs: number;
  focusedInputId: string | null;
  focusedInputBounds: InputBounds | null;
};

export type ScrollOffsetResult = {
  requiredScrollY: number;
  isCovered: boolean;
  deltaY: number;
};

export const DEFAULT_KEYBOARD_ANIMATION_MS = 250;
export const DEFAULT_EXTRA_PADDING = 16;

/**
 * Erzeugt einen initialen Tastatur-Zustand.
 */
export function createKeyboardState(): KeyboardState {
  return {
    isVisible: false,
    keyboardHeight: 0,
    animationDurationMs: DEFAULT_KEYBOARD_ANIMATION_MS,
    focusedInputId: null,
    focusedInputBounds: null,
  };
}

/**
 * Aktualisiert den Zustand bei Einblendung der Tastatur.
 */
export function handleKeyboardShow(
  state: KeyboardState,
  keyboardHeight: number,
  animationDurationMs: number = DEFAULT_KEYBOARD_ANIMATION_MS,
): KeyboardState {
  const safeHeight = Math.max(0, keyboardHeight);
  return {
    ...state,
    isVisible: safeHeight > 0,
    keyboardHeight: safeHeight,
    animationDurationMs: Math.max(0, animationDurationMs),
  };
}

/**
 * Aktualisiert den Zustand bei Ausblendung der Tastatur.
 */
export function handleKeyboardHide(
  state: KeyboardState,
  animationDurationMs: number = DEFAULT_KEYBOARD_ANIMATION_MS,
): KeyboardState {
  return {
    ...state,
    isVisible: false,
    keyboardHeight: 0,
    animationDurationMs: Math.max(0, animationDurationMs),
  };
}

/**
 * Setzt das aktuell fokussierte Eingabefeld.
 */
export function setFocusedInput(
  state: KeyboardState,
  inputId: string | null,
  bounds?: InputBounds | null,
): KeyboardState {
  return {
    ...state,
    focusedInputId: inputId,
    focusedInputBounds: bounds ?? null,
  };
}

/**
 * Berechnet, ob ein Eingabefeld verdeckt ist und wie weit der ScrollView gescrollt werden muss.
 */
export function calculateKeyboardScrollOffset(params: {
  inputY: number;
  inputHeight: number;
  viewportHeight: number;
  keyboardHeight: number;
  currentScrollY: number;
  extraPadding?: number;
}): ScrollOffsetResult {
  const {
    inputY,
    inputHeight,
    viewportHeight,
    keyboardHeight,
    currentScrollY,
    extraPadding = DEFAULT_EXTRA_PADDING,
  } = params;

  // Sichtbare Höhe des Bildschirms oberhalb der Tastatur
  const visibleViewportHeight = Math.max(0, viewportHeight - Math.max(0, keyboardHeight));

  // Untere Kante des Eingabefeldes im sichtbaren Bereich
  const inputBottomRelative = inputY + inputHeight + extraPadding - currentScrollY;

  // Verdeckt, wenn die untere Kante über der sichtbaren Höhe liegt
  const isCovered = inputBottomRelative > visibleViewportHeight;

  if (!isCovered) {
    return {
      requiredScrollY: currentScrollY,
      isCovered: false,
      deltaY: 0,
    };
  }

  // Wieviel muss gescrollt werden, damit das Feld sichtbar wird
  const deltaY = inputBottomRelative - visibleViewportHeight;
  const requiredScrollY = currentScrollY + deltaY;

  return {
    requiredScrollY: Math.max(0, requiredScrollY),
    isCovered: true,
    deltaY: Math.max(0, deltaY),
  };
}

/**
 * Berechnet den Offset für die Chat-Eingabeleiste (sticky toolbar),
 * damit sie exakt über der Tastatur verbleibt.
 */
export function calculateChatToolbarOffset(
  keyboardHeight: number,
  isKeyboardVisible: boolean,
  safeAreaBottomPadding: number = 0,
): number {
  if (!isKeyboardVisible || keyboardHeight <= 0) {
    return Math.max(0, safeAreaBottomPadding);
  }
  // Wenn die Tastatur sichtbar ist, ersetzt sie die Bottom-SafeArea
  return Math.max(0, keyboardHeight);
}

/**
 * Ermittelt das nächste oder vorherige fokussierbare Formularfeld für die 'Weiter'/'Zurück'-Steuerung.
 */
export function getNextInputFocus(
  inputs: Array<{ id: string; disabled?: boolean }>,
  currentInputId: string,
  direction: "next" | "previous",
): string | null {
  const enabledInputs = inputs.filter((inp) => !inp.disabled);
  if (enabledInputs.length === 0) return null;

  const currentIndex = enabledInputs.findIndex((inp) => inp.id === currentInputId);
  if (currentIndex === -1) {
    return enabledInputs[0].id;
  }

  if (direction === "next") {
    const nextIndex = currentIndex + 1;
    return nextIndex < enabledInputs.length ? enabledInputs[nextIndex].id : null;
  } else {
    const prevIndex = currentIndex - 1;
    return prevIndex >= 0 ? enabledInputs[prevIndex].id : null;
  }
}

/**
 * Berechnet die Anpassung der BottomSheet-Höhe bei aktiver Tastatur.
 */
export function calculateBottomSheetKeyboardOffset(
  bottomSheetHeight: number,
  keyboardHeight: number,
  viewportHeight: number,
): { adjustedHeight: number; overflowPx: number } {
  const visibleViewport = Math.max(0, viewportHeight - Math.max(0, keyboardHeight));
  const isOverflowing = bottomSheetHeight > visibleViewport;

  if (!isOverflowing) {
    return {
      adjustedHeight: bottomSheetHeight,
      overflowPx: 0,
    };
  }

  return {
    adjustedHeight: visibleViewport,
    overflowPx: bottomSheetHeight - visibleViewport,
  };
}
