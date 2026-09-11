import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { AppSidebar } from "@/components/responsive/app-sidebar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, View, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { isWideViewport } from "@/lib/viewport-logic";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && isWideViewport(width);
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
      {wide ? <AppSidebar /> : null}
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          display: wide ? "none" : "flex",
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
        <Tabs.Screen
          name="index"
          options={{
            title: "Workspace",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="folder.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Chat",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="message.fill" color={color} />,
          }}
        />
                <Tabs.Screen
          name="agent"
          options={{
            title: "Agent",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="sparkles" color={color} />,
          }}
        />
        <Tabs.Screen
          name="preview"
          options={{
            title: "Vorschau",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="play.rectangle.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="quality"
          options={{
            title: "Qualität",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="chart.bar.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: "Konto",
            tabBarIcon: ({ color }) => <IconSymbol size={25} name="person.crop.circle" color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
