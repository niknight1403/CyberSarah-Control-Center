import { type ReactNode, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cyberTypography } from "@/lib/cyber-theme";
import { useColors } from "@/hooks/use-colors";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";

/**
 * Sprint 132 — gemeinsame Huelle fuer die Drawer-Screens (Plugins, Meetings,
 * Gedaechtnis, Daten): Cyber-Header mit Hamburger, SafeArea und Drawer-Overlay
 * aus einer Hand, damit alle neuen Seiten wie aus einem Guss wirken.
 */
export function DrawerScreen({ title, kicker, children, scroll = true }: { title: string; kicker: string; children: ReactNode; scroll?: boolean }) {
  const { visible, close, hamburgerProps, drawerProps } = useNavDrawer();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
export function DrawerCard({ children, accent }: { children: ReactNode; accent?: string }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.card, { borderColor: accent ?? colors.border }]}>
      {children}
    </View>
  );
}

export function DrawerCardTitle({ children }: { children: ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function DrawerBodyText({ children }: { children: ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={styles.body}>{children}</Text>;
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe: { backgroundColor: colors.background, flex: 1 },
    screen: { flex: 1 },
    content: { padding: 18, paddingBottom: 32 },
    header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 18 },
    headerCopy: { flex: 1 },
    kicker: { ...cyberTypography.caption, color: colors.icon, letterSpacing: 1.6 },
    title: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 0.8, marginTop: 2 },
    card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 16 },
    cardTitle: { color: colors.text, fontSize: 14, fontWeight: "800", marginBottom: 6 },
    body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  });
}
