import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { glassDepth,  glassPalette,  glassSurface } from "@/lib/design/future-glass";
import { type CyberStatus } from "@/lib/cyber-theme";

export interface CyberAgentCardProps {
  name: string;
  role: string;
  status: CyberStatus;
  metric?: string;
  onPress?: () => void;
}

export function CyberAgentCard({ name, role, status, metric, onPress }: CyberAgentCardProps) {
  // Reanimated + React Compiler (Sprint 172): Shared-Value-Writes sind die
  // sanktionierte Reanimated-API, gelten dem Compiler aber als Mutation.
  // "use no memo" ist die dokumentierte Interop-Direktive (Komponente wird
  // bewusst nicht compiler-optimiert, Verhalten unveraendert).
  "use no memo";
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], shadowOpacity: 0.12 + glow.value * 0.25 }));
  // eslint-disable-next-line react-hooks/immutability -- Reanimated Shared-Value-Writes (sanktionierte API, keine React-State-Mutation).
  const handlePressIn = useCallback(() => { scale.value = withSpring(0.97, { damping: 12, stiffness: 300 }); glow.value = withSpring(1, { damping: 14 }); }, [scale, glow]);
  // eslint-disable-next-line react-hooks/immutability -- Reanimated Shared-Value-Writes (sanktionierte API, keine React-State-Mutation).
  const handlePressOut = useCallback(() => { scale.value = withSpring(1, { damping: 14, stiffness: 260 }); glow.value = withSpring(0, { damping: 16 }); }, [scale, glow]);
  const statusColor = status === "success" ? glassPalette.green : status === "running" ? glassPalette.cyan : status === "error" ? glassPalette.red : status === "warn" ? glassPalette.amber : glassSurface.textSecondary;
  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} accessibilityRole="button">
      <Animated.View style={[styles.card, { shadowColor: statusColor }, animatedStyle]}>
        <View style={styles.header}><View style={styles.titleContainer}><Text style={styles.name}>{name}</Text><Text style={styles.role}>{role}</Text></View><View style={[styles.statusDot, { backgroundColor: statusColor, shadowColor: statusColor }]} /></View>
        <View style={styles.footer}><Text style={[styles.statusText, { color: statusColor }]}>{status.toUpperCase()}{metric ? <Text style={styles.metric}> · {metric}</Text> : null}</Text><Ionicons name="chevron-forward" size={18} color={glassPalette.cyan} /></View>
      </Animated.View>
    </Pressable>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: { backgroundColor: glassDepth.glass, borderRadius: 16, padding: 16, marginVertical: 6, borderWidth: 1, borderColor: glassSurface.border, shadowOffset: { width: 0, height: 0 }, shadowRadius: 12, elevation: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    titleContainer: { flex: 1 },
    name: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
    role: { color: glassSurface.textSecondary, fontSize: 12, marginTop: 2 },
    statusDot: { width: 10, height: 10, borderRadius: 5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6 },
    footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: glassSurface.border, paddingTop: 10 },
    statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
    metric: { color: glassSurface.textSecondary, fontSize: 11 },
  });
}

const styles = createStyles();
