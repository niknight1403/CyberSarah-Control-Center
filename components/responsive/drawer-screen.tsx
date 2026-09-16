import { type ReactNode, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cyber, cyberTypography } from "@/lib/cyber-theme";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";

/**
 * Sprint 132 — gemeinsame Huelle fuer die Drawer-Screens (Plugins, Meetings,
 * Gedaechtnis, Daten): Cyber-Header mit Hamburger, SafeArea und Drawer-Overlay
 * aus einer Hand, damit alle neuen Seiten wie aus einem Guss wirken.
 */
export function DrawerScreen({ title, kicker, children, scroll = true }: { title: string; kicker: string; children: ReactNode; scroll?: boolean }) {
  const { visible, close, hamburgerProps, drawerProps } = useNavDrawer();
  const styles = useMemo(() => createStyles(), []);

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
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <NavDrawer {...drawerProps} />
      {scroll ? <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{content}</ScrollView> : <View style={styles.screen}>{content}</View>}
    </SafeAreaView>
  );
}

/** Kachel-Container fuer Inhalte auf Drawer-Screens. */
export function DrawerCard({ children, accent = cyber.border }: { children: ReactNode; accent?: string }) {
  const styles = useMemo(() => createStyles(), []);
  return (
    <View style={[styles.card, { borderColor: accent }]}>
      {children}
    </View>
  );
}

export function DrawerCardTitle({ children }: { children: ReactNode }) {
  const styles = useMemo(() => createStyles(), []);
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function DrawerBodyText({ children }: { children: ReactNode }) {
  const styles = useMemo(() => createStyles(), []);
  return <Text style={styles.body}>{children}</Text>;
}

function createStyles() {
  return StyleSheet.create({
    safe: { backgroundColor: cyber.bg, flex: 1 },
    screen: { flex: 1 },
    content: { padding: 18, paddingBottom: 32 },
    header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 18 },
    headerCopy: { flex: 1 },
    kicker: { ...cyberTypography.caption, color: cyber.textDim, letterSpacing: 1.6 },
    title: { color: cyber.text, fontSize: 22, fontWeight: "900", letterSpacing: 0.8, marginTop: 2 },
    card: { backgroundColor: cyber.surface, borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 16 },
    cardTitle: { color: cyber.text, fontSize: 14, fontWeight: "800", marginBottom: 6 },
    body: { color: cyber.textMuted, fontSize: 12, lineHeight: 18 },
  });
}
