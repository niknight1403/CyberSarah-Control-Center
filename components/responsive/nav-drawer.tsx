import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
/** Sprint 184 — Glass-Tokens statt useColors. */
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";
import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

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
            <View style={styles.brandBadge}><Text style={styles.brandBadgeText}>CS</Text></View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandTitle}>CYBER<Text style={{ color: glassPalette.cyan }}>SARAH</Text></Text>
              <Text style={styles.brandSubtitle}>Control Center</Text>
            </View>
          </View>
          <View style={styles.divider} />
          {DRAWER_ITEMS.map((item) => {
            const active = activeItem?.route === item.route;
            return (
              <Pressable key={item.route} accessibilityLabel={`${item.title} öffnen`} accessibilityRole="link" onPress={() => select(item.route)} style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && { opacity: 0.7 }]}>
                <IconSymbol name={item.icon} size={20} color={active ? glassPalette.cyan : glassSurface.textSecondary} />
                <Text numberOfLines={1} style={[styles.itemTitle, active && { color: glassPalette.cyan }]}>{item.title}</Text>
                {item.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

export function NavDrawerButton({ onPress, tint }: { onPress: () => void; tint?: string }) {
  return (
    <Pressable accessibilityLabel="Menü öffnen" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.hamburger, pressed && { opacity: 0.6 }]}>
      <IconSymbol name="chevron.left" size={22} color={tint ?? glassSurface.textPrimary} />
    </Pressable>
  );
}

export function useNavDrawer() {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return { visible, open, close, hamburgerProps: { onPress: open } as const, drawerProps: { visible, onClose: close } as const };
}

function createStyles() {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: `${glassDepth.void}B8`, flexDirection: "row" },
    panel: { backgroundColor: glassDepth.void, borderRightColor: glassSurface.border, borderRightWidth: 1, maxWidth: 300, shadowColor: glassPalette.cyan, shadowOpacity: 0.45, shadowRadius: 28, width: "82%" },
    brandRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
    brandBadge: { alignItems: "center", backgroundColor: `${glassPalette.cyan}22`, borderColor: `${glassPalette.cyan}88`, borderRadius: 14, borderWidth: 1, height: 38, justifyContent: "center", width: 38 },
    brandBadgeText: { color: glassPalette.cyan, fontSize: 14, fontWeight: "900" },
    brandCopy: { flex: 1 },
    brandTitle: { color: glassSurface.textPrimary, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
    brandSubtitle: { color: glassSurface.textSecondary, fontSize: 10, fontWeight: "600", letterSpacing: 1.2, marginTop: 1 },
    divider: { backgroundColor: glassSurface.border, height: 1, marginHorizontal: 14, marginVertical: 10 },
    item: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 46, paddingHorizontal: 18 },
    itemActive: { backgroundColor: `${glassPalette.cyan}14`, borderLeftColor: glassPalette.cyan, borderLeftWidth: 2 },
    itemTitle: { color: glassSurface.textSecondary, flex: 1, fontSize: 14, fontWeight: "600" },
    badge: { backgroundColor: `${glassPalette.cyan}22`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { color: glassPalette.cyan, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
    hamburger: { alignItems: "center", backgroundColor: `${glassPalette.cyan}24`, borderColor: `${glassPalette.cyan}59`, borderRadius: 12, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  });
}

const styles = createStyles();
