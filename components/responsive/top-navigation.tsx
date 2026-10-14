import { useMemo } from "react";
import { usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";

const routes: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Workspace", subtitle: "Code, Repository & Delivery" },
  "/dashboard": { title: "Übersicht", subtitle: "Systemlage auf einen Blick" },
  "/chat": { title: "Chat", subtitle: "KI-Dialog & Agentensteuerung" },
  "/superagent": { title: "Superagent", subtitle: "Autonome Orchestrierung" },
  "/business": { title: "Business", subtitle: "Revenue, Trading & Operations" },
  "/revenue-os": { title: "Revenue OS", subtitle: "Wachstum & Monetarisierung" },
  "/media-studio": { title: "Media Studio", subtitle: "Content & Kampagnen" },
  "/account": { title: "Konto", subtitle: "Profil, Plan & Einstellungen" },
  "/agent": { title: "Entwicklung", subtitle: "Agenten, Builds & Automatisierung" },
  "/preview": { title: "Vorschau", subtitle: "App-Erlebnis prüfen" },
  "/quality": { title: "Qualität", subtitle: "CI, Sicherheit & Release-Status" },
};

export function TopNavigation() {
  const pathname = usePathname() ?? "/";
  const insets = useSafeAreaInsets();
  const navDrawer = useNavDrawer();
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const route = routes[pathname] ?? { title: "CyberSarah", subtitle: "AI Control Center" };

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
          <View style={styles.livePill} accessibilityLabel="Systemstatus live">
            <View style={styles.statusDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
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
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: glass.glassRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: glass.accentAlpha("green", 0.08),
    borderWidth: 1,
    borderColor: glass.accentAlpha("green", 0.26),
  },
  liveText: {
    color: glass.glassPalette.green,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  statusDot: {
    backgroundColor: glass.glassPalette.green,
    borderRadius: 5,
    height: 8,
    width: 8,
    shadowColor: glass.glassPalette.green,
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
});
