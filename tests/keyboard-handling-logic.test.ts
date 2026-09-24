import { describe, expect, it } from "vitest";
import {
  calculateBottomSheetKeyboardOffset,
  calculateChatToolbarOffset,
  calculateKeyboardScrollOffset,
  createKeyboardState,
  getNextInputFocus,
  handleKeyboardHide,
  handleKeyboardShow,
  setFocusedInput,
} from "../lib/keyboard-handling-logic";

describe("Sprint 350 — Keyboard Handling Logic", () => {
  it("erstellt initialen Zustand korrekt", () => {
    const state = createKeyboardState();
    expect(state.isVisible).toBe(false);
    expect(state.keyboardHeight).toBe(0);
    expect(state.focusedInputId).toBeNull();
  });

  it("handhabt Tastatur-Einblendung und Ausblendung", () => {
    let state = createKeyboardState();
    state = handleKeyboardShow(state, 280, 200);

    expect(state.isVisible).toBe(true);
    expect(state.keyboardHeight).toBe(280);
    expect(state.animationDurationMs).toBe(200);

    state = handleKeyboardHide(state, 150);
    expect(state.isVisible).toBe(false);
    expect(state.keyboardHeight).toBe(0);
    expect(state.animationDurationMs).toBe(150);
  });

  it("setzt fokussiertes Eingabefeld", () => {
    let state = createKeyboardState();
    state = setFocusedInput(state, "email-input", { y: 350, height: 48 });

    expect(state.focusedInputId).toBe("email-input");
    expect(state.focusedInputBounds).toEqual({ y: 350, height: 48 });
  });

  it("berechnet Scroll-Offset wenn Eingabefeld verdeckt ist", () => {
    // Viewport 800px, Keyboard 300px -> sichtbare Höhe 500px
    // InputY 480px, InputHeight 50px + Padding 16px = Bottom 546px > 500px -> verdeckt
    const result = calculateKeyboardScrollOffset({
      inputY: 480,
      inputHeight: 50,
      viewportHeight: 800,
      keyboardHeight: 300,
      currentScrollY: 0,
      extraPadding: 16,
    });

    expect(result.isCovered).toBe(true);
    expect(result.deltaY).toBe(46); // 546 - 500 = 46
    expect(result.requiredScrollY).toBe(46);
  });

  it("liefert aktuellen ScrollY unverändert wenn Feld nicht verdeckt ist", () => {
    const result = calculateKeyboardScrollOffset({
      inputY: 100,
      inputHeight: 40,
      viewportHeight: 800,
      keyboardHeight: 300,
      currentScrollY: 0,
    });

    expect(result.isCovered).toBe(false);
    expect(result.deltaY).toBe(0);
    expect(result.requiredScrollY).toBe(0);
  });

  it("berechnet Chat-Toolbar Offset über der Tastatur", () => {
    // Tastatur unsichtbar: nutzt safeAreaBottom
    expect(calculateChatToolbarOffset(0, false, 34)).toBe(34);

    // Tastatur sichtbar: nutzt keyboardHeight
    expect(calculateChatToolbarOffset(280, true, 34)).toBe(280);
  });

  it("navigiert durch Formular-Eingabefelder (next/previous)", () => {
    const fields = [
      { id: "username" },
      { id: "email" },
      { id: "password_old", disabled: true },
      { id: "password_new" },
    ];

    expect(getNextInputFocus(fields, "username", "next")).toBe("email");
    // Überspringt disabled feld password_old
    expect(getNextInputFocus(fields, "email", "next")).toBe("password_new");
    expect(getNextInputFocus(fields, "password_new", "next")).toBeNull();

    expect(getNextInputFocus(fields, "password_new", "previous")).toBe("email");
    expect(getNextInputFocus(fields, "email", "previous")).toBe("username");
    expect(getNextInputFocus(fields, "username", "previous")).toBeNull();
  });

  it("berechnet BottomSheet-Höhenanpassung bei Tastatur", () => {
    // Viewport 800, Keyboard 300 -> sichtbare Höhe 500
    // Sheet 600px -> passt nicht in 500px -> adjustedHeight 500px, overflow 100px
    const result = calculateBottomSheetKeyboardOffset(600, 300, 800);
    expect(result.adjustedHeight).toBe(500);
    expect(result.overflowPx).toBe(100);

    // Sheet 400px -> passt locker -> unassessed
    const result2 = calculateBottomSheetKeyboardOffset(400, 300, 800);
    expect(result2.adjustedHeight).toBe(400);
    expect(result2.overflowPx).toBe(0);
  });
});
