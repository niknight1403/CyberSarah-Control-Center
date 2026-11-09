import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";
import { getPrimaryNavigation, matchesRoute, resolveSidebarFooter } from "@/lib/dual-sidebar-logic";
import { useServerHealth } from "@/hooks/use-server-health";

const TONE_COLORS = {
  positive: glassPalette.green,
  negative: glassPalette.red,
  muted: glassSurface.textMuted,
} as const;

/** Einheitliche Desktop-Navigation mit denselben fünf Hauptbereichen wie mobil. */
export function DualSidebar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const health = useServerHealth();
  const footer = resolveSidebarFooter(health);
  const items = getPrimaryNavigation();

  return (
    <View accessibilityLabel="Hauptnavigation" style={styles.sidebar}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <IconSymbol name="sparkles" size={18} color={glassPalette.cyan} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>CYBERSARAH</Text>
          <Text style={styles.subtitle}>REVENUE & GROWTH OS</Text>
        </View>
      </View>
      <View style={styles.rule} />
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const active = matchesRoute(pathname, item.route);
          return (
            <Pressable
              key={item.route}
              accessibilityLabel={`${item.title} öffnen`}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              onPress={() => router.push(item.route as never)}
              style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.pressed]}
            >
              <IconSymbol name={item.icon} size={18} color={active ? glassPalette.cyan : glassSurface.textSecondary} />
              <Text numberOfLines={1} style={[styles.itemText, active && styles.itemTextActive]}>{item.title}</Text>
              {active ? <View style={styles.activeDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <View accessibilityLabel={footer.label} style={[styles.statusDot, { backgroundColor: TONE_COLORS[footer.tone] }]} />
        <Text style={[styles.footerText, { color: TONE_COLORS[footer.tone] }]}>{footer.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { alignSelf: "stretch", backgroundColor: glassDepth.glass, borderColor: `${glassPalette.cyan}44`, borderRadius: 20, borderWidth: 1, margin: 10, overflow: "hidden", width: 226 },
  header: { alignItems: "center", flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingTop: 18 },
  headerCopy: { flex: 1 },
  badge: { alignItems: "center", backgroundColor: `${glassPalette.cyan}1C`, borderColor: `${glassPalette.cyan}66`, borderRadius: 12, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  title: { color: glassPalette.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: glassSurface.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.5, marginTop: 3 },
  rule: { backgroundColor: `${glassPalette.cyan}33`, height: 1, marginHorizontal: 14, marginVertical: 16 },
  list: { gap: 6, paddingHorizontal: 9, paddingBottom: 12 },
  item: { alignItems: "center", borderColor: "transparent", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 46, paddingHorizontal: 11 },
  itemActive: { backgroundColor: `${glassPalette.cyan}18`, borderColor: `${glassPalette.cyan}99` },
  itemText: { color: glassSurface.textSecondary, flex: 1, fontSize: 12, fontWeight: "700" },
  itemTextActive: { color: glassSurface.textPrimary },
  activeDot: { backgroundColor: glassPalette.cyan, borderRadius: 3, height: 6, width: 6 },
  pressed: { opacity: 0.72 },
  footer: { alignItems: "center", borderTopColor: `${glassPalette.cyan}22`, borderTopWidth: 1, flexDirection: "row", gap: 8, marginHorizontal: 10, paddingVertical: 13 },
  statusDot: { borderRadius: 4, height: 8, width: 8 },
  footerText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
});
