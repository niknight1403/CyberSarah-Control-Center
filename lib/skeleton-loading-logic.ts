/**
 * Sprint 346 — Skeleton-Lade-Logik: entscheidet, welche Skeleton-Platzhalter
 * auf welchen Kern-Screens gezeigt werden, statt universeller Spinner.
 *
 * Datenfluss:
 *   Die UI meldet den aktiven Screen und ob Daten bereits vorliegen.
 *   Diese Logik erzeugt eine Skeleton-Konfiguration (welche Zeilen/Karten,
 *   in welcher Anzahl, mit welchem Typ), die die UI direkt rendern kann.
 *
 * Ehrlichkeits-Grenze:
 *   Wenn ein Screen-Typ unbekannt ist, liefert die Logik ein minimales
 *   Generic-Skeleton statt gar nichts — aber kennzeichnet es als Fallback.
 *   Skeletons werden nur gezeigt, wenn Daten tatsaechlich noch nicht
 *   vorliegen (hasData === false). Bei Teil-Daten wird ein Hybrid-Modus
 *   empfohlen: vorhandene Daten zeigen, fuer fehlende Bereiche Skeletons.
 */

export type SkeletonType = "line" | "card" | "avatar" | "chat-bubble" | "list-row" | "media-tile";

export type ScreenType =
  | "chat"
  | "media-studio"
  | "dashboard"
  | "settings"
  | "admin"
  | "integrations"
  | "billing"
  | "generic";

export type SkeletonItem = {
  type: SkeletonType;
  /** Relative Breite in Prozent (0-100), oder null fuer Vollbreite. */
  widthPercent: number | null;
  /** Zeilenhoehe in px (default 16). */
  heightPx: number;
};

export type SkeletonConfig = {
  screen: ScreenType;
  items: SkeletonItem[];
  /** True wenn dies ein Fallback-Skeleton fuer einen unbekannten Screen ist. */
  isFallback: boolean;
  /** Minimale Anzeigezeit in ms, um Skeleton-Flackern zu vermeiden. */
  minDisplayMs: number;
};

export type SkeletonInput = {
  screen: ScreenType;
  hasData: boolean;
  /** Anzahl der erwarteten Elemente (z. B. Chat-Nachrichten); null = Standard. */
  expectedCount?: number | null;
};

const DEFAULT_MIN_DISPLAY_MS = 200;

const SCREEN_PRESETS: Record<ScreenType, SkeletonItem[]> = {
  chat: [
    { type: "chat-bubble", widthPercent: 80, heightPx: 48 },
    { type: "chat-bubble", widthPercent: 60, heightPx: 36 },
    { type: "chat-bubble", widthPercent: 90, heightPx: 56 },
    { type: "chat-bubble", widthPercent: 50, heightPx: 32 },
    { type: "chat-bubble", widthPercent: 70, heightPx: 40 },
  ],
  "media-studio": [
    { type: "media-tile", widthPercent: 48, heightPx: 120 },
    { type: "media-tile", widthPercent: 48, heightPx: 120 },
    { type: "media-tile", widthPercent: 48, heightPx: 120 },
    { type: "media-tile", widthPercent: 48, heightPx: 120 },
  ],
  dashboard: [
    { type: "card", widthPercent: 100, heightPx: 80 },
    { type: "card", widthPercent: 100, heightPx: 80 },
    { type: "card", widthPercent: 100, heightPx: 80 },
  ],
  settings: [
    { type: "list-row", widthPercent: 100, heightPx: 56 },
    { type: "list-row", widthPercent: 100, heightPx: 56 },
    { type: "list-row", widthPercent: 100, heightPx: 56 },
    { type: "list-row", widthPercent: 100, heightPx: 56 },
  ],
  admin: [
    { type: "card", widthPercent: 48, heightPx: 100 },
    { type: "card", widthPercent: 48, heightPx: 100 },
    { type: "line", widthPercent: 100, heightPx: 24 },
    { type: "line", widthPercent: 70, heightPx: 16 },
  ],
  integrations: [
    { type: "list-row", widthPercent: 100, heightPx: 64 },
    { type: "list-row", widthPercent: 100, heightPx: 64 },
    { type: "list-row", widthPercent: 100, heightPx: 64 },
  ],
  billing: [
    { type: "card", widthPercent: 100, heightPx: 72 },
    { type: "line", widthPercent: 60, heightPx: 16 },
    { type: "list-row", widthPercent: 100, heightPx: 48 },
    { type: "list-row", widthPercent: 100, heightPx: 48 },
  ],
  generic: [
    { type: "line", widthPercent: 100, heightPx: 20 },
    { type: "line", widthPercent: 80, heightPx: 16 },
    { type: "line", widthPercent: 60, heightPx: 16 },
  ],
};

/**
 * Erzeugt eine Skeleton-Konfiguration fuer den gegebenen Screen.
 * Wenn hasData === true, wird ein leeres Config zurueckgegeben (kein Skeleton noetig).
 */
export function buildSkeleton(input: SkeletonInput): SkeletonConfig {
  const { screen, hasData, expectedCount } = input;

  if (hasData) {
    return { screen, items: [], isFallback: false, minDisplayMs: 0 };
  }

  const preset = SCREEN_PRESETS[screen] ?? SCREEN_PRESETS.generic;
  const isFallback = screen !== "generic" && !SCREEN_PRESETS[screen];

  let items = preset;
  if (expectedCount && expectedCount > 0) {
    const cycled: SkeletonItem[] = [];
    for (let i = 0; i < expectedCount; i++) {
      cycled.push(preset[i % preset.length]);
    }
    items = cycled;
  }

  return {
    screen,
    items,
    isFallback,
    minDisplayMs: DEFAULT_MIN_DISPLAY_MS,
  };
}

/**
 * Empfiehlt einen Hybrid-Modus: welche Bereiche zeigen echte Daten,
 * welche zeigen Skeletons. Nuetzlich bei teilweisen Daten.
 */
export function recommendHybridMode(
  loadedSections: string[],
  pendingSections: string[],
): { show: string[]; skeleton: string[] } {
  return {
    show: loadedSections,
    skeleton: pendingSections,
  };
}

/**
 * Bewertet, ob die minimale Anzeigezeit verstrichen ist, um Flackern zu vermeiden.
 */
export function shouldHideSkeleton(
  elapsedMs: number,
  minDisplayMs: number,
  hasData: boolean,
): boolean {
  if (!hasData) return false;
  return elapsedMs >= minDisplayMs;
}
