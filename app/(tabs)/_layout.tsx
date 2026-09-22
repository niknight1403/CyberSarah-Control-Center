import { router, Tabs } from "expo-router";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOnboarding } from "@/hooks/use-onboarding";
import { HapticTab } from "@/components/haptic-tab";
import { AppSidebar } from "@/components/responsive/app-sidebar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassTabIcon } from "@/components/glass/glass-tab-icon";
import { Platform, View, useWindowDimensions } from "react-native";
import { isWideViewport } from "@/lib/viewport-logic";
import { useGlassTheme } from "@/lib/design/future-glass-runtime";

/**
 * Sprint 168 — Future-Glass-Navigation: schwebende CyberGlass-Bar statt
 * einer flach anliegenden Standard-Tab-Bar (Referenz §14). Alle bisherigen
 * Tabs/Routen bleiben unveraendert erhalten — nur die visuelle Huelle
 * (Position, Rand, Glow, aktives Icon) wurde neu aufgebaut.
 */
export default function TabLayout() {
  const glass = useGlassTheme();
  const insets = useSafeAreaInsets();
  // Sprint 117: erster Start → Willkommensflow mit Theme-Auswahl, einmalig.
  const { status: onboardingStatus } = useOnboarding();
  useEffect(() => {
    if (onboardingStatus === "incomplete") {
      router.replace("/onboarding");
    }
  }, [onboardingStatus]);
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && isWideViewport(width);
  const floatMargin = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 10);
  const barHeight = 58;
  // Docked (kein position:absolute) — der Rand bleibt im Layout reserviert,
  // damit KEIN Screen-Inhalt hinter der schwebend wirkenden Bar verschwindet
  // (nur der Freiraum unter/um die Bar zeigt den Void-Hintergrund durch).
  const tabBarHeight = barHeight + floatMargin;

  return (
    <View style={{ flex: 1, flexDirection: wide ? "row" : "column", backgroundColor: glass.glassSurface.background }}>
      {wide ? <AppSidebar /> : null}
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: glass.glassPalette.cyan,
        tabBarInactiveTintColor: glass.glassSurface.textMuted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
        tabBarStyle: {
          display: wide ? "none" : "flex",
          height: tabBarHeight,
          marginHorizontal: 12,
          marginBottom: floatMargin,
          borderRadius: 26,
          backgroundColor: glass.glassDepth.abyss,
          borderWidth: 1,
          borderColor: glass.glassSurface.border,
          shadowColor: glass.glassPalette.purple,
          shadowOpacity: 0.28,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
          paddingTop: 6,
          paddingBottom: 4,
        },
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
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="blue"><IconSymbol size={22} name="chart.bar.fill" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="cyber-dashboard"
          options={{
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
            // Sprint 199: aus der Tab-Leiste ausgeblendet, erreichbar ueber den NavDrawer.
            href: null,
            tabBarIcon: ({ color, focused }) => (
              <GlassTabIcon focused={focused} accent="magenta"><IconSymbol size={22} name="sparkles" color={color} /></GlassTabIcon>
            ),
          }}
        />
        <Tabs.Screen
          name="superagent"
          options={{
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
