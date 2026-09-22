import { router, Tabs } from "expo-router";
import { useEffect } from "react";

import { useOnboarding } from "@/hooks/use-onboarding";
import { HapticTab } from "@/components/haptic-tab";
import { DualSidebar } from "@/components/responsive/dual-sidebar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassTabIcon } from "@/components/glass/glass-tab-icon";
import { Platform, View, useWindowDimensions } from "react-native";
import { isWideViewport } from "@/lib/viewport-logic";
import { useGlassTheme } from "@/lib/design/future-glass-runtime";

/**
 * Die Routen bleiben als Expo-Router-Segmente erhalten, aber die mobile
 * Bottom-Tab-Bar ist bewusst deaktiviert. Die Navigation wird über das
 * Top-Menü geöffnet und reserviert keinen Platz am unteren Bildschirmrand.
 */
export default function TabLayout() {
  const glass = useGlassTheme();
  // Sprint 117: erster Start → Willkommensflow mit Theme-Auswahl, einmalig.
  const { status: onboardingStatus } = useOnboarding();
  useEffect(() => {
    if (onboardingStatus === "incomplete") {
      router.replace("/onboarding");
    }
  }, [onboardingStatus]);
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
        tabBarItemStyle: { flex: 1, minWidth: 0 },
        tabBarIconStyle: { height: 24 },
        tabBarStyle: { display: "none" },
      }}
    >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: "Übersicht",
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="cyan"><IconSymbol size={22} name="house.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="business"
          options={{
            title: "Business",
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="blue"><IconSymbol size={22} name="chart.bar.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="revenue-os"
          options={{
            title: "Revenue OS",
            href: null,
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
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="cyan"><IconSymbol size={22} name="message.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="agent"
          options={{
            title: "Agent",
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
            title: "Konto",
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="cyan"><IconSymbol size={22} name="person.crop.circle" color={color} /></GlassTabIcon>
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
