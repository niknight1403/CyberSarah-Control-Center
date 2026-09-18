import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useColors } from "@/hooks/use-colors";
import { type CyberStatus } from "@/lib/cyber-theme";

export interface CyberAgentCardProps {
  name: string;
  role: string;
  status: CyberStatus;
  metric?: string;
  onPress?: () => void;
}

export function CyberAgentCard({ name, role, status, metric, onPress }: CyberAgentCardProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], shadowOpacity: 0.12 + glow.value * 0.25 }));
  const handlePressIn = useCallback(() => { scale.value = withSpring(0.97, { damping: 12, stiffness: 300 }); glow.value = withSpring(1, { damping: 14 }); }, [scale, glow]);
  const handlePressOut = useCallback(() => { scale.value = withSpring(1, { damping: 14, stiffness: 260 }); glow.value = withSpring(0, { damping: 16 }); }, [scale, glow]);
  const statusColor = status === "success" ? colors.success : status === "running" ? colors.tint : status === "error" ? colors.error : status === "warn" ? colors.warning : colors.icon;
  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} accessibilityRole="button">
      <Animated.View style={[styles.card, { shadowColor: statusColor }, animatedStyle]}>
        <View style={styles.header}><View style={styles.titleContainer}><Text style={styles.name}>{name}</Text><Text style={styles.role}>{role}</Text></View><View style={[styles.statusDot, { backgroundColor: statusColor, shadowColor: statusColor }]} /></View>
        <View style={styles.footer}><Text style={[styles.statusText, { color: statusColor }]}>{status.toUpperCase()}{metric ? <Text style={styles.metric}> · {metric}</Text> : null}</Text><Ionicons name="chevron-forward" size={18} color={colors.tint} /></View>
      </Animated.View>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginVertical: 6, borderWidth: 1, borderColor: colors.border, shadowOffset: { width: 0, height: 0 }, shadowRadius: 12, elevation: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    titleContainer: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
    role: { color: colors.muted, fontSize: 12, marginTop: 2 },
    statusDot: { width: 10, height: 10, borderRadius: 5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6 },
    footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
    metric: { color: colors.icon, fontSize: 11 },
  });
}
