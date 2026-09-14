import { describe, expect, it } from "vitest";

import {
  createParticleField,
  orbPulsePhase,
  orbScale,
  ORB_PULSE_DURATION_MS,
  resolveActionGlow,
  resolveScanlines,
} from "../lib/living-interface-logic";

describe("living-interface-logic (Sprint 89)", () => {
  it("erzeugt ein deterministisches Partikel-Feld (gleiches Seed => gleiches Feld)", () => {
    const a = createParticleField(42, 24);
    const b = createParticleField(42, 24);
    expect(a).toEqual(b);
    expect(a).toHaveLength(24);
  });

  it("begrenzt Anzahl und Parameter auf ruhige, performante Werte", () => {
    const tooMany = createParticleField(1, 500);
    expect(tooMany).toHaveLength(40);

    const none = createParticleField(1, 0);
    expect(none).toHaveLength(0);

    for (const particle of createParticleField(7, 40)) {
      expect(particle.x).toBeGreaterThanOrEqual(0);
      expect(particle.x).toBeLessThanOrEqual(100);
      expect(particle.y).toBeGreaterThanOrEqual(0);
      expect(particle.y).toBeLessThanOrEqual(100);
      expect(particle.size).toBeGreaterThanOrEqual(1);
      expect(particle.size).toBeLessThanOrEqual(3);
      expect(particle.durationMs).toBeGreaterThanOrEqual(20_000);
      expect(particle.durationMs).toBeLessThanOrEqual(48_000);
      expect(particle.opacity).toBeGreaterThan(0);
      expect(particle.opacity).toBeLessThanOrEqual(0.26);
      expect(particle.driftY).toBeLessThan(0); // aufwaerts gerichtet
    }
  });

  it("orbPulsePhase bleibt deterministisch in [0,1] und thinking pulsiert schneller als idle", () => {
    for (const state of ["idle", "thinking", "success", "error"] as const) {
      for (const now of [0, 137, 999, 12_345]) {
        const phase = orbPulsePhase(now, state);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThanOrEqual(1);
        expect(orbPulsePhase(now, state)).toBe(phase); // deterministisch
      }
    }
    expect(ORB_PULSE_DURATION_MS.thinking).toBeLessThan(ORB_PULSE_DURATION_MS.idle);
    // Nach einer vollen idle-Dauer ist die Phase wieder am Anfang.
    expect(orbPulsePhase(ORB_PULSE_DURATION_MS.idle, "idle")).toBeCloseTo(0, 3);
  });

  it("orbScale bleibt in vernuenftigen Grenzen um 1.0", () => {
    for (const now of [0, 500, 4_000]) {
      const idle = orbScale(now, "idle");
      expect(idle).toBeGreaterThanOrEqual(1);
      expect(idle).toBeLessThanOrEqual(1.07);
    }
    const thinking = orbScale(ORB_PULSE_DURATION_MS.thinking / 2, "thinking");
    expect(thinking).toBeGreaterThan(1.15); // deutlich sichtbarer Puls
  });

  it("gibt Neon-Glow nur bei wichtigen Aktionen (Ruhe-Regel)", () => {
    expect(resolveActionGlow("deploy")).toBe("primary");
    expect(resolveActionGlow("commit")).toBe("primary");
    expect(resolveActionGlow("push")).toBe("primary");
    expect(resolveActionGlow("send-message")).toBe("primary");
    expect(resolveActionGlow("attach")).toBe("soft");
    expect(resolveActionGlow("settings")).toBe("soft");
    expect(resolveActionGlow("typing")).toBe("none");
    expect(resolveActionGlow("scroll")).toBe("none");
    expect(resolveActionGlow("navigation")).toBe("none");
  });

  it("liefert dezenteste Scanline-Werte und null bei 'off'", () => {
    expect(resolveScanlines("off")).toBeNull();
    const subtle = resolveScanlines("subtle");
    expect(subtle).toEqual({ lineHeight: 1, gap: 4, opacity: 0.03 });
    const strong = resolveScanlines("strong");
    expect(strong?.opacity).toBeLessThanOrEqual(0.05);
  });
});
