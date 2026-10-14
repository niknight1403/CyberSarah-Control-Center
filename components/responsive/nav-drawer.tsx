import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AiCore } from "@/components/glass/ai-core";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

export function NavDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const activeItem = useMemo(() => resolveActiveDrawerItem(pathname), [pathname]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  const select = useCallback(
    (route: string) => {
      onClose();
      if (route !== pathname) router.push(route as never);
    },
    [onClose, pathname, router],
  );

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} accessibilityLabel="Navigationsmenü">
      <Pressable accessibilityLabel="Menü schließen" accessibilityRole="button" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityRole="none"
          onPress={(event) => event.stopPropagation()}
          style={[styles.panel, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}
        >
          <View style={styles.brandRow}>
            <AiCore size={40} state="idle" />
            <View style={styles.brandCopy}>
              <Text style={styles.brandEyebrow}>AI CONTROL CENTER</Text>
              <Text style={styles.brandTitle}>Cyber<Text style={{ color: glass.glassPalette.cyan }}>Sarah</Text></Text>
              <Text style={styles.brandSubtitle}>Autonomous Operations</Text>
            </View>
            <Pressable accessibilityLabel="Menü schließen" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <IconSymbol name="xmark" size={18} color={glass.glassSurface.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>NAVIGATION</Text>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {DRAWER_ITEMS.map((item) => {
              const active = activeItem?.route === item.route;
              return (
                <Pressable
                  key={item.route}
                  accessibilityLabel={`${item.title} öffnen`}
                  accessibilityRole="link"
                  onPress={() => select(item.route)}
                  style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.itemPressed]}
                >
                  {active ? <View style={styles.activeRail} /> : null}
                  <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                    <IconSymbol name={item.icon} size={19} color={active ? glass.glassPalette.cyan : glass.glassSurface.textSecondary} />
                  </View>
                  <Text numberOfLines={1} style={[styles.itemTitle, active && styles.itemTitleActive]}>{item.title}</Text>
                  {item.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerDot} />
            <Text style={styles.footerText}>CyberSarah · Future Glass 2.0</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function NavDrawerButton({ onPress, tint }: { onPress: () => void; tint?: string }) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  return (
    <Pressable accessibilityLabel="Menü öffnen" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.hamburger, pressed && styles.itemPressed]}>
      <IconSymbol name="line.3.horizontal" size={21} color={tint ?? glass.glassSurface.textPrimary} />
    </Pressable>
  );
}

export function useNavDrawer() {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return { visible, open, close, hamburgerProps: { onPress: open } as const, drawerProps: { visible, onClose: close } as const };
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: glass.glassOverlay.dark,
    flexDirection: "row",
  },
  panel: {
    backgroundColor: glass.glassDepth.abyss,
    borderRightColor: glass.glassSurface.border,
    borderRightWidth: 1,
    maxWidth: 330,
    shadowColor: glass.glassPalette.cyan,
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 8, height: 0 },
    width: "88%",
  },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 11, paddingHorizontal: 16, paddingVertical: 10 },
  brandCopy: { flex: 1 },
  brandEyebrow: { color: glass.glassPalette.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1.3 },
  brandTitle: { color: glass.glassSurface.textPrimary, fontSize: 17, fontWeight: "900", letterSpacing: 0.3, marginTop: 1 },
  brandSubtitle: { color: glass.glassSurface.textSecondary, fontSize: 10, fontWeight: "600", marginTop: 1 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glass.glassSurface.card,
    borderWidth: 1,
    borderColor: glass.glassSurface.border,
  },
  divider: { backgroundColor: glass.glassSurface.border, height: 1, marginHorizontal: 16, marginVertical: 10 },
  sectionLabel: {
    color: glass.glassSurface.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    paddingHorizontal: 18,
    marginBottom: 6,
  },
  list: { gap: 5, paddingHorizontal: 10, paddingBottom: 12 },
  item: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 14,
    position: "relative",
    overflow: "hidden",
  },
  itemActive: {
    backgroundColor: glass.accentAlpha("cyan", 0.09),
    borderColor: glass.accentAlpha("cyan", 0.22),
  },
  itemPressed: { opacity: 0.72 },
  activeRail: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 3,
    backgroundColor: glass.glassPalette.cyan,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  iconWrapActive: { backgroundColor: glass.accentAlpha("cyan", 0.1) },
  itemTitle: { color: glass.glassSurface.textSecondary, flex: 1, fontSize: 13, fontWeight: "600" },
  itemTitleActive: { color: glass.glassSurface.textPrimary, fontWeight: "800" },
  badge: { backgroundColor: glass.accentAlpha("purple", 0.14), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: glass.glassPalette.purple, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: glass.glassSurface.border,
  },
  footerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: glass.glassPalette.green },
  footerText: { color: glass.glassSurface.textMuted, fontSize: 9, fontWeight: "700" },
  hamburger: {
    alignItems: "center",
    backgroundColor: glass.accentAlpha("cyan", 0.08),
    borderColor: glass.accentAlpha("cyan", 0.22),
    borderRadius: 13,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
});
