import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useWindowDimensions } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { designThemeLabel } from "@/lib/design-theme-logic";
import { resolveActiveSidebarItem, SIDEBAR_ITEMS } from "@/lib/viewport-logic";

/**
 * Responsive Sidebar für breite Viewports (Tablet/Desktop): ersetzt die mobile
 * Bottom-Tab-Navigation, sobald der Viewport den Tablet-Breakpoint erreicht.
 * Die Sidebar ist Design-Theme-aware (Palette, Glas-/Glow-Effekte).
 */
export function AppSidebar() {
  const { width } = useWindowDimensions();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const colors = useColors();
  const { designTheme } = useThemeContext();
  const [narrowRail, setNarrowRail] = useState(false);
  const wide = width >= 1100;
  useEffect(() => {
    setNarrowRail(!wide);
  }, [wide]);

  const activeItem = resolveActiveSidebarItem(pathname);

  return (
    <View
      accessibilityLabel="Hauptnavigation"
      className="effect-glass"
      style={[
        styles.sidebar,
        narrowRail ? styles.rail : styles.panel,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <IconSymbol name="bolt.fill" size={narrowRail ? 18 : 20} color={colors.tint} />
          {narrowRail ? null : (
            <Text style={[styles.brandTitle, { color: colors.text }]} numberOfLines={1}>
              CyberSarah
            </Text>
          )}
        </View>
        {SIDEBAR_ITEMS.map((item) => {
          const active = activeItem?.route === item.route;
          return (
            <Pressable
              key={item.route}
              accessibilityLabel={`${item.title} öffnen`}
              accessibilityRole="link"
              onPress={() => router.push(item.route)}
              style={[
                styles.item,
                active ? { backgroundColor: `${String(colors.tint)}22`, borderColor: colors.tint } : null,
              ]}
            >
              <IconSymbol name={item.icon} size={20} color={active ? colors.tint : colors.icon} />
              {narrowRail ? null : (
                <Text
                  numberOfLines={1}
                  style={[styles.itemTitle, { color: active ? colors.tint : colors.text }]}
                >
                  {item.title}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {narrowRail ? null : (
        <Text style={[styles.designHint, { color: colors.muted }]} numberOfLines={1}>
          Design: {designThemeLabel(designTheme)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    alignSelf: "stretch",
    borderRightWidth: 1,
  },
  rail: { width: 72 },
  panel: { width: 220 },
  list: { gap: 4, padding: 10 },
  brand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  brandTitle: { fontSize: 15, fontWeight: "800" },
  item: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  itemTitle: { fontSize: 13, fontWeight: "600" },
  designHint: {
    fontSize: 10,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
