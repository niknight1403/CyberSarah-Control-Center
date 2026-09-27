/**
 * Sprint 302 — Tests fuer Theme-Konsistenz (Hartkodierungs-Scanner).
 */
import { describe, it, expect } from "vitest";
import {
  scanForHardcodedColors,
  summarizeScan,
  colorDistance,
  THEME_TOKENS,
} from "@/lib/theme-consistency-logic";

describe("Sprint 302 — Theme Consistency Logic", () => {
  it("findet hartkodierte Hex-Farben mit Zeilenangabe", () => {
    const src = 'const s = StyleSheet.create({ box: { backgroundColor: "#10161F" } });';
    const f = scanForHardcodedColors(src);
    expect(f).toHaveLength(1);
    expect(f[0].line).toBe(1);
    expect(f[0].literal).toBe("#10161F");
  });

  it("Token-treue Literale sind kein Befund", () => {
    const src = `const c = { bg: "${THEME_TOKENS.background}", accent: "${THEME_TOKENS.cyan}" };`;
    expect(scanForHardcodedColors(src)).toHaveLength(0);
  });

  it("schlaegt das naechste Token vor (magenta statt lila)", () => {
    const f = scanForHardcodedColors('const c = "#FF0A86";');
    expect(f[0].suggestedToken).toBe("magenta");
    expect(f[0].distance).toBeLessThan(30);
  });

  it("colorDistance ist 0 fuer identische Farben", () => {
    expect(colorDistance("#00F2FE", "#00F2FE")).toBe(0);
  });

  it("ungueltige Farben werfen", () => {
    expect(() => colorDistance("#GGGGGG", "#000000")).toThrow();
  });

  it("summarizeScan trennt kritische Alt-Farben von Token-Naehe", () => {
    const f = scanForHardcodedColors('const a = "#00FF00"; const b = "#00F1FD";');
    const s = summarizeScan(f);
    expect(s.total).toBe(2);
    expect(s.critical).toBe(1); // orange hat kein nahes Token
    expect(s.report).toContain("davon 1 ohne nahes Token");
  });

  it("leerer Scan meldet sauber", () => {
    const s = summarizeScan(scanForHardcodedColors("keine farben hier"));
    expect(s.total).toBe(0);
    expect(s.report).toContain("keine hartkodierten");
  });
});
