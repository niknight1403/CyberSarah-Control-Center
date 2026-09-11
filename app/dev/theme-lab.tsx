import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { type ColorScheme, resolveDesignPalette, SchemeColors } from "@/constants/theme";
import { DESIGN_THEMES, designThemeDescription, designThemeIcon, designThemeLabel, type DesignTheme } from "@/lib/design-theme-logic";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";

type PaletteName = keyof typeof SchemeColors.light;

const paletteNames: PaletteName[] = Object.keys(SchemeColors.light) as PaletteName[];

function ColorSwatch({ name, value }: { name: PaletteName; value: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-border px-3 py-2">
      <View className="flex-row items-center gap-3">
        <View className="h-6 w-6 rounded-full border border-border" style={{ backgroundColor: value }} />
        <Text className="text-sm font-semibold text-foreground">{name}</Text>
      </View>
      <Text className="text-xs text-muted" style={{ fontFamily: "monospace" }}>
        {value}
      </Text>
    </View>
  );
}

export default function ThemeLabScreen() {
  const [pressCount, setPressCount] = useState(0);
  const [lastAction, setLastAction] = useState<string>("None yet");
  const { colorScheme, setColorScheme, designTheme, setDesignTheme, palette } = useThemeContext();
  const colors = useColors();

  const swatches = useMemo(
    () =>
      paletteNames.map((name) => ({
        name,
        value: resolveDesignPalette(designTheme, colorScheme)[name],
      })),
    [designTheme, colorScheme],
  );

  const tileStyles = useMemo(() => {
    const build = (scheme: ColorScheme) => {
      const resolved = resolveDesignPalette(designTheme, scheme);
      return {
        background: resolved.background,
        border: resolved.border,
        text: resolved.foreground,
        subText: resolved.muted,
        activeBackground: resolved.primary,
        activeText: resolved.background,
      };
    };
    return {
      light: build("light"),
      dark: build("dark"),
    };
  }, [designTheme]);

  return (
    <ScreenContainer className="p-5">
      <ScrollView className="flex-1">
        <View className="gap-4 pb-8">
          <ThemedView className="rounded-2xl border border-border p-4">
            <Text className="text-lg font-bold text-foreground">Design</Text>
            <Text className="mt-1 text-sm text-muted">
              Drei optische Gesamtdesigns — Palette und Effekte (Glow, Glas, Gradient) wechseln global.
            </Text>
            <View className="mt-3 gap-2">
              {DESIGN_THEMES.map((theme) => {
                const active = designTheme === theme;
                return (
                  <Pressable
                    key={theme}
                    accessibilityLabel={`Design ${designThemeLabel(theme)} aktivieren`}
                    className={`rounded-2xl border px-4 py-3 ${active ? "border-primary" : "border-border"}`}
                    style={active ? { borderColor: palette.primary } : undefined}
                    onPress={() => {
                      setDesignTheme(theme);
                      setLastAction(`Design ${designThemeLabel(theme)} angewendet`);
                    }}
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-row items-center gap-3">
                        <IconSymbol name={designThemeIcon(theme)} size={18} color={palette.primary} />
                        <View className="gap-0.5">
                          <Text className="text-base font-semibold text-foreground">{designThemeLabel(theme)}</Text>
                          <Text className="text-xs text-muted">{designThemeDescription(theme)}</Text>
                        </View>
                      </View>
                      {active ? <IconSymbol name="checkmark.circle.fill" size={20} color={palette.success} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>

          <View className="flex-row gap-2">
            {(["light", "dark"] as ColorScheme[]).map((scheme) => (
              <Pressable
                key={scheme}
                style={[
                  styles.schemeToggle,
                  {
                    backgroundColor:
                      colorScheme === scheme
                        ? tileStyles[scheme].activeBackground
                        : tileStyles[scheme].background,
                    borderColor:
                      colorScheme === scheme
                        ? tileStyles[scheme].activeBackground
                        : tileStyles[scheme].border,
                  },
                ]}
                onPress={() => {
                  setColorScheme(scheme);
                  setLastAction(`Applied ${scheme} globally`);
                }}
              >
                <Text
                  style={[
                    styles.schemeToggleTitle,
                    {
                      color:
                        colorScheme === scheme
                          ? tileStyles[scheme].activeText
                          : tileStyles[scheme].text,
                    },
                  ]}
                >
                  {scheme === "light" ? "Light preview" : "Dark preview"}
                </Text>
                <Text
                  style={[
                    styles.schemeToggleSubtitle,
                    {
                      color:
                        colorScheme === scheme
                          ? tileStyles[scheme].activeText
                          : tileStyles[scheme].subText,
                    },
                  ]}
                >
                  Global theme (NativeWind + useColors)
                </Text>
              </Pressable>
            ))}
          </View>

          <ThemedView className="rounded-2xl border border-border p-4">
            <Text className="text-lg font-bold text-foreground">
              Tailwind tokens
            </Text>
            <Text className="mt-1 text-sm text-muted">
              Buttons and badges driven by global {colorScheme} palette
            </Text>

            <View className="mt-4 flex-row flex-wrap gap-2">
              <TouchableOpacity
                className="effect-glow rounded-full px-4 py-2"
                style={{ backgroundColor: palette.primary }}
                onPress={() => {
                  setPressCount((count) => count + 1);
                  setLastAction("Pressed Primary token (Glow-Effekt)");
                }}
              >
                <Text className="text-sm font-semibold text-background">Primary + Glow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="effect-glass rounded-full border px-4 py-2"
                style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                onPress={() => {
                  setPressCount((count) => count + 1);
                  setLastAction("Pressed Surface token (Glas-Effekt)");
                }}
              >
                <Text className="text-sm font-semibold text-foreground">
                  Surface + Glas
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: palette.success }}
                onPress={() => {
                  setPressCount((count) => count + 1);
                  setLastAction("Pressed Success token");
                }}
              >
                <Text className="text-sm font-semibold text-background">
                  Success
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: palette.warning }}
                onPress={() => {
                  setPressCount((count) => count + 1);
                  setLastAction("Pressed Warning token");
                }}
              >
                <Text className="text-sm font-semibold text-background">
                  Warning
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: palette.error }}
                onPress={() => {
                  setPressCount((count) => count + 1);
                  setLastAction("Pressed Error token");
                }}
              >
                <Text className="text-sm font-semibold text-background">
                  Error
                </Text>
              </TouchableOpacity>
            </View>

            <View className="effect-glass effect-gradient mt-4 rounded-xl border border-border p-4">
              <Text className="text-base font-semibold text-foreground">
                Design-Vorschau
              </Text>
              <Text className="mt-1 text-sm text-muted">
                Diese Fläche zeigt Gradient und Blur des aktiven Designs.
              </Text>
              <Text className="mt-1 text-xs text-muted">
                useColors(): {colors.background} • Tint: {colors.tint}
              </Text>
            </View>

            <View className="mt-4 rounded-xl bg-background p-4 border border-border">
              <Text className="text-base font-semibold text-foreground">
                useColors()
              </Text>
              <Text className="mt-1 text-sm text-muted">
                Background: {colors.background} • Text: {colors.text} • Tint: {colors.tint}
              </Text>
              <Text className="text-xs text-muted">
                (Pressable uses style; Tailwind on Pressable is disabled via remap)
              </Text>
              <View className="mt-3 gap-2">
                <View className="flex-row items-center gap-2">
                  <IconSymbol name="house.fill" color={colors.tint} size={20} />
                  <Text className="text-sm text-foreground">
                    Press count: {pressCount}
                  </Text>
                </View>
                <Text className="text-sm text-muted">
                  Last action: {lastAction}
                </Text>
              </View>
            </View>
          </ThemedView>

          <ThemedView className="rounded-2xl border border-border p-4">
            <Text className="text-lg font-bold text-foreground">
              Palette values
            </Text>
            <Text className="mt-1 text-sm text-muted">
              Live values for {designThemeLabel(designTheme)} · {colorScheme}
            </Text>
            <View className="mt-3 gap-2">
              {swatches.map((item) => (
                <ColorSwatch key={item.name} name={item.name} value={item.value} />
              ))}
            </View>
          </ThemedView>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  schemeToggle: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  schemeToggleTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  schemeToggleSubtitle: {
    fontSize: 12,
  },
});
