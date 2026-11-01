import { describe, expect, it } from "vitest";
import {
  calculatePaneWidths,
  getDeviceScreenCategory,
  isDualPaneSupported,
  resolveTabletPaneState,
  selectDetailItem,
  toggleMasterPaneVisibility,
} from "../lib/tablet-layout-logic";

describe("Sprint 351 — Tablet Layout Logic", () => {
  it("klassifiziert Bildschirmgrößen in Gerätekategorien", () => {
    expect(getDeviceScreenCategory(390)).toBe("phone");
    expect(getDeviceScreenCategory(768)).toBe("tablet_portrait");
    expect(getDeviceScreenCategory(1024)).toBe("tablet_landscape");
    expect(getDeviceScreenCategory(1440)).toBe("desktop");
  });

  it("prüft Dual-Pane-Unterstützung nach Mindestbreite", () => {
    expect(isDualPaneSupported(390)).toBe(false);
    expect(isDualPaneSupported(768)).toBe(true);
    expect(isDualPaneSupported(1024)).toBe(true);
  });

  it("berechnet Spaltenbreiten für Ein- und Zwei-Spalten-Modus", () => {
    // Phone
    const phone = calculatePaneWidths(400);
    expect(phone.mode).toBe("single");
    expect(phone.masterWidthPx).toBe(400);
    expect(phone.detailWidthPx).toBe(0);

    // Tablet (800px Gesamtbreite, Standard Master 320px -> Detail 480px)
    const tablet = calculatePaneWidths(800);
    expect(tablet.mode).toBe("dual");
    expect(tablet.masterWidthPx).toBe(320);
    expect(tablet.detailWidthPx).toBe(480);

    // Prozentuale Vorgabe
    const percent = calculatePaneWidths(1000, { masterWidthPercent: 30 });
    expect(percent.masterWidthPx).toBe(300);
    expect(percent.detailWidthPx).toBe(700);
  });

  it("schützt minimale Detailbreite bei zu breitem Master-Wunsch", () => {
    // 800px Gesamt, Master 600px gewollt, minDetail = 400px -> Master gekappt auf 400px
    const result = calculatePaneWidths(800, { masterWidthPx: 600, minDetailWidthPx: 400 });
    expect(result.mode).toBe("dual");
    expect(result.masterWidthPx).toBe(400);
    expect(result.detailWidthPx).toBe(400);
  });

  it("löst Tablet-Pane-Status für Ein- und Zwei-Spalten-Layouts auf", () => {
    // Single
    const single = resolveTabletPaneState({
      activeRoute: "/chat/42",
      selectedItemId: "42",
      screenWidth: 400,
    });
    expect(single.mode).toBe("single");
    expect(single.activePane).toBe("detail");
    expect(single.detailRoute).toBe("/chat/42");

    // Dual
    const dual = resolveTabletPaneState({
      activeRoute: "/chat/42",
      selectedItemId: "42",
      screenWidth: 1024,
    });
    expect(dual.mode).toBe("dual");
    expect(dual.masterRoute).toBe("/chat");
    expect(dual.detailRoute).toBe("/chat/42");
    expect(dual.selectedItemId).toBe("42");
  });

  it("schaltet Master-Sidebar-Sichtbarkeit um", () => {
    let state = resolveTabletPaneState({
      activeRoute: "/chat/42",
      screenWidth: 1024,
      isMasterCollapsed: false,
    });

    state = toggleMasterPaneVisibility(state);
    expect(state.isMasterCollapsed).toBe(true);

    state = toggleMasterPaneVisibility(state);
    expect(state.isMasterCollapsed).toBe(false);
  });

  it("wählt Detail-Element in Master-Liste aus", () => {
    let state = resolveTabletPaneState({
      activeRoute: "/chat",
      screenWidth: 1024,
    });

    state = selectDetailItem(state, "/chat/99", "99");
    expect(state.detailRoute).toBe("/chat/99");
    expect(state.selectedItemId).toBe("99");
    expect(state.activePane).toBe("detail");
  });
});
