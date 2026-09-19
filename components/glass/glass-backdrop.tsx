/**
 * GlassBackdrop (Sprint 168) — atmosphärischer Deep-Void-Hintergrund.
 *
 * Ersetzt flache Vollfarb-Hintergruende durch 3 diffuse Lichtwolken
 * (radiale Gradient-Kreise, versetzt positioniert) auf Deep-Void-Basis.
 * Bewusst dezent: Inhalt bleibt jederzeit optimal lesbar (Referenz §3).
 *
 * Performance: rein statisch (keine Animation) — 3 LinearGradient-Views,
 * kein Blur, web+mobile-kompatibel. Nutzung: als aeusserster Wrapper
 * jedes Screens, Inhalt als Children.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { accentAlpha, glassDepth, type GlassAccent } from "@/lib/design/future-glass";

interface GlassBackdropProps {
  children: React.ReactNode;
  /** Zweite Lichtwolken-Farbe (Default purple — KI-Praesenz). */
  accent?: GlassAccent;
}

export function GlassBackdrop({ children, accent = "purple" }: GlassBackdropProps) {
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
      {/* Zentrale, sehr dezente Tiefenebene */}
      <LinearGradient
        colors={[glassDepth.abyss, glassDepth.void]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
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
});
