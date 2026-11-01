/**
 * Sprint 352 — App-Icon/Splash-Politur + Store-Screenshots-Doku erneuern.
 *
 * Reine, deterministische Logik zur Steuerung des Splash-Screen-Lebenszyklus
 * (Mindest-Anzeigezeit gegen Flackern, Timeout-Fallback), Validierung von
 * Icon-/Splash-Bilddateien und Vollständigkeitsprüfung der Store-Screenshots.
 *
 * Datenfluss:
 *   Die App startet im Splash-Status 'initializing'. Beim Laden von Systemkomponenten
 *   wird der Fortschritt gemeldet. Sobald die App bereit ist UND die Mindestanzeit (default 500ms)
 *   verstrichen ist, geht der Splash in 'ready_to_fade' über.
 *   Zusätzlich werden Asset-Spezifikationen (Master-Icon 1024x1024, Adaptive Icon etc.)
 *   sowie Screenshot-Checklisten für Apple App Store & Google Play gefordert.
 *
 * Ehrlichkeits-Grenze:
 *   Das native Ausblenden des Splash-Screens erfordert die Expo/Capacitor Bridge.
 *   Diese Logik entscheidet rein rechnerisch über den optimalen Umschaltzeitpunkt.
 */

export type SplashPhase = "initializing" | "waiting_min_display" | "ready_to_fade" | "hidden";

export type SplashState = {
  phase: SplashPhase;
  startTimeMs: number;
  minDisplayMs: number;
  maxTimeoutMs: number;
  appReady: boolean;
};

export type AssetSpec = {
  name: string;
  requiredWidth: number;
  requiredHeight: number;
  actualWidth?: number | null;
  actualHeight?: number | null;
  requiredFormat: "png" | "svg" | "webp";
  actualFormat?: string | null;
};

export type StoreDeviceSpec = {
  id: string;
  name: string;
  platform: "ios" | "android";
  widthPx: number;
  heightPx: number;
  required: boolean;
};

export type ScreenshotCheckitem = {
  scene: string;
  deviceId: string;
  deviceName: string;
  platform: "ios" | "android";
  requiredDimensions: string;
};

export type StoreScreenshotChecklist = {
  scenes: string[];
  devices: StoreDeviceSpec[];
  items: ScreenshotCheckitem[];
  totalRequired: number;
};

export const DEFAULT_MIN_SPLASH_MS = 500;
export const DEFAULT_MAX_SPLASH_TIMEOUT_MS = 3000;

export const DEFAULT_STORE_DEVICES: StoreDeviceSpec[] = [
  { id: "iphone_6.7", name: "iPhone 6.7\" (15 Pro Max)", platform: "ios", widthPx: 1290, heightPx: 2796, required: true },
  { id: "iphone_6.5", name: "iPhone 6.5\" (XS Max)", platform: "ios", widthPx: 1242, heightPx: 2688, required: true },
  { id: "ipad_12.9", name: "iPad Pro 12.9\"", platform: "ios", widthPx: 2048, heightPx: 2732, required: false },
  { id: "android_phone", name: "Android Phone 1080p", platform: "android", widthPx: 1080, heightPx: 1920, required: true },
  { id: "android_tablet", name: "Android Tablet 10\"", platform: "android", widthPx: 1600, heightPx: 2560, required: false },
];

export const REQUIRED_STORE_SCENES = ["chat", "dashboard", "designer", "admin", "settings"];

/**
 * Erzeugt den initialen Zustand des Splash-Screens.
 */
export function createSplashState(
  minDisplayMs: number = DEFAULT_MIN_SPLASH_MS,
  maxTimeoutMs: number = DEFAULT_MAX_SPLASH_TIMEOUT_MS,
  nowMs: number = Date.now(),
): SplashState {
  return {
    phase: "initializing",
    startTimeMs: nowMs,
    minDisplayMs: Math.max(0, minDisplayMs),
    maxTimeoutMs: Math.max(minDisplayMs, maxTimeoutMs),
    appReady: false,
  };
}

/**
 * Aktualisiert den Splash-Fortschritt und entscheidet, ob der Splash-Screen ausgeblendet werden kann.
 */
