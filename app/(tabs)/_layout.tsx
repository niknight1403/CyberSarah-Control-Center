import { router, Tabs } from "expo-router";
import { useEffect } from "react";

import { useOnboarding } from "@/hooks/use-onboarding";
import { authGateRoute, resolveAuthGate } from "@/lib/auth-gate-logic";
import { trpc } from "@/lib/trpc";
import { HapticTab } from "@/components/haptic-tab";
import { DualSidebar } from "@/components/responsive/dual-sidebar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassTabIcon } from "@/components/glass/glass-tab-icon";
import { Platform, View, useWindowDimensions } from "react-native";
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
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && isWideViewport(width);

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
              <GlassTabIcon focused={focused} accent="magenta"><IconSymbol size={22} name="person.3.fill" color={color} /></GlassTabIcon>
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
    </View>
  );
}
