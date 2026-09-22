import { usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";

const titles: Record<string, string> = {
  "/": "Workspace",
  "/dashboard": "Übersicht",
  "/chat": "Chat",
  "/superagent": "Superagent",
  "/account": "Konto",
  "/agent": "Entwicklung",
  "/preview": "Vorschau",
  "/quality": "Qualität",
};

/**
 * Globaler App-Header: Die Navigation wird bewusst nicht mehr als Bottom-Tab-Bar
 * gerendert. Auf kleinen Screens öffnet der Button links oben das identische
 * Navigationsmenü; dadurch bleibt der Chatbereich vollständig für Inhalte frei.
 */
export function TopNavigation() {
  const pathname = usePathname() ?? "/";
  const insets = useSafeAreaInsets();
  const navDrawer = useNavDrawer();
  const title = titles[pathname] ?? "CyberSarah";

  return (
    <>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <NavDrawerButton {...navDrawer.hamburgerProps} tint={glassPalette.cyan} />
        <View style={styles.copy}>
          <Text style={styles.brand}>CYBERSARAH</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        <View style={styles.statusDot} accessibilityLabel="System online" />
      </View>
      <NavDrawer {...navDrawer.drawerProps} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: glassDepth.void,
    borderBottomColor: glassSurface.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingBottom: 8,
    paddingHorizontal: 14,
    zIndex: 10,
  },
  copy: { flex: 1, minWidth: 0 },
  brand: { color: glassPalette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  title: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "800", marginTop: 2 },
  statusDot: {
    backgroundColor: glassPalette.green,
    borderRadius: 5,
    height: 9,
    shadowColor: glassPalette.green,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    width: 9,
  },
});
