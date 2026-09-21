import { router, Tabs } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOnboarding } from "@/hooks/use-onboarding";
import { HapticTab } from "@/components/haptic-tab";
import { AppSidebar } from "@/components/responsive/app-sidebar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassTabIcon } from "@/components/glass/glass-tab-icon";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsProgress = useRef(new Animated.Value(0)).current;
  const hiddenRoutes = [
    { route: "business", label: "Business", icon: "▥" },
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
        <Tabs.Screen name="cyber-dashboard" options={{ href: null }} />
        <Tabs.Screen name="cyber-terminal" options={{ href: null }} />
        <Tabs.Screen name="index" options={{ href: null }} />
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
        <Tabs.Screen name="superagent" options={{ href: null }} />
        <Tabs.Screen name="preview" options={{ href: null }} />
        <Tabs.Screen name="quality" options={{ href: null }} />
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
      {!wide ? (
        <View pointerEvents="box-none" style={styles.toolsDock}>
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
