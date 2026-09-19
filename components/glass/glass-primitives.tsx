/**
 * CyberGlass-Basiskomponenten (Sprint 168) — verbindliches Card/Button/
 * Badge-System fuer die "Future Glass"-Neugestaltung. Ersetzt Ad-hoc-
 * Karten-Styles in Screens: semi-transparente Glasflaeche, duenner
 * leuchtender Rand, grosse Ecken, innerer Highlight-Saum, mehrschichtiger
 * Aussen-Glow (Staerke via `glow`-Prop, Farbe via `accent`).
 *
 * Web+Mobile-kompatibel (kein native-only Blur nötig): Glass-Wirkung per
 * semi-transparenter backgroundColor + Border + Shadow.
 */

import React from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View, useAnimatedValue, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  accentAlpha,
  glassMotion,
  glassPalette,
  glassRadii,
  glassSpacing,
  glassSurface,
  glassType,
  type GlassAccent,
} from "@/lib/design/future-glass";

// ---------------------------------------------------------------------------
// GlassCard — Basis-Flaeche des gesamten Systems.
// ---------------------------------------------------------------------------

interface GlassCardProps {
  children: React.ReactNode;
  /** Akzentfarbe des Glow-Rands (undefined = neutraler Rand ohne Glow). */
  accent?: GlassAccent;
  /** Glow-Intensitaet: 0 (kein Glow) bis 2 (starker Glow fuer Hero-Cards). */
  glow?: 0 | 1 | 2;
  /** Groessere, hoeher liegende Glasflaeche (Modals/Hero). */
  elevated?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function GlassCard({ children, accent, glow = 0, elevated = false, onPress, style, testID }: GlassCardProps) {
  const scale = useAnimatedValue(1);

  const pressIn = () => {
    if (!onPress) return;
    Animated.timing(scale, { toValue: glassMotion.pressScale, duration: glassMotion.fast, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    if (!onPress) return;
    Animated.timing(scale, { toValue: 1, duration: glassMotion.fast, useNativeDriver: true }).start();
  };

  const borderColor = accent ? accentAlpha(accent, glow > 0 ? 0.55 : 0.32) : glassSurface.border;
  const shadowColor = accent ? glassPalette[accent] : "transparent";
  const shadowOpacity = glow === 2 ? 0.5 : glow === 1 ? 0.3 : 0;
  const shadowRadius = glow === 2 ? 20 : glow === 1 ? 12 : 0;

  const content = (
    <Animated.View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: elevated ? glassSurface.cardElevated : glassSurface.card,
          borderColor,
          borderRadius: glassRadii.card,
          shadowColor,
          shadowOpacity,
          shadowRadius,
          transform: [{ scale }],
        },
        style,
      ]}
    >
      {/* Akzent-Gradient-Wash — diagonaler Lichtschein (Sprint 192). */}
      {accent && glow > 0 ? (
        <LinearGradient
          colors={[accentAlpha(accent, glow === 2 ? 0.14 : 0.07), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {/* Innerer Highlight-Saum oben — Tiefenwirkung ohne Blur. */}
      <View style={styles.highlightEdge} pointerEvents="none" />
      {children}
    </Animated.View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// GlowButton — primaerer/sekundaerer CTA mit Lichtakzent.
// ---------------------------------------------------------------------------

interface GlowButtonProps {
  label: string;
  onPress: () => void;
  accent?: GlassAccent;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  icon?: React.ReactNode;
  testID?: string;
}

export function GlowButton({ label, onPress, accent = "purple", variant = "primary", disabled, icon, testID }: GlowButtonProps) {
  const scale = useAnimatedValue(1);
  const pressIn = () => Animated.timing(scale, { toValue: glassMotion.pressScale, duration: glassMotion.fast, useNativeDriver: true }).start();
  const pressOut = () => Animated.timing(scale, { toValue: 1, duration: glassMotion.fast, useNativeDriver: true }).start();

  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const background = isPrimary ? accentAlpha(accent, 0.92) : isSecondary ? accentAlpha(accent, 0.14) : "transparent";
  const borderColor = isPrimary ? "transparent" : accentAlpha(accent, 0.5);
  const textColor = isPrimary ? "#04060B" : glassPalette[accent];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: background,
            borderWidth: isPrimary ? 0 : 1,
            borderColor,
            opacity: disabled ? 0.5 : 1,
            shadowColor: glassPalette[accent],
            shadowOpacity: isPrimary ? 0.45 : 0,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 0 },
            transform: [{ scale }],
          },
        ]}
      >
        {/* Vertikaler Lichtschein — primaerer CTA wirkt "beleuchtet" (Sprint 192). */}
        {isPrimary ? (
          <LinearGradient
            colors={["rgba(255, 255, 255, 0.22)", "transparent"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderTopLeftRadius: glassRadii.pill, borderTopRightRadius: glassRadii.pill }]}
            pointerEvents="none"
          />
        ) : null}
        {icon}
        <Text style={[glassType.title, { color: textColor, fontSize: 14 }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// StatusChip — kleines Status-Badge (ONLINE/AKTIV/FEHLER/…)
// ---------------------------------------------------------------------------

interface StatusChipProps {
  label: string;
  accent?: GlassAccent;
  live?: boolean;
}

export function StatusChip({ label, accent = "green", live = false }: StatusChipProps) {
  const pulse = useAnimatedValue(0.5);
  React.useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: glassMotion.orbPulse / 2, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: glassMotion.orbPulse / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, pulse]);

  return (
    <View style={[styles.chip, { backgroundColor: accentAlpha(accent, 0.14), borderColor: accentAlpha(accent, 0.4) }]}>
      <Animated.View style={[styles.chipDot, { backgroundColor: glassPalette[accent], opacity: live ? pulse : 1 }]} />
      <Text style={[glassType.label, { color: glassPalette[accent] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: glassSpacing.lg,
    overflow: "hidden",
    ...Platform.select({ web: { boxShadow: undefined } as object, default: {} }),
  },
  highlightEdge: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: glassSurface.highlightEdge,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: glassRadii.pill,
    paddingHorizontal: glassSpacing.xl,
    paddingVertical: 13,
    minHeight: 46,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: glassRadii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
});
