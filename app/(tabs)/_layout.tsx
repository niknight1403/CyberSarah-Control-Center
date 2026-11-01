import { router, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOnboarding } from "@/hooks/use-onboarding";
import { authGateRoute, resolveAuthGate } from "@/lib/auth-gate-logic";
import { trpc } from "@/lib/trpc";
import { HapticTab } from "@/components/haptic-tab";
import { DualSidebar } from "@/components/responsive/dual-sidebar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassTabIcon } from "@/components/glass/glass-tab-icon";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { isWideViewport } from "@/lib/viewport-logic";
import { useGlassTheme } from "@/lib/design/future-glass-runtime";
import { CYBERSARAH_ASSET_PACK } from "@/lib/design/cybersarah-asset-pack";

/**
 * Die Routen bleiben als Expo-Router-Segmente erhalten, aber die mobile
 * Bottom-Tab-Bar ist auf Smartphones für fünf Kernbereiche aktiviert.
 * Auf großen Web-Viewports bleibt die bestehende Sidebar erhalten.
 */
export default function TabLayout() {
  const glass = useGlassTheme();
  // Sprint 117: erster Start → Willkommensflow mit Theme-Auswahl, einmalig.
  const { status: onboardingStatus } = useOnboarding();
  // Sprint 373: Login-Bereich als Start der App — das Gate entscheidet rein
  // (lib/auth-gate-logic.ts): Login hat Vorrang vor dem einmaligen Onboarding.
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const gatePhase = resolveAuthGate({
    meResolved: accountQuery.isSuccess || accountQuery.isError,
    user: accountQuery.data ?? null,
    onboardingStatus: onboardingStatus === "incomplete" ? "incomplete" : onboardingStatus === "checking" ? "loading" : "complete",
  });
  useEffect(() => {
    const route = authGateRoute(gatePhase);
    if (route) router.replace(route);
  }, [gatePhase]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = Platform.OS === "web" && isWideViewport(width);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Sprint 386: Animated-Wert ueber useState statt useRef.current halten.
  // React 19 / react-hooks verbietet das Lesen von refs im Render-Body
  // ("Cannot access refs during render"); die Lazy-Initialisierung liefert
  // weiterhin genau eine Animated.Value-Instanz pro Mount.
  const [toolsProgress] = useState(() => new Animated.Value(0));
  const hiddenRoutes = [
    { route: "business", label: "Business", icon: "▥" },
    { route: "ai-influenza-team", label: "AI Influenza Team", icon: "✦" },
    { route: "micro-trading", label: "Micro Trading", icon: "↗" },
    { route: "loop-engineering", label: "Loop Engineering", icon: "⌘" },
    { route: "decisions", label: "Entscheidungen", icon: "▤" },
    { route: "ideas", label: "Ideen", icon: "✧" },
    { route: "focus", label: "Fokus", icon: "◷" },
    { route: "chat", label: "Chat", icon: "▰" },
    { route: "cyber-dashboard", label: "Cyber Dashboard", icon: "ϟ" },
    { route: "cyber-terminal", label: "Terminal", icon: "‹›" },
    { route: "index", label: "Workspace", icon: "□" },
    { route: "superagent", label: "Superagent", icon: "✦" },
    { route: "preview", label: "Vorschau", icon: "▶" },
    { route: "quality", label: "Qualität", icon: "▥" },
  ];

  useEffect(() => {
    Animated.spring(toolsProgress, {
      toValue: toolsOpen ? 1 : 0,
      useNativeDriver: true,
      tension: 70,
      friction: 10,
    }).start();
  }, [toolsOpen, toolsProgress]);

  const openTool = (route: string) => {
    setToolsOpen(false);
    router.push(`/(tabs)/${route}` as never);
  };

  return (
    <View style={{ flex: 1, flexDirection: wide ? "row" : "column", backgroundColor: glass.glassSurface.background }}>
      {wide ? <DualSidebar /> : null}
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: glass.glassPalette.cyan,
        tabBarInactiveTintColor: glass.glassSurface.textMuted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0 },
        tabBarItemStyle: { flex: 1, minWidth: 0 },
        tabBarIconStyle: { height: 24 },
        tabBarStyle: wide ? { display: "none" } : { backgroundColor: glass.glassSurface.card, borderTopColor: glass.glassSurface.border, borderTopWidth: 1, height: 72, paddingTop: 8, paddingBottom: 10 },
      }}
    >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: CYBERSARAH_ASSET_PACK.navigation[0].label,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="cyan"><IconSymbol size={22} name="house.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="business"
          options={{
            title: "Business",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="blue"><IconSymbol size={22} name="chart.bar.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="ai-influenza-team"
          options={{
            title: "AI Influenza Team",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="magenta"><IconSymbol size={22} name="person.crop.circle" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="revenue-os"
          options={{
            title: CYBERSARAH_ASSET_PACK.navigation[1].label,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="green"><IconSymbol size={22} name="chart.bar.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="micro-trading"
          options={{
            title: "Micro Trading",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="green"><IconSymbol size={22} name="chart.bar.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="loop-engineering"
          options={{
            title: "Loop Engineering",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="blue"><IconSymbol size={22} name="wand.and.stars" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="media-studio"
          options={{
            title: CYBERSARAH_ASSET_PACK.navigation[2].label,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="purple"><IconSymbol size={22} name="video.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="decisions"
          options={{
            title: "Entscheidungen",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="purple"><IconSymbol size={22} name="doc.text.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="ideas"
          options={{
            title: "Ideen",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="green"><IconSymbol size={22} name="sparkles" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="focus"
          options={{
            title: "Fokus",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="amber"><IconSymbol size={22} name="hourglass" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="cyber-dashboard"
          options={{
            href: null, // Sprint 195: aus Leiste ausgeblendet für Handy-Übersicht
            title: "Cyber",
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="purple"><IconSymbol size={22} name="bolt.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="cyber-terminal"
          options={{
            title: "Terminal",
            // Sprint 199: aus der Tab-Leiste ausgeblendet, erreichbar ueber den NavDrawer.
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="green"><IconSymbol size={22} name="chevron.left.forwardslash.chevron.right" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: "Workspace",
            // Sprint 199: aus der Tab-Leiste ausgeblendet, erreichbar ueber den NavDrawer.
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="blue"><IconSymbol size={22} name="folder.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="cyan"><IconSymbol size={22} name="message.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="agent"
          options={{
            title: CYBERSARAH_ASSET_PACK.navigation[3].label,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="magenta"><IconSymbol size={22} name="sparkles" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="superagent"
          options={{
            href: null, // Sprint 195: aus Leiste ausgeblendet für Handy-Übersicht
            title: "Superagent",
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="purple"><IconSymbol size={22} name="wand.and.stars" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="preview"
          options={{
            title: "Vorschau",
            // Sprint 199: aus der Tab-Leiste ausgeblendet, erreichbar ueber den NavDrawer.
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="green"><IconSymbol size={22} name="play.rectangle.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="quality"
          options={{
            title: "Qualität",
            // Sprint 199: aus der Tab-Leiste ausgeblendet, erreichbar ueber den NavDrawer.
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="amber"><IconSymbol size={22} name="chart.bar.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: CYBERSARAH_ASSET_PACK.navigation[4].label,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="cyan"><IconSymbol size={22} name="person.crop.circle" color={color} /></GlassTabIcon>
            ),
          }}
        />
      </Tabs>
      {!wide ? (
        <View pointerEvents="box-none" style={[styles.toolsDock, { bottom: 92 + insets.bottom }]}>
          <Animated.View
            pointerEvents={toolsOpen ? "auto" : "none"}
            style={[
              styles.toolsPanel,
              {
                opacity: toolsProgress,
                transform: [
                  { translateX: toolsProgress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
                  { scale: toolsProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            <Text style={styles.toolsTitle}>WEITERE BEREICHE</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: Math.max(180, height - insets.top - insets.bottom - 218) }}
            >
              {hiddenRoutes.map((item) => (
                <Pressable
                  key={item.route}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} öffnen`}
                  onPress={() => openTool(item.route)}
                  style={({ pressed }) => [styles.toolItem, pressed && styles.toolItemPressed]}
                >
                  <Text style={styles.toolIcon}>{item.icon}</Text>
                  <Text style={styles.toolLabel}>{item.label}</Text>
                  <Text style={styles.toolArrow}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toolsOpen ? "Weitere Bereiche schließen" : "Weitere Bereiche öffnen"}
            accessibilityState={{ expanded: toolsOpen }}
            onPress={() => setToolsOpen((open) => !open)}
            style={({ pressed }) => [styles.toolsHandle, pressed && styles.toolsHandlePressed]}
          >
            <Text style={styles.toolsHandleIcon}>{toolsOpen ? "×" : "⋯"}</Text>
            <Text style={styles.toolsHandleLabel}>Mehr</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toolsDock: {
    alignItems: "flex-end",
    bottom: 92,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  toolsPanel: {
    backgroundColor: "#071526F2",
    borderColor: "#00E5FF",
    borderRadius: 20,
    borderWidth: 1,
    elevation: 18,
    marginBottom: 10,
    padding: 10,
    shadowColor: "#8B5CFF",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    width: 236,
  },
  toolsTitle: {
    color: "#00E5FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 5,
    paddingHorizontal: 8,
  },
  toolItem: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    minHeight: 38,
    paddingHorizontal: 8,
  },
  toolItemPressed: {
    backgroundColor: "#17345A",
  },
  toolIcon: {
    color: "#B88CFF",
    fontSize: 18,
    textAlign: "center",
    width: 28,
  },
  toolLabel: {
    color: "#E9F7FF",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  toolArrow: {
    color: "#64E9FF",
    fontSize: 22,
  },
  toolsHandle: {
    alignItems: "center",
    backgroundColor: "#10243DF5",
    borderColor: "#00E5FF",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 14,
    height: 54,
    justifyContent: "center",
    shadowColor: "#00E5FF",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    width: 62,
  },
  toolsHandlePressed: {
    backgroundColor: "#17345A",
  },
  toolsHandleIcon: {
    color: "#00E5FF",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 22,
  },
  toolsHandleLabel: {
    color: "#C6F8FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