export function updateSplashProgress(
  state: SplashState,
  nowMs: number,
  appReady: boolean,
): { state: SplashState; shouldHide: boolean; notice: string | null } {
  if (state.phase === "hidden") {
    return { state, shouldHide: true, notice: null };
  }

  const elapsed = Math.max(0, nowMs - state.startTimeMs);
  const updatedReady = state.appReady || appReady;

  // Timeout-Schutz: falls die App-Initalisierung hängt
  if (elapsed >= state.maxTimeoutMs) {
    const nextState: SplashState = {
      ...state,
      phase: "ready_to_fade",
      appReady: updatedReady,
    };
    return {
      state: nextState,
      shouldHide: true,
      notice: `Splash Timeout nach ${elapsed}ms erreicht — Notfall-Freigabe erteilt.`,
    };
  }

  // Warten auf App-Bereitschaft UND Mindestanzeigedauer
  if (updatedReady && elapsed >= state.minDisplayMs) {
    const nextState: SplashState = {
      ...state,
      phase: "ready_to_fade",
      appReady: true,
    };
    return {
      state: nextState,
      shouldHide: true,
      notice: null,
    };
  }

  const phase: SplashPhase = updatedReady ? "waiting_min_display" : "initializing";
  return {
    state: { ...state, phase, appReady: updatedReady },
    shouldHide: false,
    notice: null,
  };
}

/**
 * Validiert Bild-Assets (Icon-Dimensionen, Formate).
 */
export function validateIconAssetSpecs(assets: AssetSpec[]): {
  isValid: boolean;
  errors: string[];
  missingCount: number;
} {
  const errors: string[] = [];
  let missingCount = 0;

  for (const asset of assets) {
    if (!asset.actualWidth || !asset.actualHeight) {
      errors.push(`Asset "${asset.name}": Dimensionen fehlen.`);
      missingCount++;
      continue;
    }

    if (asset.actualWidth !== asset.requiredWidth || asset.actualHeight !== asset.requiredHeight) {
      errors.push(
        `Asset "${asset.name}": Falsche Auflösung ${asset.actualWidth}x${asset.actualHeight} (erwartet: ${asset.requiredWidth}x${asset.requiredHeight}).`,
      );
    }

    if (asset.actualFormat && asset.actualFormat.toLowerCase() !== asset.requiredFormat.toLowerCase()) {
      errors.push(
        `Asset "${asset.name}": Falsches Format "${asset.actualFormat}" (erwartet: "${asset.requiredFormat}").`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingCount,
  };
}

/**
 * Generiert die Store-Screenshot-Checkliste für den App Store & Google Play Submission Process.
 */
export function generateStoreScreenshotChecklist(
  scenes: string[] = REQUIRED_STORE_SCENES,
  devices: StoreDeviceSpec[] = DEFAULT_STORE_DEVICES,
): StoreScreenshotChecklist {
  const items: ScreenshotCheckitem[] = [];

  for (const scene of scenes) {
    for (const dev of devices) {
      items.push({
        scene,
        deviceId: dev.id,
        deviceName: dev.name,
        platform: dev.platform,
        requiredDimensions: `${dev.widthPx}x${dev.heightPx}`,
      });
    }
  }

  return {
    scenes,
    devices,
    items,
    totalRequired: items.length,
  };
}

/**
 * Prüft die Vollständigkeit hochgeladener/erstellter Store-Screenshots.
 */
export function verifyStoreAssetCompleteness(
  checklist: StoreScreenshotChecklist,
  uploadedAssets: Array<{ scene: string; deviceId: string; fileExists: boolean }>,
): {
  isComplete: boolean;
  missingItems: Array<{ scene: string; deviceId: string }>;
  completionPercentage: number;
} {
  const missingItems: Array<{ scene: string; deviceId: string }> = [];

  const uploadedSet = new Set(
    uploadedAssets.filter((a) => a.fileExists).map((a) => `${a.scene}:${a.deviceId}`),
  );

  for (const item of checklist.items) {
    const key = `${item.scene}:${item.deviceId}`;
    if (!uploadedSet.has(key)) {
      missingItems.push({ scene: item.scene, deviceId: item.deviceId });
    }
  }

  const total = checklist.totalRequired;
  const passed = total - missingItems.length;
  const completionPercentage = total > 0 ? Math.round((passed / total) * 100) : 100;

  return {
    isComplete: missingItems.length === 0,
    missingItems,
    completionPercentage,
  };
}
