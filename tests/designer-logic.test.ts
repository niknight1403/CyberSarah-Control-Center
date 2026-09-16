import { describe, expect, it } from "vitest";
import {
  DESIGN_ASSET_TYPES,
  buildDesignPrompt,
  designAssetFileName,
  extractJsonObject,
  normalizeDesignAssetType,
  validateDesignAsset,
  validateSvg,
  validateThemeTokens,
} from "@/lib/designer-logic";

describe("designer-logic: Asset-Typen", () => {
  it("normalisiert bekannte und aliase Typen", () => {
    expect(normalizeDesignAssetType("Icon")).toBe("icon");
    expect(normalizeDesignAssetType("app-icon")).toBe("icon");
    expect(normalizeDesignAssetType("design-tokens")).toBe("theme");
    expect(normalizeDesignAssetType("Splash-Screen")).toBe("splash");
  });

  it("lehnt unbekannte Typen ab", () => {
    expect(normalizeDesignAssetType("video")).toBeNull();
    expect(normalizeDesignAssetType("")).toBeNull();
    expect(normalizeDesignAssetType("icon.png.exe")).toBeNull();
  });

  it("exposed alle erlaubten Typen", () => {
    expect(DESIGN_ASSET_TYPES).toContain("icon");
    expect(DESIGN_ASSET_TYPES).toContain("theme");
    expect(DESIGN_ASSET_TYPES).toHaveLength(6);
  });
});

describe("designer-logic: Dateinamen", () => {
  it("slugifiziert Umlaute und blockt Pfad-Traversal", () => {
    const name = designAssetFileName("logo", "Neon Gründungs Logo ../../etc", "ab12cd34");
    expect(name).toBe("logo-neon-gruendungs-logo-etc-ab12cd34.svg");
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
  });

  it("fallback fuer leere Namen", () => {
    expect(designAssetFileName("icon", "", "id1")).toBe("icon-asset-id1.svg");
  });
});

describe("designer-logic: Prompt-Bau", () => {
  it("enthaelt Typ, Beschreibung und Design-Regeln", () => {
    const prompt = buildDesignPrompt({ type: "icon", description: "Hexagon mit Neon-Rand" });
    expect(prompt).toContain("App-Icon");
    expect(prompt).toContain("Hexagon mit Neon-Rand");
    expect(prompt).toContain("Cyber-Design-System");
    expect(prompt).toContain("SVG");
  });

  it("fordert JSON bei Theme-Tokens", () => {
    const prompt = buildDesignPrompt({ type: "theme", description: "Dark Premium" });
    expect(prompt).toContain("JSON-Objekt");
    expect(prompt).toContain("colors");
  });
});

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#22D3EE"/><circle cx="12" cy="12" r="6" fill="#0A0A14"/></svg>';

describe("designer-logic: SVG-Validierung", () => {
  it("akzeptiert valides SVG", () => {
    expect(validateSvg(VALID_SVG)).toBe(VALID_SVG);
  });

  it("entfernt Markdown-Code-Fences", () => {
    expect(validateSvg("```svg\n" + VALID_SVG + "\n```")).toBe(VALID_SVG);
  });

  it("lehnt aktive Inhalte und Externe Referenzen ab", () => {
    expect(validateSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toBeNull();
    expect(
      validateSvg('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'),
    ).toBeNull();
    expect(
      validateSvg('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>'),
    ).toBeNull();
  });

  it("lehnt kaputte Form und fehlendes xmlns ab", () => {
    expect(validateSvg("<div>kein svg</div>")).toBeNull();
    expect(validateSvg('<svg><rect/></svg>')).toBeNull();
  });
});

describe("designer-logic: Theme-Token-Validierung", () => {
  it("akzeptiert vollstaendige Token-Struktur", () => {
    const theme = {
      colors: { background: "#0A0A14", surface: "#12121E", text: "#F4F4F8", accent: "#22D3EE", primary: "#A78BFA" },
      typography: { heading: { fontFamily: "Inter", size: 28, weight: "800" } },
    };
    expect(validateThemeTokens(JSON.stringify(theme))).toEqual(theme);
    expect(validateThemeTokens(theme)).toEqual(theme);
  });

  it("lehnt fehlende Pflichtfarben und kapptes JSON ab", () => {
    expect(validateThemeTokens('{"colors":{"background":"red"}}')).toBeNull(); // keine Hex-Farbe
    expect(validateThemeTokens('{"typography":{}}')).toBeNull(); // colors fehlen
    expect(validateThemeTokens("gar kein json")).toBeNull();
  });
});

describe("designer-logic: validateDesignAsset", () => {
  it("validiert SVG-Typen gegen die SVG-Regeln", () => {
    const result = validateDesignAsset("logo", "```svg\n" + VALID_SVG + "\n```");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toBe(VALID_SVG);
  });

  it("validiert Theme gegen Token-Regeln", () => {
    const bad = validateDesignAsset("theme", '{"colors":{}}');
    expect(bad.ok).toBe(false);
  });
});

describe("designer-logic: extractJsonObject", () => {
  it("findet JSON in umgebendem Text", () => {
    expect(extractJsonObject('Vorab: {"a":1,"b":{"c":"}"}} Ende')).toEqual({ a: 1, b: { c: "}" } });
  });

  it("liefert null bei Muell", () => {
    expect(extractJsonObject("keine klammer")).toBeNull();
    expect(extractJsonObject("{ kapott")).toBeNull();
  });
});
