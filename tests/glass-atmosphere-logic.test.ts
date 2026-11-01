/**
 * Sprint 192 — Glass-Atmosphere-Logik: deterministische Grafik-Basis
 * (Partikel-Feld, Cyber-Grid, Aurora) fuer das Future-Glass-Max-Upgrade.
 */
import { describe, expect, it } from "vitest";

import {
  buildAurora,
  buildGridMesh,
  buildParticleField,
  createSeededRandom,
  normalizeAtmosphereSeed,
  particleAccent,
} from "../lib/design/glass-atmosphere-logic";

describe("glass-atmosphere-logic (Sprint 192: deterministische Grafik)", () => {
  it("erzeugt deterministische Partikel-Felder (gleiche Seed, gleiches Bild)", () => {
    const a = buildParticleField(192, 5);
    const b = buildParticleField(192, 5);
    expect(a).toEqual(b);
  });

  it("unterschiedliche Seeds liefern unterschiedliche Felder", () => {
    const a = buildParticleField(192, 5);
    const b = buildParticleField(193, 5);
    expect(a).not.toEqual(b);
  });

  it("begrenzt Partikel-Anzahl und Wertebereiche", () => {
    expect(buildParticleField(7, 99)).toHaveLength(8); // Oberlimit
    expect(buildParticleField(7, -3)).toHaveLength(0); // Unterlimit
    for (const particle of buildParticleField(192, 8)) {
      expect(particle.leftPercent).toBeGreaterThanOrEqual(0);
      expect(particle.leftPercent).toBeLessThanOrEqual(100);
      expect(particle.size).toBeGreaterThanOrEqual(2);
      expect(particle.size).toBeLessThanOrEqual(5);
      expect(particle.opacity).toBeLessThanOrEqual(0.22); // bewusst dezent
    }
  });

  it("leistet gueltige Akzent-Schluessel pro Partikel", () => {
    for (const particle of buildParticleField(192, 8)) {
      expect(["cyan", "purple", "magenta", "blue"]).toContain(particleAccent(particle));
    }
  });

  it("baut ein Maschennetz mit geklammerter Dichte", () => {
    const grid = buildGridMesh(390, 844, 120);
    expect(grid.verticalLines).toBeGreaterThan(0);
    expect(grid.horizontalLines).toBeGreaterThan(0);
    expect(grid.lineWidth).toBe(1);
    // Spacing-Klammer: 60-160px
    const clamped = buildGridMesh(300, 300, 10);
    expect(clamped.verticalLines).toBe(buildGridMesh(300, 300, 60).verticalLines);
  });

  it("baut Aurora-Stops aus Hex-Farbe mit dezentem Alpha", () => {
    const aurora = buildAurora("#00F2FE");
    // Sprint 355 — Aurora-Flow-Welle: Akzent, Violett, Cyan, Petrol, transparent.
    expect(aurora.colors[0]).toBe("rgba(0, 242, 254, 0.14)");
    expect(aurora.colors[1]).toBe("rgba(124, 58, 237, 0.09)");
    expect(aurora.colors[2]).toBe("rgba(0, 242, 254, 0.06)");
    expect(aurora.colors[3]).toBe("rgba(0, 229, 176, 0.04)");
    expect(aurora.colors[4]).toBe("rgba(0, 229, 176, 0)");
    expect(aurora.driftMs).toBeGreaterThan(10_000); // langsam, unaufdraenglich
  });

  it("normalisiert ungültige Seeds auf 42", () => {
    expect(normalizeAtmosphereSeed(0)).toBe(42);
    expect(normalizeAtmosphereSeed(-5)).toBe(42);
    expect(normalizeAtmosphereSeed(Number.NaN)).toBe(42);
    expect(normalizeAtmosphereSeed(192)).toBe(192);
  });

  it("haelt den LCG im Wertebereich 0-1", () => {
    const rand = createSeededRandom(192);
    for (let i = 0; i < 100; i += 1) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
