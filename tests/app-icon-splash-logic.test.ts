import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORE_DEVICES,
  REQUIRED_STORE_SCENES,
  createSplashState,
  generateStoreScreenshotChecklist,
  updateSplashProgress,
  validateIconAssetSpecs,
  verifyStoreAssetCompleteness,
} from "../lib/app-icon-splash-logic";

describe("Sprint 352 — App Icon, Splash & Store Screenshots Logic", () => {
  it("erstellt initialen Splash-Zustand", () => {
    const splash = createSplashState(500, 3000, 1000);
    expect(splash.phase).toBe("initializing");
    expect(splash.startTimeMs).toBe(1000);
    expect(splash.minDisplayMs).toBe(500);
    expect(splash.appReady).toBe(false);
  });

  it("wartet mit dem Ausblenden bis Mindestanzeigezeit erreicht ist", () => {
    let splash = createSplashState(500, 3000, 1000);

    // App sofort bereit, aber erst 200ms verstrichen (1200 - 1000 = 200 < 500)
    let res = updateSplashProgress(splash, 1200, true);
    expect(res.shouldHide).toBe(false);
    expect(res.state.phase).toBe("waiting_min_display");

    // Nach 600ms (1600 - 1000 = 600 >= 500): jetzt Ausblendung erlaubt
    res = updateSplashProgress(res.state, 1600, true);
    expect(res.shouldHide).toBe(true);
    expect(res.state.phase).toBe("ready_to_fade");
  });

  it("schlägt bei Timeout-Überschreitung an", () => {
    let splash = createSplashState(500, 3000, 1000);

    // 3500ms verstrichen, App noch nicht bereit
    const res = updateSplashProgress(splash, 4500, false);
    expect(res.shouldHide).toBe(true);
    expect(res.notice).toContain("Timeout");
  });

  it("validiert App-Icon-Assets auf Auflösung und Format", () => {
    const assets = [
      { name: "icon_1024.png", requiredWidth: 1024, requiredHeight: 1024, actualWidth: 1024, actualHeight: 1024, requiredFormat: "png" as const, actualFormat: "png" },
      { name: "adaptive_icon.png", requiredWidth: 432, requiredHeight: 432, actualWidth: 500, actualHeight: 500, requiredFormat: "png" as const, actualFormat: "png" },
      { name: "splash_logo.svg", requiredWidth: 512, requiredHeight: 512, actualWidth: null, actualHeight: null, requiredFormat: "svg" as const },
    ];

    const result = validateIconAssetSpecs(assets);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBe(2);
    expect(result.missingCount).toBe(1);
  });

  it("generiert Store-Screenshot-Checkliste für alle Szenen und Geräte", () => {
    const checklist = generateStoreScreenshotChecklist(REQUIRED_STORE_SCENES, DEFAULT_STORE_DEVICES);

    // 5 Szenen x 5 Geräte = 25 Items
    expect(checklist.totalRequired).toBe(25);
    expect(checklist.scenes).toEqual(REQUIRED_STORE_SCENES);
    expect(checklist.items[0]).toEqual({
      scene: "chat",
      deviceId: "iphone_6.7",
      deviceName: 'iPhone 6.7" (15 Pro Max)',
      platform: "ios",
      requiredDimensions: "1290x2796",
    });
  });

  it("prüft Vollständigkeit der erstellten Screenshots", () => {
    const checklist = generateStoreScreenshotChecklist(["chat"], [DEFAULT_STORE_DEVICES[0], DEFAULT_STORE_DEVICES[1]]);

    const uploaded = [
      { scene: "chat", deviceId: "iphone_6.7", fileExists: true },
    ];

    const result = verifyStoreAssetCompleteness(checklist, uploaded);
    expect(result.isComplete).toBe(false);
    expect(result.completionPercentage).toBe(50);
    expect(result.missingItems).toEqual([{ scene: "chat", deviceId: "iphone_6.5" }]);
  });
});
