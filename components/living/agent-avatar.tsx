/**
 * Sprint 118 — Agent-Avatar: prozedural animierte Avatar-Komponente.
 *
 * Konsumiert nur die reine Logik (lib/agent-avatar-logic.ts): Geometrie aus
 * einem stabilen Seed, Animations-Parameter je Stimmung. Design-Regeln des
 * Owners: ruhige Grundanimation (Atem >= 1,6 s), Glow nur bei wichtigen
 * Zustaenden (success/error/aktiv), Rotation langsam — nichts Tackern.
 */
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "@/hooks/use-colors";
import {
  AVATAR_MOOD_ANIMATION,
  avatarSeedFromName,
  buildRingArcPath,
  createAvatarGeometry,
  normalizeAvatarMood,
  type AvatarMood,
} from "@/lib/agent-avatar-logic";
import { shiftHue, withAlpha } from "@/lib/theme-color-utils";

export function AgentAvatar({
  name,
  mood = "idle",
  size = 88,
  label,
}: {
  /** Agent-Name — bestimmt identisch die Geometrie (gleicher Name, gleicher Avatar). */
  name: string;
  mood?: AvatarMood;
  size?: number;
  label?: string;
}) {
  const colors = useColors();
  const normalizedMood = normalizeAvatarMood(mood);
  const animation = AVATAR_MOOD_ANIMATION[normalizedMood];
  const geometry = useMemo(
    () => createAvatarGeometry(avatarSeedFromName(name)),
    // Geometrie ist identitaetsstabil: bewusst nur von name abhaengig.
     
    [name],
  );
  const accent = useMemo(
    () => shiftHue(colors.tint, geometry.hueOffset),
    // hueOffset ist seed-stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors.tint, name],
  );

  const breath = useSharedValue(1);
  const ringSpin = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(animation.breathAmplitude, {
        duration: animation.breathDurationMs / 2,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [animation.breathAmplitude, animation.breathDurationMs, breath]);

  useEffect(() => {
    // Volle Umdrehung linear, Richtung aus der Stimmung (negativ = rueckwaerts).
    const durationMs = animation.ringRotationDegPerSec === 0 ? 0 : Math.round(36000 / Math.abs(animation.ringRotationDegPerSec));
    if (durationMs === 0) {
      ringSpin.value = withTiming(0, { duration: 400 });
      return;
    }
    ringSpin.value = withRepeat(
      withTiming(360 * Math.sign(animation.ringRotationDegPerSec), { duration: durationMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [animation.ringRotationDegPerSec, ringSpin]);

  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${ringSpin.value}deg` }] }));

  const [glow, setGlow] = useState(0);
  useEffect(() => {
    // Glow-Intensitaet je Stimmung — nach Design-Regel nur wichtige Zustaende.
    setGlow(animation.glowIntensity);
  }, [animation.glowIntensity]);

  const styles = useMemo(() => createStyles(colors, accent, glow), [colors, accent, glow]);

  return (
    <View style={styles.root} accessibilityLabel={`Avatar von ${name} (${normalizedMood})`}>
      <View style={[styles.stage, { width: size, height: size }]}>
        {/* Rotierende Ringe */}
        <Animated.View style={[StyleSheet.absoluteFill, spinStyle]}>
          {geometry.rings.map((ring, index) => (
            <View
              key={index}
              style={{
                position: "absolute",
                left: (size - (ring.radius / 100) * size * 2) / 2,
                top: (size - (ring.radius / 100) * size * 2) / 2,
                width: (ring.radius / 100) * size * 2,
                height: (ring.radius / 100) * size * 2,
                borderRadius: (ring.radius / 100) * size,
                borderWidth: ring.strokeWidth,
                borderColor: withAlpha(index === 0 ? accent : colors.icon, 0.5 + index * 0.12),
                borderTopColor: "transparent",
                borderRightColor: "transparent",
                transform: [{ rotate: `${ring.dashPhase + ring.direction * ring.sweep / 4}deg` }],
              }}
            />
          ))}
        </Animated.View>

        {/* Blueten-Segmente */}
        <View style={StyleSheet.absoluteFill}>
          {geometry.petals.map((petal, index) => (
            <View
              key={index}
              style={{
                position: "absolute",
                left: size / 2 - petal.width / 2,
                top: size / 2,
                width: petal.width,
                height: (petal.length / 100) * size,
                borderRadius: petal.width / 2,
                backgroundColor: withAlpha(accent, 0.22),
                transform: [{ rotate: `${petal.angle - 90}deg` }, { translateY: -(size / 2) }],
                transformOrigin: "top center" as const,
              }}
            />
          ))}
        </View>

        {/* Atmender Kern */}
        <Animated.View
          style={[
            styles.core,
            {
              width: (geometry.coreRadius / 100) * size * 2,
              height: (geometry.coreRadius / 100) * size * 2,
              borderRadius: (geometry.coreRadius / 100) * size,
            },
            coreStyle,
          ]}
        />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

/** SVG-Pfade der Ringe (fuer Web/Vorschau/Tests) — reine Hilfsausgabe. */
export function avatarRingPaths(name: string, size: number): string[] {
  const geometry = createAvatarGeometry(avatarSeedFromName(name));
  return geometry.rings.map((ring) => buildRingArcPath(size, ring.radius, ring.dashPhase, ring.sweep));
}

type Colors = ReturnType<typeof useColors>;

function createStyles(colors: Colors, accent: string, glow: number) {
  return StyleSheet.create({
    root: { alignItems: "center" },
    stage: { alignItems: "center", justifyContent: "center" },
    core: {
      backgroundColor: withAlpha(accent, 0.55),
      shadowColor: accent,
      shadowOpacity: 0.25 + glow * 0.55,
      shadowRadius: 8 + glow * 18,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    label: { fontSize: 11, color: colors.icon, marginTop: 6 },
  });
}
