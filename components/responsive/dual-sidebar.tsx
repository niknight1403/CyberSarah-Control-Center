import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";

type Zone = "apps" | "superagent";
type NavigationItem = { route: string; title: string; icon: Parameters<typeof IconSymbol>[0]["name"] };

const APPS_ITEMS: NavigationItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "house.fill" },
  { route: "/", title: "Workspace", icon: "folder.fill" },
  { route: "/cyber-dashboard", title: "Cyber Dashboard", icon: "bolt.fill" },
  { route: "/business", title: "Business & Analytics", icon: "chart.bar.fill" },
  { route: "/cyber-terminal", title: "Terminal", icon: "chevron.left.forwardslash.chevron.right" },
  { route: "/data", title: "Daten-Hub", icon: "tablecells.fill" },
  { route: "/meetings", title: "Meetings", icon: "gearshape.fill" },
];

const SUPERAGENT_ITEMS: NavigationItem[] = [
  { route: "/superagent", title: "Command Center", icon: "wand.and.stars" },
  { route: "/agent", title: "Development Agent", icon: "sparkles" },
  { route: "/chat", title: "Agent Chat", icon: "message.fill" },
  { route: "/quality", title: "Quality & Runs", icon: "checkmark.circle.fill" },
  { route: "/preview", title: "Live Preview", icon: "play.rectangle.fill" },
];

function matchesRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/" || pathname.endsWith("/index");
  return pathname === route || pathname.startsWith(`${route}/`);
}

function ZoneSidebar({ zone, items }: { zone: Zone; items: NavigationItem[] }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const accent = zone === "apps" ? glassPalette.cyan : glassPalette.purple;
  const title = zone === "apps" ? "APPS OPERATIONS" : "SUPERAGENT COMMAND";
  const subtitle = zone === "apps" ? "Tools · Data · Workspace" : "Autonomy · Execution · Control";

  return (
    <View accessibilityLabel={`${zone === "apps" ? "Apps" : "Superagent"}-Sidebar`} style={[styles.sidebar, { borderColor: `${accent}44` }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: `${accent}1C`, borderColor: `${accent}66` }]}>
          <IconSymbol name={zone === "apps" ? "tablecells.fill" : "wand.and.stars"} size={18} color={accent} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: accent }]} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>
      <View style={[styles.rule, { backgroundColor: `${accent}33` }]} />
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const active = matchesRoute(pathname, item.route);
          return (
            <Pressable
              key={item.route}
              accessibilityLabel={`${item.title} öffnen`}
              accessibilityRole="link"
              onPress={() => router.push(item.route as never)}
              style={({ pressed }) => [styles.item, active && { backgroundColor: `${accent}18`, borderColor: `${accent}99` }, pressed && styles.pressed]}
            >
              <IconSymbol name={item.icon} size={18} color={active ? accent : glassSurface.textSecondary} />
              <Text numberOfLines={1} style={[styles.itemText, { color: active ? glassSurface.textPrimary : glassSurface.textSecondary }]}>{item.title}</Text>
              {active ? <View style={[styles.activeDot, { backgroundColor: accent, shadowColor: accent }]} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: `${accent}22` }]}>
        <View style={[styles.statusDot, { backgroundColor: glassPalette.green, shadowColor: glassPalette.green }]} />
        <Text style={styles.footerText}>{zone === "apps" ? "SYSTEM ONLINE" : "ORCHESTRATOR READY"}</Text>
      </View>
    </View>
  );
}

export function DualSidebar() {
  return (
    <View accessibilityLabel="Dual-Sidebar-Navigation" style={styles.shell}>
      <ZoneSidebar zone="apps" items={APPS_ITEMS} />
      <ZoneSidebar zone="superagent" items={SUPERAGENT_ITEMS} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { alignSelf: "stretch", flexDirection: "row", gap: 8, padding: 10, paddingRight: 0 },
  sidebar: { backgroundColor: glassDepth.glass, borderRadius: 20, borderWidth: 1, overflow: "hidden", width: 214 },
  header: { alignItems: "center", flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingTop: 16 },
  headerCopy: { flex: 1 },
  badge: { alignItems: "center", borderRadius: 12, borderWidth: 1, height: 34, justifyContent: "center", width: 34 },
  title: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  subtitle: { color: glassSurface.textMuted, fontSize: 9, fontWeight: "600", marginTop: 3 },
  rule: { height: 1, marginHorizontal: 14, marginVertical: 14 },
  list: { gap: 5, paddingHorizontal: 8, paddingBottom: 12 },
  item: { alignItems: "center", borderColor: "transparent", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 9, minHeight: 42, paddingHorizontal: 10 },
  itemText: { flex: 1, fontSize: 12, fontWeight: "700" },
  activeDot: { borderRadius: 3, height: 6, shadowOpacity: 0.8, shadowRadius: 6, width: 6 },
  pressed: { opacity: 0.72 },
  footer: { alignItems: "center", borderTopWidth: 1, flexDirection: "row", gap: 7, marginHorizontal: 10, paddingVertical: 12 },
  statusDot: { borderRadius: 4, height: 8, shadowOpacity: 0.8, shadowRadius: 5, width: 8 },
  footerText: { color: glassSurface.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
});
