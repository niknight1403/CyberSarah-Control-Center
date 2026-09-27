import { describe, it, expect } from "vitest";
import {
  classifyCrash,
  buildFingerprint,
  isDuplicateCrash,
  formatCrashLine,
  crashPriority,
} from "@/lib/crash-classification-logic";

const input = (errorType: string, message: string, stackHead = "") => ({ errorType, message, stackHead });

describe("Sprint 328 — Crash-Klassifizierung", () => {
  it("klassifiziert bekannte Muster mit Basis-Angabe", () => {
    expect(classifyCrash(input("TypeError", "fetch failed")).category).toBe("netzwerk");
    expect(classifyCrash(input("Error", "401 Unauthorized")).category).toBe("auth");
    expect(classifyCrash(input("SyntaxError", "JSON.parse: unexpected")).category).toBe("daten");
    expect(classifyCrash(input("Error", "stripe charge failed")).category).toBe("third-party");
  });

  it("unbekannt bleibt ehrlich unbekannt mit genannten Grund", () => {
    const c = classifyCrash(input("Error", "irgendwas komisches"));
    expect(c.category).toBe("unbekannt");
    expect(c.basis).toContain("kein bekanntes Muster");
    expect(c.basis).not.toContain("geraten: ja");
  });

  it("Fingerprint normalisiert Zahlen fuer Dedup", () => {
    const a = buildFingerprint(input("TypeError", "Cannot read x of undefined at line 42"));
    const b = buildFingerprint(input("TypeError", "Cannot read x of undefined at line 99"));
    expect(a).toBe(b);
    expect(isDuplicateCrash([a], b)).toBe(true);
    expect(isDuplicateCrash([], a)).toBe(false);
  });

  it("Dashboard-Zeile und Prioritaet (unbekannt zuerst)", () => {
    const c = classifyCrash(input("Error", "fetch failed"));
    expect(formatCrashLine(c, "fetch failed")).toContain("[netzwerk]");
    expect(crashPriority("unbekannt")).toBe(1);
    expect(crashPriority("netzwerk")).toBe(3);
  });
});
