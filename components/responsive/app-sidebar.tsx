import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { usePathname, useRouter } from "expo-router";

import { AiCore } from "@/components/glass/ai-core";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { designThemeLabel } from "@/lib/design-theme-logic";
import { resolveActiveSidebarItem, SIDEBAR_ITEMS } from "@/lib/viewport-logic";

export function AppSidebar() {
  const { width } = useWindowDimensions();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { designTheme } = useThemeContext();
  const glass = useGlassTheme();
  const wide = width >= 1180;
  const narrowRail = !wide;
  const activeItem = resolveActiveSidebarItem(pathname);
  const styles = useMemo(() => createStyles(glass), [glass]);

  return (
    <View
      accessibilityLabel="Hauptnavigation"
      style={[styles.sidebar, narrowRail ? styles.rail : styles.panel]}
    >
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={[styles.brand, narrowRail && styles.brandRail]}>
          <AiCore size={narrowRail ? 32 : 38} state="idle" />
          {narrowRail ? null : (
            <View style={styles.brandCopy}>
              <Text style={styles.brandEyebrow}>AI CONTROL CENTER</Text>
              <Text style={styles.brandTitle} numberOfLines={1}>CyberSarah</Text>
            </View>
          )}
        </View>

        {narrowRail ? null : <Text style={styles.sectionLabel}>NAVIGATION</Text>}

        {SIDEBAR_ITEMS.map((item) => {
          const active = activeItem?.route === item.route;
          return (
            <Pressable
              key={item.route}
              accessibilityLabel={`${item.title} öffnen`}
              accessibilityRole="link"
              onPress={() => router.push(item.route)}
              style={({ pressed }) => [
                styles.item,
                narrowRail && styles.itemRail,
                active && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
            >
              {active ? <View style={styles.activeRail} /> : null}
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <IconSymbol name={item.icon} size={19} color={active ? glass.glassPalette.cyan : glass.glassSurface.textSecondary} />
              </View>
              {narrowRail ? null : (
                <Text numberOfLines={1} style={[styles.itemTitle, active && styles.itemTitleActive]}>
                  {item.title}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {narrowRail ? null : (
        <View style={styles.footer}>
          <View style={styles.footerDot} />
          <View style={styles.footerCopy}>
            <Text style={styles.footerLabel}>DESIGN SYSTEM</Text>
            <Text style={styles.designHint} numberOfLines={1}>{designThemeLabel(designTheme)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  sidebar: {
    alignSelf: "stretch",
    backgroundColor: glass.glassSurface.card,
    borderRightWidth: 1,
    borderRightColor: glass.glassSurface.border,
    shadowColor: glass.glassOverlay.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 0 },
    elevation: 5,
  },
  rail: { width: 76 },
  panel: { width: 244 },
  list: { gap: 5, paddingHorizontal: 10, paddingVertical: 12 },
  brand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  brandRail: { justifyContent: "center", paddingHorizontal: 0 },
  brandCopy: { flex: 1 },
  brandEyebrow: { color: glass.glassPalette.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1.3 },
  brandTitle: { color: glass.glassSurface.textPrimary, fontSize: 16, fontWeight: "900", marginTop: 2 },
  sectionLabel: {
    color: glass.glassSurface.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 4,
    paddingHorizontal: 10,
  },
  item: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 10,
    position: "relative",
    overflow: "hidden",
  },
  itemRail: { justifyContent: "center", paddingHorizontal: 0 },
  itemActive: {
    backgroundColor: glass.accentAlpha("cyan", 0.09),
    borderColor: glass.accentAlpha("cyan", 0.22),
  },
  itemPressed: { opacity: 0.78 },
  activeRail: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 3,
    backgroundColor: glass.glassPalette.cyan,
    shadowColor: glass.glassPalette.cyan,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: glass.accentAlpha("cyan", 0.1) },
  itemTitle: { color: glass.glassSurface.textSecondary, fontSize: 13, fontWeight: "600", flex: 1 },
  itemTitleActive: { color: glass.glassSurface.textPrimary, fontWeight: "800" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    margin: 10,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: glass.glassSurface.border,
    backgroundColor: glass.accentAlpha("purple", 0.06),
  },
  footerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: glass.glassPalette.purple },
  footerCopy: { flex: 1 },
  footerLabel: { color: glass.glassSurface.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  designHint: { color: glass.glassSurface.textSecondary, fontSize: 10, fontWeight: "700", marginTop: 2 },
});
