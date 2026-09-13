import { describe, expect, it } from "vitest";
import { darken, lighten, withAlpha } from "@/lib/theme-color-utils";

describe("theme-color-utils", () => {
  it("withAlpha erzeugt rgba aus Hex", () => {
    expect(withAlpha("#9D8CFF", 0.35)).toBe("rgba(157, 140, 255, 0.35)");
  });

  it("lighten mischt Richtung Weiss", () => {
    expect(lighten("#7C5CFF", 0.5)).toBe("#beaeff");
  });

  it("darken mischt Richtung Schwarz und klemmt Werte", () => {
    expect(darken("#4ADE96", 0.5)).toBe("#256f4b");
    expect(darken("#000000", 0.9)).toBe("#000000");
  });
});
