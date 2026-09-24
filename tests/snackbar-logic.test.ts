/**
 * Sprint 299 — Tests fuer Snackbar/Toast-System.
 */
import { describe, it, expect } from "vitest";
import {
  pushSnackbar,
  dismissSnackbar,
  autoDismissDueIds,
  highestSeverity,
  MAX_ACTIVE_SNACKBARS,
  EMPTY_SNACKBAR_STATE,
} from "@/lib/snackbar-logic";

const msg = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  text: "Gespeichert",
  severity: "success" as const,
  createdAt: 1000,
  ...overrides,
});

describe("Sprint 299 — Snackbar Logic", () => {
  it("pusht eine Meldung in den leeren Zustand", () => {
    const s = pushSnackbar(EMPTY_SNACKBAR_STATE, msg());
    expect(s.messages).toHaveLength(1);
    expect(s.suppressedCount).toBe(0);
  });

  it("haelt durationMs=0 ein (manuell zu schliessen, kein Auto-Fill)", () => {
    const s = pushSnackbar(EMPTY_SNACKBAR_STATE, msg({ severity: "error", durationMs: 0 }));
    // 0 ist ein gueltiger Wert (manuell zu schliessen) — Logik haelt ihn ein.
    expect(s.messages[0].durationMs).toBe(0);
  });

  it("dedupliziert nach dedupKey und zaehlt Unterdrueckungen ehrlich", () => {
    let s = pushSnackbar(EMPTY_SNACKBAR_STATE, msg({ dedupKey: "save" }));
    s = pushSnackbar(s, msg({ id: "m2", text: "Gespeichert (erneut)", dedupKey: "save" }));
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].text).toBe("Gespeichert (erneut)");
    expect(s.suppressedCount).toBe(1);
  });

  it("ohne dedupKey werden Meldungen nicht dedupliziert", () => {
    let s = pushSnackbar(EMPTY_SNACKBAR_STATE, msg());
    s = pushSnackbar(s, msg({ id: "m2" }));
    expect(s.messages).toHaveLength(2);
  });

  it("kappe auf MAX_ACTIVE_SNACKBARS per FIFO", () => {
    let s = EMPTY_SNACKBAR_STATE;
    for (let i = 0; i < MAX_ACTIVE_SNACKBARS + 2; i++) {
      s = pushSnackbar(s, msg({ id: `m${i}`, createdAt: i }));
    }
    expect(s.messages).toHaveLength(MAX_ACTIVE_SNACKBARS);
    expect(s.messages[0].id).toBe("m2");
  });

  it("dismiss entfernt gezielt und ignoriert unbekannte Ids", () => {
    let s = pushSnackbar(EMPTY_SNACKBAR_STATE, msg());
    s = dismissSnackbar(s, "m1");
    expect(s.messages).toHaveLength(0);
    s = dismissSnackbar(s, "gibtsnicht");
    expect(s.messages).toHaveLength(0);
  });

  it("autoDismissDueIds entfernt nur abgelaufene und nie durationMs=0", () => {
    let s = pushSnackbar(EMPTY_SNACKBAR_STATE, msg({ id: "a", durationMs: 500 }));
    s = pushSnackbar(s, msg({ id: "b", durationMs: 0 }));
    expect(autoDismissDueIds(s, 1600)).toEqual(["a"]);
    expect(autoDismissDueIds(s, 1499)).toEqual([]);
  });

  it("highestSeverity priorisiert error ueber info", () => {
    let s = pushSnackbar(EMPTY_SNACKBAR_STATE, msg({ severity: "info" }));
    s = pushSnackbar(s, msg({ id: "e", severity: "error" }));
    expect(highestSeverity(s)).toBe("error");
    expect(highestSeverity(EMPTY_SNACKBAR_STATE)).toBeNull();
  });
});
