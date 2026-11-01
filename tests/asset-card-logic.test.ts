import { describe, expect, it } from "vitest";
import {
  autoCardAssetUrl,
  buildPublishingCardPng,
  IG_RATIOS,
  normalizeCardText,
  personaColors,
  validateAssetUrl,
  wrapHeadline,
} from "../lib/asset-card-logic";
import { encodePng } from "../lib/png-encoder";

describe("asset card logic (Sprint 367)", () => {
  it("normalisiert Kartentext ehrlich (Grossbuchstaben, Laengen-Limit)", () => {
    expect(normalizeCardText("  Zukunft wird gebaut. ", 90)).toBe("ZUKUNFT WIRD GEBAUT.");
    expect(normalizeCardText("x".repeat(120), 90)).toHaveLength(90);
  });

  it("bricht Headlines ohne Wortverlust um", () => {
    const lines = wrapHeadline("AUTONOME SYSTEME SKALIEREN REICHWEITE", 12, 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("AUTONOME SYSTEME SKALIEREN REICHWEITE");
  });

  it(" rendert deterministische PNGs mit korrekter Signatur und Groesse", () => {
    const input = { personaId: "nova", product: "CyberSarah", headline: "Test Headline" };
    const pngA = buildPublishingCardPng(input);
    const pngB = buildPublishingCardPng(input);
    expect(pngA.equals(pngB)).toBe(true); // deterministisch
    expect(pngA.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(pngA.readUInt32BE(16)).toBe(IG_RATIOS.square.width);
    expect(pngA.readUInt32BE(20)).toBe(IG_RATIOS.square.height);
    const portrait = buildPublishingCardPng({ ...input, ratio: "portrait" });
    expect(portrait.readUInt32BE(20)).toBe(IG_RATIOS.portrait.height);
  });

  it("laedt jede Persona auf eine deterministische Palette", () => {
    expect(personaColors("nova")).toEqual(personaColors("nova"));
    expect(personaColors("unbekannt")).toEqual(personaColors("nova")); // ehrlicher Fallback
  });

  it("baut Auto-Karten-URLs im app-gehosteten Pfad", () => {
    expect(autoCardAssetUrl("https://app.cybersarah-ki.com/", 42)).toBe(
      "https://app.cybersarah-ki.com/api/publishing/assets/42.png"
    );
  });

  it("validiert Asset-URLs vorab statt Blind-Versuch (Optimierung 4)", () => {
    expect(validateAssetUrl("https://cdn.example.com/bild.jpg", "image")).toEqual({ valid: true });
    expect(validateAssetUrl("https://cdn.example.com/video.mp4", "video").valid).toBe(true);
    expect(validateAssetUrl("https://cdn.example.com/bild.gif", "image").valid).toBe(false);
    expect(validateAssetUrl("data:image/png;base64,xxx", "image").reason).toContain("http(s)://");
    expect(validateAssetUrl("https://cdn.example.com/bild.jpg", "video").valid).toBe(false);
  });

  it("png-encoder lehnt falsche Pixelbuffer ehrlich ab", () => {
    expect(() => encodePng({ width: 2, height: 2, pixels: Buffer.alloc(4) })).toThrow(/Pixelbuffer/);
  });
});
