/**
 * AI-CORE (Sprint 168) — CyberSarahs holografischer AI-Kern.
 *
 * KEIN Icon: ein lebendiger, mehrschichtiger Energie-Kern mit
 *   - rotierendem aeusseren Ring (Zustandsabhaengig)
 *   - pulsierendem Gradient-Kern
 *   - bis zu 4 kreisenden Energie-Partikeln
 *   - akzentabhaengigem Aussen-Glow
 *
 * Statusmaschine: idle/listening/thinking/processing/executing/
 * success/warning/error — jede Zustand definiert Rotation, Puls,
 * Partikel und Lichtstaerke (lib/design/future-glass.ts).
 *
 * Performance: Animated (RN-classic) mit useNativeDriver — ein Loop
 * pro Layer, kein Re-Render, web- und mobile-kompatibel (Capacitor).
 * Der Kern skaliert mit `size`, alle Layer sind prozentual abgeleitet.
 */

import React, { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  accentAlpha,
  aiCoreStates,
  glassMotion,
  glassPalette,
  type AiCoreState,
} from "@/lib/design/future-glass";

interface AiCoreProps {
  /** Durchmesser in px (Default 44 — kompakt fuer Header). */
  size?: number;
  state?: AiCoreState;
  /** Zeigt den Zustands-Text unter dem Core an (Default false). */
  withLabel?: boolean;
}

const PARTICLE_TINTS = { 0: 0, 1: 0.25, 2: 0.5, 3: 0.75 } as const;

export function AiCore({ size = 44, state = "idle", withLabel = false }: AiCoreProps) {
  const visual = aiCoreStates[state];
  const accent = glassPalette[visual.accent];

  // --- Rotation des aeusseren Rings ---
  const rotation = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (visual.rotationMs <= 0) return;
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: visual.rotationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation, visual.rotationMs]);
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  // --- Puls des Kerns ---
  const pulse = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (visual.pulseMs <= 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: visual.pulseMs / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: visual.pulseMs / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, visual.pulseMs]);
  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.6] });

  // --- Umlaufende Partikel ---
  const orbit = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (visual.particles <= 0) return;
    const loop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: glassMotion.particleDrift,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [orbit, visual.particles]);

  const ringWidth = Math.max(2, size * 0.055);
  const coreSize = size * 0.52;

  return (
    <View style={{ width: size, height: withLabel ? size + 14 : size, alignItems: "center" }}>
      <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
        {/* Aeussere Glow-Aura */}
        <Animated.View
          style={[
            styles.aura,
            {
              width: size * 1.24,
              height: size * 1.24,
              borderRadius: (size * 1.24) / 2,
              backgroundColor: accentAlpha(visual.accent, 0.14),
              opacity: glowOpacity,
            },
          ]}
        />
        {/* Rotierender Ring mit Segmenten */}
        {visual.rotationMs > 0 ? (
          <Animated.View
            style={[
              styles.ring,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: ringWidth,
                borderColor: accentAlpha(visual.accent, 0.75),
                borderTopColor: "transparent",
                borderLeftColor: accentAlpha(visual.accent, 0.18),
                transform: [{ rotate: spin }],
              },
            ]}
          />
        ) : (
          <View
            style={[
              styles.ring,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: ringWidth,
                borderColor: accentAlpha(visual.accent, 0.5),
              },
            ]}
          />
        )}
        {/* Pulsierender Gradient-Kern */}
        <Animated.View style={{ transform: [{ scale: coreScale }] }}>
          <LinearGradient
            colors={[accentAlpha(visual.accent, 0.95), accentAlpha(visual.accent, 0.4), glassPalette.purple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: coreSize,
              height: coreSize,
              borderRadius: coreSize / 2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={innerCoreStyle(visual.accent, coreSize)} />
          </LinearGradient>
        </Animated.View>
        {/* Umlaufende Partikel: rotierender Container, Dot am Ringrand */}
        {visual.particles > 0 &&
          Array.from({ length: visual.particles }).map((_, index) => (
            <Animated.View
              key={index}
              style={[
                particleOrbitStyle(size),
                {
                  transform: [
                    { rotate: orbit.interpolate({
                      inputRange: [0, 1],
                      outputRange: [`${PARTICLE_TINTS[index as keyof typeof PARTICLE_TINTS] * 360}deg`, `${(PARTICLE_TINTS[index as keyof typeof PARTICLE_TINTS] * 360) + 360}deg`],
                    }) },
                  ],
                },
              ]}
            >
              <View style={particleDotStyle(accent)} />
            </Animated.View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aura: { position: "absolute" },
  ring: { position: "absolute" },
});

// Dynamische Style-Factories (haengen von Groesse/Akzent ab — gehoeren
// nicht in StyleSheet.create, da RN-Typen dort keine Funktionswerte kennen).
function innerCoreStyle(accent: keyof typeof glassPalette, coreSize: number) {
  return {
    width: coreSize * 0.34,
    height: coreSize * 0.34,
    borderRadius: (coreSize * 0.34) / 2,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    shadowColor: glassPalette[accent],
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  } as const;
}

function particleOrbitStyle(size: number) {
  return {
    position: "absolute" as const,
    width: size,
    height: size,
    // Dot sitzt am oberen Ringrand (Rotation um die Mitte).
    alignItems: "center" as const,
  };
}

function particleDotStyle(accent: string) {
  return {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    shadowColor: accent,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  } as const;
}
