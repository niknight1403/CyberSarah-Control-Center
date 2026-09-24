/**
 * Sprint 301 — Tests fuer Kontrast-Audit und Fokus-Ordnung.
 */
import { describe, it, expect } from "vitest";
import {
  relativeLuminance,
  contrastRatio,
  meetsWCAGAA,
  auditContrastPairs,
  validateFocusOrder,
} from "@/lib/accessibility-logic";

describe("Sprint 301 — Accessibility Logic", () => {
  it("berechnet Schwarz/Weiss-Kontrast als 21", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("identische Farben haben Kontrast 1 und bestehen AA nicht", () => {
    expect(contrastRatio("#07090E", "#07090E")).toBeCloseTo(1, 3);
    expect(meetsWCAGAA("#07090E", "#07090E")).toBe(false);
  });

  it("Cyber-Textfarbe auf Cyber-Hintergrund besteht AA", () => {
    expect(meetsWCAGAA("#E8F1FF", "#07090E")).toBe(true);
  });

  it("relativeLuminance wirft bei ungueltiger Farbe", () => {
    expect(() => relativeLuminance("rot")).toThrow();
  });

  it("auditContrastPairs liefert Paar-Befunde mit Schwellwert", () => {
    const results = auditContrastPairs([
      { label: "gut", foreground: "#E8F1FF", background: "#07090E" },
      { label: "schlecht", foreground: "#8B9BB4", background: "#0D1117" },
    ]);
    expect(results[0].passed).toBe(true);
    expect(results[1].ratio).toBeGreaterThan(1);
  });

  it("validateFocusOrder bemengelt negative tabIndex-Werte", () => {
    const r = validateFocusOrder([{ id: "a" }, { id: "b", tabIndex: -1 }]);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.includes('"b"'))).toBe(true);
  });

  it("positive tabIndex-Werte erzeugen einen Reihenfolge-Hinweis", () => {
    const r = validateFocusOrder([{ id: "a", tabIndex: 1 }, { id: "b" }]);
    expect(r.issues.some((i) => i.includes("Deklarationsreihenfolge"))).toBe(true);
  });

  it("saubere deklarierte Reihenfolge ist valide", () => {
    const r = validateFocusOrder([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("doppelte Fokus-Ids werden gemeldet", () => {
    const r = validateFocusOrder([{ id: "a" }, { id: "a" }]);
    expect(r.valid).toBe(false);
    expect(r.issues[0]).toContain("Doppelte Fokus-Ids");
  });
});
