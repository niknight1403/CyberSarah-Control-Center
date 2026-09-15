/**
 * Sprint 118 — Agent-Avatar: deterministische Tests der reinen Logik —
 * Seed-Stabilitaet, Geometrie-Grenzen, Stimmungs-Animationen (Design-Regeln:
 * ruhig, Glow nur bei wichtig), SVG-Pfad-Format, Stimmungs-Ableitung.
 */
import { describe, expect, it } from "vitest";

import {
  AVATAR_MOOD_ANIMATION,
  avatarSeedFromName,
  buildRingArcPath,
  createAvatarGeometry,
  normalizeAvatarMood,
  resolveAvatarMood,
} from "@/lib/agent-avatar-logic";

describe("Sprint 118: Seed-Stabilitaet", () => {
  it("gleicher Name → gleicher Seed, immer (Identitaet, kein Zufall)", () => {
    expect(avatarSeedFromName("CyberSarah")).toBe(avatarSeedFromName("CyberSarah"));
    expect(avatarSeedFromName("CyberSarah")).not.toBe(avatarSeedFromName("Sandra"));
  });

  it("Seed bleibt im 32-Bit-Bereich und ist leerer-Zeichen-robust", () => {
    for (const name of ["", "a", "Master Agent", "gä-42#"]) {
      const seed = avatarSeedFromName(name);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("Sprint 118: Geometrie", () => {
  it("gleicher Seed → identischer Avatar (reproduzierbar)", () => {
    expect(createAvatarGeometry(1234)).toEqual(createAvatarGeometry(1234));
  });

  it("unterschiedliche Seeds unterscheiden sich", () => {
    const a = createAvatarGeometry(1);
    const b = createAvatarGeometry(2);
    expect(a).not.toEqual(b);
  });

  it("Ringe: 2-3, sortiert von innen nach aussen, Radien im Rahmen", () => {
    for (const seed of [1, 42, 999, 123456]) {
      const geometry = createAvatarGeometry(seed);
      expect(geometry.rings.length).toBeGreaterThanOrEqual(2);
      expect(geometry.rings.length).toBeLessThanOrEqual(3);
      let lastRadius = 0;
      for (const ring of geometry.rings) {
        expect(ring.radius).toBeGreaterThan(20);
        expect(ring.radius).toBeLessThanOrEqual(46);
        expect(ring.radius).toBeGreaterThan(lastRadius);
        lastRadius = ring.radius;
        expect(ring.sweep).toBeGreaterThanOrEqual(40);
        expect(ring.sweep).toBeLessThan(322);
        expect(ring.direction === 1 || ring.direction === -1).toBe(true);
      }
    }
  });

  it("Blueten: 4-8, Winkel aufsteigend, Laengen/Breiten im Rahmen", () => {
    for (const seed of [7, 77, 777]) {
      const geometry = createAvatarGeometry(seed);
      expect(geometry.petals.length).toBeGreaterThanOrEqual(4);
      expect(geometry.petals.length).toBeLessThanOrEqual(8);
      let lastAngle = -1;
      for (const petal of geometry.petals) {
        expect(petal.angle).toBeGreaterThanOrEqual(lastAngle);
        expect(petal.angle).toBeLessThan(360);
        expect(petal.length).toBeGreaterThanOrEqual(16);
        expect(petal.length).toBeLessThanOrEqual(30);
        expect(petal.width).toBeGreaterThanOrEqual(3);
        expect(petal.width).toBeLessThanOrEqual(9);
        lastAngle = petal.angle;
      }
    }
  });

  it("Kern-Radius und Farbversatz bleiben im Rahmen", () => {
    for (const seed of [3, 33, 333]) {
      const geometry = createAvatarGeometry(seed);
      expect(geometry.coreRadius).toBeGreaterThanOrEqual(18);
      expect(geometry.coreRadius).toBeLessThanOrEqual(30);
      expect(geometry.hueOffset).toBeGreaterThanOrEqual(0);
      expect(geometry.hueOffset).toBeLessThanOrEqual(359);
    }
  });
});

describe("Sprint 118: Stimmungs-Animation (Design-Regeln des Owners)", () => {
  it("ruhige Grundanimation: Atem mindestens 1,6 s, idle rotiert langsam", () => {
    for (const mood of ["idle", "thinking", "speaking", "success", "error"] as const) {
      expect(AVATAR_MOOD_ANIMATION[mood].breathDurationMs).toBeGreaterThanOrEqual(1600);
    }
    expect(AVATAR_MOOD_ANIMATION.idle.ringRotationDegPerSec).toBeLessThanOrEqual(8);
  });

  it("Glow nur bei wichtigen Zustaenden — idle bleibt still", () => {
    expect(AVATAR_MOOD_ANIMATION.idle.glowIntensity).toBe(0);
    expect(AVATAR_MOOD_ANIMATION.thinking.glowIntensity).toBeLessThanOrEqual(0.3);
    expect(AVATAR_MOOD_ANIMATION.success.glowIntensity).toBeGreaterThan(0.3);
    expect(AVATAR_MOOD_ANIMATION.error.glowIntensity).toBeGreaterThan(0.3);
  });

  it("alle Animation-Werte sind endliche, physikalisch plausible Zahlen", () => {
    for (const mood of Object.values(AVATAR_MOOD_ANIMATION)) {
      expect(mood.breathAmplitude).toBeGreaterThan(1);
      expect(mood.breathAmplitude).toBeLessThanOrEqual(1.1);
      expect(Number.isFinite(mood.ringRotationDegPerSec)).toBe(true);
      expect(Math.abs(mood.ringRotationDegPerSec)).toBeLessThanOrEqual(40);
    }
  });
});

describe("Sprint 118: SVG-Pfad", () => {
  it("Bogen-Pfad: deterministisch, M/A-Format, Startpunkt auf dem Radius", () => {
    const path = buildRingArcPath(100, 40, 0, 180);
    expect(path).toBe(buildRingArcPath(100, 40, 0, 180));
    expect(path).toMatch(/^M /);
    expect(path).toContain(" A ");
    const [x1, y1] = path.split(" A ")[0].replace("M ", "").split(" ").map(Number);
    expect(x1).toBeCloseTo(90, 1); // cx=50 + r=40 (Radius 40 % von 100) auf Winkel 0
    expect(y1).toBeCloseTo(50, 1);
  });

  it("Sweep ueber 180 Grad setzt large-arc-flag", () => {
    expect(buildRingArcPath(100, 40, 0, 270)).toContain(" 1 1 ");
    expect(buildRingArcPath(100, 40, 0, 90)).toContain(" 0 1 ");
  });
});

describe("Sprint 118: Stimmungs-Ableitung", () => {
  it("Fehler schlaegt alles, Denken schlaegt Erfolg, sonst ruhig", () => {
    expect(resolveAvatarMood({ isThinking: true, hasError: true, isSuccess: true })).toBe("error");
    expect(resolveAvatarMood({ isThinking: true, hasError: false, isSuccess: true })).toBe("thinking");
    expect(resolveAvatarMood({ isThinking: false, hasError: false, isSuccess: true })).toBe("success");
    expect(resolveAvatarMood({ isThinking: false, hasError: false, isSuccess: false, isSpeaking: true })).toBe("speaking");
    expect(resolveAvatarMood({ isThinking: false, hasError: false, isSuccess: false })).toBe("idle");
  });

  it("unbekannte Stimmung faellt auf idle zureck", () => {
    expect(normalizeAvatarMood("halluzination")).toBe("idle");
    expect(normalizeAvatarMood("success")).toBe("success");
    expect(normalizeAvatarMood(42)).toBe("idle");
  });
});
