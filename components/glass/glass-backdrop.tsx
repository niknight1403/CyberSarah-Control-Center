/**
 * GlassBackdrop v2 (Sprint 192) — atmosphaerischer Deep-Void-Hintergrund
 * mit aufgewerteter Grafik (Future-Glass Max):
 *   - 3 diffuse Lichtwolken (radiale Gradient-Kreise, versetzt)
 *   - Aurora-Schleier: langsam driftender Akzent-Verlauf (Native Driver)
 *   - Cyber-Grid: haarfeines Maschennetz fuer Tiefenwirkung
 *   - bis zu 5 driftende Lichtpartikel (deterministisch, seeded)
 *
 * Performance: nur Opacity/Transform-Animationen (useNativeDriver), kein
 * Blur, web+mobile-kompatibel. Partikel und Grid sind bewusst dezent —
 * Inhalt bleibt jederzeit optimal lesbar. Nutzung: aeusserster Wrapper
 * jedes Screens, Inhalt als Children.
 */

import React, { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { accentAlpha, glassDepth, glassOverlay, glassPalette, type GlassAccent } from "@/lib/design/future-glass";
import {
  buildAurora,
  buildGridMesh,
  buildParticleField,
  particleAccent,
} from "@/lib/design/glass-atmosphere-logic";

interface GlassBackdropProps {
  children: React.ReactNode;
  /** Zweite Lichtwolken-Farbe (Default purple — KI-Praesenz). */
  accent?: GlassAccent;
  /** Atmosphaeren-Layer (Aurora/Grid/Partikel) deaktivierbar fuer dichte Screens. */
  atmosphere?: boolean;
}

export function GlassBackdrop({ children, accent = "purple", atmosphere = true }: GlassBackdropProps) {
  const { width, height } = useWindowDimensions();

  // --- Aurora-Drift: langsame, sanfte Pendelbewegung (ein Loop, Native Driver) ---
  const auroraDrift = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (!atmosphere) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(auroraDrift, {
          toValue: 1,
          duration: buildAurora(glassPalette[accent]).driftMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(auroraDrift, {
          toValue: 0,
          duration: buildAurora(glassPalette[accent]).driftMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [atmosphere, auroraDrift, accent]);
  const aurora = buildAurora(glassPalette[accent]);
  const auroraShift = auroraDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, aurora.driftAmplitudePx],
  });

  // --- Deterministische Partikel (kein Math.random im Render) ---
  const particles = useMemo(() => buildParticleField(192, atmosphere ? 5 : 0), [atmosphere]);
  const particleLoops = useMemo(
    () => particles.map(() => new Animated.Value(0)),
    [particles],
  );
  useEffect(() => {
    if (!atmosphere) return;
    const loops = particles.map((particle, index) =>
      Animated.loop(
        Animated.timing(particleLoops[index], {
          toValue: 1,
          duration: particle.driftMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [atmosphere, particles, particleLoops]);

  const grid = useMemo(() => buildGridMesh(width, height, 120), [width, height]);

  return (
    <View style={[styles.root, { backgroundColor: glassDepth.void }]}>
      {/* Lichtwolke oben rechts — Akzentfarbe */}
      <LinearGradient
        colors={[accentAlpha(accent, 0.16), "transparent"]}
        style={[styles.cloud, styles.cloudTopRight]}
        pointerEvents="none"
      />
      {/* Lichtwolke unten links — Cyan (System) */}
      <LinearGradient
        colors={[accentAlpha("cyan", 0.1), "transparent"]}
        style={[styles.cloud, styles.cloudBottomLeft]}
        pointerEvents="none"
      />
      {/* Lichtwolke oben links — Blue (Daten), sehr dezent (Sprint 192) */}
      <LinearGradient
        colors={[accentAlpha("blue", 0.07), "transparent"]}
        style={[styles.cloud, styles.cloudTopLeft]}
        pointerEvents="none"
      />
      {/* Zentrale, sehr dezente Tiefenebene */}
      <LinearGradient
        colors={[glassDepth.abyss, glassDepth.void]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {atmosphere ? (
        <>
          {/* Aurora-Schleier — driftender vertikaler Akzent-Verlauf */}
          <Animated.View
            style={[styles.aurora, { transform: [{ translateX: auroraShift }] }]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={aurora.colors}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {/* Cyber-Grid — haarfeines Maschennetz */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.gridRow}>
              {Array.from({ length: grid.verticalLines }, (_, i) => (
                <View key={`v${i}`} style={styles.gridLine} />
              ))}
            </View>
            <View style={[styles.gridRow, styles.gridHorizontal]}>
              {Array.from({ length: grid.horizontalLines }, (_, i) => (
                <View key={`h${i}`} style={[styles.gridLine, styles.gridLineH]} />
              ))}
            </View>
          </View>
          {/* Driftende Lichtpartikel */}
          {particles.map((particle, index) => {
            const drift = particleLoops[index].interpolate({
              inputRange: [0, 1],
              outputRange: [0, -Math.round(height * 0.25)],
            });
            const fade = particleLoops[index].interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 1, 0],
            });
            return (
              <Animated.View
                key={`p${index}`}
                style={[
                  styles.particle,
                  {
                    left: `${particle.leftPercent}%`,
                    top: `${particle.topPercent}%`,
                    width: particle.size,
                    height: particle.size,
                    borderRadius: particle.size / 2,
                    backgroundColor: accentAlpha(particleAccent(particle), particle.opacity),
                    opacity: fade,
                    transform: [{ translateY: drift }],
                  },
                ]}
                pointerEvents="none"
              />
            );
          })}
        </>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  cloud: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  cloudTopRight: { top: -140, right: -120 },
  cloudBottomLeft: { bottom: -160, left: -140 },
  cloudTopLeft: { top: -180, left: -160 },
  aurora: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    opacity: 0.9,
  },
  gridRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-evenly",
  },
  gridHorizontal: { flexDirection: "column" },
  gridLine: { width: 1, height: "100%", backgroundColor: glassOverlay.gridLine },
  gridLineH: { width: "100%", height: 1 },
  particle: { position: "absolute" },
});
