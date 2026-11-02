import { describe, it, expect } from "vitest";
import { MOTIF_PALETTES, buildMotifPpm, paletteFor } from "../lib/ai-influenza-motif-logic";

function readPixel(ppm: Buffer, width: number, x: number, y: number): { r: number; g: number; b: number } {
  const headerEnd = ppm.indexOf("255\n") + 4;
  const offset = headerEnd + (y * width + x) * 3;
  return { r: ppm[offset], g: ppm[offset + 1], b: ppm[offset + 2] };
}

describe("paletteFor", () => {
  it("liefert die Paketfarben", () => {
    expect(paletteFor("starter")).toBe(MOTIF_PALETTES.starter);
    expect(paletteFor("growth")).toBe(MOTIF_PALETTES.growth);
  });

  it("faellt bei unbekanntem Paket auf growth zurueck", () => {
    expect(paletteFor("unbekannt")).toBe(MOTIF_PALETTES.growth);
  });
});

describe("buildMotifPpm", () => {
  const width = 40;
  const height = 60;
  const ppm = buildMotifPpm({ width, height, palette: MOTIF_PALETTES.growth, sceneIndex: 0 });

  it("schreibt einen gueltigen PPM-Kopf mit passender Nutzlast", () => {
    const headerEnd = ppm.indexOf("255\n") + 4;
    expect(ppm.subarray(0, headerEnd).toString("ascii")).toBe("P6\n40 60\n255\n");
    expect(ppm.length).toBe(headerEnd + width * height * 3);
  });

  it("verlaueft von dunkel oben links nach heller unten rechts", () => {
    const start = readPixel(ppm, width, 1, 1);
    const end = readPixel(ppm, width, width - 2, height - 2);
    expect(start.r + start.g + start.b).toBeLessThan(end.r + end.g + end.b);
  });

  it("bleibt in der Bildmitte heller als am Rand (Vignette)", () => {
    const middle = readPixel(ppm, width, width / 2, height / 2);
    const corner = readPixel(ppm, width, 0, 0);
    expect(middle.r + middle.g + middle.b).toBeGreaterThan(corner.r + corner.g + corner.b);
  });

  it("unterscheidet Szenen, damit vier Motive nicht gleich aussehen", () => {
    const other = buildMotifPpm({ width, height, palette: MOTIF_PALETTES.growth, sceneIndex: 2 });
    expect(other.equals(ppm)).toBe(false);
  });

  it("verweigert unsinnige Groessen", () => {
    expect(() => buildMotifPpm({ width: 0, height: 10, palette: MOTIF_PALETTES.growth, sceneIndex: 0 })).toThrow(/Groesse/);
  });
});
