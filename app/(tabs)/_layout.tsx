import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <WorkspaceProvider>
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
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
      </Tabs>
    </WorkspaceProvider>
  );
}
