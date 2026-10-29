import { useMemo } from "react";
import { usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { resolveMobileHeader } from "@/lib/mobile-header-logic";
import { useMobileReadiness } from "@/hooks/use-mobile-readiness";

export function TopNavigation() {
  const pathname = usePathname() ?? "/";
  const insets = useSafeAreaInsets();
  const navDrawer = useNavDrawer();
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const route = resolveMobileHeader(pathname);
  const readiness = useMobileReadiness();

  return (
    <>
      <View style={[styles.outer, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.header}>
          <View style={styles.menuButton}>
            <NavDrawerButton {...navDrawer.hamburgerProps} tint={glass.glassPalette.cyan} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.brand}>CYBERSARAH / CONTROL CENTER</Text>
            <Text style={styles.title} numberOfLines={1}>{route.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{route.subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`API- und Datenbankstatus: ${readiness.view.detail} ${readiness.isChecking ? "Prüfung läuft." : "Zum Aktualisieren tippen."}`}
            accessibilityState={{ busy: readiness.isChecking, disabled: readiness.isChecking }}
            disabled={readiness.isChecking}
            onPress={readiness.refresh}
            style={[styles.contextPill, {
              borderColor: glass.accentAlpha(readiness.view.accent, 0.26),
              backgroundColor: glass.accentAlpha(readiness.view.accent, 0.08),
            }]}
          >
            <Text numberOfLines={1} style={[styles.contextText, { color: glass.glassPalette[readiness.view.accent] }]}>
              {readiness.view.label}
            </Text>
          </Pressable>
        </View>
      </View>
      <NavDrawer {...navDrawer.drawerProps} />
    </>
  );
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  outer: {
    backgroundColor: "transparent",
    paddingHorizontal: 10,
    paddingBottom: 8,
    zIndex: 10,
  },
  header: {
    alignItems: "center",
    backgroundColor: glass.glassSurface.card,
    borderColor: glass.glassSurface.border,
    borderWidth: 1,
    borderRadius: glass.glassRadii.lg,
    flexDirection: "row",
    gap: 12,
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: glass.glassOverlay.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  menuButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: glass.accentAlpha("cyan", 0.08),
    borderWidth: 1,
    borderColor: glass.accentAlpha("cyan", 0.18),
  },
  copy: { flex: 1, minWidth: 0 },
  brand: {
    color: glass.glassPalette.cyan,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  title: {
    color: glass.glassSurface.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  subtitle: {
    color: glass.glassSurface.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  contextPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: glass.glassRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 44,
    maxWidth: 116,
    justifyContent: "center",
    backgroundColor: glass.accentAlpha("cyan", 0.08),
    borderWidth: 1,
    borderColor: glass.accentAlpha("cyan", 0.26),
  },
  contextText: {
    color: glass.glassPalette.cyan,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
