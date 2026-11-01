/**
 * Sprint 351 — Tablet-Layout: Zwei-Spalten-Designs auf breiten Screens.
 *
 * Reine, deterministische Logik für responsive Breakpoints, Zwei-Spalten-Splits
 * (Master-Detail) auf Tablets/Desktops und automatische Zusammenklappungs-Steuerung.
 *
 * Datenfluss:
 *   Die UI liefert die aktuelle Fensterbreite (screenWidth) und aktive Route/Auswahl.
 *   Diese Logik entscheidet, ob ein Ein-Spalten-Modus (Phone) oder Zwei-Spalten-Modus
 *   (Tablet/Desktop) verwendet wird, berechnet Spaltenbreiten und verwaltet den
 *   Master-Detail Navigationszustand.
 *
 * Ehrlichkeits-Grenze:
 *   Schmale Bildschirme (< 768px) erzwingen den Ein-Spalten-Modus. Ein Zwei-Spalten-Layout
 *   wird nur aktiviert, wenn die verfügbare Breite ausreicht, um dem Detailbereich
 *   mindestens `minDetailWidthPx` (default 400px) einzuräumen.
 */

export type ScreenCategory = "phone" | "tablet_portrait" | "tablet_landscape" | "desktop";

export type LayoutMode = "single" | "dual";

export type PaneWidths = {
  mode: LayoutMode;
  masterWidthPx: number;
  detailWidthPx: number;
  isCollapsible: boolean;
};

export type TabletPaneState = {
  mode: LayoutMode;
  masterRoute: string;
  detailRoute: string | null;
  selectedItemId: string | null;
  isMasterCollapsed: boolean;
  activePane: "master" | "detail";
};

export const BREAKPOINTS = {
  PHONE_MAX: 599,
  TABLET_PORTRAIT_MAX: 899,
  TABLET_LANDSCAPE_MAX: 1199,
} as const;

export const DEFAULT_MIN_DUAL_PANE_WIDTH = 768;
export const DEFAULT_MASTER_WIDTH_PX = 320;
export const DEFAULT_MIN_DETAIL_WIDTH_PX = 400;

/**
 * Ermittelt die Gerätekategorie basierend auf der Bildschirmbreite.
 */
export function getDeviceScreenCategory(screenWidth: number): ScreenCategory {
  const width = Math.max(0, screenWidth);
  if (width <= BREAKPOINTS.PHONE_MAX) return "phone";
  if (width <= BREAKPOINTS.TABLET_PORTRAIT_MAX) return "tablet_portrait";
  if (width <= BREAKPOINTS.TABLET_LANDSCAPE_MAX) return "tablet_landscape";
  return "desktop";
}

/**
 * Prüft, ob das Gerät breit genug für ein Zwei-Spalten-Layout ist.
 */
export function isDualPaneSupported(
  screenWidth: number,
  minWidth: number = DEFAULT_MIN_DUAL_PANE_WIDTH,
): boolean {
  return screenWidth >= minWidth;
}

/**
 * Berechnet die exakten Breiten der Master- und Detail-Spalte.
 */
export function calculatePaneWidths(
  screenWidth: number,
  config?: {
    masterWidthPx?: number;
    masterWidthPercent?: number;
    minDetailWidthPx?: number;
  },
): PaneWidths {
  const width = Math.max(0, screenWidth);
  const minDetail = config?.minDetailWidthPx ?? DEFAULT_MIN_DETAIL_WIDTH_PX;

  if (!isDualPaneSupported(width)) {
    return {
      mode: "single",
      masterWidthPx: width,
      detailWidthPx: 0,
      isCollapsible: false,
    };
  }

  let preferredMaster = config?.masterWidthPx ?? DEFAULT_MASTER_WIDTH_PX;
  if (config?.masterWidthPercent && config.masterWidthPercent > 0) {
    preferredMaster = Math.round(width * (Math.min(100, config.masterWidthPercent) / 100));
  }

  // Sicherstellen, dass Detailspalte mindestens minDetail stark bleibt
  const maxMasterAllowed = Math.max(0, width - minDetail);
  const effectiveMasterWidth = Math.min(preferredMaster, maxMasterAllowed);
  const effectiveDetailWidth = Math.max(0, width - effectiveMasterWidth);

  // Falls auch mit minimalem Master die Detailspalte zu klein wäre
  if (effectiveDetailWidth < minDetail) {
    return {
      mode: "single",
      masterWidthPx: width,
      detailWidthPx: 0,
      isCollapsible: false,
    };
  }

  return {
    mode: "dual",
    masterWidthPx: effectiveMasterWidth,
    detailWidthPx: effectiveDetailWidth,
    isCollapsible: width <= BREAKPOINTS.TABLET_LANDSCAPE_MAX,
  };
}

/**
 * Berechnet den Master-Detail-Zustand für Tablets/Desktops.
 */
export function resolveTabletPaneState(params: {
  activeRoute: string;
  selectedItemId?: string | null;
  screenWidth: number;
  isMasterCollapsed?: boolean;
  masterBaseRoute?: string;
}): TabletPaneState {
  const {
    activeRoute,
    selectedItemId = null,
    screenWidth,
    isMasterCollapsed = false,
    masterBaseRoute = "/chat",
  } = params;

  const isDual = isDualPaneSupported(screenWidth);

  if (!isDual) {
    // Single Pane Mode (Phone)
    const isMaster = activeRoute === masterBaseRoute || activeRoute === "/";
    return {
      mode: "single",
      masterRoute: masterBaseRoute,
      detailRoute: isMaster ? null : activeRoute,
      selectedItemId: selectedItemId,
      isMasterCollapsed: false,
      activePane: isMaster ? "master" : "detail",
    };
  }

  // Dual Pane Mode (Tablet / Desktop)
  const detailRoute = activeRoute === masterBaseRoute ? null : activeRoute;

  return {
    mode: "dual",
    masterRoute: masterBaseRoute,
    detailRoute: detailRoute,
    selectedItemId: selectedItemId,
    isMasterCollapsed: isMasterCollapsed,
    activePane: detailRoute ? "detail" : "master",
  };
}

/**
 * Schaltet das Einklappen der Master-Sidebar um.
 */
export function toggleMasterPaneVisibility(state: TabletPaneState): TabletPaneState {
  if (state.mode !== "dual") return state;
  return {
    ...state,
    isMasterCollapsed: !state.isMasterCollapsed,
  };
}

/**
 * Wählt ein Element in der Master-Liste aus und öffnet die Detail-Ansicht.
 */
export function selectDetailItem(
  state: TabletPaneState,
  detailRoute: string,
  itemId: string,
): TabletPaneState {
  return {
    ...state,
    detailRoute: detailRoute,
    selectedItemId: itemId,
    activePane: "detail",
  };
}
