import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACK_THRESHOLD,
  calculatePredictiveTransform,
  cancelPredictiveBackGesture,
  commitPredictiveBackGesture,
  isPredictiveBackSupported,
  shouldTriggerHapticFeedback,
  startPredictiveBackGesture,
  updatePredictiveBackProgress,
} from "../lib/predictive-back-logic";

describe("Sprint 349 — Predictive Back Logic", () => {
  it("prüft Plattformunterstützung für Android API Levels", () => {
    expect(isPredictiveBackSupported("android", 33)).toBe(true);
    expect(isPredictiveBackSupported("android", 34)).toBe(true);
    expect(isPredictiveBackSupported("android", 31)).toBe(false);
    expect(isPredictiveBackSupported("ios", 17)).toBe(false);
    expect(isPredictiveBackSupported("web", 0)).toBe(false);
  });

  it("startet eine Gesten-Session korrekt", () => {
    const session = startPredictiveBackGesture({
      sourceRoute: "/chat/42",
      targetRoute: "/chat",
      canGoBack: true,
      edge: "left",
    });

    expect(session.status).toBe("started");
    expect(session.progress).toBe(0);
    expect(session.canGoBack).toBe(true);
    expect(session.isModal).toBe(false);
    expect(session.sourceRoute).toBe("/chat/42");
    expect(session.targetRoute).toBe("/chat");
  });

  it("berechnet Fortschritt basierend auf Wischdistanz", () => {
    let session = startPredictiveBackGesture({
      sourceRoute: "/settings/profile",
      targetRoute: "/settings",
      canGoBack: true,
    });

    session = updatePredictiveBackProgress(session, 100, 400); // 100 / 400 = 0.25
    expect(session.status).toBe("progress");
    expect(session.progress).toBe(0.25);

    session = updatePredictiveBackProgress(session, 200, 400); // 200 / 400 = 0.5
    expect(session.progress).toBe(0.5);

    session = updatePredictiveBackProgress(session, 500, 400); // Clamped at 1.0
    expect(session.progress).toBe(1.0);
  });

  it("berechnet visuelle Transformationen für Screen und Modal", () => {
    const screenTransform = calculatePredictiveTransform(0.5, false);
    expect(screenTransform.scale).toBe(0.95);
    expect(screenTransform.borderRadius).toBe(8);
    expect(screenTransform.translateY).toBe(0);

    const modalTransform = calculatePredictiveTransform(0.5, true);
    expect(modalTransform.scale).toBe(0.975);
    expect(modalTransform.translateY).toBe(125);
    expect(modalTransform.borderRadius).toBe(10);
  });

  it("erkennt Schwellenwert-Meldung für Haptik", () => {
    expect(shouldTriggerHapticFeedback(0.2, 0.4, DEFAULT_BACK_THRESHOLD)).toBe(true);
    expect(shouldTriggerHapticFeedback(0.4, 0.2, DEFAULT_BACK_THRESHOLD)).toBe(true);
    expect(shouldTriggerHapticFeedback(0.1, 0.2, DEFAULT_BACK_THRESHOLD)).toBe(false);
  });

  it("führt commit mit Zurück-Navigation aus wenn Schwelle erreicht", () => {
    let session = startPredictiveBackGesture({
      sourceRoute: "/chat/42",
      targetRoute: "/chat",
      canGoBack: true,
    });

    session = updatePredictiveBackProgress(session, 200, 400); // 0.5 > 0.35
    const result = commitPredictiveBackGesture(session);

    expect(result.action).toBe("navigate_back");
    expect(result.targetRoute).toBe("/chat");
    expect(result.state.status).toBe("completed");
  });

  it("bricht ab wenn Schwelle beim Loslassen nicht erreicht wurde", () => {
    let session = startPredictiveBackGesture({
      sourceRoute: "/chat/42",
      targetRoute: "/chat",
      canGoBack: true,
    });

    session = updatePredictiveBackProgress(session, 50, 400); // 0.125 < 0.35
    const result = commitPredictiveBackGesture(session);

    expect(result.action).toBe("cancelled_insufficient_progress");
    expect(result.state.status).toBe("cancelled");
  });

  it("handhabt Modal-Dismissal und App-Exit korrekt", () => {
    // Modal
    let modalSession = startPredictiveBackGesture({
      sourceRoute: "/filter-modal",
      canGoBack: true,
      isModal: true,
    });
    modalSession = updatePredictiveBackProgress(modalSession, 200, 400);
    const modalResult = commitPredictiveBackGesture(modalSession);
    expect(modalResult.action).toBe("dismiss_modal");

    // Root screen (canGoBack = false)
    let rootSession = startPredictiveBackGesture({
      sourceRoute: "/home",
      canGoBack: false,
    });
    rootSession = updatePredictiveBackProgress(rootSession, 200, 400);
    const rootResult = commitPredictiveBackGesture(rootSession);
    expect(rootResult.action).toBe("exit_app");
  });

  it("bricht Geste manuell ab", () => {
    let session = startPredictiveBackGesture({ sourceRoute: "/a", canGoBack: true });
    session = updatePredictiveBackProgress(session, 150, 400);
    const cancelled = cancelPredictiveBackGesture(session);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.progress).toBe(0);
  });
});
