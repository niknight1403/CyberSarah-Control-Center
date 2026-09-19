/**
 * Sprint 117 — Onboarding: Willkommensflow beim ersten Start.
 *
 * Liquid-glass-inspiriert (Tech-Scan-Fund "liquid-glass-screens"):
 * Gradient-Hintergrund, Milchglas-Karten mit Blur-Glow, animierte
 * Fortschritts-Punkte. Reihenfolge und Regeln liegen rein in
 * lib/onboarding-logic.ts; dieser Screen rendert nur.
 *
 * Der letzte Schritt (Design-Auswahl) schreibt Design-Theme und
 * Hell/Dunkel-Praeferenz ueber den ThemeProvider und setzt das
 * Abschluss-Flag — danach replace zu den Tabs (kein Zurueck).
 *
 * Sprint 130:
 *  - Willkommens-Schritt bekommt dezente, schwebende Glow-Orbs im
 *    Hintergrund ("spacige Animationen") — reine transform/opacity-
 *    Animationen ueber Reanimated, GPU-billig, kein Layout-Thrashing.
 *  - Design-Auswahl bekommt eine Live-Vorschau (Mini-Mockup), die beim
 *    Antippen einer Karte sofort die echten Farben/Effekte des Designs
 *    zeigt, statt nur Beschreibungstext — "wie fuehlt sich das an".
 */
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useOnboarding } from "@/hooks/use-onboarding";
import { DEFAULT_DESIGN_THEME, type DesignTheme } from "@/lib/design-theme-logic";
import { DesignThemeDefinitions, resolveDesignPalette, resolveDesignRuntimePalette } from "@/lib/_core/design-theme-palettes";
import {
  getOnboardingStepState,
  getOnboardingThemeChoices,
  normalizeOnboardingDesignTheme,
  ONBOARDING_SLIDES,
  shouldCompleteOnboarding,
} from "@/lib/onboarding-logic";
import { normalizeThemePreference, themePreferenceLabel, type ThemePreference } from "@/lib/theme-preference-logic";
import { useThemeContext } from "@/lib/theme-provider";
import { withAlpha } from "@/lib/theme-color-utils";
import { glassSurface } from "@/lib/design/future-glass";

const PREFERENCE_CHOICES: readonly ThemePreference[] = ["system", "light", "dark"] as const;

/** Schwebende Glow-Orbs fuer den Willkommens-Schritt — rein dekorativ. */
function DriftingOrb({
  size,
  color,
  top,
  left,
  duration,
  delay,
}: {
  size: number;
  color: string;
  top: number;
  left: number;
  duration: number;
  delay: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (progress.value - 0.5) * 26 },
      { translateX: (progress.value - 0.5) * 18 },
      { scale: 0.92 + progress.value * 0.16 },
    ],
    opacity: 0.18 + progress.value * 0.22,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeInUp.duration(600).delay(delay)}
      style={[
        {
          position: "absolute",
          top,
          left,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        Platform.OS === "web" ? ({ filter: "blur(18px)" } as never) : null,
        animatedStyle,
      ]}
    />
  );
}

