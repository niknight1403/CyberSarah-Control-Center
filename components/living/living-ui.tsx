/**
 * Sprint 89 — "Living AI Interface": lebendige UI-Bausteine.
 *
 * Alle Werte kommen aus lib/living-interface-logic.ts (deterministisch
 * getestet) — die Komponenten selbst sind duenne Reaktionsflaechen:
 *
 * - ParticleField: langsam driftende Hintergrund-Partikel (ein gemeinsamer
 *   Animated-Treiber, pro Partikel nur eine Interpolation — performant).
 * - AiOrb: pulsierender KI-Orb statt statischem Icon; Zustand idle/thinking/
 *   success/error steuert Pulsfrequenz.
 * - ScanlineOverlay: extrem dezente Hologramm-Linien, pointerEvents-none.
 */

import { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  createParticleField,
  orbPulsePhase,
  ORB_PULSE_DURATION_MS,
  ORB_PULSE_SCALE,
  resolveScanlines,
  type OrbState,
} from "@/lib/living-interface-logic";

/* ==================== Partikel-Feld ==================== */

const PARTICLE_COLOR = "rgba(157, 140, 255, 0.9)";

export function ParticleField({ seed = 7, count = 24 }: { seed?: number; count?: number }) {
  const particles = useMemo(() => createParticleField(seed, count), [seed, count]);

  // Ein gemeinsamer Treiber 0->1 mit langer Dauer; jedes Partikel interpoliert
  // seine eigene Drift-Bahn daraus — nur EIN laufender Animated-Loop gesamt.
  const driver = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(driver, {
        toValue: 1,
        duration: 30_000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [driver]);

  return (
    <View pointerEvents="none" style={styles.particleRoot}>
      {particles.map((particle) => (
        <Animated.View
          key={particle.id}
          style={[
            styles.particle,
            {
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.size,
              height: particle.size,
              borderRadius: particle.size / 2,
              opacity: particle.opacity,
              transform: [
                {
                  translateY: driver.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, `${particle.driftY}%` as unknown as number],
                  }),
                },
                {
                  translateX: driver.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, particle.driftX, 0],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/* ==================== AI-Orb ==================== */

const ORB_COLORS: Record<OrbState, [string, string, string]> = {
  idle: ["#7C5CFF", "#4A90FF", "#38D1FF"],
  thinking: ["#9D8CFF", "#38D1FF", "#7C5CFF"],
  success: ["#22C9A7", "#4ADE96", "#38D1FF"],
  error: ["#FF7B8A", "#FF4A3A", "#7C5CFF"],
};

export function AiOrb({ state = "idle", size = 24 }: { state?: OrbState; size?: number }) {
  const pulse = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: ORB_PULSE_DURATION_MS[state] / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: ORB_PULSE_DURATION_MS[state] / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, state]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1 + ORB_PULSE_SCALE[state]],
  });
  // Startphase deterministisch aus der Logik (kein sichtbarer Kaltstart bei 0).
  const initialPhase = orbPulsePhase(Date.now(), state);

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
      <LinearGradient
        colors={ORB_COLORS[state]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.orb, { width: size, height: size, borderRadius: size / 2, opacity: 0.85 + initialPhase * 0.15 }]}
      >
        <View style={[styles.orbCore, { width: size * 0.34, height: size * 0.34, borderRadius: (size * 0.34) / 2 }]} />
      </LinearGradient>
    </Animated.View>
  );
}

/* ==================== Scanline-Overlay ==================== */

export function ScanlineOverlay({ intensity = "subtle" as const }: { intensity?: "off" | "subtle" | "strong" }) {
  const config = resolveScanlines(intensity);
  if (!config) return null;
  const lines = Math.ceil(100 / (config.gap + config.lineHeight));
  return (
    <View pointerEvents="none" style={styles.scanlineRoot}>
      {Array.from({ length: lines }, (_, index) => (
        <View
          key={index}
          style={{
            height: config.lineHeight,
            marginTop: config.gap,
            backgroundColor: "rgba(200, 220, 255, 1)",
            opacity: config.opacity,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particleRoot: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  particle: { backgroundColor: PARTICLE_COLOR, position: "absolute" },
  orb: { alignItems: "center", justifyContent: "center" },
  orbCore: { backgroundColor: "rgba(255, 255, 255, 0.85)" },
  scanlineRoot: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
});
