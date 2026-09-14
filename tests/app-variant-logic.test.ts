import { describe, expect, it } from "vitest";
import {
  DEV_SURFACES,
  appVariantLabel,
  isAppVariantValue,
  resolveAppVariant,
  showDevSurface,
  type DevSurface,
} from "../lib/app-variant-logic";

describe("app-variant-logic", () => {
  it("loest die Variante aus der Build-Umgebung und faellt auf Entwicklung zurueck", () => {
    expect(resolveAppVariant("admin")).toBe("admin");
    expect(resolveAppVariant("ADMIN")).toBe("admin");
    expect(resolveAppVariant("  admin  ")).toBe("admin");
    expect(resolveAppVariant("development")).toBe("development");
    expect(resolveAppVariant(undefined)).toBe("development");
    expect(resolveAppVariant("")).toBe("development");
    // Tippfehler duerfen nie die Admin-Variante ausloesen.
    expect(resolveAppVariant("admın")).toBe("development");
    expect(resolveAppVariant("prod")).toBe("development");
  });

  it("zeigt Entwicklungsanzeigen nur in der Entwicklungs-Variante", () => {
    for (const surface of DEV_SURFACES) {
      expect(showDevSurface("development", surface)).toBe(true);
      expect(showDevSurface("admin", surface)).toBe(false);
    }
  });

  it("lehnt unbekannte Anzeigen ab, statt stillschweigend anzuzeigen", () => {
    const unknown = "kInderhack" as unknown as DevSurface;
    expect(showDevSurface("development", unknown)).toBe(false);
  });

  it("liefert fuer Berichte klare Varianten-Labels", () => {
    expect(appVariantLabel("development")).toBe("Entwicklung");
    expect(appVariantLabel("admin")).toBe("Admin (Produktion)");
  });

  it("validiert Build-Eingaben fuer Workflow-Asserts", () => {
    expect(isAppVariantValue("development")).toBe(true);
    expect(isAppVariantValue("admin")).toBe(true);
    expect(isAppVariantValue("production")).toBe(false);
    expect(isAppVariantValue(undefined)).toBe(false);
  });
});