/** Mini-Mockup, das die echten Farben/Effekte eines Designs live zeigt. */
function DesignPreview({ theme, colors }: { theme: DesignTheme; colors: Colors }) {
  const scheme = colors.background === glassSurface.textPrimary || colors.background === glassSurface.textSecondary ? "light" : "dark";
  const palette = resolveDesignPalette(theme, scheme);
  const effects = DesignThemeDefinitions[theme].effects[scheme];
  const hasGlow = effects.glowPrimary !== "none";

  return (
    <View style={[previewStyles.frame, { backgroundColor: palette.background, borderColor: withAlpha(palette.border, 0.7) }]}>
      <View
        style={[
          previewStyles.card,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
          Platform.OS === "web"
            ? ({ boxShadow: hasGlow ? effects.glowPrimary : "none", backdropFilter: effects.blur !== "0px" ? `blur(${effects.blur})` : undefined } as never)
            : null,
        ]}
      >
        <View style={[previewStyles.pill, { backgroundColor: palette.primary }]} />
        <View style={[previewStyles.line, { backgroundColor: withAlpha(palette.foreground, 0.85), width: "70%" }]} />
        <View style={[previewStyles.line, { backgroundColor: withAlpha(palette.muted, 0.7), width: "45%" }]} />
        <View style={[previewStyles.button, { backgroundColor: palette.primary }]} />
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { setDesignTheme, setThemePreference } = useThemeContext();
  const { completeOnboarding } = useOnboarding();

  const [stepIndex, setStepIndex] = useState(0);
  const [designChoice, setDesignChoice] = useState<DesignTheme | null>(null);
  const [previewTheme, setPreviewTheme] = useState<DesignTheme>(DEFAULT_DESIGN_THEME);
  // Der neue Neon-Look startet bewusst dunkel; "System" bleibt später auswählbar.
  const [preferenceChoice, setPreferenceChoice] = useState<ThemePreference>("dark");

  const step = useMemo(() => getOnboardingStepState(stepIndex, ONBOARDING_SLIDES), [stepIndex]);
  const themeChoices = useMemo(() => getOnboardingThemeChoices(), []);
  const visualColors = useMemo(
    () => resolveDesignRuntimePalette(previewTheme, preferenceChoice === "light" ? "light" : "dark"),
    [preferenceChoice, previewTheme],
  );
  const styles = useMemo(() => createStyles(visualColors), [visualColors]);

  const finish = useCallback(async () => {
    if (!shouldCompleteOnboarding(step.isLast, designChoice !== null)) return;
    setDesignTheme(normalizeOnboardingDesignTheme(designChoice, DEFAULT_DESIGN_THEME));
    setThemePreference(normalizeThemePreference(preferenceChoice));
    await completeOnboarding();
    router.replace("/(tabs)");
  }, [completeOnboarding, designChoice, preferenceChoice, setDesignTheme, setThemePreference, step.isLast]);

  const isWide = width >= 640;
  const isWelcome = step.slide.id === "welcome";

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[visualColors.tint, visualColors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {isWelcome ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <DriftingOrb size={140} color={withAlpha(visualColors.tint, 0.55)} top={40} left={-30} duration={5200} delay={80} />
          <DriftingOrb size={90} color={withAlpha(glassSurface.textMuted, 0.45)} top={220} left={width - 90} duration={4200} delay={220} />
          <DriftingOrb size={60} color={withAlpha(visualColors.tint, 0.4)} top={420} left={30} duration={3600} delay={360} />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Fortschritts-Punkte */}
        <View style={styles.dotsRow} accessibilityLabel={`Schritt ${stepIndex + 1} von ${ONBOARDING_SLIDES.length}`}>
          {ONBOARDING_SLIDES.map((slide, index) => (
            <View key={slide.id} style={[styles.dot, index === stepIndex && styles.dotActive]} />
          ))}
        </View>

        <Animated.View
          key={step.slide.id}
          entering={FadeInDown.duration(320)}
          style={[styles.glassCard, isWide && styles.glassCardWide]}
        >
          <View style={styles.iconBadge}>
            <IconSymbol name={step.slide.icon} size={28} color={visualColors.tint} />
          </View>
          <Text style={styles.title}>{step.slide.title}</Text>
          <Text style={styles.text}>{step.slide.text}</Text>
        </Animated.View>

        {/* Theme-Auswahl erst auf dem letzten Schritt */}
        {step.slide.id === "theme" ? (
          <Animated.View entering={FadeInUp.duration(320).delay(120)} style={[styles.glassCard, isWide && styles.glassCardWide]}>
            <Text style={styles.sectionTitle}>Design wählen</Text>

            <DesignPreview theme={previewTheme} colors={visualColors} />
            <Text style={styles.previewHint}>Live-Vorschau — tippe eine Karte an, um Farben und Effekte direkt zu sehen.</Text>

            <View style={styles.choiceGrid}>
              {themeChoices.map((choice) => {
                const selected = designChoice === choice.theme;
                return (
                  <Pressable
                    key={choice.theme}
                    onPress={() => {
                      setDesignChoice(choice.theme);
                      setPreviewTheme(choice.theme);
                    }}
                    onHoverIn={Platform.OS === "web" ? () => setPreviewTheme(choice.theme) : undefined}
                    style={[styles.choiceCard, selected && styles.choiceCardSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <IconSymbol name={choice.icon} size={22} color={selected ? visualColors.tint : visualColors.icon} />
                    <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]} numberOfLines={1}>
                      {choice.label}
                    </Text>
                    <Text style={styles.choiceDescription} numberOfLines={3}>
                      {choice.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Hell oder dunkel?</Text>
            <View style={styles.preferenceRow}>
              {PREFERENCE_CHOICES.map((preference) => {
                const selected = preferenceChoice === preference;
                return (
                  <Pressable
                    key={preference}
                    onPress={() => setPreferenceChoice(preference)}
                    style={[styles.preferenceChip, selected && styles.preferenceChipSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.preferenceLabel, selected && styles.preferenceLabelSelected]}>
                      {themePreferenceLabel(preference)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>Alles laesst sich spaeter im Konto-Tab aendern.</Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step.isFirst ? null : (
          <Pressable style={styles.backButton} onPress={() => setStepIndex((current) => Math.max(0, current - 1))}>
            <Text style={styles.backLabel}>Zurück</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.nextButton, step.isLast && designChoice === null && styles.nextButtonDisabled]}
          onPress={() => {
            if (step.isLast) {
              void finish();
              return;
            }
            setStepIndex((current) => Math.min(ONBOARDING_SLIDES.length - 1, current + 1));
          }}
          disabled={step.isLast && designChoice === null}
        >
          <Text style={styles.nextLabel}>{step.nextLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Colors = ReturnType<typeof resolveDesignRuntimePalette>;

const previewStyles = StyleSheet.create({
  frame: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  pill: { width: 28, height: 28, borderRadius: 8 },
  line: { height: 8, borderRadius: 4 },
  button: { height: 22, borderRadius: 8, marginTop: 4, width: "40%" },
});

function createStyles(colors: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1, paddingHorizontal: 20, justifyContent: "center" },
    dotsRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: withAlpha(colors.icon, 0.3) },
    dotActive: { backgroundColor: colors.tint, width: 24 },
    glassCard: {
      backgroundColor: withAlpha(colors.surface, 0.82),
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withAlpha(colors.tint, 0.35),
      padding: 24,
      marginBottom: 16,
      shadowColor: colors.tint,
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    glassCardWide: { maxWidth: 720, width: "100%", alignSelf: "center" },
    iconBadge: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(colors.tint, 0.14),
      marginBottom: 16,
    },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, marginBottom: 8 },
    text: { fontSize: 15, lineHeight: 22, color: colors.text },
    sectionTitle: { fontSize: 16, fontWeight: "600", color: colors.text, marginTop: 20, marginBottom: 12 },
    previewHint: { fontSize: 11, color: colors.icon, marginBottom: 14, marginTop: -2 },
    choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    choiceCard: {
      flexBasis: "47%",
      flexGrow: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withAlpha(colors.border, 0.6),
      backgroundColor: withAlpha(colors.background, 0.5),
      padding: 14,
      gap: 6,
    },
    choiceCardSelected: { borderColor: colors.tint, backgroundColor: withAlpha(colors.tint, 0.12) },
    choiceLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
    choiceLabelSelected: { color: colors.tint },
    choiceDescription: { fontSize: 11, lineHeight: 15, color: colors.icon },
    preferenceRow: { flexDirection: "row", gap: 10 },
    preferenceChip: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(colors.border, 0.6),
      backgroundColor: withAlpha(colors.background, 0.5),
    },
    preferenceChipSelected: { borderColor: colors.tint, backgroundColor: withAlpha(colors.tint, 0.12) },
    preferenceLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
    preferenceLabelSelected: { color: colors.tint },
    hint: { fontSize: 12, color: colors.icon, marginTop: 12 },
    footer: { flexDirection: "row", gap: 12, paddingHorizontal: 20 },
    backButton: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 16,
      borderRadius: 16,
      backgroundColor: withAlpha(colors.surface, 0.6),
    },
    backLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
    nextButton: {
      flex: 2,
      alignItems: "center",
      paddingVertical: 16,
      borderRadius: 16,
      backgroundColor: colors.tint,
    },
    nextButtonDisabled: { opacity: 0.45 },
    nextLabel: { fontSize: 15, fontWeight: "700", color: colors.background },
  });
}
