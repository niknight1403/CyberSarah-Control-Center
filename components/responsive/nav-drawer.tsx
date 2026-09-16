import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { cyber } from "@/lib/cyber-theme";
import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

/**
 * Sprint 132 — Nav-Drawer im Base44-Stil (Chat, Workflows, Plugins, Meet-
 * ings, Dateien, Gedaechtnis, Daten, Agenteneinstellungen).
 *
 * Overlay-Drawer (Modal, von links) plus kompaktem Hamburger-Button, der in
 * jeden Screen-Header eingebaut werden kann. Design folgt dem Cyber-Design-
 * System (Indigo-Schwarz + Neon-Spektrum). Android-Back-Button schliesst
 * den geoeffneten Drawer statt die App zu verlassen.
 */
export function NavDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose} accessibilityLabel="Navigationsmenü">
      <Pressable accessibilityLabel="Menü schließen" accessibilityRole="button" onPress={onClose} style={styles.backdrop}>
        <View style={[styles.panel, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>CS</Text>
            </View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandTitle}>CYBER<Text style={{ color: cyber.cyan }}>SARAH</Text></Text>
              <Text style={styles.brandSubtitle}>Control Center</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {DRAWER_ITEMS.map((item) => {
            const active = activeItem?.route === item.route;
            return (
              <Pressable
                key={item.route}
                accessibilityLabel={`${item.title} öffnen`}
                accessibilityRole="link"
                onPress={() => select(item.route)}
                style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && { opacity: 0.7 }]}
              >
                <IconSymbol name={item.icon} size={20} color={active ? cyber.cyan : cyber.textDim} />
                <Text numberOfLines={1} style={[styles.itemTitle, active && { color: cyber.cyan }]}>
                  {item.title}
                </Text>
                {item.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

/** Hamburger-Button — in Screen-Header einbauen, oeffnet den Drawer. */
export function NavDrawerButton({ onPress, tint }: { onPress: () => void; tint?: string }) {
  return (
    <Pressable
      accessibilityLabel="Menü öffnen"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.hamburger, pressed && { opacity: 0.6 }]}
    >
      <IconSymbol name="line.3.horizontal" size={22} color={tint ?? cyber.text} />
    </Pressable>
  );
}

/** Convenience-Hook: Drawer-State + geoeffnete Props, pro Screen nutzbar. */
export function useNavDrawer() {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return { visible, open, close, hamburgerProps: { onPress: open } as const, drawerProps: { visible, onClose: close } as const };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(4, 4, 12, 0.72)", flexDirection: "row" },
  panel: {
    backgroundColor: cyber.bg,
    borderRightColor: cyber.border,
    borderRightWidth: 1,
    maxWidth: 300,
    shadowColor: cyber.purple,
    shadowOpacity: 0.45,
    shadowRadius: 28,
    width: "82%",
  },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  brandBadge: {
    alignItems: "center",
    backgroundColor: `${cyber.pink}22`,
    borderColor: `${cyber.pink}88`,
    borderRadius: 14,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  brandBadgeText: { color: cyber.pink, fontSize: 14, fontWeight: "900" },
  brandCopy: { flex: 1 },
  brandTitle: { color: cyber.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  brandSubtitle: { color: cyber.textDim, fontSize: 10, fontWeight: "600", letterSpacing: 1.2, marginTop: 1 },
  divider: { backgroundColor: cyber.border, height: 1, marginHorizontal: 14, marginVertical: 10 },
  item: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 46, paddingHorizontal: 18 },
  itemActive: { backgroundColor: "rgba(0, 229, 255, 0.08)", borderLeftColor: cyber.cyan, borderLeftWidth: 2 },
  itemTitle: { color: cyber.textMuted, flex: 1, fontSize: 14, fontWeight: "600" },
  badge: { backgroundColor: `${cyber.pink}22`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: cyber.pink, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  hamburger: {
    alignItems: "center",
    backgroundColor: "rgba(139, 92, 246, 0.14)",
    borderColor: "rgba(139, 92, 246, 0.35)",
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
});
