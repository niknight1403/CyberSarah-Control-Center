import { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { glassDepth, glassPalette, glassSurface, glassType } from "@/lib/design/future-glass";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";

/**
 * Sprint 132 — gemeinsame Huelle fuer die Drawer-Screens (Plugins, Meetings,
 * Gedaechtnis, Daten): Cyber-Header mit Hamburger, SafeArea und Drawer-Overlay
 * aus einer Hand, damit alle neuen Seiten wie aus einem Guss wirken.
 * Sprint 184 — auf "CyberSarah Future Glass" umgestellt: GlassBackdrop mit
 * transparentem SafeArea-Container, Glass-Tokens statt useColors/cyber-theme.
 */
export function DrawerScreen({ title, kicker, children, scroll = true, accent = "cyan" }: { title: string; kicker: string; children: ReactNode; scroll?: boolean; accent?: "cyan" | "purple" | "magenta" | "green" | "red" | "amber" | "blue" }) {
  const { hamburgerProps, drawerProps } = useNavDrawer();

  const content = (
    <>
      <View style={styles.header}>
        <NavDrawerButton {...hamburgerProps} />
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
      {children}
    </>
  );

  return (
    <GlassBackdrop accent={accent}>
      <SafeAreaView style={styles.safeTransparent} edges={["top", "bottom"]}>
        <NavDrawer {...drawerProps} />
        {scroll ? <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{content}</ScrollView> : <View style={styles.screen}>{content}</View>}
      </SafeAreaView>
    </GlassBackdrop>
  );
}

/** Kachel-Container fuer Inhalte auf Drawer-Screens. */
export function DrawerCard({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <View style={[styles.card, { borderColor: accent ?? glassSurface.border }]}>
      {children}
    </View>
  );
}

export function DrawerCardTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function DrawerBodyText({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

function createStyles() {
  return StyleSheet.create({
    safe: { backgroundColor: glassDepth.void, flex: 1 },
    safeTransparent: { backgroundColor: "transparent", flex: 1 },
    screen: { flex: 1 },
    content: { padding: 18, paddingBottom: 32 },
    header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 18 },
    headerCopy: { flex: 1 },
    kicker: { ...glassType.label, color: glassSurface.textSecondary, letterSpacing: 1.6 },
    title: { color: glassSurface.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: 0.8, marginTop: 2 },
    card: { backgroundColor: glassDepth.glass, borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 16 },
    cardTitle: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 6 },
    body: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18 },
  });
}

const styles = createStyles();
